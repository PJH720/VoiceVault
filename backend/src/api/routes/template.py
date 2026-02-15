"""
Template CRUD REST endpoints.

Provides list, create, update, and soft-delete operations for
classification templates.
"""

from fastapi import APIRouter, Query

from src.core.models import TemplateCreate, TemplateResponse
from src.services.storage.database import get_session
from src.services.storage.repository import RecordingRepository

router = APIRouter(prefix="/templates", tags=["templates"])


def _to_response(template) -> TemplateResponse:
    """Convert an ORM Template object to its API response model.

    Args:
        template: SQLAlchemy ORM ``Template`` instance.

    Returns:
        TemplateResponse: Pydantic model suitable for JSON serialization.
    """
    return TemplateResponse(
        id=template.id,
        name=template.name,
        display_name=template.display_name,
        triggers=template.triggers or [],
        output_format=template.output_format,
        fields=template.fields or [],
        icon=template.icon,
        priority=template.priority,
        is_default=template.is_default,
        is_active=template.is_active,
        created_at=template.created_at,
    )


@router.get("", response_model=list[TemplateResponse])
async def list_templates(active_only: bool = Query(True)):
    """List all templates, optionally filtering to active only."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        templates = await repo.list_templates(active_only=active_only)
    return [_to_response(t) for t in templates]


@router.post("", response_model=TemplateResponse, status_code=201)
async def create_template(body: TemplateCreate):
    """Create a new classification template."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        template = await repo.create_template(
            name=body.name,
            display_name=body.display_name,
            triggers=body.triggers,
            output_format=body.output_format,
            fields=body.fields,
            icon=body.icon,
            priority=body.priority,
        )
    return _to_response(template)


@router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(template_id: int, body: TemplateCreate):
    """Update an existing template."""
    update_data = body.model_dump(exclude_unset=True)
    async with get_session() as session:
        repo = RecordingRepository(session)
        template = await repo.update_template(template_id, **update_data)
    return _to_response(template)


@router.delete("/{template_id}", response_model=TemplateResponse)
async def delete_template(template_id: int):
    """Soft-delete a template by setting is_active=False."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        template = await repo.update_template(template_id, is_active=False)
    return _to_response(template)
