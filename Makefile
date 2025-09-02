.PHONY: sync-roadmap propose-next-pr dev

sync-roadmap:
	python tools/roadmap_sync.py

propose-next-pr:
	python tools/propose_pr.py

dev:
        ./scripts/start_local_stack.sh

.PHONY: test-memory

test-memory:
        pytest tests/memory_agentic -q
