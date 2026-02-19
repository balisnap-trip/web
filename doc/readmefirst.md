# Balisnaptrip Unified Plan Docs (Detailed Baseline)

Tanggal baseline: 2026-02-18  
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
5. `doc/cross-project-master-plan-2026-02-18.md`
6. `doc/prep-ui-ux-standardization-spec-2026-02-18.md`
7. `doc/prep-ui-component-inventory-2026-02-18.md`
8. `doc/prep-api-contract-v1-2026-02-18.md`
9. `doc/prep-migration-matrix-2026-02-18.md`
10. `doc/prep-phase2-migration-blueprint-2026-02-18.md`
11. `doc/prep-release-gate-checklist-phase2-2026-02-19.md`
12. `doc/prep-implementation-backlog-2026-02-18.md`
13. `doc/prep-naming-consistency-audit-2026-02-19.md`

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
5. `cross-project-master-plan`: aktif, peta implementasi end-to-end.
6. `prep-api-contract-v1`: aktif, contract baseline.
7. `prep-migration-matrix`: aktif, mapping field-level.
8. `prep-phase2-migration-blueprint`: aktif, langkah migrasi batch.
9. `prep-release-gate-checklist-phase2`: aktif, checklist lulus/tahan per batch A-H.
10. `prep-ui-ux-standardization-spec`: aktif, standar UI internal + continuity public web.
11. `prep-ui-component-inventory`: aktif, daftar komponen + gap + prioritas refactor.
12. `prep-implementation-backlog`: aktif, breakdown eksekusi mingguan.
13. `prep-naming-consistency-audit`: aktif, lock keputusan naming dan governance terminology.
14. `sql-templates/phase2`: aktif, template SQL eksekusi batch A-B + postcheck.

## 5. Arsip

1. `doc/Plan A/*`
2. `doc/Plan B/*`
3. `doc/plan-a-vs-plan-b-comparison-2026-02-18.md`
