# Balisnaptrip Planning Docs (2026-02-18)

Dokumen ini adalah pintu masuk untuk rencana lintas proyek `balisnap` + `bstadmin` + calon `content manager`.

## Urutan Baca

1. `doc/prep-decision-lock-2026-02-18.md`
2. `doc/tmp-prep-source-truth-2026-02-18.md`
3. `doc/cross-project-master-plan-2026-02-18.md`

## Tujuan Paket Dokumen Ini

1. Mengunci keputusan arsitektur supaya tidak berubah-ubah saat implementasi.
2. Menyelaraskan rencana dengan kondisi kode nyata di kedua proyek saat ini.
3. Memberi rencana implementasi yang siap dieksekusi tanpa major reconstruction di fase scale-up.

## Catatan Penting

1. Fokus utama fase awal adalah kestabilan operasional saat volume booking naik.
2. `admin operasional` dan `content manager` diperlakukan sebagai domain terpisah.
3. Integrasi antar domain dilakukan lewat kontrak API/event, bukan coupling database langsung.
