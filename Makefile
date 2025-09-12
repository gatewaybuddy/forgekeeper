.PHONY: sync-roadmap propose-next-pr dev

sync-roadmap:
	python tools/roadmap_sync.py

propose-next-pr:
	python tools/propose_pr.py

dev:
	./scripts/start_local_stack.sh

.PHONY: up-backend up-ui up-inference up-agent up-worker down

up-backend:
	docker compose --profile backend up -d --build

up-ui:
	docker compose --profile ui up -d --build

up-inference:
	docker compose --profile inference up -d --build

up-agent:
	docker compose --profile agent up -d --build

up-worker:
	docker compose --profile agent-worker up -d --build

down:
	docker compose down

.PHONY: test-memory

test-memory:
	pytest tests/memory_agentic -q

# Inference stack
.PHONY: inference-up inference-down inference-logs inference-rebuild gateway-dev sanity load-test test-inference

inference-up:
	cd ../infra/docker && docker compose -f docker-compose.inference.yml --env-file .env.inference.example up -d --build

inference-down:
	cd ../infra/docker && docker compose -f docker-compose.inference.yml down

inference-logs:
	cd ../infra/docker && docker compose -f docker-compose.inference.yml logs -f --tail=200

inference-rebuild:
	cd ../infra/docker && docker compose -f docker-compose.inference.yml build --no-cache

gateway-dev:
	cd ../gateway/openai_proxy && python -m gunicorn -c gunicorn.conf.py openai_proxy.app:app

sanity:
	bash ../scripts/sanity_check.sh

load-test:
	python ../scripts/load_test.py --n 20 --concurrency 5

test-inference:
	pytest -q ../tests/test_inference_backends.py
