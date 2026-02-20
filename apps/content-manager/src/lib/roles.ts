const DEFAULT_ALLOWED_ROLES = ["ADMIN", "MANAGER", "STAFF"];

export function readAllowedRoles(): string[] {
  const raw = process.env.CM_ALLOWED_ROLES?.trim();
  if (!raw) {
    return DEFAULT_ALLOWED_ROLES;
  }

  const parsed = raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ROLES;
}

export function isAllowedRole(role: string | null | undefined): boolean {
  if (!role) {
    return false;
  }
  const normalized = role.trim().toUpperCase();
  if (!normalized) {
    return false;
  }
  return readAllowedRoles().includes(normalized);
}
