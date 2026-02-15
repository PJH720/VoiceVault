"""Unit tests for ClaudeLLM provider."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from anthropic import APIConnectionError, APITimeoutError, RateLimitError

from src.services.llm.claude import ClaudeLLM

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_message_response(text: str):
    """Build a minimal object that looks like ``anthropic.types.Message``."""
    block = SimpleNamespace(text=text)
    return SimpleNamespace(content=[block])


def _mock_settings(**overrides):
    """Return a fake Settings object with sensible defaults."""
    defaults = {
        "claude_api_key": "sk-test-key",
        "claude_model": "claude-sonnet-4-20250514",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_client():
    """Return an ``AsyncMock`` mimicking ``AsyncAnthropic``."""
    client = AsyncMock()
    client.messages.create = AsyncMock(
        return_value=_make_message_response('{"summary": "test", "keywords": ["AI"]}')
    )
    return client


@pytest.fixture
def llm(mock_client):
    """Create a ClaudeLLM with a mocked Anthropic client."""
    with patch("src.services.llm.claude.get_settings", return_value=_mock_settings()):
        with patch("src.services.llm.claude.AsyncAnthropic", return_value=mock_client):
            instance = ClaudeLLM()
    return instance


# ---------------------------------------------------------------------------
# TestClaudeLLMInit
# ---------------------------------------------------------------------------


class TestClaudeLLMInit:
    """Constructor / settings tests."""

    def test_defaults_from_settings(self):
        settings = _mock_settings()
        with patch("src.services.llm.claude.get_settings", return_value=settings):
            with patch("src.services.llm.claude.AsyncAnthropic") as mock_cls:
                llm = ClaudeLLM()

        assert llm._api_key == "sk-test-key"
        assert llm._model == "claude-sonnet-4-20250514"
        mock_cls.assert_called_once_with(api_key="sk-test-key")

    def test_explicit_args_override_settings(self):
        settings = _mock_settings()
        with patch("src.services.llm.claude.get_settings", return_value=settings):
            with patch("src.services.llm.claude.AsyncAnthropic"):
                llm = ClaudeLLM(
                    api_key="sk-custom",
                    model="claude-opus-4-6",
                    max_tokens=2048,
                    temperature=0.5,
                    max_concurrent=10,
                )

        assert llm._api_key == "sk-custom"
        assert llm._model == "claude-opus-4-6"
        assert llm._max_tokens == 2048
        assert llm._temperature == 0.5


# ---------------------------------------------------------------------------
# TestGenerate
# ---------------------------------------------------------------------------


class TestGenerate:
    """Tests for ``generate()``."""

    async def test_returns_text(self, llm, mock_client):
        mock_client.messages.create.return_value = _make_message_response("Hello world")

        result = await llm.generate("Say hello")

        assert result == "Hello world"

    async def test_passes_system_kwarg(self, llm, mock_client):
        mock_client.messages.create.return_value = _make_message_response("result")

        await llm.generate("user prompt", system="Be helpful")

        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert call_kwargs["system"] == "Be helpful"

    async def test_no_system_kwarg_omitted(self, llm, mock_client):
        mock_client.messages.create.return_value = _make_message_response("result")

        await llm.generate("user prompt")

        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert "system" not in call_kwargs

    async def test_forwards_options(self, llm, mock_client):
        mock_client.messages.create.return_value = _make_message_response("result")

        await llm.generate("prompt", temperature=0.1, max_tokens=512)

        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert call_kwargs["temperature"] == 0.1
        assert call_kwargs["max_tokens"] == 512


# ---------------------------------------------------------------------------
# TestSummarize
# ---------------------------------------------------------------------------


class TestSummarize:
    """Tests for ``summarize()``."""

    async def test_returns_json(self, llm, mock_client):
        mock_client.messages.create.return_value = _make_message_response(
            '{"summary": "AI overview", "keywords": ["AI"], "topic": "tech"}'
        )

        result = await llm.summarize("Some long text about AI")

        assert '"summary"' in result
        assert '"keywords"' in result

    async def test_prompt_contains_json_instruction(self, llm, mock_client):
        mock_client.messages.create.return_value = _make_message_response("{}")

        await llm.summarize("text")

        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert "JSON" in call_kwargs["system"]

    async def test_uses_low_temperature(self, llm, mock_client):
        mock_client.messages.create.return_value = _make_message_response("{}")

        await llm.summarize("text")

        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert call_kwargs["temperature"] == 0.3


# ---------------------------------------------------------------------------
# TestClassify
# ---------------------------------------------------------------------------


class TestClassify:
    """Tests for ``classify()``."""

    async def test_returns_json(self, llm, mock_client):
        mock_client.messages.create.return_value = _make_message_response(
            '{"category": "lecture", "confidence": 0.95}'
        )

        result = await llm.classify("AI lecture content", ["lecture", "meeting", "personal"])

        assert '"category"' in result
        assert '"confidence"' in result

    async def test_categories_in_prompt(self, llm, mock_client):
        mock_client.messages.create.return_value = _make_message_response("{}")

        await llm.classify("text", ["lecture", "meeting"])

        call_kwargs = mock_client.messages.create.call_args.kwargs
        user_content = call_kwargs["messages"][0]["content"]
        assert "lecture" in user_content
        assert "meeting" in user_content

    async def test_uses_very_low_temperature(self, llm, mock_client):
        mock_client.messages.create.return_value = _make_message_response("{}")

        await llm.classify("text", ["a", "b"])

        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert call_kwargs["temperature"] == 0.1


# ---------------------------------------------------------------------------
# TestErrorHandling
# ---------------------------------------------------------------------------


class TestErrorHandling:
    """Tests for exception translation."""

    async def test_connection_error(self, llm, mock_client):
        mock_client.messages.create.side_effect = APIConnectionError(request=MagicMock())

        with pytest.raises(ConnectionError, match="Failed to connect"):
            await llm.generate("prompt")

    async def test_timeout_error(self, llm, mock_client):
        mock_client.messages.create.side_effect = APITimeoutError(request=MagicMock())

        with pytest.raises(TimeoutError, match="timed out"):
            await llm.generate("prompt")

    async def test_rate_limit_error(self, llm, mock_client):
        mock_client.messages.create.side_effect = RateLimitError(
            message="Rate limit exceeded",
            response=MagicMock(status_code=429, headers={}),
            body={"error": {"message": "rate limited"}},
        )

        with pytest.raises(ConnectionError, match="rate limit"):
            await llm.generate("prompt")

    async def test_unexpected_error(self, llm, mock_client):
        mock_client.messages.create.side_effect = ValueError("something weird")

        with pytest.raises(RuntimeError, match="Claude API error"):
            await llm.generate("prompt")
