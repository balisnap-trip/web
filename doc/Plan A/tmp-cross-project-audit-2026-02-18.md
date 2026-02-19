# Temporary Cross-Project Audit Notes

Date: 2026-02-18
Scope: balisnap (public web) + bstadmin (admin/ops)
Status: completed

## Instructions
- Write findings incrementally per module.
- Focus on architecture fit for federated multi-channel catalog.

## Project A: balisnap

### A1. Baseline stack
- Next.js 14 (App Router), React 18, Prisma 5.
- Direct Prisma access from route handlers (no dedicated backend service layer boundary yet).
- Payment via PayPal routes under `app/api/orders`.

### A2. Data model state
- Hybrid schema: v2 models exist (`TourProduct`, `TourVariant`, `Departure`, `VariantRatePlan`, `BookingItem`).
- Legacy models still retained (`TourPackage`, `Booking.package_id` linkage).
- Indicates transitional compatibility architecture (not fully cutover).

### A3. API surface
- Core public API: `/api/tours`, `/api/tours/[slug]`, `/api/orders/*`, `/api/bookings`, `/api/booking/[id]`.
- Public web still served from same codebase as API.

### A4. Auth and boundary
- NextAuth in public web uses social/email providers; session strategy is database.
- No admin role layer for content operations in this project (public app oriented).

### A5. Catalog implementation state
- Public tour APIs now read from v2 (`TourProduct`/`TourVariant`) then map to legacy response shape for UI compatibility.
- Detail API picks primary variant and projects v2 entities to legacy keys.
- UI still strongly coupled to legacy field names (`package_id`, `package_name`, `price_per_person`).

### A6. Booking/payment state
- Booking create already accepts `variantId` and writes `BookingItem` + snapshot.
- Payment create/capture validates against BookingItems aggregate (good hardening).
- Compatibility helper still builds pseudo `TourPackage` object for legacy UI pages.

### A7. Current risk/limitations
- Public web is still monolith (UI + API + business rules in same app).
- Compatibility layer adds complexity and technical debt if long-lived.
- Public app is not ideal as control-plane for multi-channel catalog governance.

## Project B: bstadmin

### B1. Baseline stack
- Next.js 15 + Prisma 6 + NextAuth credentials.
- Strongly admin/ops oriented: bookings, drivers, finance, notification, email ingestion.
- Has role-based protection (`ADMIN`/`STAFF` vs `CUSTOMER`).

### B2. Core business orientation
- Main flow is OTA email ingestion -> parsed booking -> booking lifecycle + finance processing.
- Booking model stores source (`GYG`, `VIATOR`, `TRIPDOTCOM`, etc.) and operational status progression.
- Existing architecture already behaves like control-plane for operations.

### B3. Catalog state in bstadmin
- Catalog tables are still legacy/simple (`Tour`, `TourPackage`) and used by finance patterns (`TourCostPattern.packageId`).
- Tours/packages module exists, but functionally acts as operational master data (not full omnichannel content).

### B4. Data/sync characteristics
- Has bidirectional DB sync utility across peers using timestamp conflict resolution.
- This sync is table-level generic merge; risky if used as primary cross-system integration for evolving schemas.

### B5. Fit against federated channel content reality
- Very good fit for indexing/mapping hub and operational source aggregation.
- Not a good fit to become canonical rich-content CMS for each channel listing as-is.

## Cross-Project Findings

### C1. Domain overlap but different primary purpose
- `balisnap` is optimized for public discovery + direct booking and has richer v2 tour domain.
- `bstadmin` is optimized for operations/finance with OTA ingestion and strict admin workflows.
- Forcing one app to own both concerns increases coupling and regression risk.

### C2. Data model mismatch is the core risk
- `balisnap` already has `TourProduct`/`TourVariant`/`Departure`/`BookingItem`.
- `bstadmin` still anchors finance and operations on `TourPackage` with package-linked cost patterns.
- Without bridging models, cross-channel updates remain manual and fragile.

### C3. Channel reality requires explicit mapping layer
- Real-world rule: GYG/Viator/Web catalogs differ by content, options, and structure.
- A single universal package-content table is insufficient.
- Needed: canonical internal fulfillment model + per-channel listing/mapping model.

### C4. Integration method should not rely on generic table sync
- Existing DB sync utility in `bstadmin` is useful for recovery/bootstrap.
- It is not a robust long-term integration contract between evolving systems.
- Recommended contract: versioned APIs/events + explicit mapping records.

### C5. Best control-plane placement
- Admin/content indexing should stay close to `bstadmin` capabilities (RBAC + operations + finance context).
- Public web should consume published catalog API (read-focused), not own multi-channel governance.

## Candidate Plan Draft

### P1. Architectural direction
- Keep two frontend surfaces:
  - `balisnap` -> public website and direct booking UX.
  - `bstadmin` -> admin/ops/finance + indexing/content governance.
- Introduce dedicated backend service (`api-core`, e.g. NestJS) as the domain boundary.

### P2. Catalog strategy
- Define internal canonical entities for fulfillment:
  - `product`, `variant`, `departure`, `rate_plan`.
- Add channel-specific entities:
  - `channel`, `channel_product`, `channel_variant`, `channel_pricing`, `channel_sync_log`.
- Keep `TourPackage` as legacy adapter until full cutover.

### P3. Migration strategy
- Additive schema first, no destructive drops in early phase.
- Build adapters:
  - `balisnap v2 -> api-core`
  - `bstadmin legacy package -> api-core mapping`.
- Move writes to `api-core`, keep temporary read-compatibility in both apps.

### P4. Execution order
- Phase 1: finalize target schema + mapping rules + API contract.
- Phase 2: implement DB + migration + backfill + reconciliation reports.
- Phase 3: refactor both apps to consume `api-core` and retire duplicate logic.
