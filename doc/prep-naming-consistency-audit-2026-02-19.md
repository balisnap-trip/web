# Naming Consistency Audit (Cross-Project)

Tanggal audit: 2026-02-19  
Scope: `balisnap` + `bstadmin` (schema, API, function/service naming, menu/UI labels).

## 0. Decision Lock Update (Owner)

Tanggal lock keputusan owner: 2026-02-19  
Status: locked dan mengikat untuk implementasi naming.

Ringkasan jawaban owner:

1. DEC-1 = `A` (canonical `Product + Variant`).
2. DEC-2 = `B` (tetap polymorphic `package_id` sementara).
3. DEC-3 = `A` (`financeCategory` dipisah dari `productCategory`).
4. DEC-4 = `A` (identifier kode/route internal full English).
5. DEC-5 = `B` (hard cut route canonical untuk alias internal/private, tanpa deprecation window route alias internal).
6. UI/UX language policy:
   1. primary language = English.

## 1. Ringkasan Eksekutif

Konsistensi penamaan saat ini **cukup berisiko** untuk scale karena ada beberapa konsep inti yang dipakai untuk makna berbeda.

Status ringkas:

1. Kritis:
   1. domain katalog (`tour/package/product/variant`) belum punya istilah tunggal,
   2. status booking memakai 2 sistem sekaligus (legacy lowercase + enum V2 uppercase),
   3. istilah `category` dipakai lintas domain dengan arti berbeda.
2. Tinggi:
   1. gaya penamaan field antar app berbeda (`snake_case` vs `camelCase @map`),
   2. route API tidak konsisten singular/plural/action path,
   3. label menu dan terminologi UI belum seragam.
3. Menengah:
   1. duplikasi utility naming (`formatDate` dengan perilaku berbeda),
   2. campuran bahasa pada route/path internal.

## 2. Temuan Detail (dengan bukti)

## 2.1 Kritis-1: Domain katalog ambigu (`tour`, `package`, `product`, `variant`)

Bukti:

1. `balisnap` sudah punya model baru `TourProduct` dan `TourVariant`: `balisnap/prisma/schema.prisma:126`, `balisnap/prisma/schema.prisma:164`.
2. `balisnap` masih mempertahankan `TourPackage` legacy: `balisnap/prisma/schema.prisma:382`.
3. API slug detail mengembalikan field legacy `package_*` dari `product`: `balisnap/app/api/tours/[slug]/route.ts:145`, `balisnap/app/api/tours/[slug]/route.ts:150`.
4. `buildTourPackageCompat` mengisi `package_id` dari `package_id/variant_id/product_id` (makna id jadi tidak tunggal): `balisnap/lib/utils/booking/compat.ts:59`, `balisnap/lib/utils/booking/compat.ts:63`.
5. Validator booking menerima `variantId` tapi fallback ke `packageId`: `balisnap/lib/api/validators.ts:117`.

Risiko:

1. dev baru sulit membedakan mana entitas canonical vs alias compatibility,
2. risiko salah join/salah mapping saat migrasi ke `core-api`,
3. contract API berpotensi membawa field yang namanya sama tetapi semantik beda.

## 2.2 Kritis-2: Status booking ganda (legacy + V2)

Bukti:

1. `Booking` menyimpan `status` (string legacy) dan `status_v2` (enum): `balisnap/prisma/schema.prisma:444`, `balisnap/prisma/schema.prisma:445`.
2. `createBooking` menulis `status: 'waiting'` + `status_v2: 'PENDING_PAYMENT'`: `balisnap/lib/utils/booking/createBooking.ts:280`, `balisnap/lib/utils/booking/createBooking.ts:281`.
3. Setelah pembayaran, update ke `status: 'paid'` + `status_v2: 'PAID'`: `balisnap/lib/utils/booking/createBooking.ts:415`.
4. Endpoint pembayaran masih memvalidasi legacy status lowercase: `balisnap/app/api/orders/route.ts:57`, `balisnap/app/api/orders/route.ts:58`, `balisnap/app/api/orders/route.ts:59`.
5. UI customer juga membaca status lowercase (`waiting/paid/completed/cancelled`): `balisnap/app/bookings/BookingCard.tsx:23`, `balisnap/app/bookings/BookingCard.tsx:29`, `balisnap/app/bookings/BookingCard.tsx:41`.

Risiko:

1. dua sumber kebenaran status di satu entitas,
2. mapping bug saat integrasi admin-ops (`NEW/READY/...`) vs public flow (`waiting/paid/...`),
3. query/report bisa salah jika field status tidak dipilih konsisten.

## 2.3 Kritis-3: `category` overload lintas domain

Bukti:

1. Katalog public punya `TourProduct.category` (kategori produk): `balisnap/prisma/schema.prisma:133`.
2. Finance admin punya tabel `categories` untuk `TourItemCategory`: `bstadmin/prisma/schema.prisma:496`, `bstadmin/prisma/schema.prisma:515`.
3. `Partner` menyimpan **dua representasi** sekaligus:
   1. `category` string legacy,
   2. `tourItemCategoryId` relation: `bstadmin/prisma/schema.prisma:450`, `bstadmin/prisma/schema.prisma:451`.
4. API masih menerima `tourItemCategoryId` **atau** `categoryId` (alias): `bstadmin/src/app/api/service-items/route.ts:49`, `bstadmin/src/app/api/service-items/route.ts:50`, `bstadmin/src/app/api/service-items/route.ts:61`.
5. Canonical endpoint kategori finance adalah `/api/tour-item-categories`: `bstadmin/src/app/api/tour-item-categories/route.ts:9`.

Risiko:

1. kata `category` tidak menunjukkan domain mana (catalog/finance/system),
2. meningkatkan peluang bug mapping antar modul,
3. memperbesar debt compatibility kalau tidak segera dibakukan.

## 2.4 Tinggi-1: Konvensi field antar app tidak seragam

Bukti:

1. `bstadmin` memakai `camelCase` + `@map("snake_case")`, contoh `bookingRef @map("booking_ref")`: `bstadmin/prisma/schema.prisma:95`.
2. `balisnap` memakai field schema langsung `snake_case`, contoh `booking_ref`: `balisnap/prisma/schema.prisma:449`.

Risiko:

1. tipe data lintas app tidak bisa dibagikan langsung tanpa adapter,
2. raw SQL, DTO, dan contract gampang drift.

## 2.5 Tinggi-2: Route API naming belum konsisten

Bukti:

1. `booking fetch` sekarang sudah disinkronkan ke resource plural (`/api/bookings/fetch`) agar konsisten dengan `/api/bookings`: `bstadmin/src/app/api/bookings/fetch/route.ts:7`, `bstadmin/src/app/api/bookings/route.ts:10`.
2. `balisnap` memakai `/api/booking/[id]` dan `/api/bookings` sekaligus: `balisnap/app/api/booking/[id]/route.ts:11`, `balisnap/app/api/bookings/route.ts:11`.
3. Endpoint `orders/store` sebenarnya membuat booking: `balisnap/app/api/orders/store/route.ts:8`, `balisnap/app/api/orders/store/route.ts:21`.
4. Ada route review ganda dengan domain berbeda:
   1. `POST /api/review` (submit review),
   2. `GET /api/tours/review` (list review): `balisnap/app/api/review/route.ts:10`, `balisnap/app/api/tours/review/route.ts:5`.

Risiko:

1. naming route tidak mencerminkan resource domain dengan jelas,
2. API governance sulit saat OpenAPI distandardisasi.

## 2.6 Tinggi-3: Menu/UI term belum seragam

Bukti:

1. Module title `Bookings` tapi tab title `Booking`: `bstadmin/src/config/navigation.ts:33`, `bstadmin/src/config/navigation.ts:38`.
2. Module `Finances` memakai tab `Reviews` untuk `/finance/validate`: `bstadmin/src/config/navigation.ts:44`, `bstadmin/src/config/navigation.ts:49`.
3. Module `Tours & Packages` punya tab `Package` (singular): `bstadmin/src/config/navigation.ts:68`, `bstadmin/src/config/navigation.ts:74`.
4. Path internal partners sudah disinkronkan ke English route `/finance/partners`: `bstadmin/src/config/navigation.ts:62`, `bstadmin/src/app/(dashboard)/finance/partners/page.tsx:53`.
5. Status badge style/label dibuat manual di beberapa page walau helper sudah ada:
   1. helper: `bstadmin/src/lib/booking/status-label.ts:6`,
   2. manual map: `bstadmin/src/app/(dashboard)/bookings/page.tsx:63`,
   3. manual map: `bstadmin/src/app/(dashboard)/dashboard/page.tsx:419`,
   4. manual map: `bstadmin/src/app/(dashboard)/bookings/[id]/page.tsx:958`.

Risiko:

1. istilah UI tidak stabil untuk user operasional,
2. style/label status bisa beda antar screen.

## 2.7 Menengah: Utility naming duplikatif

Bukti:

1. `formatDate` di util A formatnya `en-GB` tanggal saja: `bstadmin/src/lib/date-format.ts:8`.
2. `formatDate` di util B formatnya `en-US` + time: `bstadmin/src/lib/utils.ts:8`.
3. Public app juga punya `formatDate` versi lain lagi: `balisnap/lib/utils/formatDate.ts:17`.

Risiko:

1. nama fungsi sama, output beda,
2. potensi bug display tanggal/waktu dan timezone.

## 2.8 Tinggi-4: Nama field menipu pada relasi (`tour_id` vs `package_id`)

Bukti:

1. Pada `balisnap`, `TourImage.tour_id` sebenarnya FK ke `TourPackage.package_id`: `balisnap/prisma/schema.prisma:515`, `balisnap/prisma/schema.prisma:517`.
2. Pada `bstadmin`, `TourImage.tourId @map("tour_id")` juga relasi ke `TourPackage`: `bstadmin/prisma/schema.prisma:301`, `bstadmin/prisma/schema.prisma:304`.

Risiko:

1. developer bisa salah asumsi bahwa `tour_id` menunjuk tabel `tours`,
2. saat split domain catalog di `core-api`, relasi media berpotensi salah migrasi.

## 2.9 Menengah: `category` dan `source` dipakai sebagai metadata generik sekaligus domain field

Bukti:

1. `SystemSetting.category` dipakai sebagai klasifikasi konfigurasi: `bstadmin/prisma/schema.prisma:788`.
2. `Booking.source` dan `EmailInbox.source` memakai nama field sama walau konteks objek berbeda: `bstadmin/prisma/schema.prisma:114`, `bstadmin/prisma/schema.prisma:691`.

Risiko:

1. istilah generik cenderung dipakai ulang tanpa boundary domain,
2. kontrak event/API mudah blur antara metadata teknis dan atribut bisnis.

## 3. Standard Penamaan yang Disarankan (Target Future-Proof)

## 3.1 Domain Lexicon (wajib tunggal)

Gunakan kamus istilah berikut sebagai sumber tunggal:

1. Catalog:
   1. `catalogProduct` (entitas produk/tour utama),
   2. `catalogVariant` (varian layanan),
   3. `legacyTourPackage` (khusus compatibility, bukan canonical).
2. Booking:
   1. `booking` (aggregate),
   2. `bookingItem` (baris booking),
   3. `bookingTraveler`.
3. Finance:
   1. `financeCategory` (gantikan istilah generic `category` pada domain finance),
   2. `serviceItem`,
   3. `settlement`.
4. Status:
   1. `customerPaymentStatus`,
   2. `opsFulfillmentStatus`.
5. Source:
   1. `bookingSource` untuk channel booking,
   2. `emailSource` untuk inbox parsing (boleh enum sama, nama field tetap beda).

## 3.2 Aturan Naming Teknis

1. Database column/table: `snake_case`.
2. Kode TypeScript/DTO/API payload internal: `camelCase`.
3. Prisma layer:
   1. gunakan `camelCase + @map` untuk model baru,
   2. legacy boleh bertahan selama fase compatibility, tapi harus dibungkus adapter.
4. API path:
   1. resource plural noun (`/bookings`, `/finance-categories`),
   2. action sebagai subresource (`/bookings/{id}/assign`),
   3. hindari kata kerja di root kecuali endpoint proses internal yang memang command.
5. UI labels:
   1. singular/plural konsisten,
   2. istilah bisnis tetap sama antar module/tab/page.

## 4. Keputusan Owner (Locked)

## DEC-1 (Kritis): Canonical istilah katalog

Keputusan final: `A`.

1. Canonical domain catalog adalah `Product + Variant`.
2. `Package` diposisikan sebagai legacy compatibility term.

## DEC-2 (Kritis): Strategi field `package_id` compatibility

Keputusan final: `B`.

1. `package_id` tetap polymorphic sementara (bisa mereferensikan package/variant/product sesuai adapter legacy).
2. Wajib diberi catatan eksplisit pada contract dan mapper agar tidak dianggap canonical id tunggal.
3. Wajib ada discriminator canonical:
   1. `packageRefType` (`LEGACY_PACKAGE` | `CATALOG_PRODUCT` | `CATALOG_VARIANT`),
   2. `packageRefKey` (UUID canonical bila mapping tersedia).
4. Sunset:
   1. target `LEGACY_PACKAGE` tanpa `packageRefKey` = 0 pada `2026-09-30`.

## DEC-3 (Kritis): Istilah `category` lintas domain

Keputusan final: `A`.

1. Finance domain menggunakan istilah `financeCategory`.
2. Catalog domain menggunakan istilah `productCategory`.

## DEC-4 (Tinggi): Standar bahasa identifier

Keputusan final: `A`.

1. Identifier kode/route internal wajib full English.
2. UI copy boleh bilingual bila dibutuhkan, tetapi primary language UI/UX adalah English.

## DEC-5 (Tinggi): Route alias deprecation window

Keputusan final: `B`.

1. Tidak ada deprecation window untuk alias route naming internal/private (non-versioned).
2. Route canonical menggantikan route lama secara hard cut pada release yang sama untuk internal consumer.
3. Untuk API publik/eksternal versioned, kebijakan deprecation window tetap mengikuti versioning (`v1` -> `v2`).

## 5. Rencana Perbaikan Naming Tanpa Ganggu Operasional

1. Fase 0:
   1. lock kamus istilah (hasil DEC-1..DEC-5),
   2. publish naming glossary di `doc/`.
2. Fase 1 (controlled compatibility):
   1. tambah field canonical di response,
   2. pertahankan alias field bila dibutuhkan compatibility data,
   3. route alias tidak dipertahankan (hard cut ke canonical),
   4. tambah telemetry pemakaian field legacy (bukan route legacy).
3. Fase 2 (migration code):
   1. ganti pemakaian internal ke istilah canonical,
   2. satukan helper status/formatting agar tidak duplikatif,
   3. standardisasi label menu/tab dengan primary English labels.
4. Fase 3 (breaking cleanup):
   1. hapus alias field yang usage-nya nol,
   2. cleanup kolom legacy (`category` string di partner, dll) sesuai keputusan.

## 6. Kesimpulan

Secara future-proof, yang paling penting bukan sekadar rename, tetapi **mengunci kamus istilah domain** lebih dulu.  
Tanpa lock keputusan DEC-1 sampai DEC-5, refactor naming berisiko menambah adapter baru dan mengulang ambiguity di versi berikutnya.

## 7. Runtime Sync Applied (2026-02-19)

Sinkronisasi yang sudah diterapkan ke code runtime:

1. Route fetch booking:
   1. dari `/api/booking/fetch` -> `/api/bookings/fetch`,
   2. consumer dashboard booking sudah dipindah.
2. Route alias categories:
   1. alias `/api/categories` dan `/api/categories/[id]` dihapus (hard cut),
   2. canonical finance category endpoint tetap `/api/tour-item-categories`.
3. Dashboard partners path:
   1. dari `/finance/mitra` -> `/finance/partners`,
   2. navigation dan page route sudah dipindah.
4. Transition naming `financeCategory` (DEC-3):
   1. endpoint `service-items` dan `partners` sudah menerima canonical input `financeCategoryId`,
   2. alias input legacy `tourItemCategoryId` dan `categoryId` tetap diterima,
   3. response saat ini membawa field canonical (`financeCategoryId`, `financeCategoryRef`) dan legacy (`tourItemCategoryId`, `tourItemCategoryRef`) bersamaan.

Dampak logic dan flow:

1. Tidak mengubah business logic booking/finance parser.
2. Mengubah surface route (HTTP path + URL halaman) sesuai naming lock.
3. Consumer internal proyek sudah disinkronkan pada release yang sama.
