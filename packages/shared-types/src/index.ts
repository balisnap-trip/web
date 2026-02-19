export type CustomerPaymentStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "PAID"
  | "FAILED"
  | "REFUNDED";

export type OpsFulfillmentStatus =
  | "NEW"
  | "READY"
  | "ATTENTION"
  | "COMPLETED"
  | "DONE"
  | "UPDATED"
  | "CANCELLED"
  | "NO_SHOW";

export type ChannelCode = "DIRECT" | "GYG" | "VIATOR" | "BOKUN" | "TRIPDOTCOM" | "MANUAL";

export type PackageRefType = "LEGACY_PACKAGE" | "CATALOG_PRODUCT" | "CATALOG_VARIANT";
