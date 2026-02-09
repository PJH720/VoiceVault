"""Template matching service.

Given a classification result, finds the best-matching template from
the database by category name, trigger keyword overlap, and priority.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import TemplateNotFoundError
from src.core.models import ClassificationResult
from src.services.storage.models_db import Template
from src.services.storage.repository import RecordingRepository

logger = logging.getLogger(__name__)


class TemplateMatcher:
    """Matches a ClassificationResult to the best template in the DB."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def match(self, classification_result: ClassificationResult) -> Template:
        """Find the best template for the given classification.

        Matching strategy:
        1. Filter active templates by category name match.
        2. Score remaining templates by trigger keyword overlap with reason text.
        3. Sort by priority descending, pick the highest.
        4. Fallback: return the default template (is_default=True).

        Args:
            classification_result: The classification output to match against.

        Returns:
            The best-matching Template ORM object.

        Raises:
            TemplateNotFoundError: If no templates exist at all.
        """
        repo = RecordingRepository(self._session)
        templates = await repo.list_templates(active_only=True)

        if not templates:
            raise TemplateNotFoundError("no active templates found")

        category = classification_result.category
        reason_lower = classification_result.reason.lower()

        # Step 1: Find templates matching the category name
        category_matches = [t for t in templates if t.name == category]

        if len(category_matches) == 1:
            return category_matches[0]

        if len(category_matches) > 1:
            # Step 2: Score by trigger keyword overlap
            return self._best_by_triggers(category_matches, reason_lower)

        # No exact category match — score all templates by triggers
        scored = self._best_by_triggers(templates, reason_lower)
        if scored and self._trigger_score(scored, reason_lower) > 0:
            return scored

        # Fallback: default template
        for t in templates:
            if t.is_default:
                return t

        # Last resort: highest priority
        return templates[0]

    @staticmethod
    def _trigger_score(template: Template, text: str) -> int:
        """Count how many trigger keywords appear in the text."""
        triggers = template.triggers or []
        return sum(1 for trigger in triggers if trigger.lower() in text)

    def _best_by_triggers(self, templates: list[Template], text: str) -> Template:
        """Return the template with the highest trigger overlap; break ties by priority."""
        return max(
            templates,
            key=lambda t: (self._trigger_score(t, text), t.priority),
        )
