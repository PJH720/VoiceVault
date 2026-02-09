"""Unit tests for OllamaLLM provider."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from ollama import ResponseError

from src.services.llm.ollama import OllamaLLM

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_chat_response(text: str):
    """Build a minimal object that looks like ``ollama.ChatResponse``."""
    message = SimpleNamespace(content=text)
    return SimpleNamespace(message=message)


def _mock_settings(**overrides):
    """Return a fake Settings object with sensible defaults."""
    defaults = {
        "ollama_base_url": "http://localhost:11434",
        "ollama_model": "llama3.2",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_client():
    """Return an ``AsyncMock`` mimicking ``ollama.AsyncClient``."""
    client = AsyncMock()
    client.chat = AsyncMock(
        return_value=_make_chat_response('{"summary": "test", "keywords": ["AI"]}')
    )
    return client


@pytest.fixture
def llm(mock_client):
    """Create an OllamaLLM with a mocked Ollama client."""
    with patch("src.services.llm.ollama.get_settings", return_value=_mock_settings()):
        with patch("src.services.llm.ollama.AsyncClient", return_value=mock_client):
            instance = OllamaLLM()
    return instance


# ---------------------------------------------------------------------------
# TestOllamaLLMInit
# ---------------------------------------------------------------------------


class TestOllamaLLMInit:
    """Constructor / settings tests."""

    def test_defaults_from_settings(self):
        settings = _mock_settings()
        with patch("src.services.llm.ollama.get_settings", return_value=settings):
            with patch("src.services.llm.ollama.AsyncClient") as mock_cls:
                llm = OllamaLLM()

        assert llm._base_url == "http://localhost:11434"
        assert llm._model == "llama3.2"
        mock_cls.assert_called_once_with(host="http://localhost:11434")

    def test_explicit_args_override_settings(self):
        settings = _mock_settings()
        with patch("src.services.llm.ollama.get_settings", return_value=settings):
            with patch("src.services.llm.ollama.AsyncClient"):
                llm = OllamaLLM(
                    base_url="http://remote:11434",
                    model="mistral",
                    temperature=0.5,
                )

        assert llm._base_url == "http://remote:11434"
        assert llm._model == "mistral"
        assert llm._temperature == 0.5


# ---------------------------------------------------------------------------
# TestGenerate
# ---------------------------------------------------------------------------


class TestGenerate:
    """Tests for ``generate()``."""

    async def test_returns_text(self, llm, mock_client):
        mock_client.chat.return_value = _make_chat_response("Hello world")

        result = await llm.generate("Say hello")

        assert result == "Hello world"

    async def test_system_message_handling(self, llm, mock_client):
        mock_client.chat.return_value = _make_chat_response("result")

        await llm.generate("user prompt", system="Be helpful")

        call_kwargs = mock_client.chat.call_args.kwargs
        messages = call_kwargs["messages"]
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == "Be helpful"
        assert messages[1]["role"] == "user"

    async def test_no_system_message_when_omitted(self, llm, mock_client):
        mock_client.chat.return_value = _make_chat_response("result")

        await llm.generate("user prompt")

        call_kwargs = mock_client.chat.call_args.kwargs
        messages = call_kwargs["messages"]
        assert len(messages) == 1
        assert messages[0]["role"] == "user"


# ---------------------------------------------------------------------------
# TestSummarize
# ---------------------------------------------------------------------------


class TestSummarize:
    """Tests for ``summarize()``."""

    async def test_returns_json(self, llm, mock_client):
        mock_client.chat.return_value = _make_chat_response(
            '{"summary": "AI overview", "keywords": ["AI"], "topic": "tech"}'
        )

        result = await llm.summarize("Some long text about AI")

        assert '"summary"' in result
        assert '"keywords"' in result

    async def test_system_prompt_format(self, llm, mock_client):
        mock_client.chat.return_value = _make_chat_response("{}")

        await llm.summarize("text")

        call_kwargs = mock_client.chat.call_args.kwargs
        messages = call_kwargs["messages"]
        assert messages[0]["role"] == "system"
        assert "JSON" in messages[0]["content"]

    async def test_uses_low_temperature(self, llm, mock_client):
        mock_client.chat.return_value = _make_chat_response("{}")

        await llm.summarize("text")

        call_kwargs = mock_client.chat.call_args.kwargs
        assert call_kwargs["options"]["temperature"] == 0.3


# ---------------------------------------------------------------------------
# TestClassify
# ---------------------------------------------------------------------------


class TestClassify:
    """Tests for ``classify()``."""

    async def test_returns_json(self, llm, mock_client):
        mock_client.chat.return_value = _make_chat_response(
            '{"category": "lecture", "confidence": 0.95}'
        )

        result = await llm.classify("AI lecture content", ["lecture", "meeting", "personal"])

        assert '"category"' in result
        assert '"confidence"' in result

    async def test_categories_in_prompt(self, llm, mock_client):
        mock_client.chat.return_value = _make_chat_response("{}")

        await llm.classify("text", ["lecture", "meeting"])

        call_kwargs = mock_client.chat.call_args.kwargs
        messages = call_kwargs["messages"]
        user_msg = messages[1]["content"]
        assert "lecture" in user_msg
        assert "meeting" in user_msg

    async def test_uses_very_low_temperature(self, llm, mock_client):
        mock_client.chat.return_value = _make_chat_response("{}")

        await llm.classify("text", ["a", "b"])

        call_kwargs = mock_client.chat.call_args.kwargs
        assert call_kwargs["options"]["temperature"] == 0.1


# ---------------------------------------------------------------------------
# TestErrorHandling
# ---------------------------------------------------------------------------


class TestErrorHandling:
    """Tests for exception translation."""

    async def test_connection_error_server_down(self, llm, mock_client):
        mock_client.chat.side_effect = ConnectionError("Connection refused")

        with pytest.raises(ConnectionError, match="Failed to connect to Ollama"):
            await llm.generate("prompt")

    async def test_timeout_error(self, llm, mock_client):
        mock_client.chat.side_effect = TimeoutError("Request timed out")

        with pytest.raises(TimeoutError, match="timed out"):
            await llm.generate("prompt")

    async def test_response_error(self, llm, mock_client):
        mock_client.chat.side_effect = ResponseError("model not found")

        with pytest.raises(RuntimeError, match="Ollama error"):
            await llm.generate("prompt")

    async def test_unexpected_error(self, llm, mock_client):
        mock_client.chat.side_effect = ValueError("something weird")

        with pytest.raises(RuntimeError, match="Ollama error"):
            await llm.generate("prompt")
