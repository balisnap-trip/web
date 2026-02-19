# Travel/Tour Proper Rebuild Plan

Tanggal: 2026-02-18  
Project: `d:\Balisnaptrip\WEB\balisnap`  
Mode kerja: 3 tahap sesuai arahan

## Tujuan Utama

Mentransformasi sistem saat ini dari model paket sederhana menjadi model travel/tour proper yang mendukung:

1. Produk tour terstruktur.
2. Variant per produk.
3. Departure/schedule + kuota.
4. Pricing plan yang fleksibel.
5. Booking dengan snapshot data transaksi.
6. Alur code yang konsisten dengan schema baru.

## Tahap 1 - Perencanaan

Output Tahap 1:

1. Definisi domain model final.
2. Strategi migrasi database dari schema lama ke schema baru.
3. Strategi cutover code (tanpa downtime panjang).
4. Daftar acceptance criteria yang terukur.

### 1) Domain model target (high-level)

Entity inti yang akan dipakai:

1. `TourProduct` sebagai master produk.
2. `TourVariant` untuk varian produk (durasi, service type, kapasitas, dll).
3. `Departure` untuk jadwal keberangkatan + inventory seat.
4. `VariantRatePlan` untuk pricing per traveler type/season.
5. `VariantItinerary` untuk itinerary terstruktur per hari.
6. `BookingItem` untuk item transaksi (bukan hanya 1 paket flat).
7. `BookingTraveler` untuk data peserta.
8. Snapshot pada booking agar histori transaksi tidak berubah walau master data berubah.

### 2) Strategi migrasi

Pendekatan:

1. Additive migration terlebih dahulu, tidak langsung drop tabel lama.
2. Backfill data dari `TourPackage` ke `TourProduct` + `TourVariant`.
3. Booking lama tetap readable.
4. Code dipindah ke schema v2 bertahap.
5. Setelah stabil, lakukan cleanup schema legacy.

Prinsip penting:

1. Hindari breaking change langsung pada production path.
2. Semua perubahan kritis wajib ada rollback path.
3. Perubahan status/payment harus idempotent.

### 3) Strategi cutover code

Urutan:

1. Build service layer baru berbasis schema v2.
2. Route API lama tetap hidup sementara.
3. Route API baru aktif berdampingan.
4. UI booking dialihkan ke API baru.
5. Setelah stabil, nonaktifkan route/schema lama.

### 4) Acceptance criteria

Sistem dianggap selesai bila:

1. Bisa membuat product + variant + departure + rate plan.
2. Booking memilih departure dan menghitung harga server-side.
3. Payment capture memvalidasi nominal terhadap booking item.
4. Snapshot booking tersimpan lengkap.
5. Itinerary multiday terbaca benar dari variant itinerary.
6. Build dan flow booking utama lulus smoke test.

## Tahap 2 - Rekonstruksi Database

Scope:

1. Update `prisma/schema.prisma` ke model v2.
2. Tambah enum status/type agar status konsisten.
3. Tambah indeks untuk query utama.
4. Buat migration SQL terstruktur:
   - create new tables
   - backfill legacy data
   - add constraints
5. Verifikasi dengan `prisma generate`, `prisma migrate`, dan validasi query dasar.

Catatan:

1. Legacy tables tetap dipertahankan sementara untuk transisi.
2. `TourPackage` akan diposisikan sebagai legacy compatibility layer.

## Tahap 3 - Rekonstruksi Code

Scope:

1. Refactor service booking ke schema v2.
2. Refactor API:
   - catalog (product/variant/departure)
   - booking
   - pricing
   - payment capture
3. Refactor UI flow:
   - pilih variant
   - pilih departure
   - hitung harga berdasarkan rate plan
   - checkout dengan booking item
4. Tambah validasi request/response yang ketat.
5. Tambah test untuk flow kritis booking-payment.

## Risiko Utama dan Mitigasi

1. Risiko mismatch data legacy vs v2.
Mitigasi: backfill script + laporan rekonsiliasi.

2. Risiko downtime saat migrasi.
Mitigasi: additive migration dan cutover bertahap.

3. Risiko regresi alur booking.
Mitigasi: dual-run endpoint + smoke test end-to-end.

## Keputusan Implementasi

Rencana ini valid dan cukup sebagai baseline eksekusi.  
Langkah berikutnya: mulai Tahap 2 dengan implementasi schema v2 + migration.
