# Plan A vs Plan B Comparison (2026-02-18)

Dokumen ini membandingkan:

1. `doc/Plan A/*`
2. `doc/Plan B/*`

Tujuan: memilih baseline yang paling aman untuk scale jangka panjang tanpa major reconstruction.

## 1) Snapshot Singkat

1. **Plan A** kuat di kedalaman teknis persiapan migrasi:
   1. ERD final
   2. API contract v1
   3. migration matrix
   4. phase-2 migration blueprint
2. **Plan B** kuat di keputusan arsitektur final:
   1. NestJS hybrid modulith->micro
   2. dual DB boundary yang tegas
   3. webhook + queue untuk ingest non-email
   4. monorepo foundation

## 2) Perbandingan Inti

| Aspek | Plan A | Plan B | Catatan |
|---|---|---|---|
| Kejelasan target arsitektur jangka panjang | Baik, ada `api-core` | Sangat baik, detail boundary + evolusi modulith->micro | Plan B lebih eksplisit untuk growth team |
| Kedalaman data model dan migrasi | Sangat kuat (ERD + matrix + batch A-F) | Sedang (arah ada, detail migrasi belum sedalam A) | Plan A unggul untuk eksekusi DB |
| Ketahanan operasional saat peak booking | Baik, tapi mekanisme ingest async tidak sedetail B | Sangat kuat (event ingest, idempotency, retry, DLQ) | Plan B unggul untuk reliability |
| Pencegahan data drift antar sistem | Cukup kuat, ada ownership/single writer | Sangat kuat, larangan sync DB dua arah + no cross-db join runtime | Plan B lebih tegas |
| Kesiapan implementasi bertahap | Kuat untuk phase migration | Kuat untuk transisi lintas app + cutover channel | Keduanya kuat di area berbeda |
| Kesesuaian dengan flow nyata saat ini (email OTA + channel lain) | Baik | Sangat baik | Plan B lebih pas untuk model channel-based ingestion |

## 3) Kelebihan/Kekurangan per Plan

## 3.1 Plan A

Kelebihan:

1. Sangat actionable untuk migration engineering.
2. Decision lock enum/compatibility detail.
3. Meminimalkan asumsi saat backfill dan rekonsiliasi.

Kekurangan:

1. Belum setegas Plan B pada arsitektur event-driven ingestion non-email.
2. Boundary dual-DB lintas domain tidak seformal Plan B.
3. Fokus berat ke data migration, belum seimbang dengan operasi event scale.

## 3.2 Plan B

Kelebihan:

1. Arsitektur future-proof lebih jelas untuk fase scale tim/performa.
2. Channel ingestion modern (`Webhook + Queue`) lebih aman saat lonjakan booking.
3. Domain separation operasional vs content manager lebih konsisten.

Kekurangan:

1. Tidak sedetail Plan A pada level field mapping dan batch migration SQL.
2. Butuh turunan dokumen teknis tambahan agar langsung siap implementasi DB.

## 4) Verdict Praktis

Jika harus memilih satu arah arsitektur jangka panjang: **Plan B menang**.

Alasan:

1. Lebih kuat untuk mencegah reconstruction saat bisnis scale.
2. Lebih tepat untuk model channel yang Anda jalankan (OTA/email sekarang, webhook/API ke depan).
3. Lebih jelas governance domain boundary saat tim IT membesar.

## 5) Rekomendasi Implementasi Nyata

Gunakan pola gabungan:

1. **Plan B** sebagai arsitektur dan operating model final.
2. **Plan A** sebagai paket eksekusi migrasi teknis (ERD, matrix, blueprint, API v1 baseline).

Formulasi final:

1. `Architecture lock = Plan B`
2. `Migration runbook = Plan A`
3. `Execution governance = Plan B decision rules`

Dengan kombinasi ini, Anda dapat:

1. menjaga kedalaman implementasi teknis,
2. sekaligus menjaga arah jangka panjang yang stabil saat traffic dan tim bertambah.
