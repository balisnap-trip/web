# Runbook Staging and Core API Deploy

## Tujuan

Menjadikan `/home/bonk/stagging-bst` sebagai target staging deploy dan `/home/bonk/backend/core-api-prod` sebagai target deploy production core API, tanpa menjadikan server sebagai source of truth coding.

## Prasyarat

1. SSH key sudah terpasang untuk `bonk@192.168.0.60`.
2. Jalankan perintah dari root repo: `d:\Balisnaptrip\WEB`.
3. `ssh` dan `tar` tersedia di mesin lokal.
4. Tooling deploy menggunakan Node script (`.mjs`) agar tidak bergantung `.ps1`.
5. Pastikan tidak ada command yang masih mengarah ke alias path staging lama.

## Perintah Staging

Deploy snapshot code ke release baru (tanpa install/build):

```powershell
pnpm deploy:stagging-bst
```

Deploy sekaligus install dependency + build workspace:

```powershell
pnpm deploy:stagging-bst:build
```

Lihat current release dan daftar release:

```powershell
pnpm deploy:stagging-bst:list
```

Rollback manual:

Pakai release ID dari output `deploy:stagging-bst:list`, lalu jalankan:

```powershell
pnpm deploy:stagging-bst:rollback -- --release-id <RELEASE_ID>
```

## Perintah Production Core API

Deploy snapshot code ke release baru:

```powershell
pnpm deploy:core-api-prod
```

Deploy sekaligus install dependency + build:

```powershell
pnpm deploy:core-api-prod:build
```

Catatan: command ini menjalankan build terfokus `@bst/core-api` pada release target (`core-api-prod`), bukan full workspace.

Lihat current release dan daftar release:

```powershell
pnpm deploy:core-api-prod:list
```

Rollback manual:

```powershell
pnpm deploy:core-api-prod:rollback -- --release-id <RELEASE_ID>
```

Kontrol runtime core API:

```powershell
pnpm deploy:core-api-prod:status
pnpm deploy:core-api-prod:start
pnpm deploy:core-api-prod:stop
pnpm deploy:core-api-prod:restart
pnpm deploy:core-api-prod:redis:status
pnpm deploy:core-api-prod:redis:start
pnpm deploy:core-api-prod:redis:stop
pnpm deploy:core-api-prod:redis:restart
```

## Perintah Production Content Manager

Deploy snapshot code ke release baru:

```powershell
pnpm deploy:content-manager-prod
```

Deploy sekaligus install dependency + build scoped app:

```powershell
pnpm deploy:content-manager-prod:build
```

Lihat current release dan daftar release:

```powershell
pnpm deploy:content-manager-prod:list
```

Rollback manual:

```powershell
pnpm deploy:content-manager-prod:rollback -- --release-id <RELEASE_ID>
```

## Catatan Operasional

1. Struktur staging: `/home/bonk/stagging-bst/releases`, `/home/bonk/stagging-bst/shared`, `/home/bonk/stagging-bst/logs`.
2. Struktur core-api prod: `/home/bonk/backend/core-api-prod/releases`, `/home/bonk/backend/core-api-prod/shared`, `/home/bonk/backend/core-api-prod/logs`.
3. Script deploy menjaga hanya 5 release terbaru (default).
4. Metadata release tersimpan di `.release-meta` pada masing-masing folder release.
5. `.env` core API production berada di `/home/bonk/backend/core-api-prod/shared/.env`.
6. `.env` core API staging berada di `/home/bonk/stagging-bst/shared/.env`.

## Update Operasional Terbaru (2026-02-20)

1. Bootstrap env core-api production sudah dilakukan di `/home/bonk/backend/core-api-prod/shared/.env`.
2. Key yang sudah dipastikan terisi:
   1. `REDIS_URL`
   2. `INGEST_REDIS_URL`
   3. `CORE_API_ADMIN_TOKEN`
   4. `INGEST_SERVICE_TOKEN`
   5. `INGEST_SERVICE_SECRET`
3. `INGEST_SERVICE_TOKEN` dan `INGEST_SERVICE_SECRET` sudah disinkronkan ke:
   1. `/home/bonk/balisnaptrip/.env`
   2. `/home/bonk/stagging-bst/current/balisnap/.env`
4. Backup env yang dibuat sebelum update:
   1. `/home/bonk/backend/core-api-prod/shared/.env.bak.20260220T024430`
   2. `/home/bonk/balisnaptrip/.env.bak.20260220T025124`
   3. `/home/bonk/stagging-bst/current/balisnap/.env.bak.20260220T025148`
5. Nilai secret tidak ditulis ke dokumen. Source of truth tetap di file `.env` runtime dan secret workflow.
6. Deploy staging terbaru aktif pada release `/home/bonk/stagging-bst/releases/20260220T051228Z`.
7. Runtime `core-api` staging berjalan di `PORT=4100` dengan health check `http://127.0.0.1:4100/health` (`status=ok`).
8. `OPS_DB_URL` staging diset ke database operasional `balisnaptrip_ops` (host dan credential sama, beda nama database).
9. Evidence Batch G pada release staging:
   1. `reports/recon/D/2026-02-20T05-18-50-512Z-booking-bridge-backfill.json`
   2. `reports/gates/ops-read-parity/2026-02-20T06-00-10-640Z.json`
   3. `reports/gates/ops-assignment-sync/2026-02-20T06-00-11-725Z.json`
10. Aktivasi ingest queue staging dilakukan dengan backup env:
   1. `/home/bonk/stagging-bst/shared/.env.bak.20260220T054919Z`
   2. `/home/bonk/stagging-bst/shared/.env.bak.20260220T062706Z`
11. Isolasi queue staging/prod:
   1. `INGEST_QUEUE_NAME=ingest-bookings-events-staging` pada staging.
   2. worker staging terverifikasi: `Queue worker started: ingest-bookings-events-staging`.
12. Evidence Batch F staging (precheck window `10` menit):
   1. gate `F-01/F-02` (`PASS`): `reports/gates/ingest-processing/2026-02-20T05-49-54-811Z.json`
   2. gate `F-03` (`PASS`): `reports/gates/ingest-dlq-growth/2026-02-20T05-59-54-978Z.json`
   3. gate `F-04` (`PASS`): `reports/gates/ingest-duplicate-delivery/2026-02-20T05-59-55-104Z.json`
   4. gate `F-05` (`PASS`): `reports/gates/ingest-retention-policy/2026-02-20T05-59-55-223Z.json`
   5. gate release ingest (`PASS`): `reports/gates/ingest-release/2026-02-20T05-59-55-233Z.json`
13. Keputusan operasional Batch F:
   1. pada `2026-02-20`, window final `F-03` selama `120` menit di-skip.
   2. status Batch F staging dianggap `PASS` sesuai keputusan owner, berbasis evidence precheck butir `12`.
14. Smoke ingest contract staging (`PASS`):
   1. `SMOKE_TEST_RESULT=PASS`
   2. `EVENT_ID=e587aeac-48c3-4f79-9491-019a0a578573`
15. Emitter config staging (`balisnap`) sudah dibaseline dengan backup:
   1. backup: `/home/bonk/stagging-bst/current/balisnap/.env.bak.20260220T060520Z`
   2. key aktif: `CORE_API_BASE_URL`, `CORE_API_INGEST_PATH`, `INGEST_SERVICE_TOKEN`, `INGEST_SERVICE_SECRET`
16. Smoke emitter EP-009 (`PASS`, force-send tanpa mengubah flag default):
   1. `EMITTER_SMOKE_RESULT=PASS`
   2. `EMITTER_SMOKE_EVENT_ID=996198ed-4ddf-4c15-a6ca-f580356e40b2`
17. Smoke emitter EP-009 (`PASS`, simulasi flag aktif):
   1. `WEB_EMIT_BOOKING_EVENT_ENABLED=true` (runtime env command-local)
   2. `EMITTER_SMOKE_EVENT_ID=34f79313-5ebb-43f3-9410-a48cc8390e48`
18. Drill EP-009 orders flow (`PASS`, command-local):
   1. command: `pnpm --filter next-app-template drill:core-ingest-orders-flow`
   2. mode `SEND` (`T-009-01/T-009-02/T-009-03`): `EMITTER_ORDERS_DRILL_CREATED_EVENT_ID=ec615160-caf0-4a2f-adce-a68bfd999031` (`status=DONE`, `queued=true`, `idempotentReplay=false`), `EMITTER_ORDERS_DRILL_UPDATED_EVENT_ID=8c562bde-e97d-48f8-bf08-a1f33eb74220` (`status=DONE`, `queued=true`, `idempotentReplay=false`), `EMITTER_ORDERS_DRILL_IDEMPOTENT_REPLAY=true`
   3. mode `SKIP_CHECK` (`T-009-04`): `EMITTER_ORDERS_DRILL_MODE=SKIP_CHECK`
19. Canary emitter staging diaktifkan (`EP-009`):
   1. backup env baru: `/home/bonk/stagging-bst/current/balisnap/.env.bak.20260220T064012Z`
   2. flag aktif: `WEB_EMIT_BOOKING_EVENT_ENABLED="true"`
20. Drill lanjutan pasca-canary (`PASS`):
   1. `EMITTER_ORDERS_DRILL_CREATED_EVENT_ID=bac8a519-f3ee-4abe-aa4e-babf5bf6a103` (`status=DONE`, `queued=true`)
   2. `EMITTER_ORDERS_DRILL_UPDATED_EVENT_ID=e359b9a5-62bf-4d18-b1f4-1f4136dabac1` (`status=DONE`, `queued=true`)
21. Monitoring metrik ingest setelah canary:
   1. endpoint: `GET /v1/ingest/metrics/queue`
   2. snapshot `2026-02-20T06:41:28Z`: `queueName=ingest-bookings-events-staging`, `waiting=0`, `active=0`, `failed=0`, `deadLetter.SUCCEEDED=1`.
22. Continuity gate public web (`T-009-05`) sudah otomatis (`PASS`):
   1. command: `PUBLIC_WEB_BASE_URL=http://192.168.0.60:5000 pnpm gate:public-web-continuity`
   2. evidence: `reports/gates/public-web-continuity/2026-02-20T06-41-40-958Z.json`
   3. workflow manual: `.github/workflows/public-web-continuity-gate.yml`
23. Baseline konfigurasi EP-010 publish workflow (siapkan saat staging smoke):
   1. core-api: `CATALOG_PUBLISH_PERSISTENCE_ENABLED`, `CATALOG_PUBLISH_JOBS_PATH`, `CATALOG_PUBLISH_DIR`, `CATALOG_PUBLISH_SECRET`, `CATALOG_PUBLISH_SIGNATURE_REQUIRED`.
   2. content-manager: `CORE_API_BASE_URL`, `CORE_API_ADMIN_TOKEN`, `CORE_API_ADMIN_ROLE`, `CORE_API_PUBLISH_SECRET`.
24. Gate otomatis publish workflow EP-010 tersedia:
   1. command lokal/runtime: `pnpm --filter @bst/core-api gate:catalog-publish-workflow`
   2. evidence path: `reports/gates/catalog-publish-workflow/{timestamp}.json` + `.md`
   3. workflow manual CI: `.github/workflows/catalog-publish-workflow-gate.yml`
25. Runner evidence fase-2 mendukung stage EP-010 publish gate via toggle:
   1. env: `RUN_EVIDENCE_CATALOG_PUBLISH_GATE=true`
   2. optional signature strict check: `GATE_CATALOG_PUBLISH_EXPECT_SIGNATURE_REQUIRED=true`

## Verifikasi Lanjutan Wajib

1. Restart atau reload process yang membaca `.env` (core-api dan balisnap target):
   1. `pnpm deploy:core-api-prod:redis:start`.
   2. `pnpm deploy:core-api-prod:redis:status`.
   3. `pnpm deploy:core-api-prod:restart`.
2. Verifikasi status runtime core-api:
   1. `pnpm deploy:core-api-prod:status`.
3. Jalankan gate preflight runtime env:
   1. `pnpm gate:ingest-env-baseline`.
4. Jalankan smoke test endpoint ingest dan admin token auth setelah reload.
5. Canary EP-009 staging saat ini aktif (`WEB_EMIT_BOOKING_EVENT_ENABLED=true`); rollback cepat jika diperlukan: set `false` lalu reload proses emitter.
