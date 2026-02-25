.PHONY: dev dev-backend dev-frontend test test-backend test-frontend \
       lint lint-backend lint-frontend gen-openapi gen-types setup \
       build up down logs health seed clean up-ollama

# ── Concurrent Development ─────────────────────

# Run backend + frontend concurrently (Ctrl-C stops both)
dev:
	@echo "🚀 Starting backend (port 8000) + frontend (port 3000)..."
	@trap 'kill 0' INT TERM; \
	  $(MAKE) dev-backend & \
	  $(MAKE) dev-frontend & \
	  wait

# Start backend API locally (PYTHONPATH=backend)
dev-backend:
	PYTHONPATH=backend uvicorn src.api.app:app --reload --port 8000

# Start Next.js frontend locally
dev-frontend:
	cd frontend && pnpm dev

# ── Testing ────────────────────────────────────

# Run all tests (backend + frontend)
test: test-backend test-frontend

# Run backend tests (pytest)
test-backend:
	cd backend && pytest tests/ -v

# Run frontend tests (vitest)
test-frontend:
	cd frontend && pnpm test

# ── Linting ────────────────────────────────────

# Lint all code (backend + frontend)
lint: lint-backend lint-frontend

# Lint backend (ruff check + format check)
lint-backend:
	ruff check backend/src/ backend/tests/
	ruff format --check backend/src/ backend/tests/

# Lint frontend (eslint + prettier + tsc)
lint-frontend:
	cd frontend && pnpm lint
	cd frontend && pnpm format:check
	cd frontend && pnpm type-check

# ── Code Generation ────────────────────────────

# Export OpenAPI schema to docs/openapi.json
gen-openapi:
	PYTHONPATH=backend python backend/scripts/export_openapi.py

# Generate TypeScript types from OpenAPI spec (frontend + plugin)
gen-types:
	cd frontend && pnpm gen:types
	node scripts/generate-plugin-types.mjs

# ── Setup ──────────────────────────────────────

# Full project setup (backend venv + frontend deps + whisper model)
setup:
	@echo "📦 Setting up backend..."
	cd backend && uv venv --python 3.12
	cd backend && uv pip install -r requirements.txt
	cd backend && uv pip install -e ".[dev]"
	@echo "📦 Setting up frontend..."
	cd frontend && pnpm install
	@echo "📦 Downloading Whisper model..."
	PYTHONPATH=backend python backend/scripts/download_models.py
	@echo "📦 Seeding default templates..."
	PYTHONPATH=backend python backend/scripts/seed_templates.py
	@echo "✅ Setup complete! Run 'make dev' to start developing."

# ── Docker ─────────────────────────────────────

# Build all Docker images
build:
	docker compose build

# Start all services (backend + frontend, without Ollama)
up:
	docker compose up -d

# Start all services + Ollama
up-ollama:
	docker compose --profile ollama up -d

# Stop all services
down:
	docker compose --profile ollama down

# Stream logs from all services
logs:
	docker compose logs -f

# Check health of running services
health:
	@echo "=== Backend API ==="
	@curl -sf http://localhost:8000/health | python3 -m json.tool || echo "API not healthy"
	@echo "\n=== Frontend ==="
	@curl -sf -o /dev/null -w "HTTP %{http_code}" http://localhost:3000 && echo " OK" || echo "Frontend not reachable"

# Run demo data seeder inside the API container
seed:
	docker compose exec backend python backend/scripts/seed_demo_data.py

# Stop all services and remove volumes
clean:
	docker compose --profile ollama down -v
