# READMEFIRST - Handover to New Chat

Date: 2026-02-18  
Project root: `d:\Balisnaptrip\WEB\balisnap`  
Sibling admin project: `d:\Balisnaptrip\WEB\bstadmin`

## 1) Purpose

File ini wajib dibaca dulu oleh chat baru agar tidak mengulang analisis dari nol.

## 2) User mandate (must keep)

1. Gunakan **source code sebagai source of truth**.
2. Jangan menyusun keputusan dari asumsi atau dokumen `.md` internal saja.
3. Fokus domain: travel/tour proper dengan realita catalog berbeda per channel (WEB/GYG/Viator/dll).

## 3) What has been completed (Preparation Stage)

Preparation stage sudah diselesaikan, dengan output:

1. `doc/prep-erd-final-2026-02-18.md`
- ERD final target (canonical + channel mapping + finance).

2. `doc/prep-api-contract-v1-2026-02-18.md`
- API contract v1 berbasis endpoint aktif di source.

3. `doc/prep-migration-matrix-2026-02-18.md`
- Matriks migrasi field `balisnap + bstadmin -> target`.

4. `doc/prep-decision-lock-2026-02-18.md`
- Lock enum/mandatory columns/compatibility policy.

5. `doc/prep-phase2-migration-blueprint-2026-02-18.md`
- Blueprint eksekusi tahap 2 (DDL/backfill/reconciliation/cutover guards).

6. Audit trail:
- `doc/tmp-cross-project-audit-2026-02-18.md`
- `doc/tmp-prep-source-truth-2026-02-18.md`

## 4) Reading order for new chat

1. `doc/readmefirst.md` (this file)
2. `doc/prep-decision-lock-2026-02-18.md`
3. `doc/prep-erd-final-2026-02-18.md`
4. `doc/prep-api-contract-v1-2026-02-18.md`
5. `doc/prep-migration-matrix-2026-02-18.md`
6. `doc/prep-phase2-migration-blueprint-2026-02-18.md`

## 5) Immediate next step (start of Phase-2)

Jangan ulang tahap persiapan. Langsung masuk implementasi:

1. Buat migration SQL batch A-F sesuai `prep-phase2-migration-blueprint`.
2. Implement backfill scripts idempotent.
3. Jalankan reconciliation queries dan simpan hasil report.
4. Commit incremental per batch (jangan big-bang commit).

## 6) Constraints to preserve during Phase-2/3

1. Keep compatibility response fields untuk public web:
- `package_id`, `package_name`, `price_per_person`, `price_per_child`.

2. Keep booking input fallback:
- `variantId` fallback from `packageId`.

3. Keep payment safety checks:
- ownership (`custom_id`), amount match, currency validation.

4. Keep finance operational model intact while bridging to variant.

## 7) Current workspace note

Saat handover ini ditulis, perubahan berfokus pada dokumentasi di folder `doc/` dan belum menjalankan perubahan schema/code runtime untuk Phase-2.
