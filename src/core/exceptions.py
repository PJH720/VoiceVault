"""
VoiceVault exception hierarchy.

All application-specific exceptions inherit from VoiceVaultError,
enabling centralized error handling in the API middleware layer.
"""

from datetime import UTC, datetime


class VoiceVaultError(Exception):
    """Base exception for all VoiceVault errors."""

    def __init__(
        self,
        detail: str = "An unexpected error occurred",
        code: str = "VOICEVAULT_ERROR",
        status_code: int = 500,
    ) -> None:
        self.detail = detail
        self.code = code
        self.status_code = status_code
        self.timestamp = datetime.now(UTC).isoformat()
        super().__init__(detail)


class RecordingNotFoundError(VoiceVaultError):
    """Raised when a recording ID does not exist."""

    def __init__(self, recording_id: int | str) -> None:
        super().__init__(
            detail=f"Recording not found: {recording_id}",
            code="RECORDING_NOT_FOUND",
            status_code=404,
        )


class RecordingAlreadyActiveError(VoiceVaultError):
    """Raised when trying to start a recording while one is already active."""

    def __init__(self) -> None:
        super().__init__(
            detail="A recording is already active",
            code="RECORDING_ALREADY_ACTIVE",
            status_code=409,
        )


class TranscriptionError(VoiceVaultError):
    """Raised when STT processing fails."""

    def __init__(self, detail: str = "Transcription failed") -> None:
        super().__init__(
            detail=detail,
            code="TRANSCRIPTION_ERROR",
            status_code=500,
        )


class SummarizationError(VoiceVaultError):
    """Raised when LLM summarization fails."""

    def __init__(self, detail: str = "Summarization failed") -> None:
        super().__init__(
            detail=detail,
            code="SUMMARIZATION_ERROR",
            status_code=500,
        )


class ClassificationError(VoiceVaultError):
    """Raised when zero-shot classification fails."""

    def __init__(self, detail: str = "Classification failed") -> None:
        super().__init__(
            detail=detail,
            code="CLASSIFICATION_ERROR",
            status_code=500,
        )


class TemplateNotFoundError(VoiceVaultError):
    """Raised when a classification template does not exist."""

    def __init__(self, template_name: str) -> None:
        super().__init__(
            detail=f"Template not found: {template_name}",
            code="TEMPLATE_NOT_FOUND",
            status_code=404,
        )


class RAGError(VoiceVaultError):
    """Raised when a RAG query or retrieval operation fails."""

    def __init__(self, detail: str = "RAG query failed") -> None:
        super().__init__(detail=detail, code="RAG_ERROR", status_code=500)


class ExportError(VoiceVaultError):
    """Raised when Obsidian Markdown export fails."""

    def __init__(self, detail: str = "Export failed") -> None:
        super().__init__(detail=detail, code="EXPORT_ERROR", status_code=500)


class NotImplementedYetError(VoiceVaultError):
    """Raised for stub endpoints not yet implemented."""

    def __init__(self, feature: str = "This feature") -> None:
        super().__init__(
            detail=f"{feature} is not implemented yet",
            code="NOT_IMPLEMENTED",
            status_code=501,
        )
