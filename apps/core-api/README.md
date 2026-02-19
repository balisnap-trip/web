# Core API

NestJS baseline service for the unified booking core domain.

## Available Endpoints

- `GET /health`
- `GET /health/db`
- `GET /docs`

## Run

```bash
pnpm --filter @bst/core-api dev
```

## Phase-2 Migration Runner

Dry-run:

```bash
set PHASE2_DRY_RUN=true
pnpm --filter @bst/core-api migrate:phase2
```

Execute against `ops_db`:

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/ops_db
set PRECHECK_DISK_TOTAL_BYTES=100000000000
set PRECHECK_DISK_USED_BYTES=60000000000
pnpm --filter @bst/core-api migrate:phase2
```
