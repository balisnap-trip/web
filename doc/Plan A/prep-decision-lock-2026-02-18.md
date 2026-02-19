# Preparation Decision Lock (Phase-1 Closure)

Date: 2026-02-18  
Status: locked for Phase-2 migration build

## 1) Source basis used for lock

1. `balisnap` schema and routes:
- `prisma/schema.prisma:79`, `prisma/schema.prisma:99`, `prisma/schema.prisma:110`, `prisma/schema.prisma:116`
- `app/api/orders/[orderId]/capture/route.ts:156`
- `lib/api/validators.ts:117`

2. `bstadmin` schema and routes:
- `d:/Balisnaptrip/WEB/bstadmin/prisma/schema.prisma:153` (`BookingStatus`)
- `d:/Balisnaptrip/WEB/bstadmin/prisma/schema.prisma:164` (`BookingSource`)
- `d:/Balisnaptrip/WEB/bstadmin/prisma/schema.prisma:418` (`PayeeType`)
- `d:/Balisnaptrip/WEB/bstadmin/prisma/schema.prisma:424` (`UnitType`)
- `d:/Balisnaptrip/WEB/bstadmin/prisma/schema.prisma:431` (`FinanceDirection`)
- `d:/Balisnaptrip/WEB/bstadmin/src/lib/booking/status.ts:20`

## 2) Locked decisions

### 2.1 Booking status unified enum (superset)

Final enum (canonical):
1. `DRAFT`
2. `PENDING_PAYMENT`
3. `PAID`
4. `NEW`
5. `READY`
6. `ATTENTION`
7. `COMPLETED`
8. `DONE`
9. `UPDATED`
10. `CANCELLED`
11. `NO_SHOW`
12. `EXPIRED`
13. `REFUNDED`

Reason:
- preserves direct-web payment lifecycle (`balisnap`).
- preserves OTA/ops lifecycle (`bstadmin`).

### 2.2 Booking source/channel enum

Final enum:
1. `WEB`
2. `DIRECT`
3. `GYG`
4. `VIATOR`
5. `BOKUN`
6. `TRIPDOTCOM`
7. `MANUAL`

Rule:
- `balisnap` current flow maps to `WEB` (or `DIRECT` if needed for backward semantics).
- `bstadmin` sources keep current values.

### 2.3 Finance enum lock

1. `direction`: `EXPENSE`, `INCOME`
2. `payee_type`: `DRIVER`, `PARTNER`, `NONE`
3. `unit_type`: `PER_BOOKING`, `PER_PAX`, `PER_ADULT`, `PER_CHILD`
4. `payee_mode`: `DRIVER_ONLY`, `PARTNER_ONLY`, `EITHER`, `NONE`

Reason:
- must stay identical with current finance logic and validation paths.

### 2.4 Channel mapping minimum columns (mandatory)

Table `channel_product` mandatory columns:
1. `channel_id`
2. `product_id`
3. `external_product_ref` (nullable but unique per channel when present)
4. `display_name`
5. `sync_state`
6. `last_synced_at`

Table `channel_variant` mandatory columns:
1. `channel_product_id`
2. `variant_id` (nullable only during onboarding)
3. `external_variant_ref` (nullable)
4. `mapping_status` (`UNMAPPED|MAPPED|REVIEW`)

Table `channel_sync_log` mandatory columns:
1. `channel_id`
2. `entity_type`
3. `external_ref`
4. `action`
5. `status`
6. `payload`
7. `error_message`
8. `synced_at`

### 2.5 Compatibility lock (transition window)

1. Keep legacy response aliases in public API:
- `package_id`, `package_name`, `price_per_person`, `price_per_child`.

2. Keep booking input compatibility:
- `variantId` fallback from `packageId`.

3. Keep server-side payment amount/currency validation.

4. Keep finance table payload shape unchanged during Phase-2.

### 2.6 Ownership and write policy lock

1. `api-core` becomes future single writer for catalog + mapping domain.
2. During transition:
- no destructive drop on legacy tables.
- no dual-write without reconciliation checks.
3. Existing table-level DB sync (`database-sync.ts`) is not primary domain contract.

## 3) Exit criteria for Phase-1

Phase-1 is complete when these are true:
1. ERD final documented.
2. API contract v1 documented.
3. Migration matrix documented.
4. Enum/mandatory-column decisions locked.
5. Phase-2 migration blueprint documented.
