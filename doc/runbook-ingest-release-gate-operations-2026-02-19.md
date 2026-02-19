# Ingest Release Gate Operations Runbook

Tanggal: 2026-02-19  
Scope: operasi gate ingestion (`F-01`, `F-02`, `F-03`) + quality evidence phase-2.

## 1. Tujuan

1. Menyediakan prosedur eksekusi gate yang konsisten sebelum sign-off batch.
2. Memberi langkah troubleshooting cepat saat gate `FAIL`.
3. Menyatukan command lokal dan workflow GitHub Actions.

## 2. Prasyarat

1. Service `core-api` reachable.
2. Redis + queue runtime aktif (untuk observability queue).
3. Akses DB `ops_db` (untuk quality check).

Environment penting:

1. `CORE_API_BASE_URL`
2. `CORE_API_ADMIN_TOKEN`
3. `OPS_DB_URL`
4. `PHASE2_BATCH_CODE`

## 3. Jalur Eksekusi Lokal

1. Quality check data:
   1. `pnpm --filter @bst/core-api quality:phase2`
2. Ingest gates:
   1. `pnpm --filter @bst/core-api gate:ingest-processing`
   2. `pnpm --filter @bst/core-api gate:ingest-dlq-growth`
3. Combined ingest gates:
   1. `pnpm --filter @bst/core-api gate:ingest-release`
4. Combined release evidence:
   1. `pnpm --filter @bst/core-api release:evidence`

## 4. Jalur Eksekusi CI (Manual Dispatch)

1. Ingest contract smoke:
   1. `.github/workflows/ingest-contract-smoke.yml`
2. Admin RBAC smoke:
   1. `.github/workflows/admin-auth-smoke.yml`
3. Ingest release gates:
   1. `.github/workflows/ingest-release-gate.yml`
4. Phase-2 quality check:
   1. `.github/workflows/phase2-quality-check.yml`
5. Combined release evidence:
   1. `.github/workflows/phase2-release-evidence.yml`

## 5. Lokasi Evidence

1. `reports/gates/ingest-processing/*`
2. `reports/gates/ingest-dlq-growth/*`
3. `reports/gates/ingest-release/*`
4. `reports/recon/quality/{batch}/*`
5. `reports/release-evidence/{batch}/*`

## 6. Checklist Go/No-Go Singkat

1. `gate:ingest-processing` = `PASS`.
2. `gate:ingest-dlq-growth` = `PASS`.
3. `quality:phase2` = `PASS`.
4. Tidak ada failed stage di `release:evidence`.

## 7. Troubleshooting Cepat

1. `INVALID_ADMIN_TOKEN`:
   1. cek nilai `CORE_API_ADMIN_TOKEN`,
   2. cek secret workflow `CORE_API_ADMIN_TOKEN`.
2. `ADMIN_ROLE_FORBIDDEN`:
   1. gunakan `x-admin-role` sesuai endpoint (`MANAGER`/`ADMIN` untuk write).
3. `DLQ growth` tinggi:
   1. cek `GET /v1/ingest/metrics/queue`,
   2. identifikasi status dominan (`OPEN/FAILED/REPLAYING`),
   3. lakukan throttling source atau replay batch terkontrol.
4. `success rate` turun:
   1. cek `GET /v1/ingest/metrics/processing`,
   2. korelasikan dengan `ingest_event_log.error_message`,
   3. isolasi source/channel penyumbang gagal terbesar.
5. `quality:phase2` fail:
   1. baca report `reports/recon/quality/{batch}/*.md`,
   2. prioritaskan duplicate identity dan payment orphan,
   3. jalankan rekonsiliasi ulang setelah corrective action.

## 8. Escalation

1. Jika gate `FAIL` pada batch aktif:
   1. status batch berikutnya otomatis `HOLD`,
   2. eskalasi ke Tech Lead + Backend Lead,
   3. lampirkan report JSON/MD terbaru dalam tiket incident.
