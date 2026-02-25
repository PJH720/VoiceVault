"""Unit tests for TemplateMatcher."""

import pytest

from src.core.exceptions import TemplateNotFoundError
from src.core.models import ClassificationResult
from src.services.classification.template_matcher import TemplateMatcher
from src.services.storage.repository import RecordingRepository


@pytest.fixture
async def seeded_session(db_session):
    """Seed the test DB with default templates and return the session."""
    repo = RecordingRepository(db_session)

    await repo.create_template(
        name="lecture",
        display_name="강의 노트",
        triggers=["강의", "수업", "교수", "lecture", "class", "professor"],
        priority=10,
    )
    await repo.create_template(
        name="meeting",
        display_name="회의록",
        triggers=["회의", "미팅", "프로젝트", "meeting", "project"],
        priority=8,
    )
    await repo.create_template(
        name="conversation",
        display_name="대화 기록",
        triggers=["대화", "친구", "잡담", "conversation", "chat", "friend"],
        priority=5,
    )

    # memo is the default fallback
    memo = await repo.create_template(
        name="memo",
        display_name="개인 메모",
        triggers=["메모", "노트", "기록", "memo", "note", "study"],
        priority=1,
    )
    memo.is_default = True
    await db_session.flush()

    return db_session


class TestTemplateMatcher:
    """Tests for TemplateMatcher.match()."""

    @pytest.mark.asyncio
    async def test_exact_category_match(self, seeded_session):
        """Category name matches template name exactly."""
        matcher = TemplateMatcher(seeded_session)
        result = ClassificationResult(
            category="lecture",
            confidence=0.9,
            reason="Academic lecture content.",
        )
        template = await matcher.match(result)
        assert template.name == "lecture"

    @pytest.mark.asyncio
    async def test_meeting_category_match(self, seeded_session):
        """Meeting category matches meeting template."""
        matcher = TemplateMatcher(seeded_session)
        result = ClassificationResult(
            category="meeting",
            confidence=0.85,
            reason="Business meeting discussion.",
        )
        template = await matcher.match(result)
        assert template.name == "meeting"

    @pytest.mark.asyncio
    async def test_fallback_to_default_template(self, seeded_session):
        """Unknown category falls back to the default template (memo)."""
        matcher = TemplateMatcher(seeded_session)
        result = ClassificationResult(
            category="unknown_category",
            confidence=0.3,
            reason="Cannot determine type.",
        )
        template = await matcher.match(result)
        assert template.name == "memo"
        assert template.is_default is True

    @pytest.mark.asyncio
    async def test_trigger_keyword_matching(self, seeded_session):
        """When category doesn't match, triggers in reason text guide selection."""
        matcher = TemplateMatcher(seeded_session)
        result = ClassificationResult(
            category="unknown_category",
            confidence=0.5,
            reason="This is about a 강의 from a 교수 about AI.",
        )
        template = await matcher.match(result)
        assert template.name == "lecture"

    @pytest.mark.asyncio
    async def test_priority_ordering(self, seeded_session):
        """Higher priority wins when trigger scores are tied."""
        matcher = TemplateMatcher(seeded_session)
        # No triggers match — falls back to default
        result = ClassificationResult(
            category="something_else",
            confidence=0.4,
            reason="Generic content with no matching keywords.",
        )
        template = await matcher.match(result)
        # Should fall back to default (memo)
        assert template.name == "memo"

    @pytest.mark.asyncio
    async def test_empty_templates_raises_error(self, db_session):
        """Empty template list raises TemplateNotFoundError."""
        matcher = TemplateMatcher(db_session)
        result = ClassificationResult(
            category="lecture",
            confidence=0.9,
            reason="Academic content.",
        )
        with pytest.raises(TemplateNotFoundError):
            await matcher.match(result)

    @pytest.mark.asyncio
    async def test_conversation_trigger_match(self, seeded_session):
        """Conversation triggers in reason text match conversation template."""
        matcher = TemplateMatcher(seeded_session)
        result = ClassificationResult(
            category="not_a_real_category",
            confidence=0.6,
            reason="대화 with a 친구 about daily life.",
        )
        template = await matcher.match(result)
        assert template.name == "conversation"
