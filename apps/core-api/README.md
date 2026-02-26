# Core API

NestJS baseline service for the unified booking core domain.

## Available Endpoints

- `GET /health`
- `GET /health/db`
- `GET /docs`
- `GET /v1/metrics/api?windowMinutes=15`
- `GET /v1/metrics/reconciliation`

Catalog read:

- `GET /v1/catalog/items`
- `GET /v1/catalog/items/{slug}`
- `GET /v1/catalog/items/featured`

Catalog read implementation:

- DB-backed via `OPS_DB_URL` pada tabel `catalog_product`, `catalog_variant`, `catalog_variant_rate`.
- Jika schema catalog belum tersedia, endpoint akan mengembalikan `CATALOG_READ_MODEL_NOT_READY`.

Catalog editor (admin token + `x-admin-role`):

- `GET /v1/catalog/items/id/{itemId}?includeInactive=true`
- `POST /v1/catalog/items`
- `PATCH /v1/catalog/items/{itemId}`
- `DELETE /v1/catalog/items/{itemId}`
- `POST /v1/catalog/items/{itemId}/variants`
- `PATCH /v1/catalog/variants/{variantId}`
- `DELETE /v1/catalog/variants/{variantId}`
- `POST /v1/catalog/variants/{variantId}/rates`
- `PATCH /v1/catalog/rates/{rateId}`
- `DELETE /v1/catalog/rates/{rateId}`

Catalog publish workflow (admin token + `x-admin-role`):

- `GET /v1/catalog/publish/jobs`
- `GET /v1/catalog/publish/jobs/{jobId}`
- `POST /v1/catalog/publish/jobs`
- `POST /v1/catalog/publish/jobs/{jobId}/submit-review`
- `POST /v1/catalog/publish/jobs/{jobId}/publish`
- `POST /v1/catalog/publish/jobs/{jobId}/retry`

Catalog publish workflow gate:

- `pnpm --filter @bst/core-api gate:catalog-publish-workflow`
- output:
  - `reports/gates/catalog-publish-workflow/{timestamp}.json`
  - `reports/gates/catalog-publish-workflow/{timestamp}.md`

Catalog editor CRUD smoke:

- `pnpm --filter @bst/core-api smoke:catalog-editor`
- output:
  - `reports/smoke/catalog-editor/{timestamp}.json`
  - `reports/smoke/catalog-editor/{timestamp}.md`

## Run

```bash
pnpm --filter @bst/core-api dev
```

## Database Model (Current)

Default runtime memakai 2 database:

- `OPS_DB_URL` (operasional)
- `CHANNEL_DB_URL` (content/channel)

Untuk kebutuhan migrasi/backfill lintas source, override berikut bersifat opsional:

- `BALISNAP_DB_URL`
- `BSTADMIN_DB_URL`

Jika override tidak diisi, script otomatis fallback ke `OPS_DB_URL`.

Untuk script Batch C/D/E, resolver juga mencoba membaca legacy file lokal:

- `balisnap/.env` (`DATABASE_URL`) sebagai kandidat source `BALISNAP_DB_URL`
- `bstadmin/.env` / `bstadmin/.env.production` (`DATABASE_URL`) sebagai kandidat source `BSTADMIN_DB_URL`

Legacy alias yang tetap didukung:

- `DATABASE_URL` -> dipakai sebagai fallback `OPS_DB_URL`
- `SYNC_DATABASE_URL` -> dipakai sebagai fallback `CHANNEL_DB_URL` (runtime service)

Jika `OPS_DB_URL` tidak diset, script batch akan mencoba kandidat legacy berurutan:

1. `apps/core-api/.env` (`OPS_DB_URL`/`DATABASE_URL`)
2. `balisnap/.env` (`DATABASE_URL`)
3. `bstadmin/.env` / `bstadmin/.env.production` (`DATABASE_URL`/`SYNC_DATABASE_URL`)

## Phase-2 Migration Runner

Dry-run:

```bash
set PHASE2_DRY_RUN=true
set PHASE2_BATCH_CODE=A
pnpm --filter @bst/core-api migrate:phase2
```

Execute against `balisnaptrip_ops`:

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnaptrip_ops
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
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnaptrip_ops
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

## Catalog Bridge Backfill (EP-004)

Run extractor + bridge upsert for `catalog_product`, `catalog_variant`, `catalog_variant_rate`:

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnaptrip_ops
set PHASE2_BATCH_CODE=C
pnpm --filter @bst/core-api backfill:catalog-bridge
```

Notes:

- If `BALISNAP_DB_URL` or `BSTADMIN_DB_URL` is not set, script falls back to `OPS_DB_URL`.
- Optional override jika source beda DB:
  - `BALISNAP_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnap_db`
  - `BSTADMIN_DB_URL=postgresql://postgres:postgres@localhost:5432/bstadmin_db`
- Optional dry-run mode: `CATALOG_BACKFILL_DRY_RUN=true`.

Output evidence:

- `reports/recon/{PHASE2_BATCH_CODE}/{timestamp}-catalog-bridge-backfill.json`
- `reports/recon/{PHASE2_BATCH_CODE}/{timestamp}-catalog-bridge-backfill.md`

CI execution:

- GitHub Actions manual workflow: `.github/workflows/catalog-bridge-backfill.yml`
- workflow membutuhkan secret:
  - `OPS_DB_URL`
  - `BALISNAP_DB_URL` (opsional jika source berada di DB terpisah)
  - `BSTADMIN_DB_URL` (opsional jika source berada di DB terpisah)

## Catalog Bridge Gate (Batch C)

Run automated checks for Batch C gates:

- `C-01` orphan ratio (`<= 0.5%`)
- `C-02` unmapped ratio (`<= 5%`, denominator > 0)
- `C-03` variant active rate coverage (`100%`)

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnaptrip_ops
set PHASE2_BATCH_CODE=C
pnpm --filter @bst/core-api gate:catalog-bridge
```

Optional thresholds:

- `GATE_CATALOG_MAX_ORPHAN_RATIO_PERCENT` (default `0.5`)
- `GATE_CATALOG_MAX_UNMAPPED_RATIO_PERCENT` (default `5`)

Output evidence:

- `reports/gates/catalog-bridge/{timestamp}.json`
- `reports/gates/catalog-bridge/{timestamp}.md`

CI execution:

- GitHub Actions manual workflow: `.github/workflows/catalog-bridge-gate.yml`
- workflow membutuhkan secret `OPS_DB_URL`

## Booking Bridge Backfill (EP-005)

Run backfill booking bridge (`booking_core`, `booking_contact`, `booking_party`, `booking_item_snapshot`, `channel_external_refs` booking, `ops_booking_state`, `ops_finance_bridge`):

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnaptrip_ops
set PHASE2_BATCH_CODE=D
pnpm --filter @bst/core-api backfill:booking-bridge
```

Notes:

- If `BALISNAP_DB_URL` or `BSTADMIN_DB_URL` is not set, script falls back to `OPS_DB_URL`.
- Optional override jika source beda DB:
  - `BALISNAP_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnap_db`
  - `BSTADMIN_DB_URL=postgresql://postgres:postgres@localhost:5432/bstadmin_db`
- Optional dry-run mode: `BOOKING_BACKFILL_DRY_RUN=true`.

Output evidence:

- `reports/recon/{PHASE2_BATCH_CODE}/{timestamp}-booking-bridge-backfill.json`
- `reports/recon/{PHASE2_BATCH_CODE}/{timestamp}-booking-bridge-backfill.md`

CI execution:

- GitHub Actions manual workflow: `.github/workflows/booking-bridge-backfill.yml`
- workflow membutuhkan secret:
  - `OPS_DB_URL`
  - `BALISNAP_DB_URL` (opsional jika source berada di DB terpisah)
  - `BSTADMIN_DB_URL` (opsional jika source berada di DB terpisah)

## Booking Bridge Gate (Batch D)

Run automated checks for Batch D gates:

- `D-01` duplicate booking identity (`0`)
- `D-02` null critical identity field (`0`)
- `D-03` pax mismatch ratio booking vs item (`<= 1%`)
- `D-04` `package_ref_type` completeness (null `= 0`)

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnaptrip_ops
set PHASE2_BATCH_CODE=D
pnpm --filter @bst/core-api gate:booking-bridge
```

Optional thresholds:

- `GATE_BOOKING_MAX_PAX_MISMATCH_RATIO_PERCENT` (default `1`)

Output evidence:

- `reports/gates/booking-bridge/{timestamp}.json`
- `reports/gates/booking-bridge/{timestamp}.md`

CI execution:

- GitHub Actions manual workflow: `.github/workflows/booking-bridge-gate.yml`
- workflow membutuhkan secret `OPS_DB_URL`

## Payment Finance Bridge Backfill (EP-006)

Run backfill payment + finance bridge (`payment_event`, `ops_finance_bridge`, update `booking_core.customer_payment_status`, sync `ops_booking_state`):

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnaptrip_ops
set PHASE2_BATCH_CODE=E
pnpm --filter @bst/core-api backfill:payment-finance-bridge
```

Notes:

- If `BALISNAP_DB_URL` or `BSTADMIN_DB_URL` is not set, script falls back to `OPS_DB_URL`.
- Optional override jika source beda DB:
  - `BALISNAP_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnap_db`
  - `BSTADMIN_DB_URL=postgresql://postgres:postgres@localhost:5432/bstadmin_db`
- Optional dry-run mode: `PAYMENT_BACKFILL_DRY_RUN=true`.

Output evidence:

- `reports/recon/{PHASE2_BATCH_CODE}/{timestamp}-payment-finance-bridge-backfill.json`
- `reports/recon/{PHASE2_BATCH_CODE}/{timestamp}-payment-finance-bridge-backfill.md`

CI execution:

- GitHub Actions manual workflow: `.github/workflows/payment-finance-bridge-backfill.yml`
- workflow membutuhkan secret:
  - `OPS_DB_URL`
  - `BALISNAP_DB_URL` (opsional jika source berada di DB terpisah)
  - `BSTADMIN_DB_URL` (opsional jika source berada di DB terpisah)

## Payment Finance Bridge Gate (Batch E)

Run automated checks for Batch E gates:

- `E-01` orphan payment event (`0`)
- `E-02` `ops=DONE` but `payment!=PAID` ratio (`<= 0.3%`)
- `E-03` direct payment sample audit accuracy (`100%`)

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnaptrip_ops
set PHASE2_BATCH_CODE=E
pnpm --filter @bst/core-api gate:payment-finance-bridge
```

Notes:

- Script audit source default ke `OPS_DB_URL`.
- Optional override source audit:
  - `BALISNAP_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnap_db`
- Jika tidak ada `direct payment event` pada window sample (`directPaymentTotal=0`), hasil `E-03` dilaporkan `N/A` dan dianggap `PASS`.

Optional thresholds:

- `GATE_PAYMENT_MAX_OPS_DONE_NOT_PAID_RATIO_PERCENT` (default `0.3`)
- `GATE_PAYMENT_DIRECT_SAMPLE_SIZE` (default `25`)

Output evidence:

- `reports/gates/payment-finance/{timestamp}.json`
- `reports/gates/payment-finance/{timestamp}.md`

CI execution:

- GitHub Actions manual workflow: `.github/workflows/payment-finance-bridge-gate.yml`
- workflow membutuhkan secret:
  - `OPS_DB_URL`
  - `BALISNAP_DB_URL` (opsional jika source audit terpisah)

## Phase-2 Release Evidence Runner

Run combined release evidence stages (quality + ingest + optional catalog/booking/payment gates):

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnaptrip_ops
set CORE_API_BASE_URL=http://localhost:4000
set CORE_API_ADMIN_TOKEN=dev-admin-token
set PHASE2_BATCH_CODE=A
pnpm --filter @bst/core-api release:evidence
```

Toggles:

- `RUN_EVIDENCE_QUALITY_CHECK` (default `true`)
- `RUN_EVIDENCE_INGEST_GATES` (default `true`)
- `RUN_EVIDENCE_INGEST_REPLAY_DRILL` (default `false`; jika `true`, ingest gate juga menjalankan replay drill)
- `RUN_EVIDENCE_INGEST_DUPLICATE_GATE` (default `false`; jika `true`, ingest gate juga menjalankan `F-04`)
- `RUN_EVIDENCE_INGEST_RETENTION_GATE` (default `false`; jika `true`, ingest gate juga menjalankan `F-05`)
- `RUN_EVIDENCE_CATALOG_GATE` (default `false`)
- `RUN_EVIDENCE_BOOKING_GATE` (default `false`)
- `RUN_EVIDENCE_PAYMENT_GATE` (default `false`)
- `RUN_EVIDENCE_CATALOG_PUBLISH_GATE` (default `false`)

Reports are written to:

- `reports/release-evidence/{PHASE2_BATCH_CODE}/{timestamp}.json`
- `reports/release-evidence/{PHASE2_BATCH_CODE}/{timestamp}.md`

CI execution:

- GitHub Actions manual workflow: `.github/workflows/phase2-release-evidence.yml`
- workflow membutuhkan:
  - secret `OPS_DB_URL` (jika `RUN_EVIDENCE_QUALITY_CHECK=true` atau `RUN_EVIDENCE_CATALOG_GATE=true` atau `RUN_EVIDENCE_BOOKING_GATE=true` atau `RUN_EVIDENCE_PAYMENT_GATE=true`)
  - secret `BALISNAP_DB_URL` (opsional untuk override source audit payment gate)
  - variable repository `CORE_API_BASE_URL` (jika `RUN_EVIDENCE_INGEST_GATES=true`)
  - secret `CORE_API_ADMIN_TOKEN` (jika `RUN_EVIDENCE_INGEST_GATES=true`)
  - variable repository `CORE_API_BASE_URL` + secret `CORE_API_ADMIN_TOKEN` (jika `RUN_EVIDENCE_CATALOG_PUBLISH_GATE=true`)
  - secret `CATALOG_PUBLISH_SECRET` (jika `RUN_EVIDENCE_CATALOG_PUBLISH_GATE=true` dan `GATE_CATALOG_PUBLISH_EXPECT_SIGNATURE_REQUIRED=true`)
  - secret `OPS_DB_URL` (jika `RUN_EVIDENCE_INGEST_DUPLICATE_GATE=true` atau `RUN_EVIDENCE_INGEST_RETENTION_GATE=true`)
  - secret `INGEST_SERVICE_TOKEN` + `INGEST_SERVICE_SECRET` (jika `RUN_EVIDENCE_INGEST_REPLAY_DRILL=true`)

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
- `INGEST_SYNC_FALLBACK_ENABLED` enables inline processing when queue enqueue is unavailable (`queued=false`)

Admin auth for protected ops endpoints (`/v1/audit/*`, `/v1/ingest/dead-letter/*`, `/v1/ingest/metrics/*`, `/v1/ops/bookings/*`, `/v1/channel-mappings/*`, replay/fail):

- `authorization: Bearer <admin-token>`
- `x-admin-role: ADMIN | STAFF | MANAGER`
- env:
  - `ADMIN_AUTH_ENABLED` (default `true`)
  - `CORE_API_ADMIN_TOKEN` (default `dev-admin-token` for local)

Ingest storage behavior:

- accepted events are persisted to `ingest_event_log` in `balisnaptrip_ops`
- nonce replay check is validated from `ingest_event_log` within TTL window
- idempotency uses `idempotency_key` + secondary dedup key
- replay endpoint requires event to exist in `ingest_dead_letter`

Dead-letter operations:

- `GET /v1/ingest/dead-letter`
- `GET /v1/ingest/dead-letter/{deadLetterKey}`
- `PATCH /v1/ingest/dead-letter/{deadLetterKey}/status/{status}`
- `POST /v1/ingest/bookings/events/{eventId}/fail` (move event to DLQ)
- `GET /v1/ingest/metrics/queue` (queue depth + DLQ status + retry backlog metrics)
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

## Ingest Replay Drill (T-007-04)

Run operational replay drill untuk evidence lifecycle DLQ + audit:

```bash
set CORE_API_BASE_URL=http://localhost:4000
set CORE_API_ADMIN_TOKEN=dev-admin-token
set INGEST_SERVICE_TOKEN=dev-service-token
set INGEST_SERVICE_SECRET=dev-service-secret
pnpm --filter @bst/core-api drill:ingest-replay
```

Output evidence:

- `reports/gates/ingest-replay-drill/{timestamp}.json`
- `reports/gates/ingest-replay-drill/{timestamp}.md`

Default pass criteria:

1. replay request diterima (`queued=true` atau `processedInline=true`)
2. dead-letter lifecycle final status `SUCCEEDED`
3. event process status final `DONE`
4. audit events tersedia untuk fail, status update, replay

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

## Ingest Duplicate Delivery Gate (F-04)

Run automated gate check untuk memastikan tidak ada duplicate delivery yang lolos ke aggregate:

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnaptrip_ops
pnpm --filter @bst/core-api gate:ingest-duplicate-delivery
```

Optional thresholds/config:

- `GATE_DUPLICATE_MAX_EXCESS_ROWS` (default `0`)
- `GATE_DUPLICATE_REQUIRE_INDEXES` (default `true`)

Gate report JSON akan ditulis ke:

- `reports/gates/ingest-duplicate-delivery/{timestamp}.json`

## Ingest Retention Policy Gate (F-05)

Run automated gate check untuk validasi policy retention ingestion aktif:

```bash
set OPS_DB_URL=postgresql://postgres:postgres@localhost:5432/balisnaptrip_ops
set INGEST_NONCE_TTL_MINUTES=10
set INGEST_IDEMPOTENCY_TTL_DAYS=35
set INGEST_DLQ_RETENTION_DAYS=30
pnpm --filter @bst/core-api gate:ingest-retention-policy
```

Optional thresholds/config:

- `GATE_RETENTION_REQUIRED_NONCE_TTL_MINUTES` (default `10`)
- `GATE_RETENTION_REQUIRED_IDEMPOTENCY_TTL_DAYS` (default `35`)
- `GATE_RETENTION_REQUIRED_DLQ_RETENTION_DAYS` (default `30`)
- `GATE_RETENTION_MAX_STALE_DLQ_ROWS` (default `0`)
- `GATE_RETENTION_MAX_STALE_INGEST_ROWS` (default `0`)

Gate report JSON akan ditulis ke:

- `reports/gates/ingest-retention-policy/{timestamp}.json`

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
- `RUN_GATE_DUPLICATE_DELIVERY` (default `false`)
- `RUN_GATE_RETENTION_POLICY` (default `false`)
- `RUN_GATE_REPLAY_DRILL` (default `false`)

Combined report JSON akan ditulis ke:

- `reports/gates/ingest-release/{timestamp}.json`
- `reports/gates/ingest-release/{timestamp}.md`
- `reports/gates/ingest-duplicate-delivery/{timestamp}.json` (jika `RUN_GATE_DUPLICATE_DELIVERY=true`)
- `reports/gates/ingest-retention-policy/{timestamp}.json` (jika `RUN_GATE_RETENTION_POLICY=true`)
- `reports/gates/ingest-replay-drill/{timestamp}.json` (jika `RUN_GATE_REPLAY_DRILL=true`)
- `reports/gates/ingest-replay-drill/{timestamp}.md` (jika `RUN_GATE_REPLAY_DRILL=true`)

CI execution:

- GitHub Actions manual workflow tersedia di `.github/workflows/ingest-release-gate.yml`
- workflow akan upload artifact report dari folder `reports/gates/*`
- workflow membutuhkan secret repository `CORE_API_ADMIN_TOKEN`
- jika `RUN_GATE_DUPLICATE_DELIVERY=true` atau `RUN_GATE_RETENTION_POLICY=true`, workflow juga membutuhkan `OPS_DB_URL`
- jika `RUN_GATE_REPLAY_DRILL=true`, workflow juga membutuhkan `INGEST_SERVICE_TOKEN` dan `INGEST_SERVICE_SECRET`

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

