"""Zero-shot classification service.

Uses an LLM provider to classify recording content into categories
(lecture, meeting, conversation, memo) and returns a structured result.
"""

import json
import logging
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from src.core.exceptions import ClassificationError
from src.core.utils import strip_code_fences
from src.core.models import ClassificationResult
from src.services.llm.base import BaseLLM

logger = logging.getLogger(__name__)

DEFAULT_CATEGORIES = ["lecture", "meeting", "conversation", "memo"]

CLASSIFICATION_SYSTEM_PROMPT = (
    "You are a recording content classifier. "
    "Given a summary of a recording, classify it into one of the provided categories.\n\n"
    "Rules:\n"
    "- Output ONLY valid JSON, no markdown fences or extra text.\n"
    '- Format: {"category": "...", "confidence": 0.0, "reason": "..."}\n'
    "- category: one of the provided category labels (exact match).\n"
    "- confidence: a float between 0.0 and 1.0 indicating classification certainty.\n"
    "- reason: a brief explanation for the classification (1 sentence).\n"
    "- Consider both Korean and English content when classifying.\n\n"
    "Category descriptions:\n"
    "- lecture: 강의, 수업, 교수 설명, 학습 내용 (academic lecture or class)\n"
    "- meeting: 회의, 미팅, 프로젝트 논의, 업무 (work meeting or project discussion)\n"
    "- conversation: 일상 대화, 친구와 대화, 잡담 (casual conversation with friends)\n"
    "- memo: 개인 메모, 독백, 혼잣말, 공부 (personal memo, solo study, monologue)\n"
)


class ZeroShotClassifier:
    """Classifies recording content into categories using an LLM provider.

    "Zero-shot" because the LLM classifies without task-specific fine-tuning;
    it relies on the system prompt describing each category.
    """

    def __init__(self, llm: BaseLLM) -> None:
        """Initialize with the configured LLM provider.

        Args:
            llm: An LLM provider implementing ``BaseLLM``.
        """
        self._llm = llm

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        reraise=True,
    )
    async def _call_llm(self, text: str, categories: list[str]) -> str:
        """Call LLM classify with retry for transient failures."""
        return await self._llm.classify(text, categories)

    async def classify(
        self,
        text: str,
        categories: list[str] | None = None,
    ) -> ClassificationResult:
        """Classify text into one of the given categories.

        Args:
            text: Combined summary text from the recording.
            categories: Optional list of category labels. Uses defaults if None.

        Returns:
            A ClassificationResult with category, confidence, and reason.

        Raises:
            ClassificationError: If the LLM fails or returns invalid JSON.
        """
        if not text or not text.strip():
            return ClassificationResult(
                category="memo",
                confidence=0.0,
                reason="Empty input text; defaulting to memo.",
            )

        cats = categories or DEFAULT_CATEGORIES

        try:
            raw_response = await self._call_llm(text, cats)
        except Exception as exc:
            raise ClassificationError(detail=f"LLM classification call failed: {exc}") from exc

        try:
            raw_response = strip_code_fences(raw_response)
            data = json.loads(raw_response)
        except json.JSONDecodeError as exc:
            raise ClassificationError(
                detail=f"Invalid JSON from LLM classification: {raw_response[:200]}"
            ) from exc

        # Validate category is one of the expected labels
        category = data.get("category", "memo")
        if category not in cats:
            logger.warning("LLM returned unknown category %r, falling back to memo", category)
            category = "memo"

        # Safely parse confidence as float, clamped to [0.0, 1.0]
        confidence = data.get("confidence", 0.0)
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))

        reason = data.get("reason", "")

        return ClassificationResult(
            category=category,
            confidence=confidence,
            reason=str(reason),
        )
