import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ADMIN_ROLES_METADATA_KEY, AdminRole } from "./admin-auth.decorator";

interface RequestLike {
  headers?: Record<string, unknown>;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.isEnabled()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestLike>();
    const headers = request?.headers ?? {};
    const authorization = this.getHeader(headers, "authorization");
    if (!authorization || !authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException("ADMIN_AUTH_REQUIRED");
    }

    const token = authorization.slice("Bearer ".length).trim();
    if (!token || token !== this.getExpectedToken()) {
      throw new UnauthorizedException("INVALID_ADMIN_TOKEN");
    }

    const requiredRoles =
      this.reflector.getAllAndOverride<AdminRole[]>(ADMIN_ROLES_METADATA_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    if (requiredRoles.length === 0) {
      return true;
    }

    const role = this.getHeader(headers, "x-admin-role");
    if (!role) {
      throw new ForbiddenException(`ADMIN_ROLE_REQUIRED:${requiredRoles.join(",")}`);
    }

    const normalizedRole = role.trim().toUpperCase();
    if (!requiredRoles.includes(normalizedRole as AdminRole)) {
      throw new ForbiddenException(`ADMIN_ROLE_FORBIDDEN:${normalizedRole}`);
    }

    return true;
  }

  private isEnabled(): boolean {
    return this.readBoolean(process.env.ADMIN_AUTH_ENABLED, true);
  }

  private getExpectedToken(): string {
    const token = process.env.CORE_API_ADMIN_TOKEN?.trim();
    return token || "dev-admin-token";
  }

  private getHeader(headers: Record<string, unknown>, name: string): string | null {
    const direct = headers[name];
    if (typeof direct === "string") {
      return direct;
    }

    const lowerCaseName = name.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() !== lowerCaseName) {
        continue;
      }
      const value = headers[key];
      if (typeof value === "string") {
        return value;
      }
    }

    return null;
  }

  private readBoolean(rawValue: string | undefined, fallback: boolean): boolean {
    if (rawValue === undefined) {
      return fallback;
    }
    const normalized = rawValue.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }
}
