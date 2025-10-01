.PHONY: help dev-ui ui-build ui-serve lint typecheck test-ui test-py mock-openai task-sanity pr-check

help:
	@echo "Targets: dev-ui, ui-build, ui-serve, lint, typecheck, test-ui, test-py, mock-openai, task-sanity, pr-check"

dev-ui:
	npm --prefix frontend install
	npm --prefix frontend run dev

ui-build:
	npm --prefix frontend ci --no-audit --no-fund || npm --prefix frontend install
	npm --prefix frontend run build

ui-serve:
	npm --prefix frontend run serve

lint:
	npm --prefix frontend run lint

typecheck:
	npm --prefix frontend run typecheck

test-ui:
	npm --prefix frontend run test

test-py:
	python -m pip install -e .[dev]
	pytest -q

mock-openai:
	node scripts/mock_openai_server.mjs

task-sanity:
	python scripts/task_sanity.py lint-cards

# Usage: make pr-check TASK=T7
pr-check:
	@if [ -z "$(TASK)" ]; then echo "Usage: make pr-check TASK=T#" && exit 2; fi
	python scripts/task_sanity.py check-pr --task-id $(TASK) --against staged
