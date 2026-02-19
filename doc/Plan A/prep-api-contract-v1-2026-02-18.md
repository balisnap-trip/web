# API Contract v1 (Preparation Baseline)

Date: 2026-02-18  
Status: ready for implementation spec  
Method: derived from active route handlers + validators in source code.

## 1) Source of truth references

1. Public/catalog routes (`balisnap`):
- `app/api/tours/route.ts:5`
- `app/api/tours/featured/route.ts:5`
- `app/api/tours/[slug]/route.ts:11`

2. Booking/payment/review routes (`balisnap`):
- `app/api/orders/store/route.ts:11`
- `app/api/bookings/route.ts:11`
- `app/api/booking/[id]/route.ts:11`
- `app/api/orders/route.ts:12`
- `app/api/orders/[orderId]/capture/route.ts:29`
- `app/api/orders/status/route.ts:9`
- `app/api/review/route.ts:10`
- `lib/api/validators.ts:95`

3. Admin/ops/finance routes (`bstadmin`):
- `d:/Balisnaptrip/WEB/bstadmin/src/app/api/tours/route.ts:6`
- `d:/Balisnaptrip/WEB/bstadmin/src/app/api/tour-packages/route.ts:6`
- `d:/Balisnaptrip/WEB/bstadmin/src/app/api/bookings/route.ts:10`
- `d:/Balisnaptrip/WEB/bstadmin/src/app/api/finance/patterns/route.ts:6`
- `d:/Balisnaptrip/WEB/bstadmin/src/app/api/finance/assign-pattern/route.ts:26`
- `d:/Balisnaptrip/WEB/bstadmin/src/app/api/finance/booking/[id]/items/route.ts:19`
- `d:/Balisnaptrip/WEB/bstadmin/src/app/api/booking/fetch/route.ts:10`

## 2) Contract conventions (v1)

1. Base path: `/v1`.
2. Content-Type: `application/json` (except SSE endpoint).
3. Error shape (unified from current implementations):
```json
{
  "error": "Human readable error",
  "code": "OPTIONAL_MACHINE_CODE",
  "details": {}
}
```
4. Success shape:
- Keep backward-compatible resource response (array/object), because both codebases already rely on direct payloads.

## 3) Auth modes

1. `public`: no auth.
2. `customer`: logged-in customer session (current `balisnap` behavior checks `session.user.id/email`).
3. `admin_read`: non-CUSTOMER (`ADMIN`/`STAFF`/`MANAGER`) from `bstadmin`.
4. `admin_write`: `ADMIN` or `STAFF` (or `ADMIN` only for destructive delete where currently enforced).

## 4) Endpoint map (v1)

## 4.1 Public catalog (read model)

1. `GET /v1/public/tours`  
Auth: `public`  
Source parity: `GET /api/tours`  
Response item fields:
- `package_id`, `variant_id`, `package_name`, `slug`, `thumbnail_url`, `short_description`, `description`, `color_code`, `is_featured`, `duration_days`, `min_booking`, `max_booking`, `price_per_person`, `price_per_child`.

2. `GET /v1/public/tours/featured`  
Auth: `public`  
Source parity: `GET /api/tours/featured`  
Response: same shape as list tours.

3. `GET /v1/public/tours/{slug}`  
Auth: `public`  
Source parity: `GET /api/tours/[slug]`  
Response fields:
- all list fields plus:
- `TourImages[]`, `Highlights[]`, `OptionalFeatures[]`, `TourInclusion[]`, `TourExclusion[]`, `AdditionalInfos[]`, `TourItineraries[]`.

## 4.2 Customer booking + payment

1. `POST /v1/customer/bookings`  
Auth: `customer`  
Source parity: `POST /api/orders/store` + `validateCreateBookingInput`  
Request body:
```json
{
  "variantId": 123,
  "packageId": 456,
  "departureId": 789,
  "bookingRef": "BST-ABC123",
  "bookingDate": "2026-03-10T00:00:00.000Z",
  "numberOfAdult": 2,
  "numberOfChild": 1,
  "mainContactName": "John Doe",
  "mainContactEmail": "john@example.com",
  "phoneNumber": "+628123456789",
  "pickupLocation": "Ubud",
  "note": "optional"
}
```
Compatibility rule:
- `variantId` may fallback from `packageId` (same as current validator behavior).

2. `GET /v1/customer/bookings`  
Auth: `customer`  
Source parity: `GET /api/bookings`  
Response:
- list of bookings with `Payments`, `Reviews`, and `TourPackage` compat projection.

3. `GET /v1/customer/bookings/{bookingId}`  
Auth: `customer`  
Source parity: `GET /api/booking/[id]`  
Response:
- booking detail + `duration_days` + `endDate` derived.

4. `POST /v1/customer/payments/orders`  
Auth: `customer`  
Source parity: `POST /api/orders`  
Request body:
```json
{ "bookingId": 1001 }
```
Response:
- gateway order payload (currently PayPal create order response passthrough).

5. `POST /v1/customer/payments/orders/{orderId}/capture`  
Auth: `customer`  
Source parity: `POST /api/orders/[orderId]/capture`  
Request body:
```json
{ "bookingId": 1001 }
```
Server checks (must remain in v1):
- order booking ownership check (`custom_id`).
- captured amount equals booking payable total.
- currency guard (`USD` in current flow).

6. `GET /v1/customer/payments/orders/status?orderId={id}`  
Auth: `customer`  
Source parity: `GET /api/orders/status`  
Response:
```json
{ "status": "APPROVED|COMPLETED|..." }
```

7. `POST /v1/customer/reviews`  
Auth: `customer`  
Source parity: `POST /api/review`  
Request:
```json
{
  "rating": 5,
  "review": "Great tour",
  "booking_id": 1001
}
```
Guard:
- booking must belong to user.
- booking status must be `completed`.
- one review per booking.

## 4.3 Admin catalog + operations

1. `GET /v1/admin/tours` and `POST /v1/admin/tours`  
Auth: `admin_read` / `admin_write`  
Source parity: `bstadmin /api/tours`.

2. `PATCH /v1/admin/tours/{id}` and `DELETE /v1/admin/tours/{id}`  
Auth: `admin_write` / `admin_admin_only` for delete  
Source parity: `bstadmin /api/tours/[id]`.

3. `GET /v1/admin/tour-packages` and `POST /v1/admin/tour-packages`  
Auth: `admin_read` / `admin_write`  
Source parity: `bstadmin /api/tour-packages`.

4. `PATCH /v1/admin/tour-packages/{id}` and `DELETE /v1/admin/tour-packages/{id}`  
Auth: `admin_write` / `admin_admin_only`  
Source parity: `bstadmin /api/tour-packages/[id]`.

5. `GET /v1/admin/bookings` and `GET /v1/admin/bookings/{id}`  
Auth: `admin_read`  
Source parity: `bstadmin /api/bookings`.

6. `PATCH /v1/admin/bookings/{id}` and `DELETE /v1/admin/bookings/{id}`  
Auth: `admin_write` / `admin_admin_only`  
Source parity: `bstadmin /api/bookings/[id]`.

7. `POST /v1/admin/booking-fetch` (SSE) and `GET /v1/admin/booking-fetch`  
Auth: `admin_write` / `admin_read`  
Source parity: `bstadmin /api/booking/fetch`.

## 4.4 Admin finance

1. `GET /v1/admin/finance/patterns?packageId={id}`  
2. `POST /v1/admin/finance/patterns`  
3. `GET /v1/admin/finance/patterns/{id}`  
4. `PATCH /v1/admin/finance/patterns/{id}`  
5. `DELETE /v1/admin/finance/patterns/{id}`  
Auth: read/write/admin-only delete as current  
Source parity: `bstadmin /api/finance/patterns*`.

6. `POST /v1/admin/finance/assign-pattern`  
Auth: `admin_write`  
Source parity: `bstadmin /api/finance/assign-pattern`  
Request:
```json
{
  "bookingId": 1001,
  "patternId": 2002
}
```

7. `PUT /v1/admin/finance/bookings/{id}/items`  
Auth: `admin_write`  
Source parity: `bstadmin /api/finance/booking/[id]/items`  
Request:
- `items[]` editable list, optional `markValidated`.
- must keep lock check + tour-date validation behavior.

8. `GET /v1/admin/finance/validate?status=unvalidated|validated|all`  
Auth: `admin_read`  
Source parity: `bstadmin /api/finance/validate`.

## 4.5 New endpoints required for channel mapping (gap closure)

Reason for new endpoints:
- current source has channel-specific booking source values, but no first-class channel catalog mapping table/API.

1. `GET /v1/admin/channels`
2. `POST /v1/admin/channels`
3. `GET /v1/admin/channel-products`
4. `POST /v1/admin/channel-products`
5. `GET /v1/admin/channel-variants`
6. `POST /v1/admin/channel-variants/{id}/map-internal-variant`
7. `GET /v1/admin/channel-sync-logs`

Minimal request payload for mapping endpoint:
```json
{
  "variantId": 123,
  "mappingStatus": "MAPPED"
}
```

## 5) Enum contract (v1)

1. `Booking source/channel`:
- `DIRECT`, `WEB`, `GYG`, `VIATOR`, `BOKUN`, `TRIPDOTCOM`, `MANUAL`.

2. `Booking status` (unified superset to preserve current behavior):
- `DRAFT`, `PENDING_PAYMENT`, `PAID`, `NEW`, `READY`, `ATTENTION`, `COMPLETED`, `DONE`, `UPDATED`, `CANCELLED`, `NO_SHOW`, `REFUNDED`.

3. `Traveler type`:
- `ADULT`, `CHILD`, `INFANT`.

4. `Finance enums`:
- `direction`: `EXPENSE|INCOME`
- `payee_type`: `DRIVER|PARTNER|NONE`
- `unit_type`: `PER_BOOKING|PER_PAX|PER_ADULT|PER_CHILD`

## 6) Compatibility rules (mandatory)

1. Public catalog response keeps legacy aliases during transition:
- `package_id`, `package_name`, `price_per_person`, `price_per_child`.

2. Booking create request keeps accepting `packageId` fallback:
- exact current behavior from `lib/api/validators.ts:117`.

3. Payment capture keeps strict server-side amount validation:
- behavior parity with `app/api/orders/[orderId]/capture/route.ts:156`.

4. Admin finance remains itemized:
- no flattening of `BookingFinanceItem` semantics in v1.
