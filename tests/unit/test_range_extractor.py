"""Unit tests for RangeExtractor service."""

import json

import pytest

from src.core.exceptions import SummarizationError
from src.core.models import ExtractRangeResponse
from src.services.summarization.range_extractor import RangeExtractor


@pytest.fixture
def range_extractor(mock_llm):
    """Create a RangeExtractor with mock LLM."""
    return RangeExtractor(llm=mock_llm)


def _make_range_response(
    summary: str = "Unified summary of the selected range.",
    keywords: list[str] | None = None,
) -> str:
    return json.dumps(
        {
            "summary": summary,
            "keywords": keywords or ["AI", "ML", "project"],
        }
    )


def _make_summaries(start: int, end: int) -> list[tuple[int, str]]:
    """Create mock (minute_index, summary_text) tuples."""
    return [(i, f"Summary for minute {i}.") for i in range(start, end + 1)]


class TestHappyPath:
    """Tests for successful range extraction."""

    async def test_basic_range_extraction(self, range_extractor, mock_llm):
        """40-80 minute range with mock summaries returns valid response."""
        mock_llm.generate.return_value = _make_range_response()
        summaries = _make_summaries(40, 80)

        result = await range_extractor.extract_range(
            recording_id=1,
            start_minute=40,
            end_minute=80,
            summaries=summaries,
        )

        assert isinstance(result, ExtractRangeResponse)
        assert result.recording_id == 1
        assert result.start_minute == 40
        assert result.end_minute == 80
        assert result.summary_text == "Unified summary of the selected range."
        assert "AI" in result.keywords
        assert result.source_count == 41
        assert result.included_minutes == list(range(40, 81))

    async def test_cross_boundary_range(self, range_extractor, mock_llm):
        """Range spanning hour boundary (50-70) works correctly."""
        mock_llm.generate.return_value = _make_range_response(
            summary="Cross-boundary summary spanning hours.",
            keywords=["cross-boundary", "lecture"],
        )
        summaries = _make_summaries(50, 70)

        result = await range_extractor.extract_range(
            recording_id=2,
            start_minute=50,
            end_minute=70,
            summaries=summaries,
        )

        assert result.summary_text == "Cross-boundary summary spanning hours."
        assert result.source_count == 21
        assert 50 in result.included_minutes
        assert 60 in result.included_minutes
        assert 70 in result.included_minutes

    async def test_single_summary_in_range(self, range_extractor, mock_llm):
        """Only 1 minute in range still produces valid result."""
        mock_llm.generate.return_value = _make_range_response(
            summary="Single minute content.",
        )
        summaries = [(5, "Only summary for minute 5.")]

        result = await range_extractor.extract_range(
            recording_id=1,
            start_minute=5,
            end_minute=5,
            summaries=summaries,
        )

        assert result.summary_text == "Single minute content."
        assert result.source_count == 1
        assert result.included_minutes == [5]
        mock_llm.generate.assert_called_once()

    async def test_llm_called_once(self, range_extractor, mock_llm):
        """Should make exactly 1 LLM call regardless of range size."""
        mock_llm.generate.return_value = _make_range_response()
        summaries = _make_summaries(0, 119)

        await range_extractor.extract_range(
            recording_id=1,
            start_minute=0,
            end_minute=119,
            summaries=summaries,
        )

        assert mock_llm.generate.call_count == 1


class TestPromptContent:
    """Tests that the LLM prompt is correctly constructed."""

    async def test_prompt_contains_minute_labels(self, range_extractor, mock_llm):
        """Verify prompt includes [Minute N] labels."""
        mock_llm.generate.return_value = _make_range_response()
        summaries = _make_summaries(40, 42)

        await range_extractor.extract_range(
            recording_id=1,
            start_minute=40,
            end_minute=42,
            summaries=summaries,
        )

        prompt = mock_llm.generate.call_args[0][0]
        assert "[Minute 40]" in prompt
        assert "[Minute 41]" in prompt
        assert "[Minute 42]" in prompt

    async def test_prompt_contains_range_info(self, range_extractor, mock_llm):
        """Verify prompt includes the time range context."""
        mock_llm.generate.return_value = _make_range_response()
        summaries = _make_summaries(10, 20)

        await range_extractor.extract_range(
            recording_id=1,
            start_minute=10,
            end_minute=20,
            summaries=summaries,
        )

        prompt = mock_llm.generate.call_args[0][0]
        assert "minute 10 to 20" in prompt


class TestEmptySummaries:
    """Tests for empty summaries list."""

    async def test_empty_summaries_raises_error(self, range_extractor, mock_llm):
        """No summaries in range raises SummarizationError."""
        with pytest.raises(SummarizationError, match="No summaries found"):
            await range_extractor.extract_range(
                recording_id=1,
                start_minute=0,
                end_minute=10,
                summaries=[],
            )

        mock_llm.generate.assert_not_called()


class TestErrorHandling:
    """Tests for LLM failures and invalid responses."""

    async def test_llm_failure_raises_summarization_error(self, range_extractor, mock_llm):
        """Mock LLM raises exception -> SummarizationError propagated."""
        mock_llm.generate.side_effect = RuntimeError("LLM down")
        summaries = _make_summaries(0, 5)

        with pytest.raises(SummarizationError, match="LLM call failed"):
            await range_extractor.extract_range(
                recording_id=1,
                start_minute=0,
                end_minute=5,
                summaries=summaries,
            )

    async def test_invalid_json_raises_summarization_error(self, range_extractor, mock_llm):
        """Invalid JSON from LLM raises SummarizationError."""
        mock_llm.generate.return_value = "not valid json"
        summaries = _make_summaries(0, 5)

        with pytest.raises(SummarizationError, match="Invalid JSON"):
            await range_extractor.extract_range(
                recording_id=1,
                start_minute=0,
                end_minute=5,
                summaries=summaries,
            )

    async def test_connection_error_retried(self, range_extractor, mock_llm):
        """ConnectionError triggers retry then succeeds."""
        mock_llm.generate.side_effect = [
            ConnectionError("timeout"),
            _make_range_response(),
        ]
        summaries = _make_summaries(0, 3)

        result = await range_extractor.extract_range(
            recording_id=1,
            start_minute=0,
            end_minute=3,
            summaries=summaries,
        )

        assert result.summary_text != ""
        assert mock_llm.generate.call_count == 2


class TestCodeFenceHandling:
    """Tests that JSON wrapped in code fences is handled correctly."""

    async def test_json_with_code_fences(self, range_extractor, mock_llm):
        """LLM response wrapped in ```json fences is parsed correctly."""
        fenced = "```json\n" + _make_range_response() + "\n```"
        mock_llm.generate.return_value = fenced
        summaries = _make_summaries(0, 5)

        result = await range_extractor.extract_range(
            recording_id=1,
            start_minute=0,
            end_minute=5,
            summaries=summaries,
        )

        assert result.summary_text == "Unified summary of the selected range."
        assert "AI" in result.keywords
