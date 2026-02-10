.PHONY: build up down logs health seed clean up-ollama

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
	docker compose exec api python scripts/seed_demo_data.py

# Stop all services and remove volumes
clean:
	docker compose --profile ollama down -v
