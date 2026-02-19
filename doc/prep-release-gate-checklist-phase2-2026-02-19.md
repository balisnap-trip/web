# Phase-2 Release Gate Checklist

Tanggal: 2026-02-19  
Scope: gate eksekusi batch A-H sebelum lanjut batch berikutnya.

## 1. Aturan Umum

1. Satu batch dianggap `PASS` hanya jika seluruh gate `PASS`.
2. Jika ada gate `FAIL`, batch berikutnya otomatis `HOLD`.
3. Semua evidence wajib tersimpan di:
   1. `reports/recon/{batch}/{timestamp}.json`,
   2. `reports/recon/{batch}/{timestamp}.md`,
   3. log deploy + rollback drill.

## 2. Gate Global (Berlaku Semua Batch)

| Gate ID | Kriteria | Pass Rule |
|---|---|---|
| G-01 | Duplicate canonical booking | `0` row |
| G-02 | Reconciliation mismatch global | `<= 1%` + exception list |
| G-03 | API 5xx core path | `<= 1.5%` selama 15 menit |
| G-04 | Rollback readiness | RTO toggle flag `<= 5 menit` |
| G-05 | Public booking success rate | tidak turun > `2%` dari baseline 7 hari |
| G-06 | Payment mismatch harian | `<= 0.5%` |

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

## 3.6 Batch F (Ingestion Activation)

| Gate | Kriteria | Pass Rule |
|---|---|---|
| F-01 | event success rate | `>= 99.5%` rolling 1 jam |
| F-02 | median/p95 processing latency | median `<= 3s`, p95 `<= 15s` |
| F-03 | DLQ growth setelah peak | `<= 20 event/jam` selama 2 jam |
| F-04 | duplicate delivery handling | 0 duplicate aggregate row |
| F-05 | retention cleanup policy aktif | nonce 10 menit, idempotency 35 hari, DLQ 30 hari |

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

1. `F-01/F-02`:
   1. `pnpm --filter @bst/core-api gate:ingest-processing`
2. `F-03`:
   1. `pnpm --filter @bst/core-api gate:ingest-dlq-growth`
3. Combined evidence run:
   1. `pnpm --filter @bst/core-api gate:ingest-release`
4. Combined release evidence (quality + ingest gates):
   1. `pnpm --filter @bst/core-api release:evidence`

Output evidence:

1. `reports/gates/ingest-processing/{timestamp}.json`
2. `reports/gates/ingest-dlq-growth/{timestamp}.json`
3. `reports/gates/ingest-release/{timestamp}.json`
4. `reports/gates/ingest-release/{timestamp}.md`
5. `reports/release-evidence/{batch}/{timestamp}.json`
6. `reports/release-evidence/{batch}/{timestamp}.md`

Workflow automation:

1. GitHub manual workflow:
   1. `.github/workflows/phase2-release-evidence.yml`
2. Runbook operasional:
   1. `doc/runbook-ingest-release-gate-operations-2026-02-19.md`

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

Output evidence:

1. `reports/recon/daily/{timestamp}.json`
2. `reports/recon/daily/{timestamp}.md`

Workflow automation:

1. GitHub schedule + manual workflow:
   1. `.github/workflows/reconciliation-daily-report.yml`

## 4.4 Canary Rollout Controls (WS-12)

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

Verifikasi actor-level rollout:

1. endpoint internal `GET /api/ops/cutover-state` di `bstadmin` mengembalikan hasil evaluasi canary untuk user yang sedang login.

## 4.5 Gate Automation Commands (Batch H - H-01)

`bstadmin` menyediakan command otomatis untuk gate mismatch dual-write:

1. `H-01` dual-write mismatch per jam:
   1. `pnpm --filter bst-admin gate:write-cutover`

Output evidence:

1. `reports/gates/write-cutover/{timestamp}.json`
2. `reports/gates/write-cutover/{timestamp}.md`

Workflow automation:

1. GitHub manual workflow:
   1. `.github/workflows/write-cutover-mismatch-gate.yml`

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
