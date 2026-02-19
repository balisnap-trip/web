# Temporary Notes - Preparation Phase (Source of Truth)

Date: 2026-02-18
Scope: `balisnap` + `bstadmin`
Method: read source code (`prisma/schema.prisma`, API routes, service layer) only.

## 1) Source files checked

### `balisnap`
- `prisma/schema.prisma`
- `app/api/tours/route.ts`
- `app/api/tours/featured/route.ts`
- `app/api/tours/[slug]/route.ts`
- `app/api/bookings/route.ts`
- `app/api/booking/[id]/route.ts`
- `app/api/orders/route.ts`
- `app/api/orders/store/route.ts`
- `app/api/orders/[orderId]/capture/route.ts`
- `app/api/orders/status/route.ts`
- `app/api/review/route.ts`
- `app/api/tours/review/route.ts`
- `lib/api/validators.ts`
- `lib/utils/booking/createBooking.ts`
- `lib/utils/booking/compat.ts`
- `lib/utils/tour/v2Mapper.ts`

### `bstadmin`
- `prisma/schema.prisma`
- `src/lib/auth.ts`
- `src/middleware.ts`
- `src/lib/booking/status.ts`
- `src/lib/database-sync.ts`
- `src/app/api/tours/route.ts`
- `src/app/api/tours/[id]/route.ts`
- `src/app/api/tour-packages/route.ts`
- `src/app/api/tour-packages/[id]/route.ts`
- `src/app/api/bookings/route.ts`
- `src/app/api/bookings/[id]/route.ts`
- `src/app/api/booking/fetch/route.ts`
- `src/app/api/finance/patterns/route.ts`
- `src/app/api/finance/patterns/[id]/route.ts`
- `src/app/api/finance/assign-pattern/route.ts`
- `src/app/api/finance/booking/[id]/items/route.ts`
- `src/app/api/finance/validate/route.ts`
- `src/app/api/tour-item-categories/route.ts`
- `src/app/api/tour-item-categories/[id]/route.ts`
- `src/app/api/service-items/route.ts`
- `src/app/api/service-items/[id]/route.ts`
- `src/app/api/partners/route.ts`
- `src/app/api/partners/[id]/route.ts`
- `src/lib/email/booking-fetch.ts`
- `src/lib/email/parsers/gyg-parser.ts`
- `src/lib/email/parsers/bokun-parser.ts`
- `src/lib/email/parsers/tripdotcom-parser.ts`
- `src/types/email.ts`

## 2) Verified facts from source

1. `balisnap` already has v2 catalog/booking tables:
- `TourProduct`, `TourVariant`, `Departure`, `VariantRatePlan`, `BookingItem`, `BookingTraveler` in `prisma/schema.prisma`.

2. `balisnap` still keeps legacy compatibility:
- `TourPackage` and `Booking.package_id` still used.
- API response is mapped back to legacy shape (`package_id`, `package_name`, `price_per_person`) in `lib/utils/tour/v2Mapper.ts` and `app/api/tours/[slug]/route.ts`.

3. `balisnap` booking write-path is variant-aware:
- Booking create validates `variantId`, optional `departureId`, and writes `BookingItem` snapshot in `lib/utils/booking/createBooking.ts`.

4. `balisnap` payment capture has server-side amount guard:
- Capture checks order ownership (`custom_id`), amount match to booking totals, and USD currency in `app/api/orders/[orderId]/capture/route.ts`.

5. `bstadmin` core catalog is still package-centric:
- `Tour` + `TourPackage` are master entities in `prisma/schema.prisma`.
- Finance patterns linked to `TourPackage` via `TourCostPattern.packageId`.

6. `bstadmin` finance module is deep and production-oriented:
- `TourCostPattern`, `TourCostPatternItem`, `BookingFinance`, `BookingFinanceItem` + assignment/validation APIs.

7. `bstadmin` OTA ingestion does not store canonical external catalog IDs explicitly:
- Parsers extract `bookingRef`, `tourName`, pax, dates, etc. into `ParsedBooking`.
- Persisted booking fields are mostly booking-level (`bookingRef`, `tourName`, `source`, `note`), not dedicated product/variant external IDs.

8. `bstadmin` booking lifecycle status is computed by rules:
- `NEW/READY/ATTENTION/COMPLETED/DONE/UPDATED/CANCELLED/NO_SHOW` derived in `src/lib/booking/status.ts`.

9. `bstadmin` sync utility is table-level bidirectional sync:
- Generic row merge with last-write-wins based on timestamps in `src/lib/database-sync.ts`.

## 3) Implications for preparation docs

1. ERD final must preserve:
- v2 catalog/booking granularity from `balisnap`.
- finance and operations blocks from `bstadmin`.

2. API contract v1 must preserve:
- current request fields from `balisnap` booking/payment routes.
- current finance/pattern operations from `bstadmin`.
- explicit role boundaries (`CUSTOMER` vs `ADMIN/STAFF`).

3. Migration matrix must include:
- mapping from `balisnap` v2 + legacy fields.
- mapping from `bstadmin` package-centric + finance-centric schema.
- explicit "missing in source" markers (not inferred silently).
