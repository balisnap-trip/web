# Migration Matrix (Field-Level, Code-Verified)

Tanggal baseline: 2026-02-18  
Scope: `balisnap` + `bstadmin` -> target core domain model  
Status: aktif, wajib dipakai untuk migration scripts

## 1. Tujuan Dokumen

1. Menetapkan mapping field-level lintas dua source aktif.
2. Menentukan aturan transform data saat backfill dan dual-run.
3. Menetapkan ownership write-path per domain agar tidak terjadi drift.

## 2. Referensi Source Code

1. `balisnap/prisma/schema.prisma`
2. `balisnap/lib/utils/booking/createBooking.ts`
3. `balisnap/app/api/orders/store/route.ts`
4. `balisnap/app/api/orders/route.ts`
5. `balisnap/app/api/orders/[orderId]/capture/route.ts`
6. `bstadmin/prisma/schema.prisma`
7. `bstadmin/src/lib/email/email-sync.ts`
8. `bstadmin/src/lib/email/booking-fetch.ts`
9. `bstadmin/src/lib/booking/status.ts`
10. `bstadmin/src/lib/finance/sync-booking-settlement.ts`
11. `doc/prep-core-schema-target-v1-2026-02-19.md`

## 3. Aturan Global Mapping

1. `ops_fulfillment_status` authoritative dari rules `bstadmin` (`computeBookingStatus`).
2. `customer_payment_status` authoritative dari payment event direct (`balisnap`) dan settlement finance (`bstadmin`) untuk channel non-direct.
3. `booking source` tetap non-breaking mengikuti enum `bstadmin` pada fase transisi.
4. `channel identity` dipisah sebagai field/registry baru (`channel_code`) agar tidak terkunci pada enum lama.
5. Saat konflik lintas source, pilih event paling baru dengan timestamp valid.
6. Jika timestamp sama, gunakan source owner sesuai domain matrix.
7. Jika tetap konflik, tandai `REVIEW_REQUIRED` dan masukkan ke queue manual.
8. Matrix ini hanya boleh memakai entitas canonical yang ada di `doc/prep-core-schema-target-v1-2026-02-19.md`.
9. Entitas `catalog_media`, `catalog_itinerary`, `finance_item`, `booking_email_link` diperlakukan sebagai deferred compatibility (bukan tabel canonical phase-2).

## 4. Target Canonical Entitas

| Entitas Target | Fungsi | Owner Write Path |
|---|---|---|
| `channel_registry` | daftar channel bisnis | core-api admin |
| `channel_external_refs` | penyimpanan external refs lintas source | core-api ingest |
| `catalog_product` | produk canonical | content-manager via core-api |
| `catalog_variant` | varian canonical | content-manager via core-api |
| `catalog_variant_rate` | harga per traveler/currency | content-manager via core-api |
| `booking_core` | identitas booking lintas channel | core-api ingest/ops |
| `booking_contact` | kontak tamu ter-normalisasi | core-api ingest/ops |
| `booking_party` | komposisi traveler | core-api ingest/ops |
| `booking_item_snapshot` | snapshot item booking lintas source | core-api ingest/ops |
| `ops_booking_state` | state fulfillment operasional per booking | admin-ops via core-api |
| `payment_event` | event payment terverifikasi | core-api payment bridge |
| `ops_assignment` | penugasan driver/partner | admin-ops via core-api |
| `ops_finance_bridge` | relasi booking ke finance | admin-ops via core-api |
| `ingest_event_log` | jejak event + idempotency + replay | core-api ingest |
| `ingest_dead_letter` | penyimpanan event gagal/poison message | core-api ingest |
| `unmapped_queue` | antrian resolusi mapping manual | core-api + admin-ops |
| `migration_run_log` | jejak eksekusi migration/reconciliation | backend platform |

## 5. Matrix Catalog Domain

### 5.1 Product Mapping

| Target Field | `balisnap` Source | `bstadmin` Source | Transform Rule | Catatan |
|---|---|---|---|---|
| `catalog_product.product_key` | `TourProduct.product_id` | `Tour.id` (ops legacy) | generate UUIDv5 deterministik (`{source_system}:{source_table}:{source_pk}`), simpan external refs keduanya | jangan pakai integer source sebagai PK canonical |
| `catalog_product.slug` | `TourProduct.slug` | `TourPackage.slug` | pilih slug aktif publik (`balisnap`) | uniqueness global wajib |
| `catalog_product.name` | `TourProduct.product_name` | `TourPackage.packageName` | prioritas `balisnap` | trim + normalize whitespace |
| `catalog_product.short_description` | `TourProduct.short_description` | `TourPackage.shortDescription` | fallback ke source non-null | nullable |
| `catalog_product.description` | `TourProduct.description` | `TourPackage.description` | fallback ke source non-null | nullable text |
| `catalog_product.is_active` | `TourProduct.is_active` | `Tour.isActive` | true jika source publik aktif | ops-only item bisa false di web |
| `catalog_product.is_featured` | `TourProduct.is_featured` | `TourPackage.isFeatured` | default dari `balisnap` | fallback `bstadmin` saat null |
| `catalog_product.thumbnail_url` | `TourProduct.thumbnail_url` | `TourPackage.thumbnailUrl` | prioritas `balisnap`, fallback image cover | valid URL check |
| `catalog_product.color_code` | `TourProduct.color_code` | `TourPackage.colorCode` | coalesce | optional |
| `catalog_product.priority` | `TourProduct.priority` | `TourPackage.priority` | coalesce integer | untuk sorting |
| `catalog_product.country_code` | `TourProduct.country_code` | tidak ada | default `ID` jika null | source baru dari content manager |
| `catalog_product.region` | `TourProduct.region` | tidak ada | direct map | optional |
| `catalog_product.base_meeting_point` | `TourProduct.base_meeting_point` | `TourPackage` tidak punya field identik | direct map | dipakai fallback booking |

### 5.2 Variant Mapping

| Target Field | `balisnap` Source | `bstadmin` Source | Transform Rule | Catatan |
|---|---|---|---|---|
| `catalog_variant.variant_key` | `TourVariant.variant_id` | tidak ada padanan kuat | generate UUIDv5 deterministik (`{source_system}:{source_table}:{source_pk}`) | integer source jadi external ref |
| `catalog_variant.product_key` | relasi `TourVariant.product_id` | relasi `TourPackage.tourId` | map via product bridge | wajib ada parent product |
| `catalog_variant.code` | `TourVariant.variant_code` | tidak ada | direct map | unique per product |
| `catalog_variant.name` | `TourVariant.variant_name` | `TourPackage.packageName` fallback | prioritas `balisnap` | |
| `catalog_variant.service_type` | `TourVariant.service_type` | tidak ada | direct map enum | PRIVATE/SHARED/CUSTOM |
| `catalog_variant.duration_days` | `TourVariant.duration_days` | `TourPackage.durationDays` | fallback jika null | min 1 |
| `catalog_variant.duration_nights` | `TourVariant.duration_nights` | tidak ada | direct map | nullable |
| `catalog_variant.min_pax` | `TourVariant.min_pax` | `TourPackage.minBooking` | fallback ke package | min 1 |
| `catalog_variant.max_pax` | `TourVariant.max_pax` | `TourPackage.maxBooking` | fallback ke package | nullable |
| `catalog_variant.currency_code` | `TourVariant.currency_code` | `TourPackage.baseCurrency` | prioritas `balisnap` | default USD |
| `catalog_variant.is_default` | `TourVariant.is_default` | tidak ada | direct map | untuk variant picker |
| `catalog_variant.is_active` | `TourVariant.is_active` | tidak ada | direct map | |
| `catalog_variant.booking_cutoff_hours` | `TourVariant.booking_cutoff_hours` | tidak ada | direct map | |
| `catalog_variant.cancellation_policy` | `TourVariant.cancellation_policy` | tidak ada | direct map | nullable |

### 5.3 Variant Rate Mapping (Schema v1)

| Target Field | `balisnap` Source | `bstadmin` Source | Transform Rule | Catatan |
|---|---|---|---|---|
| `catalog_variant_rate.variant_rate_key` | `VariantRatePlan.id` | tidak ada | generate UUIDv5 deterministik (`{source_system}:{source_table}:{source_pk}`) | fallback plan id synthetic jika source kosong |
| `catalog_variant_rate.traveler_type` | `VariantRatePlan.traveler_type` | implicit adult/child from package price | ADULT/CHILD mapping | |
| `catalog_variant_rate.currency_code` | `VariantRatePlan.currency_code` | `TourPackage.baseCurrency` | uppercase 3-char, fallback ke variant currency | default USD jika null |
| `catalog_variant_rate.price` | `VariantRatePlan.price` | `pricePerPerson`, `pricePerChild` | legacy package price jadi fallback default rate | decimal(12,2) |
| `catalog_variant_rate.valid_from` | `VariantRatePlan.valid_from` | tidak ada | direct map | nullable |
| `catalog_variant_rate.valid_to` | `VariantRatePlan.valid_to` | tidak ada | direct map | nullable |
| `catalog_variant_rate.is_active` | `VariantRatePlan.is_active` | n/a | default true untuk fallback dari package | |

### 5.4 Deferred Catalog Metadata (Compatibility Only)

1. `catalog_media.*` dan `catalog_itinerary.*` tidak menjadi tabel canonical di schema v1.
2. Selama fase transisi:
   1. kebutuhan image cover dipetakan ke `catalog_product.thumbnail_url`,
   2. detail gallery/itinerary tetap disimpan di source legacy,
   3. kasus yang butuh tindak lanjut dimasukkan ke `unmapped_queue` dengan `queue_type='CATALOG_EXTENDED_METADATA'`.

## 6. Matrix Booking Domain

### 6.1 Booking Core

| Target Field | `balisnap` Source | `bstadmin` Source | Transform Rule | Catatan |
|---|---|---|---|---|
| `booking_core.booking_key` | `Booking.booking_id` | `Booking.id` | generate UUIDv5 deterministik (`{source_system}:{source_table}:{source_pk}`) | integer source jadi external refs |
| `booking_core.channel_code` | inferred `DIRECT` | dari `Booking.source` | map enum source ke registry channel | channel != source enum |
| `booking_core.source_enum_compat` | hardcoded `DIRECT` untuk direct | `Booking.source` | simpan untuk non-breaking legacy | dipakai adapter lama |
| `booking_core.external_booking_ref` | `Booking.booking_ref` | `Booking.bookingRef` | normalize uppercase + trim | unique per channel |
| `booking_core.booking_created_at` | `Booking.created_at` | `Booking.createdAt` | min timestamp valid | |
| `booking_core.booking_date` | `Booking.booking_date` | `Booking.bookingDate` | direct map UTC | |
| `booking_core.tour_date` | `Booking.booking_date` atau departure date | `Booking.tourDate` | gunakan date perjalanan, bukan create date | perlu turunan dari item/departure |
| `booking_core.tour_time` | dari departure/itinerary jika ada | `Booking.tourTime` | fallback null | |
| `booking_core.currency_code` | `Booking.currency_code` | `Booking.currency` | uppercase 3-char | |
| `booking_core.total_price` | `Booking.total_price` / sum item | `Booking.totalPrice` | prioritaskan sum item active jika ada | decimal normalize |
| `booking_core.number_of_adult` | `Booking.number_of_adult` | `Booking.numberOfAdult` | max(0, value) | |
| `booking_core.number_of_child` | `Booking.number_of_child` | `Booking.numberOfChild` | null -> 0 | |
| `booking_core.note` | `Booking.note` | `Booking.note` | append with source tags saat merge | audit perubahan wajib |
| `booking_core.package_ref_type` | turunan dari `Booking.package_id` | turunan dari `Booking.packageId` | wajib isi `LEGACY_PACKAGE` / `CATALOG_PRODUCT` / `CATALOG_VARIANT` | mandatory discriminator compatibility |
| `booking_core.package_ref_key` | map dari bridge katalog | map dari bridge katalog | UUID canonical target product/variant | nullable hanya jika belum ter-map |
| `booking_core.legacy_package_id` | `Booking.package_id` | `Booking.packageId` | simpan integer raw legacy untuk audit compatibility | nullable |
| `booking_item_snapshot.departure_external_id` | `BookingItem.departure_id` | tidak ada | direct map external | nullable |

### 6.2 Booking Contact + Party

| Target Field | `balisnap` Source | `bstadmin` Source | Transform Rule | Catatan |
|---|---|---|---|---|
| `booking_contact.main_name` | `main_contact_name` | `mainContactName` | latest non-placeholder wins | placeholder list dari parser rules |
| `booking_contact.main_email` | `main_contact_email` | `mainContactEmail` | latest valid email wins | invalid tetap disimpan di raw audit |
| `booking_contact.phone` | `phone_number` | `phoneNumber` | normalize E.164 best effort | |
| `booking_contact.pickup_location` | dari request `pickupLocation` ke `meeting_point` | `pickupLocation` | simpan keduanya: pickup + meeting | `balisnap` belum punya kolom pickup khusus |
| `booking_contact.meeting_point` | `meeting_point` | `meetingPoint` | coalesce | |
| `booking_party.adult_qty` | `BookingItem.adult_qty` | `Booking.numberOfAdult` | fallback booking-level | |
| `booking_party.child_qty` | `BookingItem.child_qty` | `Booking.numberOfChild` | fallback booking-level | |
| `booking_party.infant_qty` | `BookingItem.infant_qty` | tidak ada | default 0 | |
| `booking_party.traveler_rows` | `BookingTraveler` | tidak ada | migrate jika tersedia | optional detail traveler |

### 6.3 Booking Item Snapshot

| Target Field | `balisnap` Source | `bstadmin` Source | Transform Rule | Catatan |
|---|---|---|---|---|
| `booking_item_snapshot.variant_external_id` | `BookingItem.variant_id` | tidak ada | map via channel variant mapping | wajib |
| `booking_item_snapshot.currency_code` | `BookingItem.currency_code` | `Booking.currency` | prioritas item-level | |
| `booking_item_snapshot.adult_qty` | `BookingItem.adult_qty` | `Booking.numberOfAdult` | fallback booking-level jika item kosong | |
| `booking_item_snapshot.child_qty` | `BookingItem.child_qty` | `Booking.numberOfChild` | fallback booking-level jika item kosong | |
| `booking_item_snapshot.infant_qty` | `BookingItem.infant_qty` | tidak ada | null -> 0 | |
| `booking_item_snapshot.adult_unit_price` | `BookingItem.adult_unit_price` | derive (`totalPrice`/pax) jika perlu | no negative | |
| `booking_item_snapshot.child_unit_price` | `BookingItem.child_unit_price` | derive fallback | | |
| `booking_item_snapshot.discount_amount` | `BookingItem.discount_amount` | default 0 | |
| `booking_item_snapshot.tax_amount` | `BookingItem.tax_amount` | default 0 | |
| `booking_item_snapshot.total_amount` | `BookingItem.total_amount` | `Booking.totalPrice` fallback | |
| `booking_item_snapshot.snapshot_json` | `BookingItem.snapshot` | build synthetic snapshot | simpan source payload awal |

## 7. Matrix Payment Domain

| Target Field | `balisnap` Source | `bstadmin` Source | Transform Rule | Catatan |
|---|---|---|---|---|
| `payment_event.payment_key` | `Payment.payment_id` | tidak ada row-level payment | generate UUIDv5 deterministik (`{source_system}:{source_table}:{source_pk}`) | |
| `payment_event.booking_key` | `Payment.booking_id` | link via `Booking.id` | map lewat booking bridge | |
| `payment_event.payment_time` | `Payment.payment_date` | `Booking.paidAt` | event time prioritas dari payment row | |
| `payment_event.amount` | `Payment.amount` | derive dari settlement total | decimal(12,2) |
| `payment_event.currency_code` | `Payment.currency_code` | `Booking.currency` | uppercase | |
| `payment_event.method` | `Payment.payment_method` | manual marker dari ops | PAYPAL/manual/other |
| `payment_event.status_raw` | `payment_status`, `payment_status_v2` | `isPaid`, `paidAt` | simpan raw + normalized | |
| `payment_event.gateway` | `gateway` | tidak ada | direct map | |
| `payment_event.gateway_order_id` | `gateway_order_id` | tidak ada | direct map | |
| `payment_event.gateway_capture_id` | `gateway_capture_id` | tidak ada | direct map | |
| `payment_event.payment_ref` | `payment_ref` | tidak ada | unique jika ada | |
| `payment_event.raw_payload` | `raw_payload` | tidak ada | simpan apa adanya | penting audit sengketa |
| `booking_core.customer_payment_status` | derive dari event payment | derive dari `isPaid` + settlement | gunakan tabel mapping status | dipisah dari ops status |

## 8. Matrix Ops + Finance Domain

| Target Field | `balisnap` Source | `bstadmin` Source | Transform Rule | Catatan |
|---|---|---|---|---|
| `ops_booking_state.ops_fulfillment_status` | tidak authoritative | `Booking.status` + `computeBookingStatus` | ambil hasil recompute | authoritative ops |
| `ops_booking_state.assigned_driver_id` | tidak ada | `Booking.assignedDriverId` | direct map | |
| `ops_booking_state.assigned_at` | tidak ada | `Booking.assignedAt` | direct map | |
| `ops_booking_state.is_paid_flag` | infer via payment | `Booking.isPaid` | sinkronisasi via service bridge satu arah ke core | |
| `ops_booking_state.paid_at` | payment date | `Booking.paidAt` | earliest verified paid time | |
| `ops_finance_bridge.booking_finance_id` | tidak ada | `BookingFinance.id` | direct map | |
| `ops_finance_bridge.pattern_id` | tidak ada | `BookingFinance.patternId` | direct map | |
| `ops_finance_bridge.validated_at` | tidak ada | `BookingFinance.validatedAt` | direct map | |
| `ops_finance_bridge.settlement_status` | tidak ada | derive dari `BookingFinanceItem.paid` aggregate | `SETTLED` jika seluruh item paid, selain itu `PENDING` | item-level detail tetap di legacy |
| `ops_finance_bridge.last_reconciled_at` | tidak ada | timestamp proses rekonsiliasi | set saat postcheck/recompute | wajib terisi saat sync bridge |

## 9. Matrix Email Ingestion Domain

| Target Field | `balisnap` Source | `bstadmin` Source | Transform Rule | Catatan |
|---|---|---|---|---|
| `ingest_event_log.event_key` | belum ada | synthetic dari `EmailInbox.id`/`messageId` | UUIDv5 deterministik (`{source_system}:{source_table}:{source_pk}`) | |
| `ingest_event_log.idempotency_key` | belum ada | `messageId` | unique global | wajib |
| `ingest_event_log.event_type` | belum ada | inferred `CREATED/UPDATED/CANCELLED` | parser + subject classifier | |
| `ingest_event_log.source_enum` | n/a | `EmailInbox.source` + parser override | parser source menang jika lebih spesifik | contoh VIATOR dari Bokun |
| `ingest_event_log.request_received_at` | n/a | `EmailInbox.receivedAt` | direct map | |
| `ingest_event_log.process_status` | n/a | `EmailJob.status` + `errorMessage` | normalize jadi RECEIVED/PROCESSING/DONE/FAILED | |
| `ingest_event_log.raw_payload` | n/a | gabungan subject/from/body/html/parsedData | simpan compact json | |
| `ingest_event_log.raw_payload.booking_email_relation_type` | n/a | `BookingEmail.relationType` | simpan sebagai metadata payload | compatibility-only, bukan tabel canonical |

## 10. Status Mapping Rules

### 10.1 Customer Payment Status Normalization

| Input Combination | Output `customer_payment_status` |
|---|---|
| `balisnap.status_v2 = DRAFT` | `DRAFT` |
| `balisnap.status_v2 = PENDING_PAYMENT` | `PENDING_PAYMENT` |
| `balisnap.status_v2 in (PAID, CONFIRMED, COMPLETED)` | `PAID` |
| `balisnap.status_v2 = REFUNDED` | `REFUNDED` |
| `payment_status_v2 in (FAILED, CANCELLED)` | `FAILED` |
| `bstadmin.isPaid = true` and settlement complete | `PAID` |
| `bstadmin.isPaid = false` and belum ada payment event | `PENDING_PAYMENT` |

### 10.2 Ops Fulfillment Status Normalization

| Input `bstadmin.Booking.status` | Output `ops_fulfillment_status` |
|---|---|
| `NEW` | `NEW` |
| `READY` | `READY` |
| `ATTENTION` | `ATTENTION` |
| `UPDATED` | `UPDATED` |
| `COMPLETED` | `COMPLETED` |
| `DONE` | `DONE` |
| `CANCELLED` | `CANCELLED` |
| `NO_SHOW` | `NO_SHOW` |

## 11. Idempotency dan Constraint Target

1. Unique `channel_code + external_booking_ref`.
2. Unique `payment_ref` jika non-null.
3. Unique `ingest_event_log.idempotency_key`.
4. Unique secondary dedup `source_enum + external_booking_ref + event_type + event_time_normalized`.
5. `event_time_normalized` wajib UTC, dibulatkan ke detik (`date_trunc('second', event_time)`).
6. Foreign key wajib dari `booking_item_snapshot` ke `booking_core`.
7. Foreign key wajib dari `payment_event` ke `booking_core`.
8. Soft-delete flag dipakai untuk row yang tidak bisa di-drop saat dual-run.

## 11.1 Idempotency Store Retention

1. TTL idempotency key: 35 hari.
2. TTL nonce replay-protection: 10 menit.
3. Event replay boleh setelah TTL nonce selama idempotency key masih aktif.

## 12. Conflict Resolution Algorithm

1. Terima candidate row dari source event.
2. Validasi key identitas minimal (`channel_code`, `external_booking_ref`, `event_time`).
3. Cari canonical row target.
4. Jika tidak ada, create row baru.
5. Jika ada, jalankan merge field by field dengan precedence matrix domain.
6. Jika field sama-sama terisi namun beda nilai, cek freshness timestamp.
7. Jika freshness tidak bisa dipastikan, tandai `REVIEW_REQUIRED`.
8. Tulis perubahan ke audit log dan simpan payload sumber.

## 13. Data Quality Checks Wajib

1. Null critical fields:
```sql
SELECT COUNT(*) FROM booking_core
WHERE channel_code IS NULL OR external_booking_ref IS NULL;
```

2. Duplicate external refs:
```sql
SELECT channel_code, external_booking_ref, COUNT(*)
FROM booking_core
GROUP BY 1,2 HAVING COUNT(*) > 1;
```

3. Payment orphan:
```sql
SELECT COUNT(*) FROM payment_event p
LEFT JOIN booking_core b ON b.booking_key = p.booking_key
WHERE b.booking_key IS NULL;
```

4. Ops status drift:
```sql
SELECT COUNT(*) FROM booking_core
WHERE ops_fulfillment_status = 'DONE'
AND customer_payment_status <> 'PAID';
```

5. Unmapped variant queue size:
```sql
SELECT channel_code, COUNT(*)
FROM unmapped_queue
WHERE queue_type = 'VARIANT_MAPPING' AND status = 'OPEN'
GROUP BY 1;
```

## 14. Batas Lulus Migration Batch

1. Duplicate external refs: `0`.
2. Payment orphan: `0`.
3. Null critical fields: `0`.
4. Unmapped ratio per channel: `<= 5%` pada akhir batch catalog.
5. Ops status drift vs settlement: `<= 1%` dan wajib ada daftar exception.

## 15. Automation Hook

Untuk eksekusi checks di atas secara otomatis dari `apps/core-api`:

1. `pnpm --filter @bst/core-api quality:phase2`
2. output report:
   1. `reports/recon/quality/{PHASE2_BATCH_CODE}/{timestamp}.json`
   2. `reports/recon/quality/{PHASE2_BATCH_CODE}/{timestamp}.md`
