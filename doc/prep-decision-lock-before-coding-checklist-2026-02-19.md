# Decision Lock Before Coding Checklist

Tanggal: 2026-02-19  
Tujuan: memastikan blocker strategis ditutup sebelum coding fase implementasi core.

Status legend:

1. `LOCKED`: sudah terkunci di dokumen aktif.
2. `PENDING_OWNER_CONFIRM`: butuh konfirmasi owner final.
3. `BLOCKED`: belum bisa lanjut coding modul terkait.

## 0. Approval Record

1. Owner approval diterima: 2026-02-19.
2. Keputusan owner:
   1. seluruh item `PENDING_OWNER_CONFIRM` disetujui,
   2. implementasi boleh dilanjutkan ke template SQL migration dan release gate checklist.

## 1. Checklist Prioritas

| ID | Prioritas | Keputusan Kunci | Proposed Lock | Owner | Deadline | Status |
|---|---|---|---|---|---|---|
| D-01 | P0 | Schema target executable source final | `prep-core-schema-target-v1-2026-02-19.md` jadi sumber DDL aktif | Tech Lead | 2026-02-19 | LOCKED |
| D-02 | P0 | Nama tabel ops tunggal | `ops_booking_state`, `ops_assignment`, `ops_finance_bridge` | Tech Lead | 2026-02-19 | LOCKED |
| D-03 | P0 | Gate angka go/no-go | mismatch <= 1%, write mismatch <= 0.1%, event success >= 99.5% | Owner + Tech Lead | 2026-02-20 | LOCKED |
| D-04 | P0 | Security ingest detail | HMAC-SHA256, drift 5 menit, nonce TTL 10 menit, idempotency TTL 35 hari | Security + Backend Lead | 2026-02-20 | LOCKED |
| D-05 | P0 | Queue runtime lock | Redis + BullMQ, retry 5 tahap, poison ke DLQ | Backend Lead + DevOps | 2026-02-20 | LOCKED |
| D-06 | P0 | Id generation deterministic | UUIDv5 untuk backfill, UUIDv7 untuk write baru | Backend Lead | 2026-02-20 | LOCKED |
| D-07 | P0 | Dual-write conflict playbook | writer prioritas per modul + SLA resolusi konflik | Ops Lead + Backend Lead | 2026-02-21 | LOCKED |
| D-08 | P1 | Scope hard-cut vs deprecation | hard-cut hanya internal non-versioned; public API versioned pakai deprecation | Owner + Tech Lead | 2026-02-20 | LOCKED |
| D-09 | P1 | `package_id` polymorphic safety | wajib `packageRefType` + `packageRefKey`; sunset 2026-09-30 | Owner + Product | 2026-02-21 | LOCKED |
| D-10 | P1 | Monorepo tooling lock | pnpm + Turborepo + Changesets | Tech Lead | 2026-02-19 | LOCKED |
| D-11 | P1 | Deployment topology path lock | staging `/home/bonk/stagging-bst`, core-api prod `/home/bonk/backend/core-api-prod`, tanpa alias path staging lama | DevOps + Tech Lead | 2026-02-20 | LOCKED |

## 2. Dampak Jika Tidak Lock

1. D-01/D-02 gagal lock:
   1. migration script berpotensi divergen antar engineer.
2. D-03/D-04/D-05 gagal lock:
   1. go/no-go release tidak objektif dan risk incident saat peak booking naik.
3. D-07 gagal lock:
   1. dual-write bisa menciptakan drift yang sulit direkonsiliasi.
4. D-08/D-09 gagal lock:
   1. konflik policy API dan ambiguity `package_id` terus berulang.
5. D-11 gagal lock:
   1. target deploy staging/prod ambigu dan rollback evidence sulit diaudit.

## 3. Rekomendasi Eksekusi

1. Semua item prioritas sekarang `LOCKED`.
2. Freeze perubahan dokumen arsitektur selama 1 sprint kecuali ada incident kritis.
3. Lanjutkan ke implementasi SQL migration template + release gate checklist eksekusi.

## 4. Output Lanjutan (Completed)

1. SQL migration template pack:
   1. `doc/sql-templates/phase2/README.md`,
   2. `doc/sql-templates/phase2/000_precheck_readiness.sql`,
   3. `doc/sql-templates/phase2/001_create_core_bridge_tables.sql`,
   4. `doc/sql-templates/phase2/002_add_indexes_and_unique_constraints.sql`,
   5. `doc/sql-templates/phase2/003_seed_required_enums_and_checks.sql`,
   6. `doc/sql-templates/phase2/010_seed_channel_registry.sql`,
   7. `doc/sql-templates/phase2/011_seed_status_dictionary.sql`,
   8. `doc/sql-templates/phase2/012_seed_package_ref_type_dictionary.sql`,
   9. `doc/sql-templates/phase2/090_postcheck_reconciliation.sql`,
   10. `doc/sql-templates/phase2/091_retention_cleanup.sql`.
2. Release gate per batch:
   1. `doc/prep-release-gate-checklist-phase2-2026-02-19.md`.
3. Deployment topology strategy:
   1. `doc/prep-deployment-topology-strategy-2026-02-20.md`.
