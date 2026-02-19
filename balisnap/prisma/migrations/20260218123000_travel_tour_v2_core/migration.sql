-- =========================================================
-- Stage 2 - Travel/Tour V2 Core (Additive Migration)
-- =========================================================

-- ---------------------------------------------------------
-- Enums
-- ---------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE "TourServiceType" AS ENUM ('PRIVATE', 'SHARED', 'CUSTOM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DepartureStatus" AS ENUM ('DRAFT', 'OPEN', 'LIMITED', 'CLOSED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "TravelerType" AS ENUM ('ADULT', 'CHILD', 'INFANT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "BookingStatusV2" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'EXPIRED', 'REFUNDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "BookingItemStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PaymentStatusV2" AS ENUM ('PENDING', 'AUTHORIZED', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------
-- New Tables (Catalog v2)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "TourProduct" (
  "product_id" SERIAL NOT NULL,
  "legacy_package_id" INTEGER,
  "product_name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "short_description" TEXT,
  "description" TEXT,
  "category" TEXT,
  "country_code" VARCHAR(2) DEFAULT 'ID',
  "region" TEXT,
  "base_meeting_point" TEXT,
  "is_featured" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "thumbnail_url" TEXT,
  "color_code" TEXT,
  "priority" SMALLINT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TourProduct_pkey" PRIMARY KEY ("product_id")
);

CREATE TABLE IF NOT EXISTS "TourProductMedia" (
  "media_id" SERIAL NOT NULL,
  "product_id" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "alt_text" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_cover" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TourProductMedia_pkey" PRIMARY KEY ("media_id")
);

CREATE TABLE IF NOT EXISTS "TourVariant" (
  "variant_id" SERIAL NOT NULL,
  "product_id" INTEGER NOT NULL,
  "legacy_package_id" INTEGER,
  "variant_code" TEXT NOT NULL,
  "variant_name" TEXT NOT NULL,
  "service_type" "TourServiceType" NOT NULL DEFAULT 'PRIVATE',
  "duration_days" INTEGER NOT NULL,
  "duration_nights" INTEGER,
  "min_pax" INTEGER NOT NULL DEFAULT 1,
  "max_pax" INTEGER,
  "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "booking_cutoff_hours" INTEGER NOT NULL DEFAULT 24,
  "cancellation_policy" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TourVariant_pkey" PRIMARY KEY ("variant_id")
);

CREATE TABLE IF NOT EXISTS "TourVariantMedia" (
  "media_id" SERIAL NOT NULL,
  "variant_id" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "alt_text" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_cover" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TourVariantMedia_pkey" PRIMARY KEY ("media_id")
);

CREATE TABLE IF NOT EXISTS "Departure" (
  "departure_id" SERIAL NOT NULL,
  "variant_id" INTEGER NOT NULL,
  "departure_code" TEXT,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3) NOT NULL,
  "cutoff_at" TIMESTAMP(3),
  "capacity_total" INTEGER NOT NULL,
  "capacity_reserved" INTEGER NOT NULL DEFAULT 0,
  "status" "DepartureStatus" NOT NULL DEFAULT 'OPEN',
  "meeting_point" TEXT,
  "note" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Departure_pkey" PRIMARY KEY ("departure_id")
);

CREATE TABLE IF NOT EXISTS "VariantRatePlan" (
  "rate_plan_id" SERIAL NOT NULL,
  "variant_id" INTEGER NOT NULL,
  "traveler_type" "TravelerType" NOT NULL,
  "price" DECIMAL(65,30) NOT NULL,
  "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "min_quantity" INTEGER,
  "max_quantity" INTEGER,
  "valid_from" TIMESTAMP(3),
  "valid_to" TIMESTAMP(3),
  "season_start" DATE,
  "season_end" DATE,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VariantRatePlan_pkey" PRIMARY KEY ("rate_plan_id")
);

CREATE TABLE IF NOT EXISTS "VariantItinerary" (
  "itinerary_id" SERIAL NOT NULL,
  "variant_id" INTEGER NOT NULL,
  "activity_id" INTEGER,
  "day" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "start_time" TIME(6),
  "end_time" TIME(6),
  "duration_minutes" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VariantItinerary_pkey" PRIMARY KEY ("itinerary_id")
);

CREATE TABLE IF NOT EXISTS "VariantHighlight" (
  "highlight_id" SERIAL NOT NULL,
  "variant_id" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VariantHighlight_pkey" PRIMARY KEY ("highlight_id")
);

CREATE TABLE IF NOT EXISTS "VariantOptionalFeature" (
  "feature_id" SERIAL NOT NULL,
  "variant_id" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VariantOptionalFeature_pkey" PRIMARY KEY ("feature_id")
);

CREATE TABLE IF NOT EXISTS "VariantAdditionalInfo" (
  "info_id" SERIAL NOT NULL,
  "variant_id" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VariantAdditionalInfo_pkey" PRIMARY KEY ("info_id")
);

CREATE TABLE IF NOT EXISTS "VariantInclusion" (
  "variant_id" INTEGER NOT NULL,
  "inclusion_id" INTEGER NOT NULL,
  "sort_order" INTEGER DEFAULT 0,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "variantinclusion_pkey" PRIMARY KEY ("variant_id", "inclusion_id")
);

CREATE TABLE IF NOT EXISTS "VariantExclusion" (
  "variant_id" INTEGER NOT NULL,
  "exclusion_id" INTEGER NOT NULL,
  "sort_order" INTEGER DEFAULT 0,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "variantexclusion_pkey" PRIMARY KEY ("variant_id", "exclusion_id")
);

-- ---------------------------------------------------------
-- New Tables (Booking v2)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "BookingItem" (
  "booking_item_id" SERIAL NOT NULL,
  "booking_id" INTEGER NOT NULL,
  "variant_id" INTEGER NOT NULL,
  "departure_id" INTEGER,
  "item_status" "BookingItemStatus" NOT NULL DEFAULT 'ACTIVE',
  "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "adult_qty" INTEGER NOT NULL DEFAULT 0,
  "child_qty" INTEGER NOT NULL DEFAULT 0,
  "infant_qty" INTEGER NOT NULL DEFAULT 0,
  "adult_unit_price" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "child_unit_price" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "infant_unit_price" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "discount_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "tax_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "total_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("booking_item_id")
);

CREATE TABLE IF NOT EXISTS "BookingTraveler" (
  "traveler_id" SERIAL NOT NULL,
  "booking_item_id" INTEGER NOT NULL,
  "traveler_type" "TravelerType" NOT NULL DEFAULT 'ADULT',
  "title" TEXT,
  "first_name" TEXT NOT NULL,
  "last_name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "birth_date" DATE,
  "nationality" TEXT,
  "passport_number" TEXT,
  "special_request" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingTraveler_pkey" PRIMARY KEY ("traveler_id")
);

-- ---------------------------------------------------------
-- Alter Existing Tables
-- ---------------------------------------------------------
ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "status_v2" "BookingStatusV2",
  ADD COLUMN IF NOT EXISTS "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD';

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "payment_status_v2" "PaymentStatusV2",
  ADD COLUMN IF NOT EXISTS "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "gateway" TEXT,
  ADD COLUMN IF NOT EXISTS "gateway_order_id" TEXT,
  ADD COLUMN IF NOT EXISTS "gateway_capture_id" TEXT,
  ADD COLUMN IF NOT EXISTS "raw_payload" JSONB;

-- ---------------------------------------------------------
-- Indexes / Constraints
-- ---------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "TourProduct_legacy_package_id_key" ON "TourProduct"("legacy_package_id");
CREATE UNIQUE INDEX IF NOT EXISTS "TourProduct_slug_key" ON "TourProduct"("slug");
CREATE INDEX IF NOT EXISTS "tourproduct_active_featured_idx" ON "TourProduct"("is_active", "is_featured");

CREATE INDEX IF NOT EXISTS "tourproductmedia_product_sort_idx" ON "TourProductMedia"("product_id", "sort_order");

CREATE UNIQUE INDEX IF NOT EXISTS "TourVariant_legacy_package_id_key" ON "TourVariant"("legacy_package_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tourvariant_product_code_key" ON "TourVariant"("product_id", "variant_code");
CREATE INDEX IF NOT EXISTS "tourvariant_product_active_idx" ON "TourVariant"("product_id", "is_active");

CREATE INDEX IF NOT EXISTS "tourvariantmedia_variant_sort_idx" ON "TourVariantMedia"("variant_id", "sort_order");

CREATE UNIQUE INDEX IF NOT EXISTS "Departure_departure_code_key" ON "Departure"("departure_code");
CREATE INDEX IF NOT EXISTS "departure_variant_start_idx" ON "Departure"("variant_id", "start_date");
CREATE INDEX IF NOT EXISTS "departure_status_start_idx" ON "Departure"("status", "start_date");

CREATE INDEX IF NOT EXISTS "variantrateplan_variant_type_active_idx" ON "VariantRatePlan"("variant_id", "traveler_type", "is_active");
CREATE INDEX IF NOT EXISTS "variantrateplan_validity_idx" ON "VariantRatePlan"("valid_from", "valid_to");

CREATE INDEX IF NOT EXISTS "variantitinerary_variant_day_sort_idx" ON "VariantItinerary"("variant_id", "day", "sort_order");
CREATE INDEX IF NOT EXISTS "varianthighlight_variant_sort_idx" ON "VariantHighlight"("variant_id", "sort_order");
CREATE INDEX IF NOT EXISTS "variantoptionalfeature_variant_sort_idx" ON "VariantOptionalFeature"("variant_id", "sort_order");
CREATE INDEX IF NOT EXISTS "variantadditionalinfo_variant_sort_idx" ON "VariantAdditionalInfo"("variant_id", "sort_order");

CREATE INDEX IF NOT EXISTS "bookingitem_booking_idx" ON "BookingItem"("booking_id");
CREATE INDEX IF NOT EXISTS "bookingitem_variant_idx" ON "BookingItem"("variant_id");
CREATE INDEX IF NOT EXISTS "bookingitem_departure_idx" ON "BookingItem"("departure_id");
CREATE INDEX IF NOT EXISTS "bookingtraveler_bookingitem_idx" ON "BookingTraveler"("booking_item_id");

CREATE INDEX IF NOT EXISTS "booking_user_date_idx" ON "Booking"("user_id", "booking_date");
CREATE INDEX IF NOT EXISTS "booking_status_idx" ON "Booking"("status");

CREATE INDEX IF NOT EXISTS "payment_booking_status_idx" ON "Payment"("booking_id", "payment_status");
CREATE INDEX IF NOT EXISTS "payment_date_idx" ON "Payment"("payment_date");

-- deduplicate reviews first to allow unique constraint
WITH ranked_reviews AS (
  SELECT
    "review_id",
    ROW_NUMBER() OVER (PARTITION BY "booking_id" ORDER BY "updated_at" DESC, "review_id" DESC) AS rn
  FROM "Review"
)
DELETE FROM "Review" r
USING ranked_reviews rr
WHERE r."review_id" = rr."review_id"
  AND rr.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "review_booking_unique" ON "Review"("booking_id");

-- ---------------------------------------------------------
-- Foreign Keys
-- ---------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE "TourProduct"
    ADD CONSTRAINT "TourProduct_legacy_package_id_fkey"
    FOREIGN KEY ("legacy_package_id") REFERENCES "TourPackage"("package_id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TourProductMedia"
    ADD CONSTRAINT "TourProductMedia_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "TourProduct"("product_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TourVariant"
    ADD CONSTRAINT "TourVariant_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "TourProduct"("product_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TourVariant"
    ADD CONSTRAINT "TourVariant_legacy_package_id_fkey"
    FOREIGN KEY ("legacy_package_id") REFERENCES "TourPackage"("package_id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TourVariantMedia"
    ADD CONSTRAINT "TourVariantMedia_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "TourVariant"("variant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Departure"
    ADD CONSTRAINT "Departure_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "TourVariant"("variant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VariantRatePlan"
    ADD CONSTRAINT "VariantRatePlan_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "TourVariant"("variant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VariantItinerary"
    ADD CONSTRAINT "VariantItinerary_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "TourVariant"("variant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VariantItinerary"
    ADD CONSTRAINT "VariantItinerary_activity_id_fkey"
    FOREIGN KEY ("activity_id") REFERENCES "Activity"("activity_id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VariantHighlight"
    ADD CONSTRAINT "VariantHighlight_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "TourVariant"("variant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VariantOptionalFeature"
    ADD CONSTRAINT "VariantOptionalFeature_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "TourVariant"("variant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VariantAdditionalInfo"
    ADD CONSTRAINT "VariantAdditionalInfo_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "TourVariant"("variant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VariantInclusion"
    ADD CONSTRAINT "fk_variant_inclusion_variant"
    FOREIGN KEY ("variant_id") REFERENCES "TourVariant"("variant_id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VariantInclusion"
    ADD CONSTRAINT "fk_variant_inclusion"
    FOREIGN KEY ("inclusion_id") REFERENCES "Inclusion"("inclusion_id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VariantExclusion"
    ADD CONSTRAINT "fk_variant_exclusion_variant"
    FOREIGN KEY ("variant_id") REFERENCES "TourVariant"("variant_id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VariantExclusion"
    ADD CONSTRAINT "fk_variant_exclusion"
    FOREIGN KEY ("exclusion_id") REFERENCES "Exclusion"("exclusion_id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "BookingItem"
    ADD CONSTRAINT "BookingItem_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "Booking"("booking_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "BookingItem"
    ADD CONSTRAINT "BookingItem_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "TourVariant"("variant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "BookingItem"
    ADD CONSTRAINT "BookingItem_departure_id_fkey"
    FOREIGN KEY ("departure_id") REFERENCES "Departure"("departure_id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "BookingTraveler"
    ADD CONSTRAINT "BookingTraveler_booking_item_id_fkey"
    FOREIGN KEY ("booking_item_id") REFERENCES "BookingItem"("booking_item_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------
-- Backfill: Catalog
-- ---------------------------------------------------------
INSERT INTO "TourProduct" (
  "legacy_package_id",
  "product_name",
  "slug",
  "short_description",
  "description",
  "is_featured",
  "is_active",
  "thumbnail_url",
  "color_code",
  "priority",
  "created_at",
  "updated_at"
)
SELECT
  tp."package_id",
  tp."package_name",
  tp."slug",
  tp."short_description",
  tp."description",
  tp."is_featured",
  true,
  tp."thumbnail_url",
  tp."color_code",
  tp."priority",
  tp."created_at",
  COALESCE(tp."updated_at", CURRENT_TIMESTAMP)
FROM "TourPackage" tp
ON CONFLICT ("legacy_package_id") DO NOTHING;

INSERT INTO "TourVariant" (
  "product_id",
  "legacy_package_id",
  "variant_code",
  "variant_name",
  "service_type",
  "duration_days",
  "duration_nights",
  "min_pax",
  "max_pax",
  "currency_code",
  "is_default",
  "is_active",
  "booking_cutoff_hours",
  "created_at",
  "updated_at"
)
SELECT
  p."product_id",
  tp."package_id",
  'BASE',
  tp."package_name",
  'PRIVATE'::"TourServiceType",
  GREATEST(COALESCE(tp."duration_days", 1), 1),
  GREATEST(COALESCE(tp."duration_days", 1) - 1, 0),
  GREATEST(COALESCE(tp."min_booking", 1), 1),
  tp."max_booking",
  'USD',
  true,
  true,
  24,
  tp."created_at",
  COALESCE(tp."updated_at", CURRENT_TIMESTAMP)
FROM "TourPackage" tp
JOIN "TourProduct" p
  ON p."legacy_package_id" = tp."package_id"
ON CONFLICT ("legacy_package_id") DO NOTHING;

-- product cover from legacy thumbnail
INSERT INTO "TourProductMedia" (
  "product_id",
  "url",
  "alt_text",
  "sort_order",
  "is_cover",
  "created_at"
)
SELECT
  p."product_id",
  tp."thumbnail_url",
  tp."package_name",
  0,
  true,
  COALESCE(tp."created_at", CURRENT_TIMESTAMP)
FROM "TourPackage" tp
JOIN "TourProduct" p
  ON p."legacy_package_id" = tp."package_id"
WHERE tp."thumbnail_url" IS NOT NULL
  AND tp."thumbnail_url" <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "TourProductMedia" tpm
    WHERE tpm."product_id" = p."product_id"
      AND tpm."url" = tp."thumbnail_url"
  );

-- gallery media from legacy tour images
INSERT INTO "TourProductMedia" (
  "product_id",
  "url",
  "alt_text",
  "sort_order",
  "is_cover",
  "created_at"
)
SELECT
  p."product_id",
  ti."url",
  tp."package_name",
  10,
  false,
  COALESCE(ti."created_at", CURRENT_TIMESTAMP)
FROM "TourImage" ti
JOIN "TourPackage" tp
  ON tp."package_id" = ti."tour_id"
JOIN "TourProduct" p
  ON p."legacy_package_id" = tp."package_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "TourProductMedia" tpm
  WHERE tpm."product_id" = p."product_id"
    AND tpm."url" = ti."url"
);

-- itinerary backfill
INSERT INTO "VariantItinerary" (
  "variant_id",
  "activity_id",
  "day",
  "sort_order",
  "title",
  "description",
  "location",
  "start_time",
  "created_at",
  "updated_at"
)
SELECT
  tv."variant_id",
  ti."activity_id",
  GREATEST(COALESCE(ti."day", 1), 1),
  ROW_NUMBER() OVER (
    PARTITION BY tv."variant_id", GREATEST(COALESCE(ti."day", 1), 1)
    ORDER BY ti."start_time", ti."itinerary_id"
  ) - 1,
  COALESCE(a."activity_name", 'Itinerary Item'),
  a."description",
  a."location",
  ti."start_time",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "TourItinerary" ti
JOIN "TourVariant" tv
  ON tv."legacy_package_id" = ti."package_id"
LEFT JOIN "Activity" a
  ON a."activity_id" = ti."activity_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "VariantItinerary" vi
  WHERE vi."variant_id" = tv."variant_id"
    AND vi."activity_id" = ti."activity_id"
    AND vi."day" = GREATEST(COALESCE(ti."day", 1), 1)
    AND vi."start_time" IS NOT DISTINCT FROM ti."start_time"
);

-- highlights
INSERT INTO "VariantHighlight" (
  "variant_id",
  "description",
  "sort_order",
  "created_at"
)
SELECT
  tv."variant_id",
  h."description",
  ROW_NUMBER() OVER (PARTITION BY tv."variant_id" ORDER BY h."highlight_id") - 1,
  COALESCE(h."created_at", CURRENT_TIMESTAMP)
FROM "Highlight" h
JOIN "TourVariant" tv
  ON tv."legacy_package_id" = h."tour_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "VariantHighlight" vh
  WHERE vh."variant_id" = tv."variant_id"
    AND vh."description" = h."description"
);

-- optional features
INSERT INTO "VariantOptionalFeature" (
  "variant_id",
  "description",
  "sort_order",
  "created_at"
)
SELECT
  tv."variant_id",
  ofe."description",
  ROW_NUMBER() OVER (PARTITION BY tv."variant_id" ORDER BY ofe."feature_id") - 1,
  COALESCE(ofe."created_at", CURRENT_TIMESTAMP)
FROM "OptionalFeature" ofe
JOIN "TourVariant" tv
  ON tv."legacy_package_id" = ofe."tour_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "VariantOptionalFeature" vof
  WHERE vof."variant_id" = tv."variant_id"
    AND vof."description" = ofe."description"
);

-- additional infos
INSERT INTO "VariantAdditionalInfo" (
  "variant_id",
  "description",
  "sort_order",
  "created_at"
)
SELECT
  tv."variant_id",
  ai."description",
  ROW_NUMBER() OVER (PARTITION BY tv."variant_id" ORDER BY ai."info_id") - 1,
  COALESCE(ai."created_at", CURRENT_TIMESTAMP)
FROM "AdditionalInfo" ai
JOIN "TourVariant" tv
  ON tv."legacy_package_id" = ai."tour_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "VariantAdditionalInfo" vai
  WHERE vai."variant_id" = tv."variant_id"
    AND vai."description" = ai."description"
);

-- inclusions / exclusions
INSERT INTO "VariantInclusion" (
  "variant_id",
  "inclusion_id",
  "created_at"
)
SELECT
  tv."variant_id",
  ti."inclusion_id",
  COALESCE(ti."created_at", CURRENT_TIMESTAMP)
FROM "TourInclusion" ti
JOIN "TourVariant" tv
  ON tv."legacy_package_id" = ti."tour_id"
ON CONFLICT ("variant_id", "inclusion_id") DO NOTHING;

INSERT INTO "VariantExclusion" (
  "variant_id",
  "exclusion_id",
  "created_at"
)
SELECT
  tv."variant_id",
  te."exclusion_id",
  COALESCE(te."created_at", CURRENT_TIMESTAMP)
FROM "TourExclusion" te
JOIN "TourVariant" tv
  ON tv."legacy_package_id" = te."tour_id"
ON CONFLICT ("variant_id", "exclusion_id") DO NOTHING;

-- simple base rate plans from legacy package prices
INSERT INTO "VariantRatePlan" (
  "variant_id",
  "traveler_type",
  "price",
  "currency_code",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  tv."variant_id",
  'ADULT'::"TravelerType",
  tp."price_per_person",
  'USD',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "TourVariant" tv
JOIN "TourPackage" tp
  ON tp."package_id" = tv."legacy_package_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "VariantRatePlan" vrp
  WHERE vrp."variant_id" = tv."variant_id"
    AND vrp."traveler_type" = 'ADULT'
);

INSERT INTO "VariantRatePlan" (
  "variant_id",
  "traveler_type",
  "price",
  "currency_code",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  tv."variant_id",
  'CHILD'::"TravelerType",
  COALESCE(tp."price_per_child", tp."price_per_person" / 2),
  'USD',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "TourVariant" tv
JOIN "TourPackage" tp
  ON tp."package_id" = tv."legacy_package_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "VariantRatePlan" vrp
  WHERE vrp."variant_id" = tv."variant_id"
    AND vrp."traveler_type" = 'CHILD'
);

-- ---------------------------------------------------------
-- Backfill: Booking / Payment V2
-- ---------------------------------------------------------
UPDATE "Booking"
SET "status_v2" = CASE
  WHEN "status" = 'waiting' THEN 'PENDING_PAYMENT'::"BookingStatusV2"
  WHEN "status" = 'pending' THEN 'PENDING_PAYMENT'::"BookingStatusV2"
  WHEN "status" = 'paid' THEN 'PAID'::"BookingStatusV2"
  WHEN "status" = 'completed' THEN 'COMPLETED'::"BookingStatusV2"
  WHEN "status" = 'cancelled' THEN 'CANCELLED'::"BookingStatusV2"
  ELSE 'DRAFT'::"BookingStatusV2"
END
WHERE "status_v2" IS NULL;

UPDATE "Payment"
SET "payment_status_v2" = CASE
  WHEN UPPER("payment_status") = 'COMPLETED' THEN 'COMPLETED'::"PaymentStatusV2"
  WHEN UPPER("payment_status") = 'PENDING' THEN 'PENDING'::"PaymentStatusV2"
  WHEN UPPER("payment_status") = 'FAILED' THEN 'FAILED'::"PaymentStatusV2"
  WHEN UPPER("payment_status") = 'CANCELLED' THEN 'CANCELLED'::"PaymentStatusV2"
  WHEN UPPER("payment_status") = 'REFUNDED' THEN 'REFUNDED'::"PaymentStatusV2"
  ELSE 'PENDING'::"PaymentStatusV2"
END
WHERE "payment_status_v2" IS NULL;

-- Backfill one booking item per legacy booking
INSERT INTO "BookingItem" (
  "booking_id",
  "variant_id",
  "departure_id",
  "item_status",
  "currency_code",
  "adult_qty",
  "child_qty",
  "infant_qty",
  "adult_unit_price",
  "child_unit_price",
  "infant_unit_price",
  "subtotal",
  "discount_amount",
  "tax_amount",
  "total_amount",
  "snapshot",
  "created_at",
  "updated_at"
)
SELECT
  b."booking_id",
  tv."variant_id",
  NULL,
  CASE
    WHEN b."status" = 'cancelled' THEN 'CANCELLED'::"BookingItemStatus"
    WHEN b."status" = 'completed' THEN 'COMPLETED'::"BookingItemStatus"
    ELSE 'ACTIVE'::"BookingItemStatus"
  END,
  b."currency_code",
  COALESCE(b."number_of_adult", 0),
  COALESCE(b."number_of_child", 0),
  0,
  COALESCE(tp."price_per_person", 0),
  COALESCE(tp."price_per_child", tp."price_per_person" / 2),
  0,
  COALESCE(b."total_price", 0),
  0,
  0,
  COALESCE(b."total_price", 0),
  jsonb_build_object(
    'legacy_package_id', b."package_id",
    'booking_ref', b."booking_ref",
    'tour_name', tp."package_name",
    'tour_slug', tp."slug"
  ),
  b."created_at",
  COALESCE(b."updated_at", CURRENT_TIMESTAMP)
FROM "Booking" b
JOIN "TourVariant" tv
  ON tv."legacy_package_id" = b."package_id"
LEFT JOIN "TourPackage" tp
  ON tp."package_id" = b."package_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "BookingItem" bi
  WHERE bi."booking_id" = b."booking_id"
    AND bi."variant_id" = tv."variant_id"
);
