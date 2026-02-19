import { SetMetadata } from "@nestjs/common";

export const ADMIN_ROLES_METADATA_KEY = "adminRoles";

export type AdminRole = "ADMIN" | "STAFF" | "MANAGER";

export const RequireAdminRoles = (...roles: AdminRole[]) =>
  SetMetadata(ADMIN_ROLES_METADATA_KEY, roles);
