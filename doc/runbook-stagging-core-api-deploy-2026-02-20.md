# Runbook Staging and Core API Deploy

## Tujuan

Menjadikan `/home/bonk/stagging-bst` sebagai target staging deploy dan `/home/bonk/backend/core-api-prod` sebagai target deploy production core API, tanpa menjadikan server sebagai source of truth coding.

## Prasyarat

1. SSH key sudah terpasang untuk `bonk@192.168.0.60`.
2. Jalankan perintah dari root repo: `d:\Balisnaptrip\WEB`.
3. `ssh` dan `tar` tersedia di mesin lokal.
4. Tooling deploy menggunakan Node script (`.mjs`) agar tidak bergantung `.ps1`.
5. Path `/home/bonk/masterbst` tidak dipakai lagi.

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

Lihat current release dan daftar release:

```powershell
pnpm deploy:core-api-prod:list
```

Rollback manual:

```powershell
pnpm deploy:core-api-prod:rollback -- --release-id <RELEASE_ID>
```

## Catatan Operasional

1. Struktur staging: `/home/bonk/stagging-bst/releases`, `/home/bonk/stagging-bst/shared`, `/home/bonk/stagging-bst/logs`.
2. Struktur core-api prod: `/home/bonk/backend/core-api-prod/releases`, `/home/bonk/backend/core-api-prod/shared`, `/home/bonk/backend/core-api-prod/logs`.
3. Script deploy menjaga hanya 5 release terbaru (default).
4. Metadata release tersimpan di `.release-meta` pada masing-masing folder release.
5. `.env` core API production berada di `/home/bonk/backend/core-api-prod/shared/.env`.

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

## Verifikasi Lanjutan Wajib

1. Restart atau reload process yang membaca `.env` (core-api dan balisnap target).
2. Jalankan gate preflight runtime env:
   1. `pnpm gate:ingest-env-baseline`.
3. Jalankan smoke test endpoint ingest dan admin token auth setelah reload.
4. Pastikan `WEB_EMIT_BOOKING_EVENT_ENABLED=false` sampai gate Batch F dinyatakan `PASS`.
