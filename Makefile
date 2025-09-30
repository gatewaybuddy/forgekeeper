.PHONY: help dev-ui ui-build ui-serve lint typecheck test-ui test-py mock-openai task-sanity pr-check

help:
	@echo "Targets: dev-ui, ui-build, ui-serve, lint, typecheck, test-ui, test-py, mock-openai, task-sanity, pr-check"

dev-ui:
	npm --prefix forgekeeper/frontend install
	npm --prefix forgekeeper/frontend run dev

ui-build:
	npm --prefix forgekeeper/frontend ci --no-audit --no-fund || npm --prefix forgekeeper/frontend install
	npm --prefix forgekeeper/frontend run build

ui-serve:
	npm --prefix forgekeeper/frontend run serve

lint:
	npm --prefix forgekeeper/frontend run lint

typecheck:
	npm --prefix forgekeeper/frontend run typecheck

test-ui:
	npm --prefix forgekeeper/frontend run test

test-py:
	python -m pip install -e forgekeeper[dev]
	cd forgekeeper && pytest -q

mock-openai:
	node forgekeeper/scripts/mock_openai_server.mjs

task-sanity:
	python forgekeeper/scripts/task_sanity.py lint-cards

# Usage: make -C forgekeeper pr-check TASK=T7
pr-check:
	@if [ -z "$(TASK)" ]; then echo "Usage: make -C forgekeeper pr-check TASK=T#" && exit 2; fi
	python forgekeeper/scripts/task_sanity.py check-pr --task-id $(TASK) --against staged
