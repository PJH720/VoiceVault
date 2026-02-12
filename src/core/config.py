"""
Application configuration via pydantic-settings.

Loads values from .env file with sensible defaults for local development.
Use ``get_settings()`` to obtain the cached singleton instance.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """VoiceVault application settings loaded from environment / .env file.

    All settings can be overridden via environment variables or a `.env` file.
    Field names map directly to env var names (case-insensitive).

    Attributes:
        llm_provider: Which LLM backend to use ("claude" or "ollama").
        embedding_provider: Embedding backend ("local" for sentence-transformers, "ollama").
        whisper_provider: STT backend ("local" for faster-whisper).
        database_url: Async SQLAlchemy connection string for SQLite.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # Silently ignore unrecognized env vars
    )

    # --- LLM Provider ---
    # Selects the LLM backend: "claude" for Anthropic API, "ollama" for local models
    llm_provider: str = "ollama"

    # Claude (Anthropic API) settings
    claude_api_key: str = ""  # Required when llm_provider="claude"
    claude_model: str = "claude-sonnet-4-20250514"

    # Ollama (local LLM) settings
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    # --- Whisper STT ---
    # Speech-to-text configuration using faster-whisper
    whisper_provider: str = "local"
    whisper_model: str = "base"  # Model size: tiny, base, small, medium, large-v3
    whisper_api_key: str = ""
    whisper_default_language: str = ""  # Empty = auto-detect; ISO 639-1 code e.g. "ko", "en"

    # --- RAG & Embeddings ---
    # Retrieval-Augmented Generation pipeline configuration
    embedding_provider: str = "local"  # "local" = sentence-transformers, "ollama" = Ollama API
    embedding_model: str = "all-MiniLM-L6-v2"  # sentence-transformers model name
    ollama_embedding_model: str = "nomic-embed-text"  # Used when embedding_provider="ollama"
    chroma_persist_dir: str = "data/chroma_db"  # ChromaDB on-disk storage path
    rag_top_k: int = 5  # Number of similar summaries to retrieve per query
    rag_min_similarity: float = 0.3  # Cosine similarity threshold for filtering results

    # --- Obsidian Export ---
    # Settings for exporting recordings as Obsidian-compatible Markdown notes
    obsidian_vault_path: str = ""  # Absolute path to Obsidian vault root
    obsidian_export_folder: str = "VoiceVault"  # Subfolder within the vault for exports
    obsidian_frontmatter: bool = True  # Include YAML frontmatter in exported notes
    obsidian_wikilinks: bool = True  # Use [[wikilink]] syntax instead of [markdown](links)

    # --- Application ---
    app_host: str = "0.0.0.0"  # Bind address for the FastAPI server
    app_port: int = 8000
    log_level: str = "INFO"  # Python logging level

    # --- Storage ---
    # Paths are relative to the project root; absolute paths also supported
    database_url: str = "sqlite+aiosqlite:///data/voicevault.db"
    recordings_dir: str = "data/recordings"  # WAV file storage directory
    exports_dir: str = "data/exports"  # Obsidian Markdown export output directory


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton.

    Uses ``functools.lru_cache`` so the .env file is read only once.
    Subsequent calls return the same ``Settings`` instance.

    Returns:
        Settings: The application-wide configuration object.
    """
    return Settings()
