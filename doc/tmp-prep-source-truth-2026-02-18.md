# Source of Truth (Detailed, Code-Verified)

Tanggal verifikasi: 2026-02-18  
Scope: `balisnap` + `bstadmin`  
Metode: baca source code langsung (schema, route handler, service layer), bukan asumsi dokumen lama.

## 1. Baseline Teknis Repositori

1. Workspace `d:\Balisnaptrip\WEB` bukan monorepo git tunggal.
2. `balisnap` dan `bstadmin` adalah repo terpisah.
3. Versi framework saat ini:
   1. `balisnap`: Next.js `14.2.4`, Prisma Client `^5.22.0` (`balisnap/package.json`).
   2. `bstadmin`: Next.js `^15.1.11`, Prisma Client `^6.2.0` (`bstadmin/package.json`).

Implikasi:

1. Perbedaan versi framework/ORM harus diperlakukan sebagai boundary transisi.
2. Unified architecture tidak boleh mengasumsikan runtime identik sejak hari pertama.

## 2. Source Truth `balisnap` (Public + Direct Booking)

Referensi kode utama:

1. `balisnap/prisma/schema.prisma`
2. `balisnap/app/api/orders/store/route.ts`
3. `balisnap/app/api/orders/route.ts`
4. `balisnap/app/api/orders/[orderId]/capture/route.ts`
5. `balisnap/app/api/tours/route.ts`
6. `balisnap/app/api/tours/featured/route.ts`
7. `balisnap/app/api/tours/[slug]/route.ts`
8. `balisnap/lib/utils/booking/createBooking.ts`

### 2.1 Model data yang aktif

1. Ada model v2 travel:
   1. `TourProduct`
   2. `TourVariant`
   3. `Departure`
   4. `VariantRatePlan`
   5. `BookingItem`
2. Ada legacy compatibility model:
   1. `TourPackage`
3. Booking and payment:
   1. `Booking.status` (string legacy)
   2. `Booking.status_v2` (`BookingStatusV2`)
   3. `Payment.payment_status` (string)
   4. `Payment.payment_status_v2` (`PaymentStatusV2`)

### 2.2 Alur booking direct web saat ini

1. Customer submit order -> `POST /api/orders/store`.
2. Server validasi payload (`validateCreateBookingInput`).
3. `createBooking`:
   1. validasi variant/departure/capacity,
   2. hitung harga server-side dari rate plan + fallback,
   3. create `Booking` + `BookingItem` snapshot.
4. Pembayaran:
   1. `POST /api/orders` buat PayPal order,
   2. `POST /api/orders/[orderId]/capture` capture + verifikasi amount/currency/ownership,
   3. create payment record + update status booking.

### 2.3 Kekuatan dan keterbatasan

Kekuatan:

1. Payment safety checks sudah lebih kuat (amount/currency/custom_id validation).
2. Model produk v2 sudah tersedia.

Keterbatasan:

1. Tidak ada native pipeline publish event ke `bstadmin`.
2. Masih ada layer compat legacy sehingga domain boundaries belum final.

## 3. Source Truth `bstadmin` (Ops Engine)

Referensi kode utama:

1. `bstadmin/prisma/schema.prisma`
2. `bstadmin/src/lib/email/email-sync.ts`
3. `bstadmin/src/lib/email/booking-fetch.ts`
4. `bstadmin/src/app/api/email/sync/route.ts`
5. `bstadmin/src/app/api/bookings/fetch/route.ts`
6. `bstadmin/src/app/api/cron/email/route.ts`
7. `bstadmin/src/lib/booking/status.ts`
8. `bstadmin/src/app/api/settings/sync-database/route.ts`

### 3.1 Model data operasional yang aktif

1. Booking operational lifecycle:
   1. `NEW`
   2. `READY`
   3. `ATTENTION`
   4. `COMPLETED`
   5. `DONE`
   6. `UPDATED`
   7. `CANCELLED`
   8. `NO_SHOW`
2. Booking source yang aktif:
   1. `DIRECT`
   2. `GYG`
   3. `VIATOR`
   4. `TRIPDOTCOM`
   5. `BOKUN`
   6. `MANUAL`
3. Email ingestion entities:
   1. `EmailInbox`
   2. `BookingEmail` relation
   3. `EmailJob` queue table

### 3.2 Alur operasional saat ini

1. `email-sync`:
   1. tarik email IMAP dari akun GYG + OTA,
   2. klasifikasi `isBookingEmail`,
   3. simpan raw email di `email_inbox`.
2. `booking-fetch`:
   1. parse email booking,
   2. create/update/cancel booking,
   3. link email <-> booking via `BookingEmail`.
3. `syncBookingStatus`:
   1. hitung status berdasarkan assignment + finance + tanggal tour,
   2. update status jika berubah.

### 3.3 Kekuatan dan keterbatasan

Kekuatan:

1. Engine operasional harian matang (ingestion, assignment, finance linkage).
2. Rules status jelas dan ter-encapsulate di service.

Keterbatasan:

1. Source non-email belum punya webhook ingestion yang formal.
2. Ada util sync DB dua arah yang rawan drift jika dijadikan integrasi domain utama.

## 4. Konflik Teknis yang Harus Diresolusikan

### 4.1 Status model conflict

1. `balisnap` punya payment-centric statuses.
2. `bstadmin` punya fulfillment-centric statuses.

Resolusi source-truth:

1. Pisahkan status domain:
   1. `customer_payment_status`
   2. `ops_fulfillment_status`
2. Mapping dibuat di service layer.

### 4.2 Source/channel identity conflict

1. Enum source operasional saat ini belum memisahkan semua jenis channel yang akan datang.

Resolusi source-truth:

1. Pertahankan enum existing untuk non-breaking.
2. Tambahkan layer channel identity terpisah di model baru.

### 4.3 Integrasi data conflict

1. Ada kebutuhan integrasi lintas app.
2. Ada util sync DB dua arah yang tidak aman sebagai domain contract.

Resolusi source-truth:

1. Integrasi utama harus via API/event contracts.
2. DB sync dua arah hanya sebagai util maintenance terbatas, bukan jalur bisnis utama.

## 5. Constraint Non-Negotiable (Dari Kode)

1. Payment verification server-side di `balisnap` tidak boleh diturunkan.
2. Ops status automation di `bstadmin` tidak boleh hilang saat transisi.
3. Source compatibility lama harus tetap berjalan selama dual-run.
4. Endpoint alias naming boleh di-hard-cut jika seluruh consumer internal sudah dipindah dalam release yang sama (mengacu `ADR-014`).

## 6. Kesimpulan Source-Truth untuk Rencana

1. Arah arsitektur jangka panjang: Plan B (core API + domain boundary + event ingestion).
2. Kedalaman eksekusi migrasi: Plan A (matrix + batch blueprint + reconciliation).
3. Langkah praktis: gabungkan keduanya, dengan source code sebagai hakim final.

## 7. Runtime Naming Sync (2026-02-19)

1. Route API booking fetch disinkronkan:
   1. dari `/api/booking/fetch` ke `/api/bookings/fetch`.
2. Route alias categories dihapus:
   1. `/api/categories`,
   2. `/api/categories/[id]`.
3. Route dashboard partners disinkronkan:
   1. dari `/finance/mitra` ke `/finance/partners`.
4. Dampak flow:
   1. business logic booking/finance tidak berubah,
   2. surface route berubah sesuai naming lock terbaru.
