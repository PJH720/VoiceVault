"""Unit tests for MinuteSummarizer service."""

import json

import pytest

from src.core.exceptions import SummarizationError
from src.core.models import MinuteSummaryResult
from src.services.summarization.minute_summarizer import MinuteSummarizer, _strip_code_fences


@pytest.fixture
def summarizer(mock_llm):
    """Create a MinuteSummarizer with mock LLM."""
    return MinuteSummarizer(llm=mock_llm)


class TestSummarizeMinuteHappyPath:
    """Tests for successful summarization."""

    async def test_returns_minute_summary_result(self, summarizer, mock_llm):
        mock_llm.generate.return_value = json.dumps(
            {"summary": "Discussed AI topics.", "keywords": ["AI", "ML"], "topic": "AI lecture"}
        )
        result = await summarizer.summarize_minute("We discussed AI and ML today.", minute_index=0)

        assert isinstance(result, MinuteSummaryResult)
        assert result.minute_index == 0
        assert result.summary_text == "Discussed AI topics."
        assert result.keywords == ["AI", "ML"]
        assert result.topic == "AI lecture"

    async def test_minute_index_is_preserved(self, summarizer, mock_llm):
        mock_llm.generate.return_value = json.dumps(
            {"summary": "Test.", "keywords": [], "topic": ""}
        )
        result = await summarizer.summarize_minute("Some text.", minute_index=42)
        assert result.minute_index == 42

    async def test_missing_optional_fields_default(self, summarizer, mock_llm):
        mock_llm.generate.return_value = json.dumps({"summary": "Brief."})
        result = await summarizer.summarize_minute("Some text.", minute_index=0)

        assert result.summary_text == "Brief."
        assert result.keywords == []
        assert result.topic == ""


class TestPreviousContext:
    """Tests for context continuity between minutes."""

    async def test_previous_context_included_in_prompt(self, summarizer, mock_llm):
        mock_llm.generate.return_value = json.dumps(
            {"summary": "Continued discussion.", "keywords": ["AI"], "topic": "AI"}
        )
        await summarizer.summarize_minute(
            "More about neural networks.",
            minute_index=1,
            previous_context="Discussed AI fundamentals.",
        )

        call_args = mock_llm.generate.call_args
        prompt = call_args[0][0]
        assert "Discussed AI fundamentals." in prompt
        assert "More about neural networks." in prompt

    async def test_no_context_when_none(self, summarizer, mock_llm):
        mock_llm.generate.return_value = json.dumps(
            {"summary": "First minute.", "keywords": [], "topic": ""}
        )
        await summarizer.summarize_minute("Hello world.", minute_index=0)

        call_args = mock_llm.generate.call_args
        prompt = call_args[0][0]
        assert "Previous minute summary" not in prompt


class TestEmptyTranscript:
    """Tests for empty or whitespace-only transcripts."""

    async def test_empty_string_returns_empty_result(self, summarizer, mock_llm):
        result = await summarizer.summarize_minute("", minute_index=0)

        assert result.summary_text == ""
        assert result.keywords == []
        assert result.topic == ""
        mock_llm.generate.assert_not_called()

    async def test_whitespace_only_returns_empty_result(self, summarizer, mock_llm):
        result = await summarizer.summarize_minute("   \n\t  ", minute_index=3)

        assert result.minute_index == 3
        assert result.summary_text == ""
        mock_llm.generate.assert_not_called()


class TestErrorHandling:
    """Tests for LLM failures and invalid responses."""

    async def test_invalid_json_raises_summarization_error(self, summarizer, mock_llm):
        mock_llm.generate.return_value = "This is not JSON at all"

        with pytest.raises(SummarizationError, match="Invalid JSON"):
            await summarizer.summarize_minute("Some transcript.", minute_index=0)

    async def test_llm_exception_raises_summarization_error(self, summarizer, mock_llm):
        mock_llm.generate.side_effect = RuntimeError("LLM service unavailable")

        with pytest.raises(SummarizationError, match="LLM call failed"):
            await summarizer.summarize_minute("Some transcript.", minute_index=0)


class TestPromptStructure:
    """Tests verifying prompt content sent to LLM."""

    async def test_prompt_contains_json_instruction(self, summarizer, mock_llm):
        mock_llm.generate.return_value = json.dumps(
            {"summary": "Test.", "keywords": [], "topic": ""}
        )
        await summarizer.summarize_minute("Test transcript.", minute_index=0)

        prompt = mock_llm.generate.call_args[0][0]
        assert "JSON" in prompt
        assert "summary" in prompt
        assert "keywords" in prompt
        assert "topic" in prompt

    async def test_prompt_contains_transcript_text(self, summarizer, mock_llm):
        mock_llm.generate.return_value = json.dumps(
            {"summary": "Test.", "keywords": [], "topic": ""}
        )
        await summarizer.summarize_minute(
            "LangChain agent design patterns are important.", minute_index=5
        )

        prompt = mock_llm.generate.call_args[0][0]
        assert "LangChain agent design patterns are important." in prompt


class TestMarkdownFenceStripping:
    """Tests for _strip_code_fences helper."""

    def test_json_with_code_fence(self):
        raw = '```json\n{"summary": "test", "keywords": ["AI"], "topic": "AI"}\n```'
        result = json.loads(_strip_code_fences(raw))
        assert result["summary"] == "test"

    def test_json_with_plain_fence(self):
        raw = '```\n{"summary": "test", "keywords": [], "topic": ""}\n```'
        result = json.loads(_strip_code_fences(raw))
        assert result["summary"] == "test"

    def test_clean_json_unchanged(self):
        raw = '{"summary": "test", "keywords": ["AI"], "topic": "lecture"}'
        result = json.loads(_strip_code_fences(raw))
        assert result["summary"] == "test"
        assert result["topic"] == "lecture"
