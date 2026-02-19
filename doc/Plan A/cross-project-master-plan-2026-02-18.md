# Cross-Project Master Plan (balisnap + bstadmin)

Tanggal: 2026-02-18  
Status: final draft for execution  
Referensi audit: `doc/tmp-cross-project-audit-2026-02-18.md`

## 1) Konteks Nyata yang Harus Dijaga

1. Catalog `tour/package/variant` berbeda per channel (GYG, Viator, website utama) karena aturan marketplace.
2. `bstadmin` saat ini kuat di operasi, keuangan, dan ingestion booking OTA.
3. `balisnap` saat ini kuat di public website + direct booking flow.
4. Model database kedua proyek belum sejajar (v2 di `balisnap`, legacy package-centric di `bstadmin`).

Kesimpulan: tidak tepat memakai satu tabel "universal content" untuk semua channel. Harus ada pemisahan antara model internal fulfillment dan mapping per channel.

## 2) Target Arsitektur yang Benar

Gunakan 3 lapis:

1. `public web` (`balisnap`)  
   Fungsi: SEO, landing page, direct booking UX.

2. `admin/ops` (`bstadmin`)  
   Fungsi: operasi harian, finance, ingestion OTA, dan manajemen mapping catalog.

3. `api-core` baru (NestJS direkomendasikan)  
   Fungsi: source of business truth lintas aplikasi (catalog internal, mapping channel, booking contract, publish state).

Prinsip: UI tidak boleh lagi jadi tempat logika domain inti. Semua logika inti dipusatkan di `api-core`.

## 3) Model Domain yang Disarankan

### 3.1 Canonical internal (untuk fulfillment)
1. `product` (master experience internal).
2. `variant` (opsional private/group, durasi, kapasitas).
3. `departure` (tanggal/jam, quota, cutoff).
4. `rate_plan` (harga per traveler type/season).

### 3.2 Channel projection (untuk per-lapak)
1. `channel` (`WEB`, `GYG`, `VIATOR`, dll).
2. `channel_product` (ID listing per channel).
3. `channel_variant` (opsi yang tampil di channel).
4. `channel_price_rule` (aturan harga/sync per channel).
5. `channel_sync_log` (riwayat sinkronisasi + error).

### 3.3 Mapping operasional
1. `channel_variant -> variant` wajib ada mapping.
2. Booking OTA selalu masuk via external reference, lalu di-resolve ke `variant` internal.
3. Jika belum termapping: status `UNMAPPED` + antrean tindakan admin.

## 4) Rencana 3 Tahap (Eksekusi Nyata)

## Tahap 1 - Perencanaan Detail (5-7 hari)

Output wajib:
1. Data contract final (ERD + naming + enum).
2. Matriks migrasi field:
   - `balisnap` v2 -> canonical.
   - `bstadmin` legacy -> canonical/channel tables.
3. API contract v1:
   - `catalog`
   - `channel mapping`
   - `booking resolve`
   - `publish/read model`
4. Cutover plan per endpoint (siapa tulis, siapa baca, kapan dipindah).

Gate lanjut:
1. Semua tim setuju ID strategy dan ownership data.
2. Tidak ada field ambigu untuk finance dan booking resolution.

## Tahap 2 - Rekonstruksi Database (10-14 hari)

Langkah:
1. Buat schema baru additive (tanpa drop legacy di awal).
2. Tambahkan tabel channel mapping + sync log.
3. Buat script backfill:
   - dari `balisnap.TourProduct/TourVariant` ke canonical.
   - dari `bstadmin.TourPackage` ke projection/mapping awal.
4. Buat reconciliation report:
   - row count
   - orphan mapping
   - unmapped OTA references
5. Freeze write ke tabel legacy tertentu saat cutover window.

Gate lanjut:
1. Backfill sukses dan idempotent.
2. Reconciliation bersih (atau daftar exception jelas dan kecil).

## Tahap 3 - Rekonstruksi Code (14-21 hari)

Langkah:
1. Bangun `api-core` modules:
   - `catalog-module`
   - `channel-mapping-module`
   - `booking-resolution-module`
   - `publish-module`
2. Refactor `balisnap`:
   - read catalog dari `api-core` (bukan query DB langsung).
   - booking create tetap validasi harga server-side terhadap canonical item.
3. Refactor `bstadmin`:
   - tambah UI mapping channel <-> variant internal.
   - finance tetap jalan, tapi referensi package diarahkan bertahap ke variant mapping.
4. Aktifkan compatibility adapter sementara untuk endpoint lama.
5. Tutup adapter legacy setelah 2 siklus rilis stabil.

Gate selesai:
1. Public tour tampil normal.
2. Booking OTA bisa resolve ke variant internal.
3. Finance pattern tidak rusak.
4. Tidak ada dependency wajib ke `TourPackage` legacy.

## 5) Standar Teknis Wajib

1. API versioning (`/v1`) sejak awal.
2. Idempotency key untuk ingestion booking OTA.
3. Audit log untuk mapping changes (siapa, kapan, sebelum/sesudah).
4. Contract test antar aplikasi (public/admin terhadap `api-core`).
5. Observability minimum: structured logs + error tracking + slow query alert.

## 6) Risiko Utama dan Mitigasi

1. Risiko: mapping OTA tidak lengkap saat go-live.  
Mitigasi: mode `UNMAPPED` + queue + dashboard prioritas.

2. Risiko: finance masih terikat `packageId`.  
Mitigasi: tambah bridge table (`packageId -> variantId`) selama transisi.

3. Risiko: dual-write inconsistency.  
Mitigasi: temporary single-writer rule (write utama hanya lewat `api-core`).

4. Risiko: migrasi terlalu besar sekali jalan.  
Mitigasi: rollout bertahap per modul (catalog -> mapping -> booking resolution -> legacy cleanup).

## 7) Keputusan Praktis Saat Ini

1. Content manager paling tepat ditempatkan di ekosistem `admin.balisnaptrip.com` (`bstadmin`) sebagai UI.
2. Namun engine domain/content tidak disimpan permanen di UI app, melainkan dipindah ke `api-core`.
3. `balisnap` tetap fokus public web dan konsumsi data publish-ready.

## 8) Next Action yang Paling Tepat

1. Finalisasi dokumen `Tahap 1` menjadi spesifikasi API + ERD final.
2. Siapkan repository baru `api-core` (NestJS) + package shared types.
3. Implement migration set pertama (channel tables + mapping bridge) sebelum menyentuh UI lagi.
