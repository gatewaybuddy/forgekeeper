.PHONY: sync-roadmap propose-next-pr dev module-index

sync-roadmap:
	python tools/roadmap_sync.py

propose-next-pr:
	python tools/propose_pr.py

dev:
	./scripts/start_local_stack.sh

module-index:
	python tools/nav/build_module_index.py

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

.PHONY: build-core build-infer

build-core:
	cd packages/forgekeeper-core && python -m pip install --upgrade build && python -m build

build-infer:
	cd packages/forgekeeper-inference-client && python -m pip install --upgrade build && python -m build

.PHONY: test-memory

test-memory:
	pytest tests/memory_agentic -q

.PHONY: v2-dev-triton
v2-dev-triton:
	# Start TritonLLM gateway, v2 UI, and orchestrator (Windows PowerShell required)
	pwsh forgekeeper/scripts/start_v2_with_triton.ps1

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
