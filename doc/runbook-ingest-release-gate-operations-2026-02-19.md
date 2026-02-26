# Ingest Release Gate Operations Runbook

Tanggal: 2026-02-19  
Update terakhir: 2026-02-21  
Scope: operasi gate ingestion (`F-00` s.d. `F-05`) + quality evidence phase-2.

## 1. Tujuan

1. Menyediakan prosedur eksekusi gate yang konsisten sebelum sign-off batch.
2. Memberi langkah troubleshooting cepat saat gate `FAIL`.
3. Menyatukan command lokal dan workflow GitHub Actions.

## 2. Prasyarat

1. Service `core-api` reachable.
2. Redis + queue runtime aktif (untuk observability queue).
3. Akses DB `balisnaptrip_ops` (untuk quality check).
4. Target deploy path mengikuti `doc/prep-deployment-topology-strategy-2026-02-20.md`.

Environment penting:

1. `CORE_API_BASE_URL`
2. `CORE_API_ADMIN_TOKEN`
3. `INGEST_SERVICE_TOKEN`
4. `INGEST_SERVICE_SECRET`
5. `REDIS_URL`
6. `INGEST_REDIS_URL`
7. `OPS_DB_URL`
8. `CHANNEL_DB_URL`
9. `PHASE2_BATCH_CODE`
10. `WEB_EMIT_BOOKING_EVENT_ENABLED`

Catatan model DB:

1. Runtime default menggunakan 2 DB:
   1. `OPS_DB_URL` (operasional),
   2. `CHANNEL_DB_URL` (content/channel).
2. `BALISNAP_DB_URL` dan `BSTADMIN_DB_URL` hanya override opsional untuk script backfill lintas source; jika kosong maka fallback ke `OPS_DB_URL`.
3. Script Batch C/D/E akan mencoba membaca legacy file lokal untuk source DB:
   1. `balisnap/.env` (`DATABASE_URL`),
   2. `bstadmin/.env` / `bstadmin/.env.production` (`DATABASE_URL`).
4. Jika `OPS_DB_URL` tidak diset, script batch akan mencoba kandidat legacy berurutan:
   1. `apps/core-api/.env` (`OPS_DB_URL`/`DATABASE_URL`),
   2. `balisnap/.env` (`DATABASE_URL`),
   3. `bstadmin/.env` / `.env.production` (`DATABASE_URL`/`SYNC_DATABASE_URL`).

## 2.1 Status Env Runtime (2026-02-20)

1. Nilai `CORE_API_ADMIN_TOKEN`, `INGEST_SERVICE_TOKEN`, dan `INGEST_SERVICE_SECRET` sudah dibootstrap di runtime core-api.
2. `INGEST_SERVICE_TOKEN` dan `INGEST_SERVICE_SECRET` sudah disinkronkan ke env `balisnaptrip` production existing dan staging current release.
3. Nilai secret tidak ditaruh di dokumen; validasi dilakukan langsung di runtime `.env` dan workflow secret.

## 2.2 Evidence Snapshot Terbaru (2026-02-20)

1. Replay drill operasional (`T-007-04`) `PASS`:
   1. `reports/gates/ingest-replay-drill/2026-02-20T04-45-41-148Z.json`.
2. Ingest release gate gabungan (`F-01..F-05` + replay drill) `PASS`:
   1. `reports/gates/ingest-release/2026-02-20T04-45-41-179Z.json`.
3. Release evidence batch `F` (quality + ingest + catalog + booking + payment) `PASS`:
   1. `reports/release-evidence/F/2026-02-20T04-45-41-655Z.json`.
4. Catatan validasi lokal:
   1. runtime lokal menggunakan `INGEST_SYNC_FALLBACK_ENABLED=true` dengan queue nonaktif untuk memastikan replay drill tetap dapat divalidasi saat Redis lokal tidak tersedia.

## 2.3 Snapshot Operasional Prod (2026-02-21)

1. Publish production `public web` dan `admin ops` sudah aktif:
   1. `https://balisnaptrip.com` (`200`),
   2. `https://admin.balisnaptrip.com/login` (`200`).
2. Verifikasi domain ke runtime production:
   1. `balisnaptrip.com` dan `admin.balisnaptrip.com` resolve ke `192.168.0.60`,
   2. parity hash konten domain vs direct runtime `5000/3100` = `MATCH`.
3. Runtime preview staging non-prod (`3101`/`3200`) sudah dihentikan.
4. Hardening runtime `bstadmin` production sudah diterapkan:
   1. `HOSTNAME=0.0.0.0`,
   2. `INTERNAL_CRON_BASE_URL=http://127.0.0.1:3100`,
   3. `CRON_INITIAL_DELAY_MS=30000`,
   4. log periodik menunjukkan `[Cron Runner] ... success`.
5. Scope produksi saat ini:
   1. `public web` + `admin ops` = release aktif,
   2. `content manager` = lanjut pengembangan tim terpisah (belum masuk publish prod).

## 3. Jalur Eksekusi Lokal

1. Preflight runtime env baseline (`F-00`):
   1. `pnpm gate:ingest-env-baseline`
2. Quality check data:
   1. `pnpm --filter @bst/core-api quality:phase2`
3. Booking bridge backfill (Batch D):
   1. `pnpm --filter @bst/core-api backfill:booking-bridge`
4. Booking bridge gate (Batch D):
   1. `pnpm --filter @bst/core-api gate:booking-bridge`
5. Payment-finance bridge backfill (Batch E):
   1. `pnpm --filter @bst/core-api backfill:payment-finance-bridge`
6. Payment-finance bridge gate (Batch E):
   1. `pnpm --filter @bst/core-api gate:payment-finance-bridge`
7. Ingest gates:
   1. `pnpm --filter @bst/core-api gate:ingest-processing`
   2. `pnpm --filter @bst/core-api gate:ingest-dlq-growth`
   3. `pnpm --filter @bst/core-api gate:ingest-duplicate-delivery`
   4. `pnpm --filter @bst/core-api gate:ingest-retention-policy`
8. Replay drill operasional (`T-007-04`, DLQ lifecycle + audit):
   1. `pnpm --filter @bst/core-api drill:ingest-replay`
9. Combined ingest gates:
   1. `pnpm --filter @bst/core-api gate:ingest-release`
10. Combined release evidence:
   1. `pnpm --filter @bst/core-api release:evidence`
   2. jika quality check belum in-scope batch aktif, gunakan:
      1. `RUN_EVIDENCE_QUALITY_CHECK=false pnpm --filter @bst/core-api release:evidence`
   3. jika batch C membutuhkan gate catalog bridge pada release evidence, gunakan:
      1. `RUN_EVIDENCE_CATALOG_GATE=true pnpm --filter @bst/core-api release:evidence`
   4. jika batch D membutuhkan gate booking bridge pada release evidence, gunakan:
      1. `RUN_EVIDENCE_BOOKING_GATE=true pnpm --filter @bst/core-api release:evidence`
   5. jika batch E membutuhkan gate payment-finance pada release evidence, gunakan:
      1. `RUN_EVIDENCE_PAYMENT_GATE=true pnpm --filter @bst/core-api release:evidence`
   6. jika perlu include replay drill (`T-007-04`) pada stage ingest gates:
      1. `RUN_EVIDENCE_INGEST_REPLAY_DRILL=true pnpm --filter @bst/core-api release:evidence`
   7. jika perlu include gate duplicate delivery (`F-04`) pada stage ingest gates:
      1. `RUN_EVIDENCE_INGEST_DUPLICATE_GATE=true pnpm --filter @bst/core-api release:evidence`
   8. jika perlu include gate retention policy (`F-05`) pada stage ingest gates:
      1. `RUN_EVIDENCE_INGEST_RETENTION_GATE=true pnpm --filter @bst/core-api release:evidence`
   9. jika batch masih pre-catalog bridge dan denominator katalog belum tersedia, quality bisa dijalankan dengan:
      1. `QUALITY_ALLOW_EMPTY_CATALOG_DENOMINATOR=true pnpm --filter @bst/core-api quality:phase2`
11. Release candidate UI gates (gabungan EP-013 + EP-010, opsional T-009-05):
   1. strict internal+CM:
      1. `pnpm gate:release-candidate-ui`
   2. include public web continuity:
      1. `RC_UI_GATES_RUN_PUBLIC_WEB_CONTINUITY=true PUBLIC_WEB_BASE_URL=http://192.168.0.60:5000 pnpm gate:release-candidate-ui`
   3. contoh parsial (hanya EP-013):
      1. `RC_UI_GATES_RUN_CATALOG_EDITOR_SMOKE=false RC_UI_GATES_RUN_CATALOG_PUBLISH_GATE=false pnpm gate:release-candidate-ui`

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
6. Catalog bridge gate (Batch C):
   1. `.github/workflows/catalog-bridge-gate.yml`
7. Booking bridge backfill (Batch D):
   1. `.github/workflows/booking-bridge-backfill.yml`
8. Booking bridge gate (Batch D):
   1. `.github/workflows/booking-bridge-gate.yml`
9. Payment-finance bridge backfill (Batch E):
   1. `.github/workflows/payment-finance-bridge-backfill.yml`
10. Payment-finance bridge gate (Batch E):
   1. `.github/workflows/payment-finance-bridge-gate.yml`
11. Release candidate UI gates (EP-013 + EP-010 + optional continuity):
   1. `.github/workflows/release-candidate-ui-gates.yml`

## 5. Lokasi Evidence

1. `reports/gates/ingest-env-baseline/*`
2. `reports/gates/ingest-processing/*`
3. `reports/gates/ingest-dlq-growth/*`
4. `reports/gates/ingest-release/*`
5. `reports/gates/ingest-duplicate-delivery/*`
6. `reports/gates/ingest-retention-policy/*`
7. `reports/gates/ingest-replay-drill/*`
8. `reports/recon/quality/{batch}/*`
9. `reports/release-evidence/{batch}/*`
10. `reports/recon/{batch}/*-booking-bridge-backfill.*`
11. `reports/gates/booking-bridge/*`
12. `reports/recon/{batch}/*-payment-finance-bridge-backfill.*`
13. `reports/gates/payment-finance/*`
14. `reports/gates/release-candidate-ui/*`
15. `reports/gates/ui-release-checklist/*`
16. `reports/smoke/catalog-editor/*`
17. `reports/gates/catalog-publish-workflow/*`
18. `reports/gates/public-web-continuity/*` (jika continuity diaktifkan)

## 6. Checklist Go/No-Go Singkat

1. `gate:ingest-processing` = `PASS`.
2. `gate:ingest-dlq-growth` = `PASS`.
3. `gate:ingest-duplicate-delivery` = `PASS`.
4. `gate:ingest-retention-policy` = `PASS`.
5. `drill:ingest-replay` = `PASS` (untuk validasi operasional replay/DLQ lifecycle).
6. `quality:phase2` = `PASS`.
7. Tidak ada failed stage di `release:evidence`.
8. Untuk scope Batch D: `gate:booking-bridge` = `PASS`.
9. Untuk scope Batch E: `gate:payment-finance-bridge` = `PASS`.

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
