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

Feature flag gates:

- `INGEST_WEBHOOK_ENABLED` controls event acceptance endpoint
- `INGEST_QUEUE_ENABLED` controls BullMQ worker + enqueue behavior
- `INGEST_REPLAY_ENABLED` controls replay endpoint

Ingest storage behavior:

- accepted events are persisted to `ingest_event_log` in `ops_db`
- nonce replay check is validated from `ingest_event_log` within TTL window
- idempotency uses `idempotency_key` + secondary dedup key
- replay endpoint requires event to exist in `ingest_dead_letter`

Dead-letter operations:

- `GET /v1/ingest/dead-letter`
- `GET /v1/ingest/dead-letter/{deadLetterKey}`
- `PATCH /v1/ingest/dead-letter/{deadLetterKey}/status/{status}`
- `POST /v1/ingest/bookings/events/{eventId}/fail` (move event to DLQ)

Replay flow:

1. mark failed event to DLQ (`/fail`)
2. move dead-letter status to `READY`
3. call replay endpoint (`/v1/ingest/bookings/events/{eventId}/replay`)

Queue runtime:

- broker: Redis + BullMQ
- retry attempts: max 5
- retry delays: 30s, 2m, 10m, 30m, 2h
- non-retryable or max-attempt events: moved to DLQ (`ingest_dead_letter`)

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
