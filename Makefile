PY := .venv/bin/python
PIP := .venv/bin/pip

.PHONY: setup db db-down dev seed test test-web lint web-install

setup: ## one-time local setup (python deps + web deps)
	python3 -m venv .venv
	$(PIP) install --upgrade pip
	$(PIP) install -e '.[dev]'
	cd apps/web && npm install

db: ## start postgres and create databases
	docker compose up -d db

db-down:
	docker compose down -v

dev: db ## run all backend services + frontend (Ctrl-C to stop)
	./scripts/dev.sh

seed: ## deterministic synthetic dataset
	$(PY) -m scripts.seed

test: ## backend test suite (requires docker db up)
	$(PY) -m pytest

test-web:
	cd apps/web && npm run test

lint:
	$(PY) -m ruff check services scripts
