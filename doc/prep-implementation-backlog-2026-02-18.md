# Implementation Backlog (Detailed Delivery Breakdown)

Tanggal baseline: 2026-02-18  
Model delivery: Plan A + Plan B merged  
Status: aktif

## 1. Tujuan Backlog

1. Memecah master plan menjadi item kerja konkret.
2. Menetapkan dependency, urutan, dan acceptance criteria.
3. Menjadi acuan eksekusi mingguan sampai cutover stabil.

## 2. Definisi Status Task

| Status | Arti |
|---|---|
| `TODO` | belum dikerjakan |
| `IN_PROGRESS` | sedang aktif dikerjakan |
| `BLOCKED` | tertahan dependency/keputusan |
| `READY_REVIEW` | coding selesai, menunggu review |
| `DONE` | selesai dan lolos acceptance |

## 3. Workstream Utama

| Kode | Workstream | Fokus |
|---|---|---|
| WS-01 | Platform Foundation | monorepo, CI/CD, env standard |
| WS-02 | Core API Skeleton | NestJS modules, OpenAPI, auth baseline |
| WS-03 | Data Foundation | schema additive + seed |
| WS-04 | Catalog Bridge | sinkronisasi product/variant/rate/media |
| WS-05 | Booking Bridge | identity booking, contact, item snapshot |
| WS-06 | Payment and Finance Bridge | payment events + settlement linkage |
| WS-07 | Ingestion Pipeline | webhook, queue, DLQ, replay |
| WS-08 | Admin Ops Integration | read/write adapter ke core-api + UI consistency uplift |
| WS-09 | Web Integration | emit booking event + read catalog contract |
| WS-10 | Content Manager | publish flow + moderation workflow + reuse UI basis admin |
| WS-11 | Observability and Ops | dashboard, alerting, runbook |
| WS-12 | Cutover and Stabilization | rollout bertahap + rollback readiness |
| WS-13 | UI/UX Standardization | standardisasi komponen admin+CM, public web continuity |

## 3.1 Tooling Lock (WS-01)

1. package manager: `pnpm`.
2. task orchestration: `Turborepo`.
3. package versioning/release: `Changesets`.

## 4. Epic Backlog

| Epic ID | Workstream | Deliverable | Dependency | Durasi |
|---|---|---|---|---|
| EP-001 | WS-01 | monorepo target struktur final | none | 1 minggu |
| EP-002 | WS-02 | `apps/core-api` siap serve contract v1 | EP-001 | 1 minggu |
| EP-003 | WS-03 | migration batch A-B jalan idempotent | EP-002 | 1 minggu |
| EP-004 | WS-04 | catalog bridge + unmapped queue aktif | EP-003 | 2 minggu |
| EP-005 | WS-05 | booking bridge lintas source stabil | EP-003 | 2 minggu |
| EP-006 | WS-06 | payment/finance bridge tervalidasi | EP-005 | 1 minggu |
| EP-007 | WS-07 | webhook + queue + replay production-ready | EP-005 | 2 minggu |
| EP-008 | WS-08 | admin read via core-api | EP-007 | 1 minggu |
| EP-009 | WS-09 | web emit ingest event + fallback | EP-007 | 1 minggu |
| EP-010 | WS-10 | content manager v1 publish pipeline | EP-004 | 2 minggu |
| EP-011 | WS-11 | SLO dashboard + alert + playbook | EP-007 | paralel 2 minggu |
| EP-012 | WS-12 | write cutover + stabilization selesai | EP-008, EP-009, EP-011 | 2 minggu |
| EP-013 | WS-13 | UI baseline standardization + regression guard | EP-001 | 2 minggu paralel |

## 5. Detail Task per Epic

### EP-001 Platform Foundation

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-001-00 | lock tooling monorepo | `pnpm-workspace.yaml`, `turbo.json`, `.changeset/` | seluruh workspace build via `pnpm turbo` |
| T-001-01 | buat struktur `apps/*` dan `packages/*` | folder dan config baseline | semua app dapat build lokal |
| T-001-02 | setup shared tsconfig/eslint/prettier | aturan linting konsisten | lint pass semua workspace |
| T-001-03 | setup CI pipeline basic | workflow build + test | pipeline hijau pada branch utama |
| T-001-04 | setup environment template | `.env.example` per app | tidak ada secret hardcoded |
| T-001-05 | lock deployment topology staging/prod | dokumen strategi path deploy + rollback aktif | path server dan command deploy konsisten di runbook |

### EP-002 Core API Skeleton

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-002-01 | scaffold NestJS app | `apps/core-api` runnable | endpoint `/health` 200 |
| T-002-02 | module boundaries awal | module `catalog`, `booking`, `ingest`, `mapping`, `audit` | compile sukses tanpa circular deps |
| T-002-03 | OpenAPI bootstrap | docs endpoint aktif | schema minimal endpoint tersedia |
| T-002-04 | auth guard baseline | service token + role guard | unauthorized request ditolak |

### EP-003 Data Foundation

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-003-01 | implement migration batch A | tabel bridge terbentuk | migration rerun aman |
| T-003-02 | implement migration batch B | seed reference data | duplikasi seed = 0 |
| T-003-03 | buat migration run logger | tabel `migration_run_log` aktif | setiap run tercatat statusnya |
| T-003-04 | buat precheck script | script validasi lock/space/index | precheck wajib pass sebelum migrate |

### EP-004 Catalog Bridge

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-004-01 | extractor `balisnap` catalog | dataset product/variant/rate | jumlah row sesuai source |
| T-004-02 | extractor `bstadmin` catalog | dataset tour/package/image | jumlah row sesuai source |
| T-004-03 | matcher auto-map | slug/legacy/name matching | hit ratio auto-map >= 95% |
| T-004-04 | unmapped queue service | API list/resolve unmapped | unresolved reason tercatat |
| T-004-05 | reconciliation catalog | report orphan/mismatch | orphan <= 0.5% |

### EP-005 Booking Bridge

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-005-01 | backfill booking identity | `booking_core` populated | duplicate key = 0 |
| T-005-02 | backfill contact dan party | `booking_contact`, `booking_party` | field critical null = 0 |
| T-005-03 | merge rule placeholder contact | logic anti-overwrite placeholder | contact valid tidak terganti placeholder |
| T-005-04 | backfill booking item snapshot | `booking_item_snapshot` populated | sample audit cocok source |
| T-005-05 | status separation service | `customer_payment_status` + `ops_fulfillment_status` | mapping test pass |

### EP-006 Payment and Finance Bridge

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-006-01 | import payment direct | `payment_event` dari `balisnap` | orphan payment = 0 |
| T-006-02 | normalize status payment | status raw -> canonical | error mapping = 0 |
| T-006-03 | link finance settlement | relasi booking-finance konsisten | `DONE` vs settled konsisten |
| T-006-04 | payment reconciliation report | laporan mismatch harian | mismatch <= 0.3% |

### EP-007 Ingestion Pipeline

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-007-01 | endpoint ingest v1 | `POST /v1/ingest/bookings/events` | signed request valid |
| T-007-02 | idempotency guard | store kunci dedup | duplicate event tidak duplikasi booking |
| T-007-03 | queue worker + retry | worker processing pipeline | retry policy berjalan |
| T-007-04 | DLQ + replay endpoint | observasi fail + replay | replay event berhasil |
| T-007-05 | load test burst | hasil benchmark burst | throughput >= 10x peak harian |

### EP-008 Admin Ops Integration

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-008-01 | adapter read booking list | admin list dari core-api | parity data vs legacy lulus |
| T-008-02 | adapter read booking detail | detail booking dari core-api | field penting semua terisi |
| T-008-03 | adapter assignment | assign/unassign via core-api | status sync tetap benar |
| T-008-04 | fallback switch | flag fallback legacy read | rollback read < 5 menit |
| T-008-05 | audit UI inconsistency admin | daftar gap component/pattern | backlog UI prioritas disetujui |
| T-008-06 | harmonisasi komponen admin prioritas | button/form/table/badge/modal seragam | review UI checklist lulus |

### EP-009 Web Integration

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-009-01 | emit booking created event | `balisnap` kirim event ke core | event diterima dan diproses |
| T-009-02 | emit payment captured event | capture PayPal kirim event | payment event konsisten |
| T-009-03 | retry client + signing | idempotency + signature stabil | retry tidak buat duplikasi |
| T-009-04 | fallback ke flow lama | toggle disable emit event | booking web tetap jalan |
| T-009-05 | public web UX continuity check | checklist alur booking existing | tidak ada regressi UX mayor |

### EP-010 Content Manager

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-010-01 | scaffold app content manager | app dasar login + RBAC | login role-based aktif |
| T-010-01A | adopsi basis UI admin panel | token, komponen, layout basis sama | parity visual dasar admin vs CM lulus |
| T-010-02 | catalog editor | CRUD product/variant/rate/media | validasi data lengkap |
| T-010-03 | publish workflow | draft -> review -> publish | audit log publish tercatat |
| T-010-04 | publish contract ke core | event publish versioned | web read model ter-update |

### EP-011 Observability and Ops

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-011-01 | dashboard API metrics | latency, 4xx/5xx, throughput | dashboard akses tim ops |
| T-011-02 | dashboard queue metrics | queue depth, retry, DLQ | alert threshold aktif |
| T-011-03 | reconciliation dashboard | mismatch per domain | daily report otomatis |
| T-011-04 | incident playbook | runbook error utama | tim ops bisa eksekusi mandiri |

### EP-012 Cutover and Stabilization

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-012-01 | rollout read cutover | `OPS_READ_NEW_MODEL_ENABLED` bertahap | user ops stabil |
| T-012-02 | rollout write cutover | `OPS_WRITE_CORE_ENABLED` bertahap | mismatch write <= 0.1% per jam |
| T-012-03 | canary production plan | % traffic bertahap | no critical incident |
| T-012-04 | post-cutover hardening | bugfix + perf tuning | SLA kembali ke baseline |
| T-012-05 | deprecation plan legacy | jadwal matikan endpoint lama | disetujui owner bisnis |
| T-012-06 | visual regression release gate | screenshot baseline + diff report | rilis ditahan jika regressi mayor |

### EP-013 UI/UX Standardization

| Task ID | Task | Output | Acceptance |
|---|---|---|---|
| T-013-00 | lock dokumen standar UI | spec + inventory UI aktif di folder `doc` | disetujui owner dan jadi acuan PR UI |
| T-013-01 | buat UI inventory admin existing | daftar komponen + varian + ketidakkonsistenan | inventory lengkap disetujui |
| T-013-02 | definisikan UI baseline tokens | warna, spacing, radius, typography, elevation | token baseline dipakai admin+CM |
| T-013-03 | standardisasi komponen prioritas | button/input/select/table/badge/modal | komponen prioritas seragam |
| T-013-04 | terapkan ke content manager | CM memakai basis UI admin | tidak ada pattern UI liar di CM |
| T-013-05 | public web continuity QA | validasi halaman kritis web tetap gaya asli | no major UX regression |
| T-013-06 | susun checklist review UI release | checklist wajib sebelum deploy | checklist dipakai rutin per release |

## 6. Test Strategy per Workstream

| Workstream | Unit Test | Integration Test | E2E/Test Operasional |
|---|---|---|---|
| WS-02 Core API | validator, mapper, status rules | DB repository, auth guard | smoke OpenAPI endpoints |
| WS-04 Catalog Bridge | matcher logic | extractor + importer | audit sampling katalog |
| WS-05 Booking Bridge | merge contact rule | booking dedup + mapping | parity report booking |
| WS-06 Payment Bridge | status normalize | payment-finance link | sample audit capture |
| WS-07 Ingestion | idempotency key logic | queue retry + DLQ | burst + replay scenario |
| WS-08/09 Integration | adapter transform | API contract compatibility | user flow booking ops/web |
| WS-13 UI/UX | component snapshot tests | layout parity admin vs CM | visual regression + usability checklist |

## 7. Acceptance Gate per Milestone

| Milestone | Gate |
|---|---|
| M1 (EP-001..003) | migration foundation hijau di staging |
| M2 (EP-004..006) | reconciliation catalog/booking/payment lulus (`<= 1%` global) |
| M3 (EP-007..009) | ingestion dan integration stabil pada canary |
| M4 (EP-010..012) | cutover stabil, rollback tervalidasi, SLA aman |
| M5 (EP-013) | UI konsisten admin+CM, public web continuity lulus |

## 8. Risk Backlog

| Risk ID | Risiko | Dampak | Mitigasi | Owner |
|---|---|---|---|---|
| R-01 | duplicate booking dari replay | data corruption | unique dedup key + idempotency test | Backend |
| R-02 | mismatch payment dan finance | salah status bisnis | settlement reconciliation harian | Backend + Finance Ops |
| R-03 | drift catalog antar app | produk salah tampil | single publish path via content manager | Product + Backend |
| R-04 | rollback lambat saat incident | downtime lebih lama | rollback script + drill berkala | DevOps |
| R-05 | parser email noise tinggi | booking palsu/skip | classifier tuning + manual queue | Ops |
| R-06 | UI drift admin dan content manager | UX tidak konsisten | shared UI baseline + UI release checklist | Frontend |
| R-07 | regressi UX public web | konversi booking turun | continuity QA + visual regression gate | Frontend + QA |

## 9. Rencana Mingguan (High Detail)

| Minggu | Fokus Prioritas |
|---|---|
| 1 | EP-001 selesai penuh |
| 2 | EP-002 selesai penuh |
| 3 | EP-003 batch A-B selesai |
| 4 | EP-004 extractor + matcher basic + EP-013 UI inventory |
| 5 | EP-004 unmapped queue + recon + EP-013 token baseline |
| 6 | EP-005 booking bridge fase 1 |
| 7 | EP-005 booking bridge fase 2 + EP-013 standardisasi komponen prioritas |
| 8 | EP-006 payment-finance bridge |
| 9 | EP-007 ingestion endpoint + idempotency |
| 10 | EP-007 queue + replay + load test |
| 11 | EP-008 admin read integration + harmonisasi UI admin |
| 12 | EP-009 web emit integration |
| 13 | EP-010 content manager scaffold + editor (basis UI admin) |
| 14 | EP-010 publish workflow + contract + parity UI admin/CM |
| 15 | EP-011 dashboard + alert |
| 16 | EP-011 playbook + drill |
| 17 | EP-012 read cutover canary |
| 18 | EP-012 write cutover canary |
| 19 | EP-012 scale rollout + hardening + visual regression gate |
| 20 | deprecation readiness + sign-off final + UI continuity sign-off |

## 10. Artefak Wajib per Epic

1. Technical spec update di `doc/`.
2. Pull request dengan test evidence.
3. Migration/reconciliation log jika ada data change.
4. Release note + rollback note.
5. Approval record dari owner/tech lead untuk milestone terkait.
6. Bukti deploy topology mengikuti `doc/prep-deployment-topology-strategy-2026-02-20.md`.

## 11. Progress Snapshot (2026-02-22)

| Item | Status | Evidence |
|---|---|---|
| T-001-05 lock deployment topology staging/prod | `DONE` | `doc/prep-deployment-topology-strategy-2026-02-20.md` + `doc/runbook-stagging-core-api-deploy-2026-02-20.md` |
| Bootstrap env core-api prod (`REDIS_URL`, `INGEST_REDIS_URL`, `CORE_API_ADMIN_TOKEN`, `INGEST_SERVICE_TOKEN`, `INGEST_SERVICE_SECRET`) | `DONE` | runtime `.env` di `/home/bonk/backend/core-api-prod/shared/.env` |
| Sync `INGEST_SERVICE_TOKEN` + `INGEST_SERVICE_SECRET` ke emitter env | `DONE` | `/home/bonk/balisnaptrip/.env` + `/home/bonk/stagging-bst/current/balisnap/.env` |
| Otomasi gate `F-00` runtime env baseline | `DONE` | `pnpm gate:ingest-env-baseline` + report `reports/gates/ingest-env-baseline/*` |
| Smoke test ingest handshake setelah reload process | `DONE` | `SMOKE_TEST_RESULT=PASS` + `ADMIN_AUTH_SMOKE_RESULT=PASS` pada runtime `/home/bonk/backend/core-api-prod/current` |
| Gate Batch F (`F-01/F-02/F-03`) ingest release | `DONE` | `/home/bonk/backend/core-api-prod/releases/20260219T203740Z/reports/gates/ingest-release/2026-02-19T20-43-41-922Z.json` |
| Release evidence Batch F (full scope) | `DONE` | `/home/bonk/backend/core-api-prod/releases/20260219T203740Z/reports/release-evidence/F/2026-02-19T20-43-41-931Z.json` |
| Quality check phase2 (batch F) | `DONE` | `/home/bonk/backend/core-api-prod/releases/20260219T203740Z/reports/recon/quality/F/2026-02-19T20-38-31-465Z.json` |
| Quality check phase2 (batch A) | `DONE` | command `pnpm --filter @bst/core-api quality:phase2` (`PASS`) dengan `PHASE2_BATCH_CODE=A`, evidence `reports/recon/quality/A/2026-02-21T16-43-39-763Z.json` (`denominator=6`, `unmappedRatioPercent=0`) |
| EP-004 extractor + matcher baseline (`T-004-01`, `T-004-02`, `T-004-03`) | `DONE` | `apps/core-api/scripts/catalog-bridge-backfill.mjs` + evidence gate `PASS` (`reports/recon/C/*`, `reports/gates/catalog-bridge/*`) |
| Gate automation Batch C (`C-01/C-02/C-03`) | `DONE` | `apps/core-api/scripts/catalog-bridge-gate.mjs` + workflow `.github/workflows/catalog-bridge-gate.yml` |
| Core API catalog + mapping service DB-backed | `DONE` | `apps/core-api/src/modules/catalog/catalog.service.ts` migrasi ke query `OPS_DB` (`catalog_product`/`catalog_variant`/`catalog_variant_rate`) + `apps/core-api/src/modules/mapping/mapping.service.ts` DB-backed + validasi `pnpm --filter @bst/core-api build` + `pnpm --filter @bst/core-api typecheck` (`PASS`) |
| Core API lint baseline (flat config) | `DONE` | file baru `apps/core-api/eslint.config.mjs` + validasi `pnpm --filter @bst/core-api lint` (`PASS`) |
| EP-005 booking bridge backfill baseline (`T-005-01`, `T-005-02`, `T-005-03`, `T-005-04`) | `DONE` | `apps/core-api/scripts/booking-bridge-backfill.mjs` + evidence gate `PASS` (`reports/recon/D/*`, `reports/gates/booking-bridge/*`) |
| Gate automation Batch D (`D-01/D-02/D-03/D-04`) | `DONE` | `apps/core-api/scripts/booking-bridge-gate.mjs` + workflow `.github/workflows/booking-bridge-gate.yml` |
| EP-006 payment-finance bridge baseline (`T-006-01`, `T-006-02`, `T-006-03`) | `DONE` | `apps/core-api/scripts/payment-finance-bridge-backfill.mjs` + evidence `reports/recon/E/2026-02-20T03-25-46-909Z-payment-finance-bridge-backfill.json` |
| Gate automation Batch E (`E-01/E-02/E-03`) | `DONE` | `apps/core-api/scripts/payment-finance-bridge-gate.mjs` + evidence `reports/gates/payment-finance/2026-02-20T03-28-24-640Z.json` + workflow `.github/workflows/payment-finance-bridge-gate.yml` |
| EP-007 `T-007-03` hardening retry observability | `DONE` | `apps/core-api/src/modules/ingest/ingest.service.ts` + `apps/core-api/src/modules/ingest/ingest-metrics.controller.ts` (retry backlog + attempt histogram di `/v1/ingest/metrics/queue`) |
| EP-007 gate automation `F-04` duplicate delivery | `DONE` | `apps/core-api/scripts/ingest-duplicate-delivery-gate.mjs` + wiring `apps/core-api/scripts/ingest-release-gate-runner.mjs` |
| EP-007 gate automation `F-05` retention policy | `DONE` | `apps/core-api/scripts/ingest-retention-policy-gate.mjs` + wiring `apps/core-api/scripts/ingest-release-gate-runner.mjs` |
| EP-007 `T-007-04` replay drill automation | `DONE` | script `apps/core-api/scripts/ingest-replay-drill.mjs` + workflow update `.github/workflows/ingest-release-gate.yml` + `.github/workflows/phase2-release-evidence.yml` + evidence `reports/gates/ingest-replay-drill/2026-02-20T04-45-41-148Z.json` |
| Runtime evidence lokal `F-04/F-05` | `DONE` | `pnpm --filter @bst/core-api gate:ingest-duplicate-delivery` + `pnpm --filter @bst/core-api gate:ingest-retention-policy` (`PASS`), evidence: `reports/gates/ingest-duplicate-delivery/2026-02-20T04-45-40-784Z.json`, `reports/gates/ingest-retention-policy/2026-02-20T04-45-40-939Z.json` |
| Release evidence lokal Batch F (ingest + replay + catalog + booking + payment) | `DONE` | `pnpm --filter @bst/core-api release:evidence` (`PASS`), evidence: `reports/gates/ingest-release/2026-02-20T04-45-41-179Z.json`, `reports/release-evidence/F/2026-02-20T04-45-41-655Z.json` |
| EP-008 `T-008-01` adapter read booking list + gate `BG-01` | `DONE` | adapter route `bstadmin/src/app/api/bookings/route.ts` + script `bstadmin/scripts/ops-read-parity-gate.mjs` + workflow `.github/workflows/ops-read-parity-gate.yml` + strict evidence `PASS` (`matchedRows=93`): `reports/gates/ops-read-parity/2026-02-20T05-07-18-110Z.json` |
| EP-008 `T-008-02` adapter read booking detail + checklist field critical | `DONE` | adapter route `bstadmin/src/app/api/bookings/[id]/route.ts` + check `BG-01_detail_critical_fields` (`PASS`) pada strict gate `BG-01`: `reports/gates/ops-read-parity/2026-02-20T05-07-18-110Z.json` |
| EP-008 `T-008-03` adapter assignment + status sync drill | `DONE` | adapter route `bstadmin/src/app/api/bookings/[id]/assign/route.ts` + script `bstadmin/scripts/ops-assignment-sync-drill.mjs` + workflow `.github/workflows/ops-assignment-sync-drill.yml` + evidence drill `PASS`: `reports/gates/ops-assignment-sync/2026-02-20T05-07-19-040Z.json` |
| Batch G runtime target staging (`ops_db` + gate strict) | `DONE` | release `/home/bonk/stagging-bst/releases/20260220T051228Z`, backfill `reports/recon/D/2026-02-20T05-18-50-512Z-booking-bridge-backfill.json`, gate parity `reports/gates/ops-read-parity/2026-02-20T06-00-10-640Z.json`, drill `reports/gates/ops-assignment-sync/2026-02-20T06-00-11-725Z.json` |
| Batch F staging final decision (`F-03` window `120` menit di-skip) | `DONE` | keputusan owner `2026-02-20`: dianggap `PASS` berbasis precheck `10` menit + evidence `reports/gates/ingest-release/2026-02-20T05-59-55-233Z.json` |
| EP-009 precheck emitter ingest (`T-009-01` s.d. `T-009-04` drill level) | `DONE` | script `balisnap/scripts/core-ingest-orders-flow-drill.mjs` + `balisnap/scripts/core-ingest-emitter-smoke.mjs`, smoke `PASS` (`EMITTER_SMOKE_EVENT_ID=996198ed-4ddf-4c15-a6ca-f580356e40b2`), drill send `PASS` (`CREATED=ec615160-caf0-4a2f-adce-a68bfd999031 status=DONE queued=true idempotentReplay=false`, `UPDATED=8c562bde-e97d-48f8-bf08-a1f33eb74220 status=DONE queued=true idempotentReplay=false`), fallback `PASS` (`EMITTER_ORDERS_DRILL_MODE=SKIP_CHECK`) |
| EP-009 canary operasional emitter staging | `DONE` | flag runtime staging aktif `WEB_EMIT_BOOKING_EVENT_ENABLED=\"true\"` (backup: `/home/bonk/stagging-bst/current/balisnap/.env.bak.20260220T064012Z`), drill lanjutan `PASS` (`CREATED=bac8a519-f3ee-4abe-aa4e-babf5bf6a103 status=DONE queued=true`, `UPDATED=e359b9a5-62bf-4d18-b1f4-1f4136dabac1 status=DONE queued=true`), metrik queue (`waiting=0`, `failed=0`) dari `/v1/ingest/metrics/queue` |
| EP-009 `T-009-05` public web continuity check + automation | `DONE` | script `balisnap/scripts/public-web-continuity-check.mjs`, command `PUBLIC_WEB_BASE_URL=http://192.168.0.60:5000 pnpm gate:public-web-continuity` (`PASS`), evidence `reports/gates/public-web-continuity/2026-02-20T06-41-40-958Z.json` + `.md`, workflow `.github/workflows/public-web-continuity-gate.yml` |
| EP-010 scaffold content manager (`T-010-01`, `T-010-01A`) | `DONE` | app baru `apps/content-manager` (Next.js) dengan login credentials + RBAC (`CM_ALLOWED_ROLES`), middleware proteksi `/dashboard`, adopsi baseline UI admin (`globals.css` token + komponen `Button/Input/Card/Label`), command: `pnpm --filter @bst/content-manager dev` |
| EP-010 `T-010-02` catalog editor CRUD | `DONE` | endpoint CRUD baru di `apps/core-api/src/modules/catalog/catalog.controller.ts` + `apps/core-api/src/modules/catalog/catalog-editor.service.ts`, UI route `apps/content-manager/src/app/catalog/page.tsx`, `apps/content-manager/src/app/catalog/new/page.tsx`, `apps/content-manager/src/app/catalog/[itemId]/page.tsx` |
| EP-010 `T-010-03` publish workflow | `DONE` | service workflow `apps/core-api/src/modules/catalog/catalog-publish.service.ts` (status `DRAFT/IN_REVIEW/PUBLISHED/FAILED`) + UI `apps/content-manager/src/app/publish/page.tsx` |
| EP-010 `T-010-04` publish contract ke core | `DONE` | contract endpoint `POST /v1/catalog/publish/jobs*` + payload versioned artifact `reports/publish/catalog/*.json` + signed handshake (`x-signature`, `x-timestamp`, `x-nonce`, `x-idempotency-key`) dari `apps/content-manager/src/lib/core-api.ts` |
| EP-010 gate automation publish workflow | `DONE` | script `apps/core-api/scripts/catalog-publish-workflow-gate.mjs` + workflow `.github/workflows/catalog-publish-workflow-gate.yml` + command `pnpm --filter @bst/core-api gate:catalog-publish-workflow` |
| Refresh runtime staging untuk EP-010 endpoint (`catalog` + `publish`) | `DONE` | deploy release staging terbaru `/home/bonk/stagging-bst/releases/20260221T100322Z` + restart runtime `core-api` (`PID=3341878`) |
| EP-010 smoke staging endpoint `catalog CRUD` | `DONE` | command `pnpm --filter @bst/core-api smoke:catalog-editor` (`PASS`) against `CORE_API_BASE_URL=http://192.168.0.60:4100`, evidence: `reports/smoke/catalog-editor/2026-02-21T10-05-09-266Z.json` + `.md` |
| EP-010 gate staging publish workflow final | `DONE` | command `pnpm --filter @bst/core-api gate:catalog-publish-workflow` (`PASS`) against `CORE_API_BASE_URL=http://192.168.0.60:4100`, evidence: `reports/gates/catalog-publish-workflow/2026-02-21T10-05-52-598Z.json` + `.md` |
| Hardening gate `EP-010` failed-scenario compatibility | `DONE` | update `apps/core-api/scripts/catalog-publish-workflow-gate.mjs` (terima dua mode valid: invalid item ditolak saat create `400` atau gagal saat publish) |
| Automation CI smoke `EP-010` catalog editor | `DONE` | workflow manual `.github/workflows/catalog-editor-smoke.yml` + artifact `reports/smoke/catalog-editor/**` |
| Isolasi queue ingest staging vs prod | `DONE` | staging `INGEST_QUEUE_NAME=ingest-bookings-events-staging` (`/home/bonk/stagging-bst/shared/.env.bak.20260220T062706Z`), verifikasi runtime log `Queue worker started: ingest-bookings-events-staging` |
| Hardening fallback DB source parity gate/backfill (`SYNC_DATABASE_URL` precedence) | `DONE` | `bstadmin/scripts/ops-read-parity-gate.mjs` + `apps/core-api/scripts/_legacy-db-env.mjs` |
| EP-013 `T-013-03` hardening komponen prioritas content manager (`form/table/action`) | `DONE` | foundation baru `apps/content-manager/src/components/ui/{checkbox,select,textarea,badge,form-field,status-badge,table}.tsx` + helper status `apps/content-manager/src/lib/catalog-status.ts` |
| EP-013 `T-013-04` adopsi UI baseline admin ke halaman catalog + publish content manager | `DONE` | refactor `apps/content-manager/src/app/catalog/page.tsx`, `apps/content-manager/src/app/catalog/new/page.tsx`, `apps/content-manager/src/app/catalog/[itemId]/page.tsx`, `apps/content-manager/src/app/publish/page.tsx` |
| Validasi quality untuk hardening UI content manager | `DONE` | `pnpm --filter @bst/content-manager lint` (`PASS`, no ESLint warnings/errors) |
| EP-013 `T-013-03` foundation komponen prioritas `bstadmin` (`status/source badge`, `table shell`, `form-field`) | `DONE` | komponen baru `bstadmin/src/components/ui/{status-badge,source-badge,table,form-field}.tsx` + helper source tunggal `bstadmin/src/lib/booking/source-label.ts` |
| EP-013 adopsi komponen prioritas pada page utama `bstadmin` | `DONE` | refactor `bstadmin/src/app/(dashboard)/bookings/page.tsx`, `bstadmin/src/app/(dashboard)/dashboard/page.tsx`, `bstadmin/src/app/(dashboard)/finance/validate/components/BookingListPanel.tsx`, `bstadmin/src/app/(dashboard)/finance/validate/validate-client.tsx`, `bstadmin/src/app/(dashboard)/bookings/[id]/page.tsx`, `bstadmin/src/app/(dashboard)/email-inbox/page.tsx`, `bstadmin/src/app/(dashboard)/finance/patterns/page.tsx`, `bstadmin/src/app/(dashboard)/finance/settlements/page.tsx`, `bstadmin/src/app/(dashboard)/finance/report/page.tsx`, `bstadmin/src/app/(dashboard)/finance/validate/components/CommissionSplitDialog.tsx`, `bstadmin/src/app/(dashboard)/drivers/page.tsx`, `bstadmin/src/app/(dashboard)/drivers/[id]/page.tsx` |
| EP-013 cleanup status/table hardcode lanjutan `bstadmin` | `DONE` | status banner `bookings/[id]` dipindah ke `StatusBadge` (tanpa ternary class inline) + tabel modal reparse pakai `Table` shell + tabel `email-inbox` pakai `DataTableShell`/`Table`/`SourceBadge` + tabel finance (`patterns`, `settlements`, `report`) pakai `Table` shell + status driver tersentral via `driver-status-badge` (`drivers`, `drivers/[id]`) |
| EP-013 `T-013-06` checklist review UI release + freeze guard `bstadmin` | `DONE` | gate baru `bstadmin/scripts/ui-release-checklist-gate.mjs` + baseline hash `bstadmin/config/ui-release-checklist-baseline.json` + workflow `.github/workflows/ui-release-checklist-gate.yml` + evidence `reports/gates/ui-release-checklist/2026-02-21T13-13-48-243Z.json` |
| Otomasi release candidate UI gates gabungan (`EP-013` + `EP-010`) | `DONE` | runner `scripts/release-candidate-ui-gates.mjs` + command root `pnpm gate:release-candidate-ui` + workflow `.github/workflows/release-candidate-ui-gates.yml` + evidence agregat `reports/gates/release-candidate-ui/2026-02-21T16-49-53-124Z.json` (mode full termasuk `public-web-continuity`) |
| Validasi lint targeted batch EP-013 `bstadmin` | `DONE` | `pnpm --filter bst-admin exec next lint --file ...` (`PASS` dengan warning existing/non-blocking pada hook dependency + `any`) |
| Audit sweep hardcode UI `bstadmin` dashboard modules | `DONE` | grep `STATUS_COLORS`/`SOURCE_COLORS`/`<table className=\"w-full*\"` pada `bstadmin/src/app/(dashboard)` tidak menemukan sisa pattern lama |
| Refresh release staging final (post hardening) | `DONE` | release aktif `/home/bonk/stagging-bst/releases/20260221T165849Z`; runtime `core-api` staging `RUNNING` (PID `3377326`) pada `PORT=4100` |
| Baseline ingest env staging (`F-00`) khusus target staging | `DONE` | command `pnpm gate:ingest-env-baseline -- --receiver-env-path /home/bonk/stagging-bst/shared/.env --emitter-prod-env-path /home/bonk/stagging-bst/current/balisnap/.env --emitter-staging-env-path /home/bonk/stagging-bst/current/balisnap/.env` (`PASS`), evidence `reports/gates/ingest-env-baseline/2026-02-21T17-47-39-784Z.json` |
| Migrasi schema phase-2 staging (`EP-003`) | `DONE` | command `pnpm --filter @bst/core-api migrate:phase2` (`PASS`), evidence `/home/bonk/stagging-bst/releases/20260221T165849Z/reports/recon/A/2026-02-21T17-50-58-577Z.json` |
| Backfill + gate batch C/D/E staging rerun final | `DONE` | `catalog` (`reports/recon/C/2026-02-21T17-52-44-988Z-catalog-bridge-backfill.json`, `reports/gates/catalog-bridge/2026-02-21T17-53-05-993Z.json`), `booking` (`reports/recon/D/2026-02-21T17-10-20-404Z-booking-bridge-backfill.json`, `reports/gates/booking-bridge/2026-02-21T17-10-21-498Z.json`), `payment` (`reports/recon/E/2026-02-21T17-10-30-673Z-payment-finance-bridge-backfill.json`, `reports/gates/payment-finance/2026-02-21T17-10-31-773Z.json`) |
| Release evidence batch F staging (ingest + replay + C/D/E + publish) | `DONE` | command `pnpm --filter @bst/core-api release:evidence` (`PASS`), evidence `/home/bonk/stagging-bst/releases/20260221T165849Z/reports/release-evidence/F/2026-02-21T17-47-09-265Z.json` |
| Release candidate UI gates full scope (internal + CM + continuity) | `DONE` | command `RC_UI_GATES_RUN_PUBLIC_WEB_CONTINUITY=true PUBLIC_WEB_BASE_URL=http://192.168.0.60:5000 pnpm gate:release-candidate-ui` (`PASS`), evidence `reports/gates/release-candidate-ui/2026-02-21T17-52-58-773Z.json` |
| Hardening smoke `EP-010` agar tidak merusak gate C | `DONE` | update `apps/core-api/scripts/catalog-editor-smoke.mjs` (reactivate rate/variant/item setelah delete check); validasi `smoke:catalog-editor` (`PASS`) + `gate:catalog-bridge` tetap `PASS` |
| Runtime review UI staging (admin + content manager) | `DONE` | admin existing `http://192.168.0.60:3100` (`307/login`), admin preview release baru `http://192.168.0.60:3101` (`RUNNING`, PID `3385979`), content-manager staging `http://192.168.0.60:3200` (`RUNNING`, PID `3385760`, login page `200`) |
| Publish production public web (`EP-009`) | `DONE` | source `balisnap` dipromosikan dari release staging `/home/bonk/stagging-bst/current/balisnap` ke `/home/bonk/balisnaptrip`, container `balisnaptrip` rebuild/recreate (`docker compose up -d --build balisnaptrip`), verifikasi `http://192.168.0.60:5000` dan `/contact` = `200` |
| Publish production admin ops (`EP-008/EP-013`) | `DONE` | source `bstadmin` dipromosikan dari release staging `/home/bonk/stagging-bst/current/bstadmin` ke `/home/bonk/bstadmin-admin`, container `bstadmin-admin` rebuild/recreate (`docker compose up -d --build bstadmin`), verifikasi `http://192.168.0.60:3100/login` = `200` |
| Stop runtime preview staging (saran #1) | `DONE` | proses preview `3101/3200` dihentikan + PID file preview dibersihkan; validasi listener `ss -ltn` tidak lagi menampilkan port `3101`/`3200` |
| Verifikasi domain prod + hardening cron admin (saran #2) | `DONE` | `admin.balisnaptrip.com` dan `balisnaptrip.com` resolve ke `192.168.0.60`; parity hash domain vs direct prod `5000/3100` = `MATCH`; tuning `bstadmin` runtime (`HOSTNAME=0.0.0.0`, `INTERNAL_CRON_BASE_URL=http://127.0.0.1:3100`, `CRON_INITIAL_DELAY_MS=30000`) tervalidasi log `[Cron Runner] ... success` |
| Hotfix public web cache stale katalog (`EP-009`, `T-009-05`) | `DONE` | route `balisnap/app/api/tours/route.ts`, `balisnap/app/api/tours/featured/route.ts`, `balisnap/app/api/tours/[slug]/route.ts` di-hardening `dynamic='force-dynamic'` + `revalidate=0`; verifikasi `https://balisnaptrip.com/api/tours` tidak lagi mengembalikan header cache stale (`x-nextjs-cache` kosong) |
| Refresh runtime production public web pasca hotfix cache | `DONE` | source `balisnap` prod di `/home/bonk/balisnaptrip` di-rebuild (`docker compose up -d --build balisnaptrip`); container `balisnaptrip` kembali `Up` pada `0.0.0.0:5000->5000` |
| Upgrade runtime core-api production untuk endpoint catalog editor (`EP-010`, `T-010-02`) | `DONE` | deploy release `/home/bonk/backend/core-api-prod/releases/20260222T115841Z` via `pnpm deploy:core-api-prod:build`; runtime `core-api` restart `RUNNING` (PID `3508650`) |
| Backfill catalog bridge ke core-api prod setelah upgrade runtime (`EP-004`) | `DONE` | command `pnpm --filter @bst/core-api backfill:catalog-bridge` (`PASS`), evidence `/home/bonk/backend/core-api-prod/releases/20260222T115841Z/reports/recon/A/2026-02-22T12-01-21-451Z-catalog-bridge-backfill.json` |
| Operasionalisasi sinkronisasi `catalog_*` (core prod) ke `Tour*` (public web read model) | `DONE` | SQL sync `/home/bonk/backend/sync-catalog-admin-to-public.sql`; runner `/home/bonk/backend/bin/catalog-sync-admin-to-public.sh`; cron aktif `* * * * * /home/bonk/backend/bin/catalog-sync-admin-to-public.sh`; log verifikasi `/home/bonk/backend/logs/catalog-sync.log` (`sync-done`) |
| Verifikasi E2E jalur CMS -> public web (`create/edit/delete`) | `DONE` | uji API catalog prod `POST/PATCH/DELETE /v1/catalog/items*` berhasil; setelah sync, slug/item tampil dan terhapus kembali di `https://balisnaptrip.com/api/tours`; catatan kompatibilitas: item baru harus punya variant+rate aktif agar muncul di list public |

## 12. Immediate Next Action

1. Pertahankan monitoring pasca publish prod (`public web` + `admin ops`) untuk window observasi operasional harian (uptime endpoint, cron success, error log).
2. Monitor job sinkronisasi catalog bridge operasional (`/home/bonk/backend/bin/catalog-sync-admin-to-public.sh`) dan alert jika log `/home/bonk/backend/logs/catalog-sync.log` tidak mencatat `sync-done` per menit.
3. Jika ada perubahan UI prioritas `bstadmin`, jalankan `UI_RELEASE_CHECKLIST_UPDATE_BASELINE=true pnpm --filter bst-admin gate:ui-release-checklist` hanya setelah reviewer approval.
4. Handover backlog penyempurnaan `content manager` ke tim pengembangan lanjutan dengan baseline dokumen: `doc/prep-ui-ux-standardization-spec-2026-02-18.md`, `doc/prep-release-gate-checklist-phase2-2026-02-19.md`, dan evidence gate `EP-010/EP-013`.
