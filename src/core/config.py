"""
Application configuration via pydantic-settings.

Loads values from .env file with sensible defaults for local development.
Use ``get_settings()`` to obtain the cached singleton instance.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """VoiceVault application settings loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- LLM Provider ---
    llm_provider: str = "ollama"

    # Claude
    claude_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    # --- Whisper STT ---
    whisper_provider: str = "local"
    whisper_model: str = "base"
    whisper_api_key: str = ""
    whisper_default_language: str = ""  # empty = auto-detect; ISO code e.g. "ko", "en"

    # --- RAG & Embeddings ---
    embedding_provider: str = "local"
    embedding_model: str = "all-MiniLM-L6-v2"
    ollama_embedding_model: str = "nomic-embed-text"
    chroma_persist_dir: str = "data/chroma_db"
    rag_top_k: int = 5
    rag_min_similarity: float = 0.3

    # --- Obsidian Export ---
    obsidian_vault_path: str = ""
    obsidian_export_folder: str = "VoiceVault"
    obsidian_frontmatter: bool = True
    obsidian_wikilinks: bool = True

    # --- Application ---
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "INFO"

    # --- Storage ---
    database_url: str = "sqlite+aiosqlite:///data/voicevault.db"
    recordings_dir: str = "data/recordings"
    exports_dir: str = "data/exports"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()
