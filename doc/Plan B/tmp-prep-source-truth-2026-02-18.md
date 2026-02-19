# Temporary Source of Truth - 2026-02-18

Dokumen ini merangkum temuan teknis dari inspeksi kode `balisnap` dan `bstadmin` pada tanggal 2026-02-18.

## 1. Struktur Repo Saat Ini

1. Root `d:\Balisnaptrip\WEB` bukan git repo tunggal.
2. `balisnap` dan `bstadmin` adalah dua repo terpisah, keduanya branch `main`.
3. Folder `doc` berada di root bersama dan sebelumnya kosong.

## 2. Temuan Utama Proyek `balisnap`

1. Stack: Next.js App Router (project template basis), Prisma, NextAuth, PayPal.
2. Memiliki flow booking dan payment sendiri:
   1. `POST /api/orders/store` membuat booking.
   2. `POST /api/orders` membuat PayPal order.
   3. `POST /api/orders/[orderId]/capture` capture payment dan update status.
3. Memiliki API katalog publik:
   1. `GET /api/tours`
   2. `GET /api/tours/featured`
   3. `GET /api/tours/[slug]`
4. Model schema sudah mengandung layer V2 (`TourProduct`, `TourVariant`, `Departure`, `VariantRatePlan`) dengan compatibility ke legacy package.
5. UI halaman publik masih dominan client-side fetch pada beberapa halaman inti.

## 3. Temuan Utama Proyek `bstadmin`

1. Stack: Next.js 15, Prisma, domain operasional booking/email/finance cukup luas.
2. Sumber booking utama saat ini: email ingestion pipeline.
3. Flow operasional berjalan dalam 2 tahap:
   1. Sync email ke `email_inbox`.
   2. Parse email booking -> create/update/cancel booking.
4. Sudah ada enum source channel di booking (`DIRECT`, `GYG`, `VIATOR`, `TRIPDOTCOM`, `BOKUN`, `MANUAL`).
5. Sudah ada modul `Tours & Packages` untuk indexing/master data operasional.
6. Terdapat util sync database dua arah, tetapi model ini rawan drift jika dipakai lintas domain yang berbeda fungsi.

## 4. Konsistensi Flow Bisnis vs Flow Kode

1. Pernyataan bisnis valid: `admin operasional` dan `content manager` sebaiknya dipisah domain.
2. Kode saat ini mendukung paradigma channel/source-based ingestion di operasional.
3. Karena operasional sudah channel-driven, channel baru (`balisnap`, `content manager`) lebih tepat masuk via adapter API/webhook, bukan via coupling DB langsung.

## 5. Risiko jika Salah Arah

1. Jika tiap frontend punya backend sendiri tanpa core contract:
   1. aturan booking/status mudah duplikat
   2. audit dan rekonsiliasi makin sulit
   3. potensi reconstruction tinggi saat trafik naik
2. Jika dual-DB sinkronisasi dua arah dijadikan mekanisme utama:
   1. conflict resolution kompleks
   2. risiko data drift antar domain tinggi
   3. biaya observability dan debugging meningkat

## 6. Implikasi Arsitektur yang Paling Selaras

1. Pertahankan domain separation:
   1. ops domain untuk proses booking operasional
   2. content/channel domain untuk publikasi konten channel
2. Gunakan ingestion berbasis event/API untuk pertukaran data lintas domain.
3. Lock API contract + idempotency dari awal.
