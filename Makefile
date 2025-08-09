.PHONY: sync-roadmap propose-next-pr

sync-roadmap:
	python tools/roadmap_sync.py

propose-next-pr:
	python tools/propose_pr.py
