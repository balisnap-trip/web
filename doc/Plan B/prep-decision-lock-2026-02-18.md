# Decision Lock - 2026-02-18

Dokumen ini mengunci keputusan strategis dan teknis hasil diskusi.

## A. Arah Strategi Utama

1. Strategi delivery: `Bertahap Dual-Run`.
2. Scope CMS awal: `Catalog-First`.
3. KPI fase 1: `Kecepatan Operasional`.

## B. Posisi Bisnis dan Domain

1. `balisnap` diperlakukan sebagai channel booking (setara OTA dalam flow bisnis).
2. Konten faktual produk/tour dapat berasal dari channel eksternal (OTA) dan tidak dipaksakan menjadi authoring tunggal internal.
3. `admin operasional` tidak disatukan fungsinya dengan `content manager`.
4. Perlakuan operasional terhadap `content manager` mengikuti pola channel/OTA: menerima data booking/event melalui contract resmi.

## C. Keputusan Arsitektur Inti

1. Fondasi backend: `NestJS` dengan pola `Hybrid Modulith -> Micro`.
2. Kontrak API utama: `REST + OpenAPI`.
3. Model data: `Dual DB Tetap`.
4. Integrasi channel non-email ke operasional: `Webhook + Queue`.
5. Repository strategy: `Monorepo Foundation`.
6. Tooling monorepo: `pnpm + Turborepo`.

## D. Keputusan Integrasi Data

1. Tidak menggunakan sinkronisasi DB dua arah sebagai mekanisme utama antar domain.
2. Tidak melakukan cross-DB join dalam business flow runtime.
3. Pertukaran data antar domain wajib melalui API/event contract yang tervalidasi.
4. Semua event booking wajib idempotent (idempotency key).

## E. Keputusan Evolusi Sistem

1. Tidak memilih rebuild total sekali cutover (big-bang).
2. Sistem existing tetap berjalan selama transisi.
3. Perubahan dilakukan per module dengan flag dan observability.
4. Ketika tim IT membesar, arsitektur tetap relevan tanpa penggantian framework/backend besar.
