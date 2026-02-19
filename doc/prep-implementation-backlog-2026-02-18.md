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

## 11. Progress Snapshot (2026-02-20)

| Item | Status | Evidence |
|---|---|---|
| T-001-05 lock deployment topology staging/prod | `DONE` | `doc/prep-deployment-topology-strategy-2026-02-20.md` + `doc/runbook-stagging-core-api-deploy-2026-02-20.md` |
| Bootstrap env core-api prod (`REDIS_URL`, `INGEST_REDIS_URL`, `CORE_API_ADMIN_TOKEN`, `INGEST_SERVICE_TOKEN`, `INGEST_SERVICE_SECRET`) | `DONE` | runtime `.env` di `/home/bonk/backend/core-api-prod/shared/.env` |
| Sync `INGEST_SERVICE_TOKEN` + `INGEST_SERVICE_SECRET` ke emitter env | `DONE` | `/home/bonk/balisnaptrip/.env` + `/home/bonk/stagging-bst/current/balisnap/.env` |
| Otomasi gate `F-00` runtime env baseline | `DONE` | `pnpm gate:ingest-env-baseline` + report `reports/gates/ingest-env-baseline/*` |
| Smoke test ingest handshake setelah reload process | `DONE` | `SMOKE_TEST_RESULT=PASS` + `ADMIN_AUTH_SMOKE_RESULT=PASS` pada runtime `/home/bonk/backend/core-api-prod/current` |
| Gate Batch F (`F-01/F-02/F-03`) ingest release | `DONE` | `/home/bonk/backend/core-api-prod/releases/20260219T192910Z/reports/gates/ingest-release/2026-02-19T19-52-42-450Z.json` |

## 12. Immediate Next Action

1. Jalankan `pnpm --filter @bst/core-api quality:phase2` pada runtime release aktif untuk melengkapi evidence batch.
2. Jalankan `pnpm --filter @bst/core-api release:evidence` setelah quality check `PASS`.
3. Kumpulkan evidence JSON/MD dan lanjutkan sign-off matrix (Tech Lead, Backend Lead, DevOps, Owner).
