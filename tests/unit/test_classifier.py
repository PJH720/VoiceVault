"""Unit tests for ZeroShotClassifier."""

import json
from unittest.mock import AsyncMock

import pytest

from src.core.exceptions import ClassificationError
from src.core.models import ClassificationResult
from src.services.classification.classifier import (
    DEFAULT_CATEGORIES,
    ZeroShotClassifier,
)
from src.services.llm.base import BaseLLM


@pytest.fixture
def mock_llm():
    llm = AsyncMock(spec=BaseLLM)
    llm.classify.return_value = json.dumps(
        {
            "category": "lecture",
            "confidence": 0.92,
            "reason": "Content discusses academic topics and professor lectures.",
        }
    )
    return llm


@pytest.fixture
def classifier(mock_llm):
    return ZeroShotClassifier(mock_llm)


class TestZeroShotClassifier:
    """Tests for ZeroShotClassifier.classify()."""

    @pytest.mark.asyncio
    async def test_happy_path(self, classifier, mock_llm):
        """Valid LLM JSON response produces correct ClassificationResult."""
        result = await classifier.classify("오늘 강의에서 AI에 대해 배웠습니다.")

        assert isinstance(result, ClassificationResult)
        assert result.category == "lecture"
        assert result.confidence == pytest.approx(0.92)
        assert "academic" in result.reason.lower() or "professor" in result.reason.lower()
        mock_llm.classify.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_default_categories_used(self, classifier, mock_llm):
        """When no categories provided, uses DEFAULT_CATEGORIES."""
        await classifier.classify("Some text")
        _, call_kwargs = mock_llm.classify.call_args
        # positional args: text, categories
        call_args = mock_llm.classify.call_args[0]
        assert call_args[1] == DEFAULT_CATEGORIES

    @pytest.mark.asyncio
    async def test_custom_categories(self, classifier, mock_llm):
        """Custom categories are passed through to the LLM."""
        custom = ["interview", "podcast"]
        mock_llm.classify.return_value = json.dumps(
            {
                "category": "interview",
                "confidence": 0.8,
                "reason": "Interview content.",
            }
        )
        result = await classifier.classify("Some text", categories=custom)
        call_args = mock_llm.classify.call_args[0]
        assert call_args[1] == custom
        assert result.category == "interview"

    @pytest.mark.asyncio
    async def test_invalid_json_raises_error(self, classifier, mock_llm):
        """Invalid JSON from LLM raises ClassificationError."""
        mock_llm.classify.return_value = "not valid json at all"
        with pytest.raises(ClassificationError, match="Invalid JSON"):
            await classifier.classify("Some text")

    @pytest.mark.asyncio
    async def test_llm_exception_raises_error(self, classifier, mock_llm):
        """LLM exception is wrapped in ClassificationError."""
        mock_llm.classify.side_effect = RuntimeError("LLM is down")
        with pytest.raises(ClassificationError, match="LLM classification call failed"):
            await classifier.classify("Some text")

    @pytest.mark.asyncio
    async def test_confidence_clamped_high(self, classifier, mock_llm):
        """Confidence > 1.0 is clamped to 1.0."""
        mock_llm.classify.return_value = json.dumps(
            {
                "category": "memo",
                "confidence": 1.5,
                "reason": "Very confident.",
            }
        )
        result = await classifier.classify("Some text")
        assert result.confidence == 1.0

    @pytest.mark.asyncio
    async def test_confidence_clamped_low(self, classifier, mock_llm):
        """Confidence < 0.0 is clamped to 0.0."""
        mock_llm.classify.return_value = json.dumps(
            {
                "category": "memo",
                "confidence": -0.5,
                "reason": "Negative.",
            }
        )
        result = await classifier.classify("Some text")
        assert result.confidence == 0.0

    @pytest.mark.asyncio
    async def test_confidence_non_numeric_defaults_zero(self, classifier, mock_llm):
        """Non-numeric confidence defaults to 0.0."""
        mock_llm.classify.return_value = json.dumps(
            {
                "category": "memo",
                "confidence": "high",
                "reason": "Text confidence.",
            }
        )
        result = await classifier.classify("Some text")
        assert result.confidence == 0.0

    @pytest.mark.asyncio
    async def test_empty_text_returns_memo_default(self, classifier):
        """Empty text returns default memo result without calling LLM."""
        result = await classifier.classify("")
        assert result.category == "memo"
        assert result.confidence == 0.0

    @pytest.mark.asyncio
    async def test_whitespace_text_returns_memo_default(self, classifier):
        """Whitespace-only text returns default memo result."""
        result = await classifier.classify("   \n  ")
        assert result.category == "memo"
        assert result.confidence == 0.0

    @pytest.mark.asyncio
    async def test_unknown_category_falls_back_to_memo(self, classifier, mock_llm):
        """LLM returning unknown category falls back to memo."""
        mock_llm.classify.return_value = json.dumps(
            {
                "category": "unknown_thing",
                "confidence": 0.7,
                "reason": "Not a real category.",
            }
        )
        result = await classifier.classify("Some text")
        assert result.category == "memo"

    @pytest.mark.asyncio
    async def test_code_fences_stripped(self, classifier, mock_llm):
        """Markdown code fences around JSON are stripped."""
        mock_llm.classify.return_value = (
            "```json\n"
            '{"category": "meeting", "confidence": 0.85, "reason": "Business discussion."}\n'
            "```"
        )
        result = await classifier.classify("Some text")
        assert result.category == "meeting"
        assert result.confidence == pytest.approx(0.85)
