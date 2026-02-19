# Core API

NestJS baseline service for the unified booking core domain.

## Available Endpoints

- `GET /health`
- `GET /health/db`
- `GET /docs`
- `GET /v1/metrics/api?windowMinutes=15`
- `GET /v1/metrics/reconciliation`

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

## Phase-2 Quality Check

Run data-quality checks aligned with migration matrix thresholds:

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/ops_db
set PHASE2_BATCH_CODE=A
pnpm --filter @bst/core-api quality:phase2
```

Optional thresholds:

- `QUALITY_MAX_OPS_DONE_NOT_PAID_RATIO` (default `0.01`)
- `QUALITY_MAX_UNMAPPED_RATIO_PERCENT` (default `5`)

Reports are written to:

- `reports/recon/quality/{PHASE2_BATCH_CODE}/{timestamp}.json`
- `reports/recon/quality/{PHASE2_BATCH_CODE}/{timestamp}.md`

CI execution:

- GitHub Actions manual workflow: `.github/workflows/phase2-quality-check.yml`
- workflow membutuhkan secret repository `OPS_DB_URL`

## Phase-2 Release Evidence Runner

Run combined release evidence stages (quality + ingest gates):

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/ops_db
set CORE_API_BASE_URL=http://localhost:4000
set CORE_API_ADMIN_TOKEN=dev-admin-token
set PHASE2_BATCH_CODE=A
pnpm --filter @bst/core-api release:evidence
```

Toggles:

- `RUN_EVIDENCE_QUALITY_CHECK` (default `true`)
- `RUN_EVIDENCE_INGEST_GATES` (default `true`)

Reports are written to:

- `reports/release-evidence/{PHASE2_BATCH_CODE}/{timestamp}.json`
- `reports/release-evidence/{PHASE2_BATCH_CODE}/{timestamp}.md`

CI execution:

- GitHub Actions manual workflow: `.github/workflows/phase2-release-evidence.yml`
- workflow membutuhkan:
  - secret `OPS_DB_URL` (jika `RUN_EVIDENCE_QUALITY_CHECK=true`)
  - variable repository `CORE_API_BASE_URL` (jika `RUN_EVIDENCE_INGEST_GATES=true`)
  - secret `CORE_API_ADMIN_TOKEN` (jika `RUN_EVIDENCE_INGEST_GATES=true`)

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

Admin auth for protected ops endpoints (`/v1/audit/*`, `/v1/ingest/dead-letter/*`, `/v1/ingest/metrics/*`, `/v1/ops/bookings/*`, `/v1/channel-mappings/*`, replay/fail):

- `authorization: Bearer <admin-token>`
- `x-admin-role: ADMIN | STAFF | MANAGER`
- env:
  - `ADMIN_AUTH_ENABLED` (default `true`)
  - `CORE_API_ADMIN_TOKEN` (default `dev-admin-token` for local)

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
- `GET /v1/ingest/metrics/queue` (queue depth + DLQ status metrics)
- `GET /v1/ingest/metrics/processing?windowMinutes=60` (rolling success rate + latency)
- `GET /v1/metrics/api?windowMinutes=15` (API status code rates + latency + throughput)
- `GET /v1/metrics/reconciliation` (mismatch metrics per booking/payment/ingest/catalog + global ratio)

Replay flow:

1. mark failed event to DLQ (`/fail`)
2. move dead-letter status to `READY`
3. call replay endpoint (`/v1/ingest/bookings/events/{eventId}/replay`)
4. worker sets DLQ lifecycle automatically:
   - `READY -> REPLAYING` when replay accepted
   - `REPLAYING -> SUCCEEDED` when processing succeeds
   - `REPLAYING -> FAILED` when replay exhausts retry or non-retryable error
5. operational actions are audited to `GET /v1/audit/events`:
   - replay requested/rejected
   - fail-to-DLQ action
   - dead-letter status changes

Audit persistence:

- enabled by default (`AUDIT_PERSISTENCE_ENABLED=true`)
- file path default: `reports/audit/audit-events.ndjson` (`AUDIT_LOG_PATH`)

Queue runtime:

- broker: Redis + BullMQ
- retry attempts: max 5
- retry delays: 30s, 2m, 10m, 30m, 2h
- non-retryable or max-attempt events: moved to DLQ (`ingest_dead_letter`)

Retention runtime:

- cleanup scheduler enabled by `INGEST_RETENTION_ENABLED`
- default run interval: 24h (`INGEST_RETENTION_INTERVAL_MS`)
- retention windows:
  - idempotency log (`ingest_event_log`): 35 days
  - dead-letter resolved/closed: 30 days
  - unmapped queue resolved/closed: 90 days

## Ingest Smoke Test

Run contract smoke test against a running server:

```bash
set CORE_API_BASE_URL=http://localhost:4000
pnpm --filter @bst/core-api smoke:ingest-contract
```

The smoke script will:

1. send a signed ingest event
2. fetch event status
3. force event to DLQ
4. move DLQ status to `READY`
5. replay the event
6. validate ingest metrics endpoints (`queue` + `processing`)
7. validate audit trail event for fail/status-update/replay flow

CI execution:

- GitHub Actions manual workflow: `.github/workflows/ingest-contract-smoke.yml`
- workflow membutuhkan secret repository:
  - `INGEST_SERVICE_TOKEN`
  - `INGEST_SERVICE_SECRET`
  - `CORE_API_ADMIN_TOKEN`

## Admin Auth Smoke Test

Run RBAC smoke test for protected admin endpoints:

```bash
set CORE_API_BASE_URL=http://localhost:4000
set CORE_API_ADMIN_TOKEN=dev-admin-token
pnpm --filter @bst/core-api smoke:admin-auth
```

Optional:

- `EXPECT_ADMIN_AUTH_ENFORCED` (default `true`)

CI execution:

- GitHub Actions manual workflow: `.github/workflows/admin-auth-smoke.yml`
- workflow membutuhkan secret repository `CORE_API_ADMIN_TOKEN`

## Ingest Burst Load Test

Run burst load test against a running server:

```bash
set CORE_API_BASE_URL=http://localhost:4000
set LOAD_TOTAL_REQUESTS=1000
set LOAD_CONCURRENCY=50
set LOAD_MAX_FAILURE_RATE=0.01
set LOAD_MAX_P95_MS=1500
pnpm --filter @bst/core-api load:ingest-burst
```

Optional tuning variables:

- `LOAD_DUPLICATE_EVERY` (contoh `10` = tiap request ke-10 menduplikasi idempotency key sebelumnya)
- `LOAD_REQUEST_TIMEOUT_MS` (default `15000`)
- `LOAD_SOURCE` / `LOAD_EVENT_TYPE` (default `DIRECT` / `CREATED`)

Load report JSON akan ditulis ke:

- `reports/load/ingest/{timestamp}.json`

## Ingest DLQ Growth Gate (F-03)

Run automated gate check for `DLQ growth <= 20 event/jam` using live metrics endpoint:

```bash
set CORE_API_BASE_URL=http://localhost:4000
set CORE_API_ADMIN_TOKEN=dev-admin-token
set GATE_DLQ_WINDOW_MINUTES=120
set GATE_DLQ_SAMPLE_INTERVAL_SECONDS=60
set GATE_DLQ_MAX_GROWTH_PER_HOUR=20
pnpm --filter @bst/core-api gate:ingest-dlq-growth
```

Optional thresholds:

- `GATE_DLQ_MAX_FETCH_ERRORS` (default `0`)
- `GATE_DLQ_MAX_QUEUE_WAITING` (optional)
- `GATE_DLQ_MAX_QUEUE_FAILED` (optional)
- `GATE_DLQ_INCLUDE_STATUSES` (default `OPEN,READY,REPLAYING,FAILED`)

Gate report JSON akan ditulis ke:

- `reports/gates/ingest-dlq-growth/{timestamp}.json`

## Ingest Processing Gate (F-01/F-02)

Run automated gate check for:

- `F-01` event success rate `>= 99.5%` (rolling window)
- `F-02` latency median `<= 3s` and p95 `<= 15s` (rolling window)

```bash
set CORE_API_BASE_URL=http://localhost:4000
set CORE_API_ADMIN_TOKEN=dev-admin-token
set GATE_PROCESSING_WINDOW_MINUTES=60
set GATE_PROCESSING_MIN_SUCCESS_RATE=0.995
set GATE_PROCESSING_MAX_MEDIAN_MS=3000
set GATE_PROCESSING_MAX_P95_MS=15000
pnpm --filter @bst/core-api gate:ingest-processing
```

Optional thresholds:

- `GATE_PROCESSING_MIN_RECEIVED` (default `1`)
- `GATE_PROCESSING_MIN_LATENCY_SAMPLE` (default `1`)

Gate report JSON akan ditulis ke:

- `reports/gates/ingest-processing/{timestamp}.json`

## API Health Gate (G-03)

Run automated gate check for global gate:

- `G-03` API 5xx core path `<= 1.5%` selama 15 menit

```bash
set CORE_API_BASE_URL=http://localhost:4000
set CORE_API_ADMIN_TOKEN=dev-admin-token
set GATE_API_WINDOW_MINUTES=15
set GATE_API_MAX_5XX_RATE=0.015
pnpm --filter @bst/core-api gate:api-health
```

Optional thresholds:

- `GATE_API_MIN_REQUESTS` (default `1`)
- `GATE_API_REQUEST_TIMEOUT_MS` (default `10000`)

Gate report JSON akan ditulis ke:

- `reports/gates/api-health/{timestamp}.json`

CI execution:

- GitHub Actions manual workflow: `.github/workflows/api-health-gate.yml`
- workflow membutuhkan secret repository `CORE_API_ADMIN_TOKEN`

## Reconciliation Daily Report (T-011-03)

Run automated reconciliation report dari endpoint runtime observability:

```bash
set CORE_API_BASE_URL=http://localhost:4000
set CORE_API_ADMIN_TOKEN=dev-admin-token
set RECON_REPORT_FAIL_ON_CHECKS=true
pnpm --filter @bst/core-api report:reconciliation-daily
```

Output evidence:

- `reports/recon/daily/{timestamp}.json`
- `reports/recon/daily/{timestamp}.md`

Optional thresholds/config:

- `RECON_MAX_GLOBAL_MISMATCH_RATIO` (default `0.01`)
- `QUALITY_MAX_OPS_DONE_NOT_PAID_RATIO` (default `0.01`)
- `QUALITY_MAX_UNMAPPED_RATIO_PERCENT` (default `5`)
- `RECON_REPORT_REQUEST_TIMEOUT_MS` (default `10000`)

CI execution:

- GitHub Actions schedule + manual workflow: `.github/workflows/reconciliation-daily-report.yml`
- workflow membutuhkan:
  - secret `CORE_API_ADMIN_TOKEN`
  - variable repository `CORE_API_BASE_URL` (untuk mode schedule)

## Ingest Release Gate Runner

Run combined gate execution for ingestion release evidence:

```bash
set CORE_API_BASE_URL=http://localhost:4000
set CORE_API_ADMIN_TOKEN=dev-admin-token
pnpm --filter @bst/core-api gate:ingest-release
```

Gate toggles:

- `RUN_GATE_PROCESSING` (default `true`)
- `RUN_GATE_DLQ_GROWTH` (default `true`)

Combined report JSON akan ditulis ke:

- `reports/gates/ingest-release/{timestamp}.json`
- `reports/gates/ingest-release/{timestamp}.md`

CI execution:

- GitHub Actions manual workflow tersedia di `.github/workflows/ingest-release-gate.yml`
- workflow akan upload artifact report dari folder `reports/gates/*`
- workflow membutuhkan secret repository `CORE_API_ADMIN_TOKEN`

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
