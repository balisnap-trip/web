# Phase-2 SQL Templates

Tanggal: 2026-02-19  
Status: template operasional (bukan script produksi final mentah).

## 1. Tujuan

1. Menyediakan baseline SQL untuk batch A-B phase-2.
2. Menjaga konsistensi dengan:
   1. `doc/prep-core-schema-target-v1-2026-02-19.md`,
   2. `doc/prep-phase2-migration-blueprint-2026-02-18.md`,
   3. `doc/prep-migration-matrix-2026-02-18.md`.

## 2. Urutan Eksekusi

1. `000_precheck_readiness.sql`
2. `001_create_core_bridge_tables.sql`
3. `002_add_indexes_and_unique_constraints.sql`
4. `003_seed_required_enums_and_checks.sql`
5. `010_seed_channel_registry.sql`
6. `011_seed_status_dictionary.sql`
7. `012_seed_package_ref_type_dictionary.sql`
8. `090_postcheck_reconciliation.sql`
9. `091_retention_cleanup.sql`

Catatan eksekusi gate:

1. `090_postcheck_reconciliation.sql` bukan hanya sekali jalan; script ini wajib dijalankan ulang pada akhir setiap batch gate (`A` s/d `H`) sebelum keputusan `PASS/HOLD`.

## 3. Lock Penempatan DB (Phase-2 Transition)

1. Semua script pada folder ini dijalankan terhadap koneksi `ops_db`.
2. `channel_db` tidak menerima DDL baru untuk batch A-B pada fase transisi.
3. Jika nantinya dilakukan split fisik lintas DB, itu masuk scope fase lanjut dengan plan migration terpisah.

## 4. Aturan Pakai

1. Jalankan di staging dulu, bukan langsung production.
2. Simpan checksum script yang dipakai ke `migration_run_log`.
3. `000_precheck_readiness.sql` wajib `PASS` sebelum lanjut ke script DDL.
4. untuk capacity check di `000_precheck_readiness.sql`, isi input `disk_total_bytes` dan `disk_used_bytes`; status harus `PASS`.
5. `091_retention_cleanup.sql` dijalankan sebagai job terjadwal (minimal 1x/hari).
6. Bila ada penyesuaian environment (schema name, role, tablespace), commit perubahan ke repo agar traceable.
