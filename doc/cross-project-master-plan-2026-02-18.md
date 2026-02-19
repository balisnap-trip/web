# Cross-Project Master Plan (Detailed Execution Spec)

Tanggal baseline: 2026-02-18  
Update lock: 2026-02-19  
Mode: gabungan Plan A (execution depth) + Plan B (architecture resilience).

## 1. Sasaran Bisnis dan Teknis

## 1.1 Sasaran Bisnis

1. Menjaga operasi booking stabil saat volume tamu naik.
2. Menghindari reconstruction arsitektur besar saat scale.
3. Memisahkan domain operasional dan content management secara jelas.

## 1.2 Sasaran Teknis

1. Menyatukan domain logic kritis di core backend.
2. Menstandarkan contract lintas aplikasi.
3. Menjamin integritas data lintas channel dengan ingest event idempotent.

## 2. Target Arsitektur

## 2.1 Logical System Map

1. Channel Producers:
   1. `web` direct booking,
   2. OTA email adapters,
   3. content manager publish events.
2. Core Domain Runtime:
   1. `apps/core-api` (NestJS).
3. Consumer Apps:
   1. `apps/admin-ops`,
   2. `apps/web`,
   3. `apps/content-manager`.

## 2.2 App Layout (Monorepo Target)

Tooling lock:

1. package manager: `pnpm`,
2. task orchestrator: `Turborepo`,
3. release versioning package contracts: `Changesets`.

Layout target:

1. `apps/web`
2. `apps/admin-ops`
3. `apps/content-manager`
4. `apps/core-api`
5. `packages/contracts`
6. `packages/shared-types`
7. `packages/config`

## 2.3 Core API Module Boundaries

1. `ingestion-module`
   1. menerima event booking/publish,
   2. verifikasi signature,
   3. push ke queue,
   4. idempotency guard.
2. `ops-booking-module`
   1. booking aggregate,
   2. assignment hooks,
   3. ops status transitions.
3. `catalog-module`
   1. canonical product/variant/read model.
4. `channel-mapping-module`
   1. external refs mapping,
   2. unmapped queue workflows.
5. `payment-integration-module`
   1. payment event capture/verification bridge.
6. `finance-bridge-module`
   1. linking ops booking and finance items.
7. `audit-observability-module`
   1. audit log,
   2. event trace,
   3. metrics export.

## 2.4 Data Topology

1. `ops_db`
   1. booking operasional,
   2. assignment,
   3. finance,
   4. notifications,
   5. audit.
2. `channel_db`
   1. catalog read model,
   2. channel projection/mapping metadata,
   3. publish state.
3. Aturan wajib:
   1. no cross-db join di runtime domain logic,
   2. komunikasi lintas domain via API/event contract.

## 2.5 Frontend UI/UX Strategy (Locked)

1. `admin-ops`:
   1. UI/UX lama dipertahankan sebagai baseline,
   2. standardisasi dilakukan untuk komponen tidak konsisten.
2. `content-manager`:
   1. wajib memakai basis UI framework/modul yang sama dari admin panel saat ini,
   2. pattern baru harus selaras dengan design token admin.
3. `web public`:
   1. menggunakan UI/UX asli yang berjalan sekarang,
   2. perubahan hanya untuk consistency fix, accessibility, dan usability improvement,
   3. tidak ada redesign total di fase migrasi inti.
4. Komponen prioritas standardisasi sekarang:
   1. button, input, select, textarea,
   2. table/list + pagination + filter bar,
   3. badge/status chip,
   4. modal/drawer/confirmation dialog,
   5. form validation states dan feedback message.

## 3. End-to-End Flow Target

## 3.1 OTA Email Flow

1. IMAP pull -> raw email persisted.
2. classifier set `isBookingEmail`.
3. parser menghasilkan normalized booking event.
4. booking event diproses oleh `ops-booking-module`.
5. `ops_fulfillment_status` dihitung ulang.

## 3.2 Direct Web Booking Flow

1. booking dibuat di channel web flow.
2. setelah booking confirmed/captured, web emit event ke ingest endpoint.
3. core-api melakukan idempotent upsert ke ops aggregate.
4. admin ops melihat booking sebagai source channel event.

## 3.3 Content Manager Publish Flow

1. editor ubah katalog di content manager.
2. publish job menghasilkan payload versioned.
3. core-api memvalidasi payload dan update channel read model.
4. web consume read model publish-ready.

## 4. Status Model dan Mapping

## 4.1 Domain Status Separation

1. `customer_payment_status`:
   1. `DRAFT`
   2. `PENDING_PAYMENT`
   3. `PAID`
   4. `FAILED`
   5. `REFUNDED`
2. `ops_fulfillment_status`:
   1. `NEW`
   2. `READY`
   3. `ATTENTION`
   4. `COMPLETED`
   5. `DONE`
   6. `UPDATED`
   7. `CANCELLED`
   8. `NO_SHOW`

## 4.2 Mapping Rule (Service Layer)

1. payment `PAID` tidak otomatis berarti ops `DONE`.
2. ops `DONE` ditentukan oleh settlement finance complete.
3. `CANCELLED` dan `NO_SHOW` adalah terminal di ops flow.

## 5. Security and Compliance Baseline

1. Signed ingestion requests:
   1. `x-signature`,
   2. `x-signature-algorithm: HMAC-SHA256`,
   3. `x-timestamp`,
   4. `x-nonce`,
   5. `x-idempotency-key`,
   6. drift window `<= 5 menit`.
2. Replay protection:
   1. idempotency key TTL `35 hari`,
   2. nonce TTL `10 menit`.
3. Queue processing baseline:
   1. broker `Redis + BullMQ`,
   2. retry `30s, 2m, 10m, 30m, 2h` (max 5 attempt),
   3. non-retryable langsung DLQ,
   4. DLQ retention `30 hari`.
4. RBAC:
   1. admin/staff/manager scopes.
5. Audit log mandatory:
   1. mapping changes,
   2. manual status override,
   3. replay actions.

## 6. Delivery Plan (Detailed)

## Fase 0 (Week 1-2): Foundation

Deliverables:

1. monorepo scaffold,
2. `pnpm-workspace` + `turbo.json` + `changeset` config aktif,
3. build pipeline,
4. shared contracts package skeleton,
5. UI audit admin panel + daftar komponen tidak konsisten.

Exit criteria:

1. semua app build hijau,
2. lint/typecheck standard aktif.

## Fase 1 (Week 3-4): Core API Skeleton

Deliverables:

1. Nest modules scaffold,
2. healthcheck + OpenAPI endpoint,
3. DB connections for `ops_db` and `channel_db`.

Exit criteria:

1. module boundaries compile,
2. integration test koneksi DB lolos.

## Fase 2 (Week 5-7): Contract + Migration Foundation

Deliverables:

1. API v1 contracts final,
2. additive schema migration batch A-B,
3. initial mapping tables.

Exit criteria:

1. contract tests pass,
2. migration idempotent on rerun.

## Fase 3 (Week 8-10): Backfill + Reconciliation

Deliverables:

1. batch C-D-E migration run,
2. reconciliation reports.

Exit criteria:

1. reconciliation mismatch global `<= 1%` dengan exception list,
2. no duplicate canonical booking.

## Fase 4 (Week 11-13): Ingestion Unification

Deliverables:

1. webhook+queue pipeline aktif,
2. queue runtime lock (`Redis + BullMQ`) diterapkan,
3. replay + DLQ support,
4. email adapters terport ke core ingest path.

Exit criteria:

1. burst ingest tests pass,
2. idempotency tests pass.

## Fase 5 (Week 14-16): Ops Cutover

Deliverables:

1. `admin-ops` read/write utama pindah ke core-api,
2. finance bridge compatibility,
3. shared UI module admin baseline siap dipakai content manager.

Exit criteria:

1. no critical regression on ops screens,
2. status sync output konsisten.

## Fase 6 (Week 17-20): Web + Content Manager Integration

Deliverables:

1. web booking event bridge aktif,
2. content manager publish v1 aktif,
3. content manager menggunakan basis UI yang sama dengan admin,
4. public web tetap visual-consistent dengan UI asli.

Exit criteria:

1. event success rate `>= 99.5%` (rolling 1 jam),
2. no severe public flow regression.

## 7. Acceptance Criteria (Project Level)

1. Tidak ada major downtime public booking.
2. Duplicate booking dari replay/retry = nol (critical severity).
3. Reconciliation mismatch global `<= 1%` dengan daftar exception terdokumentasi.
4. Legacy endpoints bisa dimatikan bertahap dengan rollback jelas.
5. Tim ops mampu menjalankan replay/monitoring tanpa intervensi engineer harian.
6. Komponen UI `admin-ops` dan `content manager` konsisten terhadap standard UI baseline.
7. Tidak ada regressi UX mayor pada `web public` (alur booking/customer tetap familiar).

## 8. Risk Register

1. Contract drift:
   1. mitigasi: CI contract gate + semver policy.
2. Event duplication:
   1. mitigasi: idempotency key + unique constraints + deterministic handlers.
3. Finance drift:
   1. mitigasi: dedicated bridge + settlement reconciliation.
4. Overlap ownership:
   1. mitigasi: single-writer policy per domain module.
5. UI drift antar admin dan content manager:
   1. mitigasi: shared component baseline + review checklist UI.
6. Regressi visual web public:
   1. mitigasi: screenshot regression dan review QA alur booking.

## 9. Artifacts Wajib Per Fase

1. technical spec updates di `doc/`.
2. migration scripts + execution logs.
3. reconciliation reports.
4. test evidence (unit/integration/e2e).
5. release checklist + rollback checklist.
6. deploy topology + runbook staging/prod:
   1. `doc/prep-deployment-topology-strategy-2026-02-20.md`,
   2. `doc/runbook-stagging-core-api-deploy-2026-02-20.md`.
