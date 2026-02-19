# Phase-2 Migration Blueprint (Execution Runbook)

Tanggal baseline: 2026-02-18  
Update lock: 2026-02-19  
Mode delivery: `dual-run`, additive migration, no big-bang cutover

## 1. Scope Phase-2

1. Menyiapkan data bridge lintas `balisnap` dan `bstadmin`.
2. Mengaktifkan jalur ingestion contract-based (`webhook + queue`) tanpa mematikan flow lama.
3. Memindahkan read-path operasional ke model baru secara bertahap.
4. Menjaga SLA booking public tetap stabil selama migration.

## 2. Non-Goal Phase-2

1. Tidak melakukan drop tabel legacy.
2. Tidak memaksa merge enum status lama menjadi satu enum global.
3. Tidak mematikan endpoint legacy sebelum adapter lulus acceptance.

## 3. Prinsip Eksekusi Wajib

1. Semua migrasi schema bersifat additive.
2. Semua script harus idempotent dan aman di-rerun.
3. Setiap batch harus memiliki precheck, postcheck, dan rollback plan.
4. Reconciliation report wajib lolos sebelum lanjut batch berikutnya.
5. Cutover dilakukan per modul, bukan sekaligus seluruh sistem.
6. DDL target wajib mengikuti `doc/prep-core-schema-target-v1-2026-02-19.md`.
7. Topologi deploy staging/prod wajib mengikuti `doc/prep-deployment-topology-strategy-2026-02-20.md`.

## 4. Pre-Migration Readiness Checklist

| Item | Kriteria Lulus | Owner |
|---|---|---|
| Snapshot DB | backup terbaru `balisnap` + `bstadmin` tersedia dan tervalidasi restore | DBA |
| Env vars | semua secret ingest/signature/cron siap di staging dan prod | DevOps |
| Feature flags | semua flag default `OFF` di production | Backend |
| Observability | dashboard error rate, queue lag, DLQ count, payment mismatch siap | Backend + Ops |
| Runbook | prosedur rollback per batch disetujui | Tech lead |
| Deployment topology | path staging/prod terkunci sesuai dokumen strategi deploy | DevOps |
| Freeze window | jadwal deploy dan freeze disetujui owner bisnis | PM/Owner |

## 5. Feature Flags dan Default

| Flag | Default | Fungsi |
|---|---|---|
| `INGEST_WEBHOOK_ENABLED` | `false` | buka endpoint ingest v1 |
| `INGEST_QUEUE_ENABLED` | `false` | aktifkan worker queue ingest |
| `INGEST_REPLAY_ENABLED` | `false` | izinkan replay failed event |
| `OPS_READ_NEW_MODEL_ENABLED` | `false` | admin baca dari model baru |
| `OPS_WRITE_CORE_ENABLED` | `false` | admin write via core-api |
| `WEB_EMIT_BOOKING_EVENT_ENABLED` | `false` | `balisnap` emit event ke core |
| `EMAIL_PIPELINE_CORE_ENABLED` | `false` | parser email push ke core ingest |

Template eksekusi SQL:

1. lokasi: `doc/sql-templates/phase2/`.
2. urutan script mengikuti `doc/sql-templates/phase2/README.md`.
3. hasil lulus batch wajib mengacu `doc/prep-release-gate-checklist-phase2-2026-02-19.md`.
4. lock penempatan phase-2:
   1. seluruh DDL batch A-B dijalankan di koneksi `ops_db`,
   2. `channel_db` tidak menerima DDL baru pada batch A-B.

## 6. Batch Execution Plan

### 6.1 Ringkasan Batch

| Batch | Fokus | Output Utama | Durasi Target |
|---|---|---|---|
| A | Schema foundation | tabel core tambahan + index + constraints | 2-3 hari |
| B | Seed reference | channel registry + status dictionary | 1 hari |
| C | Catalog bridge backfill | product/variant mapping + unmapped queue | 3-4 hari |
| D | Booking bridge backfill | booking_core + contact + item snapshot | 4-5 hari |
| E | Payment/finance bridge | payment_event + settlement linkage | 3-4 hari |
| F | Ingestion activation | webhook + queue + replay + DLQ | 4-5 hari |
| G | Ops read cutover | admin read dari model baru | 3-4 hari |
| H | Controlled write cutover | write core-api + legacy fallback | 4-6 hari |

### 6.2 Batch A: Schema Foundation

Tujuan:
1. Menambah tabel target tanpa mengubah flow existing.

Perubahan schema minimum:
1. `channel_registry`
2. `channel_external_refs`
3. `catalog_product`
4. `catalog_variant`
5. `catalog_variant_rate`
6. `booking_core`
7. `booking_contact`
8. `booking_party`
9. `booking_item_snapshot`
10. `payment_event`
11. `ops_booking_state`
12. `ops_assignment`
13. `ops_finance_bridge`
14. `ingest_event_log`
15. `ingest_dead_letter`
16. `unmapped_queue`
17. `migration_run_log`

Script:
1. `000_precheck_readiness.sql`
2. `001_create_core_bridge_tables.sql`
3. `002_add_indexes_and_unique_constraints.sql`
4. `003_seed_required_enums_and_checks.sql`
5. `090_postcheck_reconciliation.sql`

Precheck:
1. jalankan `000_precheck_readiness.sql`.
2. isi input capacity (`disk_total_bytes`, `disk_used_bytes`) di script precheck.
3. pastikan semua check preflight berstatus `PASS` sebelum lanjut ke `001`.

Postcheck:
1. semua tabel dan index terbentuk.
2. semua constraint utama terbentuk (`unique` dedup + FK utama).
3. tidak ada query existing yang error.

Rollback:
1. disable app flags.
2. drop hanya tabel baru jika batch gagal total.
3. restore snapshot bila ada side effect tidak terkontrol.

### 6.3 Batch B: Reference Seed

Tujuan:
1. Menanam data referensi yang dipakai semua modul.

Data seed:
1. channel: `DIRECT`, `GYG`, `VIATOR`, `BOKUN`, `TRIPDOTCOM`, `MANUAL`.
2. mapping status: `UNMAPPED`, `MAPPED`, `REVIEW_REQUIRED`.
3. ingest status: `RECEIVED`, `PROCESSING`, `DONE`, `FAILED`.
4. replay status: `READY`, `REPLAYING`, `SUCCEEDED`, `FAILED`.
5. dead-letter status: `OPEN`, `READY`, `REPLAYING`, `SUCCEEDED`, `FAILED`, `RESOLVED`, `CLOSED`.
6. unmapped queue status: `OPEN`, `IN_REVIEW`, `RESOLVED`, `CLOSED`.
7. package ref type: `LEGACY_PACKAGE`, `CATALOG_PRODUCT`, `CATALOG_VARIANT`.

Script:
1. `010_seed_channel_registry.sql`
2. `011_seed_status_dictionary.sql`
3. `012_seed_package_ref_type_dictionary.sql`

Postcheck:
1. rerun script tidak menambah duplikasi.
2. dictionary status lengkap untuk mapping/ingest/replay/dead-letter/unmapped.

### 6.4 Batch C: Catalog Bridge Backfill

Tujuan:
1. Membuat canonical bridge katalog dari source aktif.

Urutan eksekusi:
1. tarik `TourProduct`, `TourVariant`, `VariantRatePlan`, `VariantItinerary` dari `balisnap`.
2. tarik `Tour`, `TourPackage`, `TourImage`, `TourItinerary` dari `bstadmin`.
3. auto-match berdasarkan `legacy_package_id`, `slug`, dan nama ter-normalisasi.
4. gagal match dimasukkan ke `unmapped_queue`.

Aturan merge:
1. atribut publish publik prioritas `balisnap`.
2. atribut ops-only disimpan sebagai metadata tambahan.
3. tidak ada overwrite destructive pada source.

Postcheck wajib:
1. orphan product/variant bridge ratio `<= 0.5%`.
2. `unmapped_queue` berisi reason code (`NO_MATCH`, `MULTI_MATCH`, `INVALID_SOURCE`).
3. semua variant memiliki minimal 1 rate aktif atau fallback price.
4. `unmapped_queue` ratio akhir batch `<= 5%`.

Rollback:
1. truncate hanya tabel bridge catalog batch ini.
2. simpan dump `unmapped_queue` untuk investigasi.

### 6.5 Batch D: Booking Bridge Backfill

Tujuan:
1. Menyatukan identitas booking lintas channel.

Urutan eksekusi:
1. backfill `booking_core` dari `bstadmin.Booking`.
2. backfill booking direct dari `balisnap.Booking` dengan channel `DIRECT`.
3. backfill `booking_contact`, `booking_party`, `booking_item_snapshot`.
4. buat relasi external refs (`booking_ref`, `bookingRef`) di `channel_external_refs`.
5. jalankan dedup berdasarkan `channel + external_booking_ref`.
6. isi mandatory discriminator `package_ref_type`.

Aturan penting:
1. placeholder contact dari parser tidak boleh overwrite contact valid.
2. jika direct booking ada di dua source dengan ref sama, pilih record yang punya payment proof paling kuat.
3. status fulfillment tetap dari engine `bstadmin`.

Postcheck wajib:
1. duplicate booking identity = 0.
2. null pada field critical (`channel_code`, `external_booking_ref`) = 0.
3. mismatch jumlah pax antara booking-level dan item-level `<= 1%`.
4. `package_ref_type` null = 0.

Rollback:
1. disable bridge readers.
2. truncate tabel booking bridge phase-2.

### 6.6 Batch E: Payment and Finance Bridge

Tujuan:
1. Menyatukan payment events dan settlement finance untuk status konsisten.

Urutan eksekusi:
1. backfill `payment_event` dari `balisnap.Payment`.
2. normalisasi payment status ke `customer_payment_status`.
3. sinkronkan `bstadmin.Booking.isPaid/paidAt` ke bridge untuk booking non-direct.
4. link `BookingFinance` dan `BookingFinanceItem` ke `booking_core`.
5. jalankan settlement recompute untuk validasi status `DONE`.

Aturan penting:
1. payment direct web authoritative untuk channel direct.
2. finance settlement authoritative untuk ops payout.
3. no downgrade status dari `PAID` menjadi `PENDING` tanpa reversal event.

Postcheck wajib:
1. orphan `payment_event` = 0.
2. booking `ops=DONE` tapi `payment!=PAID` `<= 0.3%` dan wajib exception list.
3. total payment direct cocok dengan sample audit PayPal capture (akurasi 100% pada sampel).

Rollback:
1. pause settlement sync bridge.
2. restore status snapshot batch E.

### 6.7 Batch F: Ingestion Pipeline Activation

Tujuan:
1. Menjalankan jalur event-driven berdampingan dengan pipeline lama.

Lock teknis queue:
1. broker: `Redis + BullMQ` (managed Redis di staging/prod).
2. retry policy: maksimal 5 attempt (`30s`, `2m`, `10m`, `30m`, `2h`).
3. non-retryable error (`VALIDATION_ERROR`, `UNAUTHORIZED_SIGNATURE`, `SCHEMA_MISMATCH`) langsung ke DLQ.
4. ordering scope: per `channel_code + external_booking_ref` (single in-flight per key).
5. retention:
   1. success jobs: 14 hari,
   2. failed jobs: 30 hari,
   3. DLQ: 30 hari.
6. poison-message policy:
   1. jika melebihi max attempt atau error non-retryable, tandai `poison_message=true`,
   2. hanya bisa diproses ulang via replay endpoint ter-audit.

Langkah aktivasi:
1. deploy endpoint `POST /v1/ingest/bookings/events` dengan flag `INGEST_WEBHOOK_ENABLED=false`.
2. smoke test signed request di staging.
3. enable `INGEST_WEBHOOK_ENABLED=true` pada staging.
4. jalankan queue worker dengan `INGEST_QUEUE_ENABLED=true`.
5. aktifkan replay endpoint dan DLQ monitor.
6. aktifkan emit event dari `balisnap` bertahap.
7. aktifkan adapter email parser ke core ingestion untuk subset channel dulu.
8. aktifkan job retention terjadwal (`091_retention_cleanup.sql`) harian.

Uji wajib:
1. duplicate delivery test (same idempotency key).
2. out-of-order event test (`UPDATED` sebelum `CREATED`).
3. burst traffic test minimal 10x rata-rata peak.
4. replay failed event test.

Postcheck:
1. success rate event `>= 99.5%` (rolling 1 jam).
2. DLQ growth `<= 20 event/jam` selama 2 jam setelah peak.
3. median processing latency `<= 3 detik`, p95 `<= 15 detik`.
4. retention cleanup berjalan sesuai SLA:
   1. nonce replay window `10 menit`,
   2. idempotency retention `35 hari`,
   3. DLQ retention `30 hari`.

Rollback:
1. matikan `INGEST_QUEUE_ENABLED`.
2. matikan `INGEST_WEBHOOK_ENABLED`.
3. event yang gagal disimpan untuk replay setelah fix.

### 6.8 Batch G: Ops Read Cutover

Tujuan:
1. Memindahkan pembacaan data admin ke model baru tanpa ubah write path dulu.

Langkah:
1. aktifkan `OPS_READ_NEW_MODEL_ENABLED` untuk internal tester.
2. validasi halaman utama booking, detail booking, assignment, finance summary.
3. bandingkan hasil read model baru vs legacy via shadow query.
4. rollout bertahap ke user ops penuh.

Postcheck:
1. tidak ada kenaikan 5xx signifikan.
2. metrik waktu muat halaman tetap dalam batas.
3. keluhan user ops kritis = 0.

Rollback:
1. set `OPS_READ_NEW_MODEL_ENABLED=false`.
2. fallback read seluruhnya ke legacy.

### 6.9 Batch H: Controlled Write Cutover

Tujuan:
1. Memindahkan write path utama ke core-api dengan fallback aman.

Langkah:
1. enable `OPS_WRITE_CORE_ENABLED` hanya untuk modul low-risk.
2. jalankan dual-write sementara dengan reconciliation report per jam.
3. jika mismatch terkendali, perluas ke modul assignment dan update booking.
4. untuk web, enable `WEB_EMIT_BOOKING_EVENT_ENABLED` 100% setelah stabil.

Postcheck:
1. mismatch write dual-run `<= 0.1%` per jam.
2. tidak ada kehilangan booking event.
3. rollback write path tervalidasi.

Rollback:
1. disable `OPS_WRITE_CORE_ENABLED`.
2. kembali ke legacy write.
3. replay event yang tertunda.

### 6.10 Conflict Playbook (Dual-Write Operational)

| Modul | Writer Prioritas | Aturan Konflik | Tindakan |
|---|---|---|---|
| Booking header (`booking_core`) | `core-api` | nilai beda pada field kritis (`tour_date`, `total_price`, `channel_code`) | set `REVIEW_REQUIRED`, freeze update booking sampai resolved |
| Assignment (`ops_assignment`) | `core-api` | update beda driver/partner pada window 5 menit | pilih event terbaru dari core-api, legacy dicatat sebagai audit only |
| Ops state (`ops_booking_state`) | `core-api` | drift status terhadap hasil recompute | force recompute + audit log override |
| Finance bridge (`ops_finance_bridge`) | `bstadmin` sampai modul cutover aktif | mismatch `validated_at`/`is_locked` | gunakan nilai `bstadmin`, buat ticket reconciliation |
| Payment (`payment_event`) | `balisnap` untuk channel DIRECT | event berurutan salah | simpan event, reorder berdasarkan `event_time_normalized` lalu replay |

SLA resolusi konflik:

1. konflik severity tinggi: <= 30 menit.
2. konflik severity menengah: <= 4 jam.
3. backlog conflict open > 24 jam: no-go untuk rollout batch berikutnya.

## 7. Reconciliation Gate per Batch

Query wajib:
1. row count parity per entitas utama.
2. duplicate external refs.
3. orphan foreign keys.
4. status drift `ops_fulfillment_status` vs settlement finance.
5. payment linkage consistency.

Format artefak:
1. `reports/recon/{batch}/{timestamp}.json`
2. ringkasan human-readable `reports/recon/{batch}/{timestamp}.md`

## 8. SLO Guardrails Selama Migration

| Metrik | Batas Stop |
|---|---|
| Public booking success rate | turun > 2% dari baseline 7 hari |
| API 5xx (core path) | > 1.5% selama 15 menit |
| Duplicate booking created | > 0 critical |
| Queue DLQ growth | > 100 event/jam tanpa penurunan |
| Payment mismatch | > 0.5% sampel harian |

## 8.1 UI/UX Guardrails Selama Migration

| Area | Guardrail |
|---|---|
| `admin-ops` | baseline layout/interaction dipertahankan; hanya konsistensi komponen yang diperbaiki |
| `content-manager` | wajib reuse basis UI framework/modul dari admin panel |
| `web public` | tetap memakai UI/UX asli; tidak ada redesign total |
| Release gate UI | setiap rilis wajib cek visual regression untuk halaman utama booking/admin |

## 9. Hard Stop Conditions

1. Duplicate canonical booking terdeteksi.
2. Event loss atau idempotency failure.
3. Drift payment/finance melebihi batas.
4. Ops dashboard tidak stabil setelah cutover.
5. Regressi UX mayor pada alur booking public.

## 10. Go/No-Go Meeting Checklist

1. Semua postcheck batch lulus.
2. Semua artefak reconciliation tersedia.
3. Rollback step diuji pada staging.
4. Owner bisnis menyetujui window release batch berikutnya.

## 11. Exit Criteria Phase-2

1. Model bridge aktif stabil di produksi tanpa downtime major.
2. Jalur ingestion webhook + queue aktif dan terukur.
3. Admin dapat monitor failed event, replay, dan unmapped queue secara mandiri.
4. Read path ops berjalan di model baru dengan fallback tervalidasi.
5. Write cutover inti berjalan terkendali dengan bukti reconciliation.
