# Phase-2 Release Gate Checklist

Tanggal: 2026-02-19  
Update terakhir: 2026-02-21  
Scope: gate eksekusi batch A-H sebelum lanjut batch berikutnya.

## 1. Aturan Umum

1. Satu batch dianggap `PASS` hanya jika seluruh gate `PASS`.
2. Jika ada gate `FAIL`, batch berikutnya otomatis `HOLD`.
3. Semua evidence wajib tersimpan di:
   1. `reports/recon/{batch}/{timestamp}.json`,
   2. `reports/recon/{batch}/{timestamp}.md`,
   3. log deploy + rollback drill.
4. Topologi path deploy wajib mengikuti `doc/prep-deployment-topology-strategy-2026-02-20.md`.

## 2. Gate Global (Berlaku Semua Batch)

| Gate ID | Kriteria | Pass Rule |
|---|---|---|
| G-01 | Duplicate canonical booking | `0` row |
| G-02 | Reconciliation mismatch global | `<= 1%` + exception list |
| G-03 | API 5xx core path | `<= 1.5%` selama 15 menit |
| G-04 | Rollback readiness | RTO toggle flag `<= 5 menit` |
| G-05 | Public booking success rate | tidak turun > `2%` dari baseline 7 hari |
| G-06 | Payment mismatch harian | `<= 0.5%` |
| G-07 | UI release checklist internal (`EP-013`) | `PASS` + baseline drift `0` (atau override drift dengan approval eksplisit) |

## 3. Gate Per Batch

## 3.1 Batch A (Schema Foundation)

| Gate | Kriteria | Pass Rule |
|---|---|---|
| A-01 | semua tabel target terbentuk | 17/17 tabel ada |
| A-02 | unique/FK utama terbentuk | 100% sesuai kontrak schema v1 |
| A-03 | query existing tidak error | 0 critical query failure |

## 3.2 Batch B (Reference Seed)

| Gate | Kriteria | Pass Rule |
|---|---|---|
| B-01 | seed channel registry | 6 channel mandatory ada |
| B-02 | seed status dictionary | mapping/ingest/replay/dead-letter/unmapped status lengkap |
| B-03 | rerun idempotent | tidak ada duplikasi seed |

## 3.3 Batch C (Catalog Bridge Backfill)

| Gate | Kriteria | Pass Rule |
|---|---|---|
| C-01 | orphan ratio | `<= 0.5%` |
| C-02 | unmapped ratio akhir batch | denominator katalog `> 0` dan ratio `<= 5%` |
| C-03 | variant rate availability | 100% variant punya rate aktif/fallback |

## 3.4 Batch D (Booking Bridge Backfill)

| Gate | Kriteria | Pass Rule |
|---|---|---|
| D-01 | duplicate booking identity | `0` |
| D-02 | null critical identity field | `0` |
| D-03 | pax mismatch booking vs item | `<= 1%` |
| D-04 | `package_ref_type` completeness | null `= 0` |

## 3.5 Batch E (Payment and Finance Bridge)

| Gate | Kriteria | Pass Rule |
|---|---|---|
| E-01 | orphan payment event | `0` |
| E-02 | `ops=DONE` tetapi `payment!=PAID` | `<= 0.3%` + exception list |
| E-03 | sample audit payment direct | akurasi 100% sampel |

Catatan `E-03`:

1. Jika `direct payment event` pada window evaluasi = `0`, check `E-03` dinilai `N/A` dan dianggap `PASS`.
2. Jika sample tersedia (`sampleSize > 0`), akurasi wajib `100%`.

## 3.6 Batch F (Ingestion Activation)

| Gate | Kriteria | Pass Rule |
|---|---|---|
| F-00 | runtime env baseline ingestion | key wajib non-empty + parity token/secret emitter-receiver valid |
| F-01 | event success rate | `>= 99.5%` rolling 1 jam |
| F-02 | median/p95 processing latency | median `<= 3s`, p95 `<= 15s` |
| F-03 | DLQ growth setelah peak | `<= 20 event/jam` selama 2 jam |
| F-04 | duplicate delivery handling | 0 duplicate aggregate row |
| F-05 | retention cleanup policy aktif | nonce 10 menit, idempotency 35 hari, DLQ 30 hari |

Catatan exception Batch F:

1. Khusus staging `2026-02-20`, window final `F-03` (`120` menit) di-skip berdasarkan keputusan owner.
2. Status Batch F dinyatakan `PASS` berbasis evidence precheck `10` menit:
   1. `reports/gates/ingest-processing/2026-02-20T05-49-54-811Z.json`
   2. `reports/gates/ingest-dlq-growth/2026-02-20T05-59-54-978Z.json`
   3. `reports/gates/ingest-release/2026-02-20T05-59-55-233Z.json`
3. Isolasi queue staging/prod setelah precheck:
   1. staging: `INGEST_QUEUE_NAME=ingest-bookings-events-staging`.

## 3.7 Batch G (Ops Read Cutover)

| Gate | Kriteria | Pass Rule |
|---|---|---|
| BG-01 | data parity read model vs legacy | mismatch `<= 1%` |
| BG-02 | 5xx regresi setelah switch read | tidak melewati 1.5% / 15 menit |
| BG-03 | incident operasional kritis | 0 incident severity tinggi |

## 3.8 Batch H (Controlled Write Cutover)

| Gate | Kriteria | Pass Rule |
|---|---|---|
| H-01 | dual-write mismatch per jam | `<= 0.1%` |
| H-02 | event loss | `0` |
| H-03 | conflict backlog open >24h | `0` |

## 4. Approval Matrix

| Role | Wajib Sign-off | Catatan |
|---|---|---|
| Tech Lead | Ya | validasi technical gate |
| Backend Lead | Ya | validasi API, ingestion, reconciliation |
| DevOps | Ya | validasi deploy/rollback readiness |
| Ops Lead | Ya (Batch G/H) | validasi dampak operasional |
| Owner | Ya (Go/No-Go) | final approval lanjut batch |

## 4.1 Gate Automation Commands (Batch F)

`apps/core-api` menyediakan command otomatis untuk gate ingestion:

1. `F-00` runtime env baseline:
   1. `pnpm gate:ingest-env-baseline`
2. `F-01/F-02`:
   1. `pnpm --filter @bst/core-api gate:ingest-processing`
3. `F-03`:
   1. `pnpm --filter @bst/core-api gate:ingest-dlq-growth`
4. `F-04` duplicate delivery:
   1. `pnpm --filter @bst/core-api gate:ingest-duplicate-delivery`
5. `F-05` retention policy:
   1. `pnpm --filter @bst/core-api gate:ingest-retention-policy`
6. Replay drill operasional (`T-007-04`):
   1. `pnpm --filter @bst/core-api drill:ingest-replay`
7. Combined evidence run:
   1. `pnpm --filter @bst/core-api gate:ingest-release`
8. Combined release evidence (quality + ingest gates):
   1. `pnpm --filter @bst/core-api release:evidence`
9. Combined release evidence dengan replay drill ingest (`T-007-04`):
   1. `RUN_EVIDENCE_INGEST_REPLAY_DRILL=true pnpm --filter @bst/core-api release:evidence`
10. Combined release evidence dengan gate duplicate delivery (`F-04`):
   1. `RUN_EVIDENCE_INGEST_DUPLICATE_GATE=true pnpm --filter @bst/core-api release:evidence`
11. Combined release evidence dengan gate retention policy (`F-05`):
   1. `RUN_EVIDENCE_INGEST_RETENTION_GATE=true pnpm --filter @bst/core-api release:evidence`
12. Combined release evidence dengan catalog gate Batch C:
   1. `RUN_EVIDENCE_CATALOG_GATE=true pnpm --filter @bst/core-api release:evidence`
13. Combined release evidence dengan booking gate Batch D:
   1. `RUN_EVIDENCE_BOOKING_GATE=true pnpm --filter @bst/core-api release:evidence`
14. Combined release evidence dengan payment gate Batch E:
   1. `RUN_EVIDENCE_PAYMENT_GATE=true pnpm --filter @bst/core-api release:evidence`
15. Drill emitter web integration (`EP-009`, command-local):
   1. `WEB_EMIT_BOOKING_EVENT_ENABLED=true pnpm --filter next-app-template drill:core-ingest-orders-flow`
   2. fallback check:
      1. `EMITTER_DRILL_EXPECT_SKIP=true pnpm --filter next-app-template drill:core-ingest-orders-flow`
16. Continuity gate public web (`T-009-05`, command-local):
   1. `PUBLIC_WEB_BASE_URL=http://192.168.0.60:5000 pnpm gate:public-web-continuity`

Output evidence:

1. `reports/gates/ingest-env-baseline/{timestamp}.json`
2. `reports/gates/ingest-env-baseline/{timestamp}.md`
3. `reports/gates/ingest-processing/{timestamp}.json`
4. `reports/gates/ingest-dlq-growth/{timestamp}.json`
5. `reports/gates/ingest-release/{timestamp}.json`
6. `reports/gates/ingest-release/{timestamp}.md`
7. `reports/gates/ingest-duplicate-delivery/{timestamp}.json` (jika `RUN_GATE_DUPLICATE_DELIVERY=true` atau `RUN_EVIDENCE_INGEST_DUPLICATE_GATE=true`)
8. `reports/gates/ingest-retention-policy/{timestamp}.json` (jika `RUN_GATE_RETENTION_POLICY=true` atau `RUN_EVIDENCE_INGEST_RETENTION_GATE=true`)
9. `reports/gates/ingest-replay-drill/{timestamp}.json` (jika `RUN_GATE_REPLAY_DRILL=true` atau `RUN_EVIDENCE_INGEST_REPLAY_DRILL=true`)
10. `reports/gates/ingest-replay-drill/{timestamp}.md` (jika `RUN_GATE_REPLAY_DRILL=true` atau `RUN_EVIDENCE_INGEST_REPLAY_DRILL=true`)
11. `reports/gates/catalog-bridge/{timestamp}.json` (jika `RUN_EVIDENCE_CATALOG_GATE=true`)
12. `reports/gates/catalog-bridge/{timestamp}.md` (jika `RUN_EVIDENCE_CATALOG_GATE=true`)
13. `reports/gates/booking-bridge/{timestamp}.json` (jika `RUN_EVIDENCE_BOOKING_GATE=true`)
14. `reports/gates/booking-bridge/{timestamp}.md` (jika `RUN_EVIDENCE_BOOKING_GATE=true`)
15. `reports/gates/payment-finance/{timestamp}.json` (jika `RUN_EVIDENCE_PAYMENT_GATE=true`)
16. `reports/gates/payment-finance/{timestamp}.md` (jika `RUN_EVIDENCE_PAYMENT_GATE=true`)
17. `reports/release-evidence/{batch}/{timestamp}.json`
18. `reports/release-evidence/{batch}/{timestamp}.md`
19. `reports/gates/public-web-continuity/{timestamp}.json` (jika continuity gate `T-009-05` dijalankan)
20. `reports/gates/public-web-continuity/{timestamp}.md` (jika continuity gate `T-009-05` dijalankan)

Workflow automation:

1. GitHub manual workflow:
   1. `.github/workflows/phase2-release-evidence.yml`
2. GitHub manual workflow continuity gate public web:
   1. `.github/workflows/public-web-continuity-gate.yml`
3. Runbook operasional:
   1. `doc/runbook-ingest-release-gate-operations-2026-02-19.md`

## 4.1.1 F-00 Runtime Env Baseline (Prasyarat Batch F)

Checklist lulus `F-00`:

1. jalankan command preflight:
   1. `pnpm gate:ingest-env-baseline`.
2. command mengembalikan:
   1. `INGEST_ENV_BASELINE_RESULT=PASS`.
3. report tersimpan di:
   1. `reports/gates/ingest-env-baseline/{timestamp}.json`,
   2. `reports/gates/ingest-env-baseline/{timestamp}.md`.

4. file env core-api production valid:
   1. `/home/bonk/backend/core-api-prod/shared/.env`.
5. key berikut wajib non-empty:
   1. `REDIS_URL`,
   2. `INGEST_REDIS_URL`,
   3. `CORE_API_ADMIN_TOKEN`,
   4. `INGEST_SERVICE_TOKEN`,
   5. `INGEST_SERVICE_SECRET`,
   6. `INGEST_QUEUE_ENABLED`,
   7. `INGEST_WEBHOOK_ENABLED`,
   8. `INGEST_REPLAY_ENABLED`.
6. flag berikut pada receiver wajib bernilai `true` saat batch F aktivasi:
   1. `INGEST_QUEUE_ENABLED`,
   2. `INGEST_WEBHOOK_ENABLED`,
   3. `INGEST_REPLAY_ENABLED`.
7. parity token/secret wajib sama antara receiver (`core-api`) dan emitter (`balisnap`):
   1. `/home/bonk/balisnaptrip/.env`,
   2. `/home/bonk/stagging-bst/current/balisnap/.env`.
8. evidence minimum:
   1. timestamp verifikasi,
   2. path env yang diverifikasi,
   3. bukti backup `.env` sebelum perubahan.

## 4.2 Gate Automation Commands (Global G-03)

`apps/core-api` menyediakan command otomatis untuk global API health gate:

1. `G-03` API 5xx core path:
   1. `pnpm --filter @bst/core-api gate:api-health`

Output evidence:

1. `reports/gates/api-health/{timestamp}.json`

Workflow automation:

1. GitHub manual workflow:
   1. `.github/workflows/api-health-gate.yml`

## 4.3 Reconciliation Daily Automation (T-011-03)

`apps/core-api` menyediakan command otomatis untuk observability mismatch per domain:

1. Daily reconciliation report:
   1. `pnpm --filter @bst/core-api report:reconciliation-daily`
2. Transitional quality override (pre-catalog bridge):
   1. `QUALITY_ALLOW_EMPTY_CATALOG_DENOMINATOR=true pnpm --filter @bst/core-api quality:phase2`
   2. hanya valid jika `totalCatalogEntities=0` dan `unmappedRows=0`.

Output evidence:

1. `reports/recon/daily/{timestamp}.json`
2. `reports/recon/daily/{timestamp}.md`

Workflow automation:

1. GitHub schedule + manual workflow:
   1. `.github/workflows/reconciliation-daily-report.yml`

## 4.4 Gate Automation Commands (EP-013 UI Release Checklist)

`bstadmin` menyediakan command otomatis untuk freeze checklist UI prioritas internal:

1. UI release checklist gate (strict, default):
   1. `pnpm --filter bst-admin gate:ui-release-checklist`
2. Update baseline hash untuk freeze baru (wajib setelah reviewer approval):
   1. `UI_RELEASE_CHECKLIST_UPDATE_BASELINE=true pnpm --filter bst-admin gate:ui-release-checklist`
3. Override drift baseline (hanya untuk exception terkontrol):
   1. `UI_RELEASE_CHECKLIST_ALLOW_BASELINE_DRIFT=true pnpm --filter bst-admin gate:ui-release-checklist`

Output evidence:

1. `reports/gates/ui-release-checklist/{timestamp}.json`
2. `reports/gates/ui-release-checklist/{timestamp}.md`

Baseline manifest:

1. `bstadmin/config/ui-release-checklist-baseline.json`

Workflow automation:

1. GitHub manual workflow:
   1. `.github/workflows/ui-release-checklist-gate.yml`

Otomasi gabungan release candidate (UI internal + CM gate + opsional continuity):

1. Command lokal:
   1. `pnpm gate:release-candidate-ui`
2. Workflow manual:
   1. `.github/workflows/release-candidate-ui-gates.yml`
3. Output evidence agregat:
   1. `reports/gates/release-candidate-ui/{timestamp}.json`
   2. `reports/gates/release-candidate-ui/{timestamp}.md`

## 4.5 Canary Rollout Controls (WS-12)

`bstadmin` mendukung cutover bertahap berbasis actor untuk jalur read/write:

1. Read cutover:
   1. `OPS_READ_NEW_MODEL_ENABLED`
   2. `OPS_READ_NEW_MODEL_PERCENT`
   3. `OPS_READ_NEW_MODEL_CANARY_USER_IDS`
   4. `OPS_READ_NEW_MODEL_CANARY_EMAILS`
2. Write cutover:
   1. `OPS_WRITE_CORE_ENABLED`
   2. `OPS_WRITE_CORE_PERCENT`
   3. `OPS_WRITE_CORE_CANARY_USER_IDS`
   4. `OPS_WRITE_CORE_CANARY_EMAILS`
   5. `OPS_WRITE_CORE_STRICT`

Rollback cepat (`G-04`) dapat dilakukan dengan:

1. set `OPS_READ_NEW_MODEL_ENABLED=false`,
2. set `OPS_WRITE_CORE_ENABLED=false`,
3. atau set `*_PERCENT=0` sambil mempertahankan allowlist terbatas.

Evidence deploy/rollback minimal:

1. target path (`/home/bonk/stagging-bst` atau `/home/bonk/backend/core-api-prod`),
2. `release_id` yang diaktifkan,
3. timestamp rollback drill,
4. hasil verifikasi `current` symlink.

Verifikasi actor-level rollout:

1. endpoint internal `GET /api/ops/cutover-state` di `bstadmin` mengembalikan hasil evaluasi canary untuk user yang sedang login.

## 4.6 Gate Automation Commands (Batch G - BG-01)

`bstadmin` menyediakan command otomatis untuk gate parity read model ops:

1. `BG-01` data parity read model vs legacy:
   1. `pnpm --filter bst-admin gate:ops-read-parity`
2. Drill assignment sync (`T-008-03`):
   1. `pnpm --filter bst-admin drill:ops-assignment-sync`

Parameter threshold opsional:

1. `OPS_READ_PARITY_SAMPLE_LIMIT` (default `200`)
2. `OPS_READ_DETAIL_SAMPLE_SIZE` (default `50`)
3. `OPS_READ_PARITY_MAX_MISMATCH_RATIO` (default `0.01`)
4. `OPS_READ_PARITY_MIN_MATCHED_ROWS` (default `50`)

Output evidence:

1. `reports/gates/ops-read-parity/{timestamp}.json`
2. `reports/gates/ops-read-parity/{timestamp}.md`
3. `reports/gates/ops-assignment-sync/{timestamp}.json` (jika drill `T-008-03` dijalankan)
4. `reports/gates/ops-assignment-sync/{timestamp}.md` (jika drill `T-008-03` dijalankan)

Workflow automation:

1. GitHub manual workflow:
   1. `.github/workflows/ops-read-parity-gate.yml`
2. GitHub manual workflow drill assignment sync:
   1. `.github/workflows/ops-assignment-sync-drill.yml`
3. Runbook operasional:
   1. `doc/runbook-ops-read-parity-gate-operations-2026-02-20.md`

## 4.7 Gate Automation Commands (Batch H - H-01)

`bstadmin` menyediakan command otomatis untuk gate mismatch dual-write:

1. `H-01` dual-write mismatch per jam:
   1. `pnpm --filter bst-admin gate:write-cutover`

Output evidence:

1. `reports/gates/write-cutover/{timestamp}.json`
2. `reports/gates/write-cutover/{timestamp}.md`

Workflow automation:

1. GitHub manual workflow:
   1. `.github/workflows/write-cutover-mismatch-gate.yml`

## 4.8 Gate Automation Commands (Batch C - C-01/C-02/C-03)

`apps/core-api` menyediakan command otomatis untuk gate catalog bridge:

1. `C-01` orphan ratio:
   1. `GATE_CATALOG_MAX_ORPHAN_RATIO_PERCENT=0.5 pnpm --filter @bst/core-api gate:catalog-bridge`
2. `C-02` unmapped ratio:
   1. `GATE_CATALOG_MAX_UNMAPPED_RATIO_PERCENT=5 pnpm --filter @bst/core-api gate:catalog-bridge`
3. `C-03` variant active rate coverage:
   1. `pnpm --filter @bst/core-api gate:catalog-bridge`

Output evidence:

1. `reports/gates/catalog-bridge/{timestamp}.json`
2. `reports/gates/catalog-bridge/{timestamp}.md`

Workflow automation:

1. GitHub manual workflow:
   1. `.github/workflows/catalog-bridge-gate.yml`

## 4.9 Gate Automation Commands (Batch D - D-01/D-02/D-03/D-04)

`apps/core-api` menyediakan command otomatis untuk gate booking bridge:

1. `D-01` duplicate booking identity:
   1. `pnpm --filter @bst/core-api gate:booking-bridge`
2. `D-02` null critical identity field:
   1. `pnpm --filter @bst/core-api gate:booking-bridge`
3. `D-03` pax mismatch booking vs item:
   1. `GATE_BOOKING_MAX_PAX_MISMATCH_RATIO_PERCENT=1 pnpm --filter @bst/core-api gate:booking-bridge`
4. `D-04` `package_ref_type` completeness:
   1. `pnpm --filter @bst/core-api gate:booking-bridge`

Output evidence:

1. `reports/gates/booking-bridge/{timestamp}.json`
2. `reports/gates/booking-bridge/{timestamp}.md`

Workflow automation:

1. GitHub manual workflow:
   1. `.github/workflows/booking-bridge-gate.yml`

## 4.10 Gate Automation Commands (Batch E - E-01/E-02/E-03)

`apps/core-api` menyediakan command otomatis untuk gate payment-finance bridge:

1. `E-01` orphan payment event:
   1. `pnpm --filter @bst/core-api gate:payment-finance-bridge`
2. `E-02` `ops=DONE` tetapi `payment!=PAID`:
   1. `GATE_PAYMENT_MAX_OPS_DONE_NOT_PAID_RATIO_PERCENT=0.3 pnpm --filter @bst/core-api gate:payment-finance-bridge`
3. `E-03` sample audit payment direct:
   1. `GATE_PAYMENT_DIRECT_SAMPLE_SIZE=25 pnpm --filter @bst/core-api gate:payment-finance-bridge`

Output evidence:

1. `reports/gates/payment-finance/{timestamp}.json`
2. `reports/gates/payment-finance/{timestamp}.md`

Workflow automation:

1. GitHub manual workflow:
   1. `.github/workflows/payment-finance-bridge-gate.yml`

## 5. Gate Result Template

```md
Batch: X
Tanggal: YYYY-MM-DD
Result: PASS | HOLD | FAIL
Blocked By:
- ...
Evidence:
- reports/recon/X/{timestamp}.json
- reports/recon/X/{timestamp}.md
Sign-off:
- Tech Lead:
- Backend Lead:
- DevOps:
- Ops Lead:
- Owner:
```

## 6. Snapshot Audit Menyeluruh (2026-02-21)

1. Status publish prod:
   1. `public web` (`balisnaptrip.com`) = `LIVE`,
   2. `admin ops` (`admin.balisnaptrip.com`) = `LIVE`,
   3. `content manager` = belum masuk scope publish prod (lanjut pengembangan tim lain).
2. Validasi domain prod:
   1. kedua domain resolve ke `192.168.0.60`,
   2. hash response domain vs direct runtime `5000/3100` = `MATCH`.
3. Validasi runtime:
   1. listener prod aktif pada `3100` dan `5000`,
   2. listener preview `3101` dan `3200` nonaktif.
4. Hardening post-publish `bstadmin`:
   1. `HOSTNAME=0.0.0.0`,
   2. `INTERNAL_CRON_BASE_URL=http://127.0.0.1:3100`,
   3. `CRON_INITIAL_DELAY_MS=30000`,
   4. cron log stabil `success`.
