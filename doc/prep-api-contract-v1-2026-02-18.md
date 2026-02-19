# API Contract v1 (Detailed Contract Spec)

Tanggal baseline: 2026-02-18  
Update lock: 2026-02-19  
Standar: REST + OpenAPI 3.1

Dokumen ini adalah spesifikasi implementasi kontrak lintas app, bukan hanya daftar endpoint.

## 1. Global Contract Rules

1. Prefix endpoint baru: `/v1`.
2. Semua response JSON.
3. Error envelope standard:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "field X is required",
    "details": {},
    "requestId": "req_..."
  }
}
```

4. Success envelope default:

```json
{
  "data": {},
  "meta": {
    "requestId": "req_...",
    "timestamp": "2026-02-18T10:00:00Z"
  }
}
```

5. Waktu selalu UTC ISO-8601.
6. Semua endpoint write wajib idempotent jika dipanggil ulang.

## 2. Auth and Security Contract

1. Public catalog read:
   1. no auth,
   2. rate-limit by IP.
2. Customer endpoints:
   1. session/JWT customer.
3. Internal ingestion endpoints:
   1. `authorization: Bearer <service-token>`,
   2. `x-signature`,
   3. `x-signature-algorithm: HMAC-SHA256`,
   4. `x-timestamp` (UTC ISO-8601),
   5. `x-nonce`,
   6. `x-idempotency-key`.
4. Admin endpoints:
   1. `authorization: Bearer <admin-token>`,
   2. `x-admin-role` in (`ADMIN`, `STAFF`, `MANAGER`),
   3. RBAC enforced per endpoint capability (read vs write).

## 2.1 Signature Canonicalization (Locked)

1. Canonical string:

```text
{HTTP_METHOD}\n{REQUEST_PATH}\n{X_TIMESTAMP}\n{X_NONCE}\n{X_IDEMPOTENCY_KEY}\n{SHA256_HEX_REQUEST_BODY}
```

2. Signature generation:
   1. `signature = HEX(HMAC_SHA256(service_secret, canonical_string))`.
3. Validation rules:
   1. `x-signature-algorithm` wajib `HMAC-SHA256`,
   2. timestamp drift window maksimum `5 menit`,
   3. `x-nonce` wajib unik selama `10 menit`,
   4. request ditolak jika signature mismatch / nonce reuse / drift lewat batas.

## 2.2 Replay and Idempotency Retention (Locked)

1. Nonce TTL: `10 menit`.
2. Idempotency key TTL: `35 hari`.
3. Duplicate dengan `x-idempotency-key` sama harus mengembalikan hasil pertama (status + body semantik sama).

## 3. Canonical Schemas (v1)

## 3.1 BookingIngestEventV1

```json
{
  "payloadVersion": "v1",
  "eventType": "CREATED",
  "eventTime": "2026-02-18T10:00:00Z",
  "source": "DIRECT",
  "externalBookingRef": "WEB-12345",
  "customer": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+628..."
  },
  "booking": {
    "tourDate": "2026-03-01",
    "tourTime": "09:00",
    "adult": 2,
    "child": 1,
    "currency": "USD",
    "totalPrice": 150.0,
    "pickupLocation": "Kuta",
    "meetingPoint": "Hotel Lobby",
    "note": "optional"
  },
  "raw": {
    "providerPayload": {}
  }
}
```

Validation minimum:

1. `payloadVersion` wajib `v1`.
2. `eventType` in (`CREATED`, `UPDATED`, `CANCELLED`).
3. `eventTime` valid datetime.
4. `source` valid enum source contract.
5. `externalBookingRef` non-empty.
6. `booking.totalPrice` non-negative.

## 3.2 CatalogItemV1

```json
{
  "itemId": "cat_123",
  "slug": "hidden-gems-bali",
  "name": "Hidden Gems Bali",
  "isActive": true,
  "isFeatured": false,
  "description": "...",
  "variants": [
    {
      "variantId": "var_123",
      "name": "Private Tour",
      "durationDays": 1,
      "currency": "USD",
      "rates": [
        { "travelerType": "ADULT", "price": 100 },
        { "travelerType": "CHILD", "price": 70 }
      ]
    }
  ],
  "media": [
    { "url": "https://...", "isCover": true, "sortOrder": 0 }
  ]
}
```

Compatibility fields (locked for transition):

1. legacy aliases tetap tersedia di `v1`:
   1. `package_id`,
   2. `package_name`,
   3. `price_per_person`,
   4. `price_per_child`.
2. field canonical wajib ikut dikirim:
   1. `packageRefType` (`LEGACY_PACKAGE` | `CATALOG_PRODUCT` | `CATALOG_VARIANT`),
   2. `packageRefKey` (UUID canonical),
   3. `legacyPackageId` (integer legacy, nullable).

Sunset policy:

1. target `LEGACY_PACKAGE` tanpa `packageRefKey` = 0 pada `2026-09-30`.
2. setelah target tercapai, legacy aliases dihapus di `v2`.

## 4. Endpoint Specification

## 4.1 Catalog Read APIs

1. `GET /v1/catalog/items`
   1. query: `page`, `limit`, `featured`, `active`, `q`
   2. response: paginated `CatalogItemV1[]`
   3. status: `200`, `400`, `429`, `500`
2. `GET /v1/catalog/items/{slug}`
   1. response: `CatalogItemV1`
   2. status: `200`, `404`, `500`
3. `GET /v1/catalog/items/featured`
   1. response: featured list
   2. status: `200`, `500`

## 4.2 Ingestion APIs

1. `POST /v1/ingest/bookings/events`
   1. auth: signed internal request
   2. body: `BookingIngestEventV1`
   3. response: accepted event metadata
   4. status: `202`, `400`, `401`, `409`, `422`, `500`
2. `GET /v1/ingest/bookings/events/{eventId}`
   1. response: processing status + result
   2. status: `200`, `404`, `500`
3. `POST /v1/ingest/bookings/events/{eventId}/replay`
   1. auth: admin token + role header (`x-admin-role`)
   2. status: `202`, `404`, `409`, `500`

## 4.3 Ops Booking APIs

1. `GET /v1/ops/bookings`
   1. filters: `status`, `source`, `dateFrom`, `dateTo`, `q`
   2. status: `200`, `400`, `401`, `500`
2. `GET /v1/ops/bookings/{id}`
   1. status: `200`, `401`, `404`, `500`
3. `PATCH /v1/ops/bookings/{id}`
   1. editable: note, meetingPoint, package mapping refs
   2. status: `200`, `400`, `401`, `404`, `500`
4. `POST /v1/ops/bookings/{id}/assign`
   1. input: `driverId`
   2. effect: assignment + status recompute
   3. status: `200`, `400`, `401`, `404`, `500`
5. `POST /v1/ops/bookings/{id}/status/sync`
   1. effect: recompute ops status deterministic
   2. status: `200`, `401`, `404`, `500`

## 4.4 Channel Mapping APIs

1. `GET /v1/channel-mappings`
2. `POST /v1/channel-mappings`
3. `PATCH /v1/channel-mappings/{id}`
4. `GET /v1/channel-mappings/unmapped`

Status codes:

1. `200`, `201`, `400`, `401`, `404`, `409`, `500`

## 4.5 Catalog Publish APIs

1. `POST /v1/catalog/publish/jobs`
2. `GET /v1/catalog/publish/jobs/{jobId}`
3. `POST /v1/catalog/publish/jobs/{jobId}/retry`

## 5. Idempotency, Queue, and Replay Rules

1. Primary key idempotency:
   1. `x-idempotency-key`.
2. Secondary dedup key:
   1. `source + externalBookingRef + eventType + eventTimeNormalized`.
3. `eventTimeNormalized`:
   1. UTC,
   2. truncated ke detik.
4. Duplicate event:
   1. return previous accepted result,
   2. do not create duplicate aggregate row.
5. Queue runtime contract:
   1. broker `Redis + BullMQ`,
   2. retry `30s, 2m, 10m, 30m, 2h` (max 5 attempt),
   3. non-retryable -> DLQ,
   4. poison message hanya lewat replay endpoint ter-audit.
6. Replay flow:
   1. only for failed/terminal-retry events,
   2. replay action audited.

## 6. Versioning Policy

1. Breaking changes untuk API publik/eksternal:
   1. create `v2`,
   2. maintain `v1` for deprecation window.
2. Non-breaking changes:
   1. only additive optional fields.
3. Deprecation:
   1. announce timeline,
   2. include migration notes.

## 7. Compatibility Bridge Policy (Scope Clarification)

1. Hard cut route alias berlaku untuk endpoint internal/private non-versioned (contoh route app internal yang bukan `/v1`).
2. API publik/eksternal yang sudah versioned tetap mengikuti policy deprecation versioning (`v1` -> `v2`).
3. Untuk endpoint yang direstrukturisasi karena standard naming di internal:
   1. canonical route langsung menjadi satu-satunya route aktif,
   2. semua consumer internal harus di-upgrade pada release yang sama.
4. Adapter layer tetap wajib eksplisit dan testable untuk compatibility payload/data, bukan route alias.
5. Rollback strategi:
   1. rollback via release rollback,
   2. bukan dengan menghidupkan kembali alias route lama.
