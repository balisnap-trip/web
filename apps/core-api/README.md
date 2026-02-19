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
set PHASE2_BATCH_CODE=A
pnpm --filter @bst/core-api migrate:phase2
```

Execute against `ops_db`:

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/ops_db
set PRECHECK_DISK_TOTAL_BYTES=100000000000
set PRECHECK_DISK_USED_BYTES=60000000000
set PHASE2_BATCH_CODE=A
pnpm --filter @bst/core-api migrate:phase2
```

Reports are written to:

- `reports/recon/{PHASE2_BATCH_CODE}/{timestamp}.json`
- `reports/recon/{PHASE2_BATCH_CODE}/{timestamp}.md`

## Ingestion Security

`POST /v1/ingest/bookings/events` now validates:

- `authorization: Bearer <service-token>`
- `x-signature-algorithm: HMAC-SHA256`
- `x-signature`
- `x-timestamp` (drift <= 5 minutes)
- `x-nonce` (replay protection window 10 minutes)
- `x-idempotency-key` (retained in `ingest_event_log` with 35-day policy)

Ingest storage behavior:

- accepted events are persisted to `ingest_event_log` in `ops_db`
- nonce replay check is validated from `ingest_event_log` within TTL window
- idempotency uses `idempotency_key` + secondary dedup key
- replay endpoint requires event to exist in `ingest_dead_letter`

## Error Envelope

HTTP errors are wrapped with:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "field X is required",
    "details": {},
    "requestId": "req_..."
  }
}
```
