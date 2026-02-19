import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "crypto";

export interface IngestSecurityValidationInput {
  method: string;
  path: string;
  headers: Record<string, unknown>;
  rawBody: Buffer;
}

export interface IngestSecurityValidationResult {
  idempotencyKey: string;
}

@Injectable()
export class IngestSecurityService {
  private readonly nonceStore = new Map<string, number>();
  private readonly serviceToken: string;
  private readonly serviceSecret: string;
  private readonly driftWindowMs: number;
  private readonly nonceTtlMs: number;

  constructor() {
    this.serviceToken = process.env.INGEST_SERVICE_TOKEN || "dev-service-token";
    this.serviceSecret = process.env.INGEST_SERVICE_SECRET || "dev-service-secret";
    this.driftWindowMs = this.toMinutes(process.env.INGEST_TIMESTAMP_DRIFT_MINUTES, 5);
    this.nonceTtlMs = this.toMinutes(process.env.INGEST_NONCE_TTL_MINUTES, 10);
  }

  validateRequest(input: IngestSecurityValidationInput): IngestSecurityValidationResult {
    const authorization = this.getHeader(input.headers, "authorization");
    const signature = this.getHeader(input.headers, "x-signature");
    const signatureAlgorithm = this.getHeader(input.headers, "x-signature-algorithm");
    const timestamp = this.getHeader(input.headers, "x-timestamp");
    const nonce = this.getHeader(input.headers, "x-nonce");
    const idempotencyKey = this.getHeader(input.headers, "x-idempotency-key");

    if (!authorization || !authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException("MISSING_OR_INVALID_AUTHORIZATION");
    }

    const token = authorization.slice("Bearer ".length).trim();
    if (token !== this.serviceToken) {
      throw new UnauthorizedException("INVALID_SERVICE_TOKEN");
    }

    if (!signature || !signatureAlgorithm || !timestamp || !nonce || !idempotencyKey) {
      throw new BadRequestException("MISSING_REQUIRED_INGEST_HEADERS");
    }

    if (signatureAlgorithm !== "HMAC-SHA256") {
      throw new UnauthorizedException("UNSUPPORTED_SIGNATURE_ALGORITHM");
    }

    this.assertTimestampDrift(timestamp);
    this.assertNonceUnique(nonce);

    const bodyHash = this.sha256Hex(input.rawBody);
    const canonicalString = [
      input.method.toUpperCase(),
      input.path,
      timestamp,
      nonce,
      idempotencyKey,
      bodyHash
    ].join("\n");

    const expectedSignature = createHmac("sha256", this.serviceSecret)
      .update(canonicalString)
      .digest("hex");

    if (!this.safeEqualHex(signature, expectedSignature)) {
      throw new UnauthorizedException("SIGNATURE_MISMATCH");
    }

    return {
      idempotencyKey
    };
  }

  private assertTimestampDrift(timestamp: string) {
    const parsed = Date.parse(timestamp);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException("INVALID_TIMESTAMP_FORMAT");
    }

    const drift = Math.abs(Date.now() - parsed);
    if (drift > this.driftWindowMs) {
      throw new UnauthorizedException("TIMESTAMP_DRIFT_EXCEEDED");
    }
  }

  private assertNonceUnique(nonce: string) {
    this.cleanupExpiredNonces();

    const activeUntil = this.nonceStore.get(nonce);
    if (activeUntil && activeUntil > Date.now()) {
      throw new UnauthorizedException("NONCE_REUSED");
    }

    this.nonceStore.set(nonce, Date.now() + this.nonceTtlMs);
  }

  private cleanupExpiredNonces() {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.nonceStore.entries()) {
      if (expiresAt <= now) {
        this.nonceStore.delete(nonce);
      }
    }
  }

  private getHeader(headers: Record<string, unknown>, key: string): string | undefined {
    const keyVariants = [key, key.toLowerCase(), key.toUpperCase()];

    for (const variant of keyVariants) {
      const value = headers[variant];
      if (typeof value === "string") {
        return value;
      }
      if (Array.isArray(value) && typeof value[0] === "string") {
        return value[0];
      }
    }

    return undefined;
  }

  private safeEqualHex(actual: string, expected: string): boolean {
    try {
      const actualBuffer = Buffer.from(actual, "hex");
      const expectedBuffer = Buffer.from(expected, "hex");
      if (actualBuffer.length !== expectedBuffer.length) {
        return false;
      }
      return timingSafeEqual(actualBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  private sha256Hex(rawBody: Buffer): string {
    return createHash("sha256").update(rawBody).digest("hex");
  }

  private toMinutes(input: string | undefined, fallbackMinutes: number): number {
    const value = Number(input);
    const minutes = Number.isFinite(value) && value > 0 ? value : fallbackMinutes;
    return minutes * 60 * 1000;
  }
}
