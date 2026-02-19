# Migration Matrix Field - `balisnap` + `bstadmin` -> Final Model

Date: 2026-02-18  
Status: execution-ready draft (Phase-2 input)  
Method: mapping derived from code/schema currently active.

## 1) Source of truth references

1. `balisnap` schema:
- `prisma/schema.prisma:126` (`TourProduct`)
- `prisma/schema.prisma:164` (`TourVariant`)
- `prisma/schema.prisma:212` (`Departure`)
- `prisma/schema.prisma:234` (`VariantRatePlan`)
- `prisma/schema.prisma:332` (`BookingItem`)
- `prisma/schema.prisma:437` (`Booking`)
- `prisma/schema.prisma:488` (`Payment`)
- `prisma/schema.prisma:382` (`TourPackage` legacy)

2. `bstadmin` schema:
- `d:/Balisnaptrip/WEB/bstadmin/prisma/schema.prisma:242` (`Tour`)
- `d:/Balisnaptrip/WEB/bstadmin/prisma/schema.prisma:259` (`TourPackage`)
- `d:/Balisnaptrip/WEB/bstadmin/prisma/schema.prisma:93` (`Booking`)
- `d:/Balisnaptrip/WEB/bstadmin/prisma/schema.prisma:542` (`TourCostPattern`)
- `d:/Balisnaptrip/WEB/bstadmin/prisma/schema.prisma:582` (`BookingFinance`)

3. Behavior-level references:
- `lib/utils/booking/createBooking.ts:257` (`packageId` fallback logic)
- `d:/Balisnaptrip/WEB/bstadmin/src/lib/email/booking-fetch.ts:365` (OTA booking create fields)
- `d:/Balisnaptrip/WEB/bstadmin/src/lib/booking/status.ts:20` (ops status computation)

## 2) Priority rules

1. Catalog canonical priority:
- Priority-1: `balisnap` v2 (`TourProduct`/`TourVariant`/`RatePlan`/`Departure`)
- Priority-2: `bstadmin` (`Tour`/`TourPackage`) as fallback/seeding
- Priority-3: `balisnap.TourPackage` legacy fallback

2. Booking canonical priority:
- Direct booking truth: `balisnap.Booking` + `BookingItem` + `Payment`
- OTA/ops truth: `bstadmin.Booking` + `BookingEmail` + parser output fields in notes.

3. Finance truth:
- `bstadmin` finance tables are primary source.

## 3) Matrix - Catalog product

| Target field (`product`) | `balisnap` source | `bstadmin` source | Rule |
|---|---|---|---|
| `product_id` | `TourProduct.product_id` | `Tour.id` | Use existing `TourProduct.product_id`; if seeded from admin-only row, create new ID and store legacy in bridge. |
| `product_name` | `TourProduct.product_name` | `Tour.tourName` | Prefer `TourProduct.product_name`, fallback `Tour.tourName`. |
| `slug` | `TourProduct.slug` | `Tour.slug` | Prefer `TourProduct.slug`; fallback `Tour.slug`; must stay unique. |
| `short_description` | `TourProduct.short_description` | none | Use balisnap value or null. |
| `description` | `TourProduct.description` | `Tour.description` | Prefer balisnap; fallback admin description. |
| `category` | `TourProduct.category` | none | Keep balisnap value, else null. |
| `country_code` | `TourProduct.country_code` | none | Keep balisnap, default `ID` if null. |
| `region` | `TourProduct.region` | none | Keep balisnap value. |
| `base_meeting_point` | `TourProduct.base_meeting_point` | none | Keep balisnap value. |
| `is_featured` | `TourProduct.is_featured` | indirectly `TourPackage.isFeatured` | Product-level uses `TourProduct.is_featured`; package-level featured moved to channel/variant context. |
| `is_active` | `TourProduct.is_active` | `Tour.isActive` | Prefer balisnap; fallback `Tour.isActive`. |
| `thumbnail_url` | `TourProduct.thumbnail_url` | `TourPackage.thumbnailUrl` | Prefer product thumbnail; fallback first package thumbnail by mapped variant. |
| `color_code` | `TourProduct.color_code` | `TourPackage.colorCode` | Prefer balisnap; fallback package color. |
| `priority` | `TourProduct.priority` | `TourPackage.priority` | Prefer balisnap; fallback max package priority in same product group. |
| `created_at` | `TourProduct.created_at` | `Tour.createdAt` | Preserve original timestamp from selected source. |
| `updated_at` | `TourProduct.updated_at` | `Tour.updatedAt` | Preserve latest timestamp. |

## 4) Matrix - Variant + pricing + departures

| Target field (`variant`) | `balisnap` source | `bstadmin` source | Rule |
|---|---|---|---|
| `variant_id` | `TourVariant.variant_id` | none | Keep existing `variant_id`; for admin-only package create new variant row. |
| `product_id` | `TourVariant.product_id` | `TourPackage.tourId` | Map by existing relation; fallback by `tourId -> product` mapping. |
| `variant_code` | `TourVariant.variant_code` | none | Keep existing; fallback `LEGACY-PKG-{package_id}` for migrated admin package. |
| `variant_name` | `TourVariant.variant_name` | `TourPackage.packageName` | Prefer balisnap; fallback package name. |
| `service_type` | `TourVariant.service_type` | none | Keep balisnap; fallback `PRIVATE` (explicit migration default). |
| `duration_days` | `TourVariant.duration_days` | `TourPackage.durationDays` | Prefer balisnap; fallback package duration. |
| `duration_nights` | `TourVariant.duration_nights` | none | Keep balisnap or null. |
| `min_pax` | `TourVariant.min_pax` | `TourPackage.minBooking` | Prefer balisnap; fallback package min booking. |
| `max_pax` | `TourVariant.max_pax` | `TourPackage.maxBooking` | Prefer balisnap; fallback package max booking. |
| `currency_code` | `TourVariant.currency_code` | `TourPackage.baseCurrency` | Prefer balisnap; fallback package base currency. |
| `is_default` | `TourVariant.is_default` | none | Keep balisnap; for generated variant set `true` if single variant. |
| `is_active` | `TourVariant.is_active` | inferred from parent `Tour.isActive` | Prefer balisnap; fallback parent active flag. |
| `booking_cutoff_hours` | `TourVariant.booking_cutoff_hours` | none | Keep balisnap; fallback `24`. |
| `cancellation_policy` | `TourVariant.cancellation_policy` | none | Keep balisnap value. |

### Pricing matrix (`rate_plan`)

| Target field | `balisnap` source | `bstadmin` source | Rule |
|---|---|---|---|
| `variant_id` | `VariantRatePlan.variant_id` | derived from package mapping | Keep existing or resolved mapped variant. |
| `traveler_type` | `VariantRatePlan.traveler_type` | derived (`ADULT`/`CHILD`) | Use existing; if absent create synthetic rows from package price fields. |
| `price` | `VariantRatePlan.price` | `TourPackage.pricePerPerson` / `pricePerChild` | Prefer rate plan rows; fallback package prices. |
| `currency_code` | `VariantRatePlan.currency_code` | `TourPackage.baseCurrency` | Prefer rate plan currency. |
| `min_quantity` / `max_quantity` | `VariantRatePlan.min_quantity/max_quantity` | none | Keep existing or null. |
| `valid_from` / `valid_to` | `VariantRatePlan.valid_from/valid_to` | none | Keep existing or null. |
| `season_start` / `season_end` | `VariantRatePlan.season_start/season_end` | none | Keep existing or null. |
| `is_active` | `VariantRatePlan.is_active` | none | Keep existing; synthetic rows set `true`. |

### Departure matrix

| Target field (`departure`) | `balisnap` source | `bstadmin` source | Rule |
|---|---|---|---|
| `departure_id` | `Departure.departure_id` | none | Keep existing IDs. |
| `variant_id` | `Departure.variant_id` | none | Keep as-is. |
| `departure_code` | `Departure.departure_code` | none | Keep or null. |
| `start_date` | `Departure.start_date` | none | Keep as-is. |
| `end_date` | `Departure.end_date` | none | Keep as-is. |
| `cutoff_at` | `Departure.cutoff_at` | none | Keep as-is. |
| `capacity_total` | `Departure.capacity_total` | none | Keep as-is. |
| `capacity_reserved` | `Departure.capacity_reserved` | none | Keep as-is. |
| `status` | `Departure.status` | none | Keep as-is (`OPEN`, `LIMITED`, etc.). |
| `meeting_point` | `Departure.meeting_point` | none | Keep as-is. |
| `note` | `Departure.note` | none | Keep as-is. |
| `is_active` | `Departure.is_active` | none | Keep as-is. |

## 5) Matrix - Booking and payment

### Booking master

| Target field (`booking`) | `balisnap` source | `bstadmin` source | Rule |
|---|---|---|---|
| `booking_id` | `Booking.booking_id` | `Booking.id` | Keep native ID in each system then re-key into unified table with source marker during merge. |
| `booking_ref` | `Booking.booking_ref` | `Booking.bookingRef` | Prefer non-null reference; enforce unique per `source_channel`. |
| `user_id` | `Booking.user_id` | `Booking.userId` | Keep existing; OTA import currently uses admin user in `booking-fetch.ts:364`. |
| `booking_date` | `Booking.booking_date` | `Booking.bookingDate` | Keep as creation/booking timestamp. |
| `travel_date` | derived from `booking_date` in direct flow | `Booking.tourDate` | For direct booking set `travel_date=booking_date`; for OTA set from `tourDate`. |
| `status_code` | `Booking.status` + `status_v2` | `Booking.status` | Map via status mapping table below. |
| `source_channel` | none explicit (direct web) | `Booking.source` | Set `WEB` for balisnap direct; use existing source for OTA/admin. |
| `total_amount` | `Booking.total_price` | `Booking.totalPrice` | Keep numeric total; prefer itemized sum if BookingItem exists. |
| `currency_code` | `Booking.currency_code` | `Booking.currency` | Keep source currency. |
| `number_of_adult` | `Booking.number_of_adult` | `Booking.numberOfAdult` | Keep as-is. |
| `number_of_child` | `Booking.number_of_child` | `Booking.numberOfChild` | Keep as-is (default 0 if null). |
| `main_contact_name` | `Booking.main_contact_name` | `Booking.mainContactName` | Prefer non-placeholder value. |
| `main_contact_email` | `Booking.main_contact_email` | `Booking.mainContactEmail` | Prefer non-placeholder value. |
| `phone_number` | `Booking.phone_number` | `Booking.phoneNumber` | Keep as-is. |
| `pickup_location` | none | `Booking.pickupLocation` | Fill from admin source when available; else null. |
| `meeting_point` | `Booking.meeting_point` | `Booking.meetingPoint` | Keep best available non-empty value. |
| `note` | `Booking.note` | `Booking.note` | Merge note text with source-tag if both exist. |
| `created_at`/`updated_at` | source timestamps | source timestamps | Preserve original timestamps. |

### Booking item

| Target field (`booking_item`) | `balisnap` source | `bstadmin` source | Rule |
|---|---|---|---|
| `booking_item_id` | `BookingItem.booking_item_id` | none | Keep existing for balisnap records. |
| `booking_id` | `BookingItem.booking_id` | derived from `Booking.id` | For OTA/admin bookings create one synthetic item row per booking during migration. |
| `variant_id` | `BookingItem.variant_id` | derived mapping from `packageId/tourName` | Resolve via mapping table; if unresolved set `UNMAPPED` flag and null `variant_id`. |
| `departure_id` | `BookingItem.departure_id` | none | Keep if available else null. |
| `item_status` | `BookingItem.item_status` | derived from booking status | For synthetic items map from booking status (`CANCELLED` -> cancelled, else active). |
| `adult_qty/child_qty/infant_qty` | direct fields | `numberOfAdult/numberOfChild` | Keep direct or derive (`infant=0`). |
| `adult_unit_price/child_unit_price` | direct fields | derived from `totalPrice` and pax | If no unit price, derive proportional split (adult-first). |
| `subtotal/discount_amount/tax_amount/total_amount` | direct fields | derived | For OTA synthetic item: `subtotal=total_amount=booking.totalPrice`, discounts/tax zero unless later data exists. |
| `snapshot` | `BookingItem.snapshot` | none | Keep existing snapshot; generate minimal snapshot for synthetic rows. |

### Payment

| Target field (`payment_transaction`) | `balisnap` source | `bstadmin` source | Rule |
|---|---|---|---|
| `payment_id` | `Payment.payment_id` | none | Keep balisnap payment records. |
| `booking_id` | `Payment.booking_id` | `Booking.id` (if `isPaid=true`) | For admin bookings, optional synthetic payment event may be created only if business requires; default no synthetic rows. |
| `payment_date` | `Payment.payment_date` | `Booking.paidAt` | Keep existing; fallback `paidAt` only for synthetic migration mode. |
| `amount` | `Payment.amount` | `Booking.totalPrice` | Keep existing; for synthetic records use booking total. |
| `currency_code` | `Payment.currency_code` | `Booking.currency` | Keep source currency. |
| `payment_method` | `Payment.payment_method` | none | Keep existing or `OTA_PREPAID` for synthetic mode. |
| `payment_status` | `Payment.payment_status` / `payment_status_v2` | `Booking.isPaid` | Preserve explicit status; synthetic mode map `isPaid=true -> COMPLETED`, else `PENDING`. |
| `payment_ref` | `Payment.payment_ref` | none | Keep existing reference. |

## 6) Matrix - Channel mapping (new tables)

Current source does not provide dedicated channel catalog tables; mapping below is built from available fields.

| Target field | `balisnap` source | `bstadmin` source | Rule |
|---|---|---|---|
| `channel.code` | implicit direct web | `Booking.source` enum | Seed channels from existing enum values + `WEB`. |
| `channel_product.external_product_ref` | none | parser-derived markers in `note`/subject | Start nullable; backfill progressively from parser enhancements. |
| `channel_product.display_name` | `TourProduct.product_name` | `Booking.tourName` | Prefer product name; fallback booking tour name for unmapped OTA references. |
| `channel_variant.external_variant_ref` | none | parser/body reference if present | Start nullable unless parser extracts explicit variant code. |
| `channel_variant.variant_id` | `TourVariant.variant_id` | derived via package/map | Required once mapping is confirmed. |
| `channel_sync_log.*` | none | import process logs and errors | Fill from sync/import events (`booking-fetch` result + future push/pull jobs). |

## 7) Matrix - Finance (from `bstadmin`)

| Target field | Source | Rule |
|---|---|---|
| `finance_category.*` | `TourItemCategory` | Migrate 1:1. |
| `partner.*` | `Partner` | Migrate 1:1 (keep category relation). |
| `service_item.*` | `ServiceItem` | Migrate 1:1 (keep default partner/category links). |
| `finance_pattern.name/is_active` | `TourCostPattern` | Migrate 1:1. |
| `finance_pattern.variant_id` | none (`packageId` currently) | Resolve via bridge `legacy_package_id -> variant_id`; keep `legacy_package_id` during transition. |
| `finance_pattern_item.*` | `TourCostPatternItem` | Migrate 1:1. |
| `booking_finance.*` | `BookingFinance` | Migrate 1:1 with new unified `booking_id`. |
| `booking_finance_item.*` | `BookingFinanceItem` | Migrate 1:1 with relationship remap. |

## 8) Booking status mapping table

| Source system | Source value | Target `status_code` |
|---|---|---|
| `balisnap` | `waiting` | `PENDING_PAYMENT` |
| `balisnap` | `paid` | `PAID` |
| `balisnap` | `completed` | `COMPLETED` |
| `balisnap` | `cancelled` | `CANCELLED` |
| `balisnap` | `status_v2` available | use `status_v2` when present (higher priority) |
| `bstadmin` | `NEW` | `NEW` |
| `bstadmin` | `READY` | `READY` |
| `bstadmin` | `ATTENTION` | `ATTENTION` |
| `bstadmin` | `COMPLETED` | `COMPLETED` |
| `bstadmin` | `DONE` | `DONE` |
| `bstadmin` | `UPDATED` | `UPDATED` |
| `bstadmin` | `CANCELLED` | `CANCELLED` |
| `bstadmin` | `NO_SHOW` | `NO_SHOW` |

## 9) Fields missing in current source (must be introduced)

1. Dedicated external catalog identifiers per channel:
- `external_product_ref`, `external_variant_ref` are not first-class fields today.

2. First-class relation between finance pattern and canonical variant:
- current finance uses `packageId` only (`TourCostPattern.packageId`).

3. Unified booking event table:
- needed to preserve relationship now split across `EmailInbox` + `BookingEmail` + parser notes.

## 10) Migration checkpoints

1. Checkpoint-A (catalog):
- every migrated variant must map to exactly one product.

2. Checkpoint-B (booking):
- `booking.total_amount` equals sum of active `booking_item.total_amount` where items exist.

3. Checkpoint-C (finance):
- every finance pattern either has `variant_id` or temporary `legacy_package_id` bridge (no orphan).

4. Checkpoint-D (channel):
- every OTA booking source has valid `channel_id`.
