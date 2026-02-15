"""Unit tests for HourSummarizer service."""

import json

import pytest

from src.core.exceptions import SummarizationError
from src.core.models import HourSummaryResult
from src.services.summarization.hour_summarizer import HourSummarizer


@pytest.fixture
def hour_summarizer(mock_llm):
    """Create a HourSummarizer with mock LLM."""
    return HourSummarizer(llm=mock_llm)


def _make_ten_min_response(index: int) -> str:
    return json.dumps(
        {
            "summary": f"10-min summary for chunk {index}.",
            "keywords": ["keyword_a", "keyword_b"],
            "topics": [f"topic_{index}"],
        }
    )


def _make_hour_response() -> str:
    return json.dumps(
        {
            "summary": "Comprehensive hour summary covering all topics.",
            "keywords": ["AI", "ML", "NLP", "LangChain", "agents"],
            "topic_segments": [
                {"topic": "AI fundamentals", "minutes": "0-10"},
                {"topic": "ML applications", "minutes": "10-20"},
            ],
        }
    )


class TestSummarizeHourHappyPath:
    """Tests for successful hour summarization with 60 summaries."""

    async def test_60_summaries_produce_hour_summary(self, hour_summarizer, mock_llm):
        """60 1-min summaries -> 6 parallel 10-min calls + 1 hour call."""
        summaries = [f"Minute {i} summary text." for i in range(60)]

        # 6 calls for 10-min chunks, then 1 call for hour summary
        mock_llm.generate.side_effect = [_make_ten_min_response(i) for i in range(6)] + [
            _make_hour_response()
        ]

        result = await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=summaries
        )

        assert isinstance(result, HourSummaryResult)
        assert result.hour_index == 0
        assert result.summary_text == ("Comprehensive hour summary covering all topics.")
        assert "AI" in result.keywords
        assert len(result.topic_segments) == 2
        assert result.topic_segments[0]["topic"] == "AI fundamentals"

    async def test_total_llm_calls_for_60_summaries(self, hour_summarizer, mock_llm):
        """Should make 7 LLM calls total (6 x 10-min + 1 x hour)."""
        summaries = [f"Summary {i}." for i in range(60)]
        mock_llm.generate.side_effect = [_make_ten_min_response(i) for i in range(6)] + [
            _make_hour_response()
        ]

        await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=summaries
        )

        assert mock_llm.generate.call_count == 7


class TestPartialHour:
    """Tests for partial hour (< 60 summaries but >= 20)."""

    async def test_30_summaries_produce_summary(self, hour_summarizer, mock_llm):
        """30 summaries -> 3 x 10-min chunks + 1 hour call."""
        summaries = [f"Summary {i}." for i in range(30)]
        mock_llm.generate.side_effect = [_make_ten_min_response(i) for i in range(3)] + [
            _make_hour_response()
        ]

        result = await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=summaries
        )

        assert result.summary_text != ""
        assert mock_llm.generate.call_count == 4

    async def test_20_summaries_produce_summary(self, hour_summarizer, mock_llm):
        """20 summaries -> 2 x 10-min chunks + 1 hour call."""
        summaries = [f"Summary {i}." for i in range(20)]
        mock_llm.generate.side_effect = [_make_ten_min_response(i) for i in range(2)] + [
            _make_hour_response()
        ]

        result = await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=summaries
        )

        assert result.summary_text != ""
        assert mock_llm.generate.call_count == 3


class TestSmallInput:
    """Tests for fewer than 10 summaries (skip Level 1 grouping)."""

    async def test_5_summaries_single_llm_call(self, hour_summarizer, mock_llm):
        """< 10 summaries -> skip 10-min grouping, single call."""
        summaries = [f"Summary {i}." for i in range(5)]
        mock_llm.generate.return_value = _make_hour_response()

        result = await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=summaries
        )

        assert result.summary_text != ""
        assert mock_llm.generate.call_count == 1

    async def test_1_summary_single_llm_call(self, hour_summarizer, mock_llm):
        """Single summary -> single call."""
        mock_llm.generate.return_value = _make_hour_response()

        result = await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=["Only summary."]
        )

        assert result.summary_text != ""
        assert mock_llm.generate.call_count == 1

    async def test_10_summaries_single_llm_call(self, hour_summarizer, mock_llm):
        """Exactly 10 summaries -> only 1 chunk, skip Level 1."""
        summaries = [f"Summary {i}." for i in range(10)]
        mock_llm.generate.return_value = _make_hour_response()

        await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=summaries
        )

        assert mock_llm.generate.call_count == 1


class TestEmptyInput:
    """Tests for empty summaries list."""

    async def test_empty_list_returns_empty_result(self, hour_summarizer, mock_llm):
        result = await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=[]
        )

        assert result.hour_index == 0
        assert result.summary_text == ""
        assert result.keywords == []
        assert result.topic_segments == []
        assert result.token_count == 0
        mock_llm.generate.assert_not_called()


class TestErrorHandling:
    """Tests for LLM failures."""

    async def test_llm_failure_raises_summarization_error(self, hour_summarizer, mock_llm):
        mock_llm.generate.side_effect = RuntimeError("LLM down")
        summaries = [f"Summary {i}." for i in range(5)]

        with pytest.raises(SummarizationError, match="LLM call failed"):
            await hour_summarizer.summarize_hour(
                recording_id=1, hour_index=0, minute_summaries=summaries
            )

    async def test_invalid_json_raises_summarization_error(self, hour_summarizer, mock_llm):
        mock_llm.generate.return_value = "not valid json at all"
        summaries = [f"Summary {i}." for i in range(5)]

        with pytest.raises(SummarizationError, match="Invalid JSON"):
            await hour_summarizer.summarize_hour(
                recording_id=1, hour_index=0, minute_summaries=summaries
            )

    async def test_ten_min_failure_raises_summarization_error(self, hour_summarizer, mock_llm):
        """Failure in a 10-min chunk propagates as SummarizationError."""
        summaries = [f"Summary {i}." for i in range(20)]
        mock_llm.generate.side_effect = RuntimeError("Timeout")

        with pytest.raises(SummarizationError, match="LLM call failed"):
            await hour_summarizer.summarize_hour(
                recording_id=1, hour_index=0, minute_summaries=summaries
            )

    async def test_ten_min_invalid_json_raises_error(self, hour_summarizer, mock_llm):
        """Invalid JSON from a 10-min chunk propagates."""
        summaries = [f"Summary {i}." for i in range(20)]
        mock_llm.generate.return_value = "broken"

        with pytest.raises(SummarizationError, match="Invalid JSON"):
            await hour_summarizer.summarize_hour(
                recording_id=1, hour_index=0, minute_summaries=summaries
            )


class TestParallelExecution:
    """Tests that Level 1 uses asyncio.gather for parallel calls."""

    async def test_all_chunks_are_called(self, hour_summarizer, mock_llm):
        """Verify all 6 chunks result in LLM calls."""
        summaries = [f"Summary {i}." for i in range(60)]
        mock_llm.generate.side_effect = [_make_ten_min_response(i) for i in range(6)] + [
            _make_hour_response()
        ]

        await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=summaries
        )

        # 6 ten-min calls + 1 hour call = 7
        assert mock_llm.generate.call_count == 7

    async def test_prompts_contain_minute_labels(self, hour_summarizer, mock_llm):
        """Verify 10-min prompts include [Minute N] labels."""
        summaries = [f"Summary {i}." for i in range(20)]
        mock_llm.generate.side_effect = [_make_ten_min_response(i) for i in range(2)] + [
            _make_hour_response()
        ]

        await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=summaries
        )

        # Check first call (10-min chunk)
        first_call_prompt = mock_llm.generate.call_args_list[0][0][0]
        assert "[Minute 1]" in first_call_prompt


class TestTokenCounting:
    """Tests for token_count field population."""

    async def test_token_count_populated(self, hour_summarizer, mock_llm):
        summaries = [f"Summary {i} with some text." for i in range(5)]
        mock_llm.generate.return_value = _make_hour_response()

        result = await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=summaries
        )

        # token_count should be > 0 for non-empty summary
        assert result.token_count > 0

    async def test_token_count_zero_for_empty(self, hour_summarizer, mock_llm):
        result = await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=[]
        )
        assert result.token_count == 0


class TestHourIndex:
    """Tests that hour_index is correctly preserved."""

    async def test_hour_index_preserved(self, hour_summarizer, mock_llm):
        mock_llm.generate.return_value = _make_hour_response()

        result = await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=3, minute_summaries=["Summary."]
        )

        assert result.hour_index == 3


class TestCodeFenceHandling:
    """Tests that JSON wrapped in code fences is handled correctly."""

    async def test_json_with_code_fences(self, hour_summarizer, mock_llm):
        fenced = "```json\n" + _make_hour_response() + "\n```"
        mock_llm.generate.return_value = fenced

        result = await hour_summarizer.summarize_hour(
            recording_id=1, hour_index=0, minute_summaries=["Summary."]
        )

        assert result.summary_text != ""
        assert "AI" in result.keywords
