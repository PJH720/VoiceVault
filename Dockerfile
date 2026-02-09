# Multi-stage Dockerfile for VoiceVault
# Optimized for production with ~800MB final image size

# =============================================================================
# Stage 1: Base - Common system dependencies
# =============================================================================
FROM python:3.11-slim-bookworm AS base

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# =============================================================================
# Stage 2: Builder - Install Python dependencies
# =============================================================================
FROM base AS builder

# Copy dependency files
COPY pyproject.toml requirements.txt ./

# Install Python dependencies to ~/.local
RUN pip install --user --no-warn-script-location -r requirements.txt

# =============================================================================
# Stage 3: Runtime - Final lean image
# =============================================================================
FROM base AS runtime

# Copy installed packages from builder
COPY --from=builder /root/.local /root/.local

# Update PATH to include user packages
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY src/ ./src/
COPY templates/ ./templates/
COPY scripts/ ./scripts/

# Create data directories
RUN mkdir -p /app/data/recordings /app/data/exports && \
    chmod 755 /app/data/recordings /app/data/exports

# Expose ports
EXPOSE 8000 8501

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Default command (override in docker-compose.yml)
CMD ["uvicorn", "src.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
