# Deployment Topology Strategy (Staging and Production)

Tanggal baseline: 2026-02-20  
Update terakhir: 2026-02-20  
Status: aktif

## 1. Scope

1. Menetapkan topologi folder deploy staging dan production di home server.
2. Menjadi acuan operasional deploy/rollback untuk phase transisi.
3. Menghindari drift antara strategi dokumen dan path runtime server.
4. Menjadi referensi untuk runbook `doc/runbook-stagging-core-api-deploy-2026-02-20.md`.

## 2. Topologi Folder Runtime

| Area | Path | Fungsi |
|---|---|---|
| Staging integration | `/home/bonk/stagging-bst` | rehearsal deploy, validasi release gate, rollback drill |
| Production public web (existing) | `/home/bonk/balisnaptrip` | public booking web aktif |
| Production admin ops (existing) | `/home/bonk/bstadmin-admin` | operasional booking/admin aktif |
| Production core API | `/home/bonk/backend/core-api-prod` | target runtime `apps/core-api` production |
| Production content manager (reserved) | `/home/bonk/backend/content-manager-prod` | disiapkan saat EP-010 siap release |

## 3. Aturan Path

1. Path staging resmi hanya `/home/bonk/stagging-bst`.
2. `/home/bonk/masterbst` tidak dipakai lagi sebagai alias/symlink.
3. Struktur release per target wajib:
   1. `{base}/releases/{release_id}`
   2. `{base}/current` (symlink aktif)
   3. `{base}/shared`
   4. `{base}/logs`

## 4. Standar Deploy Command

1. Staging:
   1. `pnpm deploy:stagging-bst`
   2. `pnpm deploy:stagging-bst:build`
   3. `pnpm deploy:stagging-bst:list`
   4. `pnpm deploy:stagging-bst:rollback -- --release-id <RELEASE_ID>`
2. Core API production:
   1. `pnpm deploy:core-api-prod`
   2. `pnpm deploy:core-api-prod:build` (install all workspace deps + build scoped `@bst/core-api`)
   3. `pnpm deploy:core-api-prod:list`
   4. `pnpm deploy:core-api-prod:rollback -- --release-id <RELEASE_ID>`
   5. `pnpm deploy:core-api-prod:status`
   6. `pnpm deploy:core-api-prod:start`
   7. `pnpm deploy:core-api-prod:stop`
   8. `pnpm deploy:core-api-prod:restart`
   9. `pnpm deploy:core-api-prod:redis:status`
   10. `pnpm deploy:core-api-prod:redis:start`
   11. `pnpm deploy:core-api-prod:redis:stop`
   12. `pnpm deploy:core-api-prod:redis:restart`

## 5. Kebijakan `.env`

1. Reuse env dari production existing diperbolehkan jika key kompatibel.
2. File env core API production berada di:
   1. `/home/bonk/backend/core-api-prod/shared/.env`
3. Key wajib tidak kosong sebelum go-live core API:
   1. `OPS_DB_URL`
   2. `CHANNEL_DB_URL`
   3. `REDIS_URL`
   4. `INGEST_REDIS_URL`
   5. `CORE_API_ADMIN_TOKEN`
   6. `INGEST_SERVICE_TOKEN`
   7. `INGEST_SERVICE_SECRET`
   8. `INGEST_WEBHOOK_ENABLED`
   9. `INGEST_REPLAY_ENABLED`

## 6. Cutover Guardrail

1. Perubahan jalur read/write ops tetap mengikuti canary flags:
   1. `OPS_READ_NEW_MODEL_*`
   2. `OPS_WRITE_CORE_*`
2. Rollback cepat tetap via:
   1. disable read/write flag,
   2. rollback symlink release.
3. Semua deploy batch wajib menyertakan log deploy + rollback drill sebagai evidence gate.

## 7. Progress Update (2026-02-20)

1. Lock path runtime sudah diterapkan:
   1. staging: `/home/bonk/stagging-bst`,
   2. core-api prod: `/home/bonk/backend/core-api-prod`,
   3. `masterbst` tidak dipakai sebagai symlink compatibility.
2. Bootstrap env core-api production sudah dilakukan pada `/home/bonk/backend/core-api-prod/shared/.env`.
3. Key `INGEST_SERVICE_TOKEN` dan `INGEST_SERVICE_SECRET` sudah disinkronkan ke:
   1. `/home/bonk/balisnaptrip/.env`,
   2. `/home/bonk/stagging-bst/current/balisnap/.env`.
4. Backup `.env` sudah dibuat sebelum update untuk semua path yang disentuh.
5. Nilai secret tidak dicatat di dokumen; validasi dilakukan melalui runtime file dan jalur secret operasional.

## 8. Pending Verification

1. Reload process aplikasi yang memakai env baru.
2. Jalankan smoke test ingest handshake setelah reload.
3. Lampirkan evidence hasil smoke test ke release gate batch F.
