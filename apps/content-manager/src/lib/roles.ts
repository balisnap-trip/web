const DEFAULT_ALLOWED_ROLES = ["ADMIN", "MANAGER", "STAFF"];
const DEFAULT_CATALOG_EDITOR_ROLES = DEFAULT_ALLOWED_ROLES;
const DEFAULT_PUBLISH_REVIEWER_ROLES = DEFAULT_ALLOWED_ROLES;
const DEFAULT_PUBLISHER_ROLES = DEFAULT_ALLOWED_ROLES;
const DEFAULT_PUBLISH_RETRY_ROLES = DEFAULT_ALLOWED_ROLES;

function parseRoles(rawValue: string | undefined, fallback: string[]): string[] {
  const raw = rawValue?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : fallback;
}

function normalizeRole(role: string | null | undefined): string {
  if (!role) {
    return "";
  }
  return role.trim().toUpperCase();
}

function hasRole(role: string | null | undefined, allowedRoles: string[]): boolean {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return false;
  }
  return allowedRoles.includes(normalizedRole);
}

export function readAllowedRoles(): string[] {
  return parseRoles(process.env.CM_ALLOWED_ROLES, DEFAULT_ALLOWED_ROLES);
}

export function readCatalogEditorRoles(): string[] {
  return parseRoles(process.env.CM_CATALOG_EDITOR_ROLES, DEFAULT_CATALOG_EDITOR_ROLES);
}

export function readPublishReviewerRoles(): string[] {
  return parseRoles(process.env.CM_PUBLISH_REVIEWER_ROLES, DEFAULT_PUBLISH_REVIEWER_ROLES);
}

export function readPublisherRoles(): string[] {
  return parseRoles(process.env.CM_PUBLISHER_ROLES, DEFAULT_PUBLISHER_ROLES);
}

export function readPublishRetryRoles(): string[] {
  return parseRoles(process.env.CM_PUBLISH_RETRY_ROLES, DEFAULT_PUBLISH_RETRY_ROLES);
}

export function isAllowedRole(role: string | null | undefined): boolean {
  return hasRole(role, readAllowedRoles());
}

export function canEditCatalog(role: string | null | undefined): boolean {
  return hasRole(role, readCatalogEditorRoles());
}

export function canSubmitPublishReview(role: string | null | undefined): boolean {
  return hasRole(role, readPublishReviewerRoles());
}

export function canPublishCatalog(role: string | null | undefined): boolean {
  return hasRole(role, readPublisherRoles());
}

export function canRetryPublish(role: string | null | undefined): boolean {
  return hasRole(role, readPublishRetryRoles());
}
