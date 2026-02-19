# Runbook MasterBST Staging Deploy

## Tujuan

Menjadikan `/home/bonk/masterbst` sebagai target staging deploy berbasis release folder + symlink `current`, tanpa menjadikan server sebagai source of truth coding.

## Prasyarat

1. SSH key sudah terpasang untuk `bonk@192.168.0.60`.
2. Jalankan perintah dari root repo: `d:\Balisnaptrip\WEB`.
3. `ssh` dan `tar` tersedia di mesin lokal.
4. Tooling deploy menggunakan Node script (`.mjs`) agar tidak bergantung `.ps1`.

## Perintah Utama

Deploy snapshot code ke release baru (tanpa install/build):

```powershell
pnpm deploy:masterbst
```

Deploy sekaligus install dependency + build workspace:

```powershell
pnpm deploy:masterbst:build
```

Lihat current release dan daftar release:

```powershell
pnpm deploy:masterbst:list
```

## Rollback Manual

Pakai release ID dari output `deploy:masterbst:list`, lalu jalankan:

```powershell
pnpm deploy:masterbst:rollback -- --release-id <RELEASE_ID>
```

## Catatan Operasional

1. Script deploy membuat struktur berikut jika belum ada: `/home/bonk/masterbst/releases`, `/home/bonk/masterbst/shared`, `/home/bonk/masterbst/logs`.
2. Script deploy akan menjaga hanya 5 release terbaru (default).
3. Metadata release tersimpan di `.release-meta` pada masing-masing folder release.
