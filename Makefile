.PHONY: build up down logs health seed clean up-ollama dev-api dev-ui lint test

# ── Docker ──────────────────────────────────────────

# Build all Docker images
build:
	docker compose build

# Start API + UI (without Ollama — use LLM_PROVIDER=claude or external Ollama)
up:
	docker compose up -d

# Start API + UI + Ollama
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
	@echo "=== API Health ==="
	@curl -sf http://localhost:8000/health | python3 -m json.tool || echo "API not healthy"
	@echo "\n=== Streamlit UI ==="
	@curl -sf -o /dev/null -w "HTTP %{http_code}" http://localhost:8501 && echo " OK" || echo "UI not reachable"

# Run demo data seeder inside the API container
seed:
	docker compose exec api python backend/scripts/seed_demo_data.py

# Stop all services and remove volumes
clean:
	docker compose --profile ollama down -v

# ── Local Development ───────────────────────────────

# Start backend API locally (PYTHONPATH=backend)
dev-api:
	PYTHONPATH=backend uvicorn src.api.app:app --reload --port 8000

# Start Streamlit UI locally
dev-ui:
	streamlit run src/ui/app.py

# ── Quality ─────────────────────────────────────────

# Lint & format check (backend code)
lint:
	ruff check backend/src/ backend/tests/
	ruff format --check backend/src/ backend/tests/

# Run tests (from backend/ directory)
test:
	cd backend && pytest tests/ -v
