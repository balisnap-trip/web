# Balisnaptrip Unified Plan Docs (Detailed Baseline)

Tanggal baseline: 2026-02-18  
Update terakhir: 2026-02-20  
Workspace: `d:\Balisnaptrip\WEB`

Dokumen root `doc/` adalah baseline aktif untuk implementasi.  
Folder `doc/Plan A` dan `doc/Plan B` diperlakukan sebagai arsip referensi, bukan sumber keputusan final.

## 1. Tujuan Paket Dokumen

1. Menetapkan desain final lintas `balisnap` + `bstadmin` + `content manager`.
2. Menggabungkan:
   1. kedalaman teknis migrasi (Plan A),
   2. kekuatan arsitektur jangka panjang (Plan B).
3. Menurunkan rancangan sampai level implementasi:
   1. field mapping,
   2. kontrak API,
   3. batch migration,
   4. backlog delivery.

## 2. Reading Order (Wajib)

1. `doc/tmp-prep-source-truth-2026-02-18.md`
2. `doc/prep-decision-lock-2026-02-18.md`
3. `doc/prep-decision-lock-before-coding-checklist-2026-02-19.md`
4. `doc/prep-core-schema-target-v1-2026-02-19.md`
5. `doc/prep-deployment-topology-strategy-2026-02-20.md`
6. `doc/runbook-stagging-core-api-deploy-2026-02-20.md`
7. `doc/runbook-ingest-release-gate-operations-2026-02-19.md`
8. `doc/cross-project-master-plan-2026-02-18.md`
9. `doc/prep-ui-ux-standardization-spec-2026-02-18.md`
10. `doc/prep-ui-component-inventory-2026-02-18.md`
11. `doc/prep-api-contract-v1-2026-02-18.md`
12. `doc/prep-migration-matrix-2026-02-18.md`
13. `doc/prep-phase2-migration-blueprint-2026-02-18.md`
14. `doc/prep-release-gate-checklist-phase2-2026-02-19.md`
15. `doc/prep-implementation-backlog-2026-02-18.md`
16. `doc/prep-naming-consistency-audit-2026-02-19.md`

## 3. Aturan Eksekusi

1. Jika ada konflik antar dokumen, prioritas:
   1. source code,
   2. `prep-decision-lock`,
   3. dokumen rencana lain.
2. Tidak ada keputusan arsitektur baru di luar dokumen lock tanpa pembaruan lock.
3. Semua perubahan major harus lolos:
   1. contract check,
   2. migration reconciliation,
   3. rollback readiness.

## 4. Status Dokumen

1. `tmp-prep-source-truth`: aktif, acuan fakta teknis.
2. `prep-decision-lock`: aktif, keputusan final.
3. `prep-decision-lock-before-coding-checklist`: aktif, checklist lock blocker sebelum coding.
4. `prep-core-schema-target-v1`: aktif, schema target executable baseline.
5. `prep-deployment-topology-strategy`: aktif, acuan path staging/prod + policy deploy rollback.
6. `runbook-stagging-core-api-deploy`: aktif, prosedur deploy/rollback staging dan core-api prod.
7. `runbook-ingest-release-gate-operations`: aktif, prosedur gate ingestion + troubleshooting operasional.
8. `cross-project-master-plan`: aktif, peta implementasi end-to-end.
9. `prep-api-contract-v1`: aktif, contract baseline.
10. `prep-migration-matrix`: aktif, mapping field-level.
11. `prep-phase2-migration-blueprint`: aktif, langkah migrasi batch.
12. `prep-release-gate-checklist-phase2`: aktif, checklist lulus/tahan per batch A-H.
13. `prep-ui-ux-standardization-spec`: aktif, standar UI internal + continuity public web.
14. `prep-ui-component-inventory`: aktif, daftar komponen + gap + prioritas refactor.
15. `prep-implementation-backlog`: aktif, breakdown eksekusi mingguan.
16. `prep-naming-consistency-audit`: aktif, lock keputusan naming dan governance terminology.
17. `sql-templates/phase2`: aktif, template SQL eksekusi batch A-B + postcheck.

## 4.1 Update Operasional Terkini (2026-02-20)

1. Path staging aktif tunggal: `/home/bonk/stagging-bst` (tanpa alias `masterbst`).
2. Path core-api production aktif: `/home/bonk/backend/core-api-prod`.
3. Bootstrap env runtime core-api untuk key ingest/redis/admin token sudah selesai.
4. `INGEST_SERVICE_TOKEN` dan `INGEST_SERVICE_SECRET` sudah sinkron di env emitter dan receiver.

## 5. Arsip

1. `doc/Plan A/*`
2. `doc/Plan B/*`
3. `doc/plan-a-vs-plan-b-comparison-2026-02-18.md`
