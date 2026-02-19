# Ingest Release Gate Operations Runbook

Tanggal: 2026-02-19  
Update terakhir: 2026-02-20  
Scope: operasi gate ingestion (`F-00` s.d. `F-05`) + quality evidence phase-2.

## 1. Tujuan

1. Menyediakan prosedur eksekusi gate yang konsisten sebelum sign-off batch.
2. Memberi langkah troubleshooting cepat saat gate `FAIL`.
3. Menyatukan command lokal dan workflow GitHub Actions.

## 2. Prasyarat

1. Service `core-api` reachable.
2. Redis + queue runtime aktif (untuk observability queue).
3. Akses DB `ops_db` (untuk quality check).
4. Target deploy path mengikuti `doc/prep-deployment-topology-strategy-2026-02-20.md`.

Environment penting:

1. `CORE_API_BASE_URL`
2. `CORE_API_ADMIN_TOKEN`
3. `INGEST_SERVICE_TOKEN`
4. `INGEST_SERVICE_SECRET`
5. `REDIS_URL`
6. `INGEST_REDIS_URL`
7. `OPS_DB_URL`
8. `PHASE2_BATCH_CODE`
9. `WEB_EMIT_BOOKING_EVENT_ENABLED`

## 2.1 Status Env Runtime (2026-02-20)

1. Nilai `CORE_API_ADMIN_TOKEN`, `INGEST_SERVICE_TOKEN`, dan `INGEST_SERVICE_SECRET` sudah dibootstrap di runtime core-api.
2. `INGEST_SERVICE_TOKEN` dan `INGEST_SERVICE_SECRET` sudah disinkronkan ke env `balisnaptrip` production existing dan staging current release.
3. Nilai secret tidak ditaruh di dokumen; validasi dilakukan langsung di runtime `.env` dan workflow secret.

## 3. Jalur Eksekusi Lokal

1. Preflight runtime env baseline (`F-00`):
   1. `pnpm gate:ingest-env-baseline`
2. Quality check data:
   1. `pnpm --filter @bst/core-api quality:phase2`
3. Ingest gates:
   1. `pnpm --filter @bst/core-api gate:ingest-processing`
   2. `pnpm --filter @bst/core-api gate:ingest-dlq-growth`
4. Combined ingest gates:
   1. `pnpm --filter @bst/core-api gate:ingest-release`
5. Combined release evidence:
   1. `pnpm --filter @bst/core-api release:evidence`
   2. jika quality check belum in-scope batch aktif, gunakan:
      1. `RUN_EVIDENCE_QUALITY_CHECK=false pnpm --filter @bst/core-api release:evidence`

## 3.1 Preflight Wajib Sebelum Gate

1. Jalankan `pnpm gate:ingest-env-baseline` sampai hasil `INGEST_ENV_BASELINE_RESULT=PASS`.
2. Pastikan flag receiver berikut bernilai `true` untuk batch F activation:
   1. `INGEST_QUEUE_ENABLED`,
   2. `INGEST_WEBHOOK_ENABLED`,
   3. `INGEST_REPLAY_ENABLED`.
3. Pastikan Redis runtime aktif:
   1. `pnpm deploy:core-api-prod:redis:start`,
   2. `pnpm deploy:core-api-prod:redis:status`.
4. Verifikasi semua key env penting tidak kosong.
5. Verifikasi `INGEST_SERVICE_TOKEN` dan `INGEST_SERVICE_SECRET` di emitter (`balisnap`) sama dengan penerima (`core-api`).
6. Verifikasi `WEB_EMIT_BOOKING_EVENT_ENABLED=false` jika belum masuk window aktivasi bertahap.
7. Setelah update env, lakukan restart/reload process sebelum menjalankan gate.

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

1. `reports/gates/ingest-env-baseline/*`
2. `reports/gates/ingest-processing/*`
3. `reports/gates/ingest-dlq-growth/*`
4. `reports/gates/ingest-release/*`
5. `reports/recon/quality/{batch}/*`
6. `reports/release-evidence/{batch}/*`

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
6. `INVALID_INGEST_SIGNATURE`:
   1. pastikan `INGEST_SERVICE_TOKEN` dan `INGEST_SERVICE_SECRET` sama di sisi emitter dan receiver,
   2. pastikan tidak ada whitespace/karakter tersembunyi pada nilai token/secret.
7. `QUEUE_REDIS_UNREACHABLE`:
   1. cek `REDIS_URL` dan `INGEST_REDIS_URL`,
   2. cek proses Redis aktif dan dapat diakses dari host runtime core-api.

## 8. Escalation

1. Jika gate `FAIL` pada batch aktif:
   1. status batch berikutnya otomatis `HOLD`,
   2. eskalasi ke Tech Lead + Backend Lead,
   3. lampirkan report JSON/MD terbaru dalam tiket incident.
