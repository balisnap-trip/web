# Balisnaptrip Web (balisnap) - Laporan Insight (Bug & Refactor)

Tanggal pembaruan: 2026-02-18  
Lokasi proyek: `d:\Balisnaptrip\WEB\balisnap`  
Scope: dokumen ini sengaja fokus pada potensi bug dan kebutuhan refactor. Topik kebocoran secret tidak dibahas.

## Ringkasan Teknis

- Next.js 14 App Router + React 18 + TypeScript.
- Data layer: Prisma + PostgreSQL (`prisma/schema.prisma`).
- Auth: NextAuth (`lib/auth.ts`).
- Payment: PayPal (`app/api/orders/*`, `lib/utils/paymentServices/payment-services.ts`).
- API utama berada di `app/api/*`.

## Potensi Bug Kritis

### 1) Query Prisma tidak valid pada booking detail by id

Masalah:
- `findUnique` dipakai dengan filter relasi `User.email`, padahal `findUnique` seharusnya hanya untuk selector unique.

Rujukan:
- `app/api/booking/[id]/route.ts`

Dampak:
- Runtime error atau query tidak berjalan sesuai niat.

Arah perbaikan:
- Ganti ke `findFirst` dengan filter relasi, atau ambil by `booking_id` lalu cek ownership user.

### 2) Endpoint user-data tidak memiliki guard auth eksplisit

Masalah:
- Endpoint memakai `(session?.user as any).email` tanpa return `401` bila session kosong.

Rujukan:
- `app/api/bookings/route.ts`
- `app/api/booking/[id]/route.ts`

Dampak:
- Risiko query longgar dan akses data yang tidak semestinya.

Arah perbaikan:
- Guard awal: `if (!session?.user?.email) return 401`.
- Validasi ownership sebelum mengembalikan booking.

### 3) Integritas nominal pembayaran bergantung input client

Masalah:
- Create order memakai `cart[0].amount` dari client.
- Capture menyimpan `amount` dari `params.booking.total_price` (payload client), bukan nilai terverifikasi dari PayPal/DB.

Rujukan:
- `lib/utils/paymentServices/payment-services.ts`
- `app/api/orders/route.ts`
- `app/api/orders/[orderId]/capture/route.ts`

Dampak:
- Underpayment bisa lolos dan status booking berpotensi menjadi `paid`.

Arah perbaikan:
- Harga dihitung server-side dari DB.
- Capture harus verifikasi amount/currency/status dari payload PayPal.

### 4) Capture route rapuh terhadap respons PayPal

Masalah:
- Tidak cek `captureResponse.ok` sebelum parse body.
- Mengakses properti nested (`payment_source`, `purchase_units[0].payments`) tanpa guard.
- `orderId` diekstrak dari split path manual (`pathname.split('/')`), bukan route params.

Rujukan:
- `app/api/orders/[orderId]/capture/route.ts`

Dampak:
- Mudah crash saat respons tidak sesuai bentuk yang diasumsikan.

Arah perbaikan:
- Gunakan signature route params resmi.
- Tambahkan schema validation terhadap response PayPal.

### 5) Error handling menelan failure dan menghasilkan respons tidak konsisten

Masalah:
- `catch {}` kosong di util booking.
- Beberapa util `catch` hanya `console.log` lalu return `undefined`.
- `throw new Error('...', error)` dipakai di route (argumen kedua diabaikan oleh constructor `Error`).

Rujukan:
- `lib/utils/booking/createBooking.ts`
- `app/api/orders/store/route.ts`

Dampak:
- Error sulit dideteksi, caller bisa lanjut dengan data `undefined`, debugging mahal.

Arah perbaikan:
- Pakai error contract konsisten (`{ code, message, details }`).
- Route selalu return `NextResponse.json(..., status)`.

### 6) Logika cek hasil query kurang tepat

Masalah:
- `findMany` di-check dengan `if (!bookings)`; kondisi ini tidak pernah true untuk array kosong.

Rujukan:
- `app/api/bookings/route.ts`

Dampak:
- Cabang 404 dead code, behavior API membingungkan.

Arah perbaikan:
- Gunakan `if (bookings.length === 0)` sesuai behavior yang diinginkan.

### 7) Potensi hasil tanggal akhir booking tidak valid

Masalah:
- `duration_days` null/0 dipaksa jadi 0 lalu `addDays(..., -1)`.

Rujukan:
- `app/api/booking/[id]/route.ts`

Dampak:
- `endDate` dapat mundur satu hari dari `booking_date`.

Arah perbaikan:
- Minimal clamp: `const days = Math.max(1, durationDays ?? 1)`.

### 8) Endpoint review tidak memvalidasi input

Masalah:
- `rating`, `review`, `booking_id` langsung ditulis ke DB tanpa validasi tipe/range/ownership.

Rujukan:
- `app/api/review/route.ts`

Dampak:
- Data kualitas rendah dan potensi abuse.

Arah perbaikan:
- Tambahkan schema validation (mis. `rating` 1..5, `booking_id` number, panjang `review`).

## Refactor Prioritas

### Fase 1 (Cepat, risiko rendah)

1. Standarkan Prisma client ke singleton `lib/db.ts`.
2. Hapus `prisma.$disconnect()` per request pada route handler.
3. Tambahkan helper response error yang seragam untuk semua endpoint.
4. Tambahkan auth guard standar pada endpoint user-data.

### Fase 2 (Stabilitas API)

1. Ubah endpoint read-only dari `POST` ke `GET`:
   - `app/api/tours/featured/route.ts`
   - `app/api/tours/review/route.ts`
   - `app/api/bookings/route.ts`
   - `app/api/booking/[id]/route.ts`
2. Sesuaikan caller:
   - `components/TourPackages/fetchData.ts`
   - `components/Reviews/fetchData.ts`
   - `lib/utils/booking/fetchBooking.ts`
3. Ganti fetch server internal berbasis `NEXT_PUBLIC_BASE_URL` ke akses data langsung atau relative API bila memang perlu.

### Fase 3 (Arsitektur domain)

1. Pisahkan route layer dari business layer:
   - `app/api/*` hanya parsing request + response.
   - service layer untuk aturan booking/payment/review.
2. Tambahkan validator request/response (Zod/Yup) di boundary route.
3. Perkenalkan transaksi DB (`prisma.$transaction`) untuk flow booking + payment.

## Backlog Implementasi (Disarankan)

1. Ticket A: Perbaiki `booking/[id]` query + auth guard + perhitungan `endDate`.
2. Ticket B: Refactor seluruh `new PrismaClient()` ke `lib/db.ts`.
3. Ticket C: Rework flow PayPal create/capture agar nominal server-authoritative.
4. Ticket D: Standardisasi error handling API dan observability log.
5. Ticket E: Ubah endpoint read-only ke `GET` + update semua fetch caller.
6. Ticket F: Validasi schema untuk endpoint `orders/store` dan `review`.

## Catatan Verifikasi

- Pemeriksaan berbasis code reading + cross-check antar route/util.
- `npm run lint` belum bisa dijalankan pada lingkungan saat ini karena dependensi lint belum terpasang (`eslint` command tidak ditemukan).
