import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { DatabaseService } from "../database/database.service";

export interface IngestSecurityValidationInput {
  method: string;
  path: string;
  headers: Record<string, unknown>;
  rawBody: Buffer;
}

export interface IngestSecurityValidationResult {
  idempotencyKey: string;
  nonce: string;
  payloadHash: string;
  signatureVerified: boolean;
}

@Injectable()
export class IngestSecurityService {
  private readonly serviceToken: string;
  private readonly serviceSecret: string;
  private readonly driftWindowMs: number;
  private readonly nonceTtlMinutes: number;

  constructor(private readonly databaseService: DatabaseService) {
    this.serviceToken = process.env.INGEST_SERVICE_TOKEN || "dev-service-token";
    this.serviceSecret = process.env.INGEST_SERVICE_SECRET || "dev-service-secret";
    this.driftWindowMs = this.toMinutesMilliseconds(process.env.INGEST_TIMESTAMP_DRIFT_MINUTES, 5);
    this.nonceTtlMinutes = this.toMinutesNumber(process.env.INGEST_NONCE_TTL_MINUTES, 10);
  }

  async validateRequest(input: IngestSecurityValidationInput): Promise<IngestSecurityValidationResult> {
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
    await this.assertNonceUnique(nonce);

    const payloadHash = this.sha256Hex(input.rawBody);
    const canonicalString = [
      input.method.toUpperCase(),
      input.path,
      timestamp,
      nonce,
      idempotencyKey,
      payloadHash
    ].join("\n");

    const expectedSignature = createHmac("sha256", this.serviceSecret)
      .update(canonicalString)
      .digest("hex");

    if (!this.safeEqualHex(signature, expectedSignature)) {
      throw new UnauthorizedException("SIGNATURE_MISMATCH");
    }

    return {
      idempotencyKey,
      nonce,
      payloadHash,
      signatureVerified: true
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

  private async assertNonceUnique(nonce: string) {
    try {
      const result = await this.databaseService.opsQuery(
        `
          select 1
          from ingest_event_log
          where nonce = $1
            and request_received_at >= now() - ($2::int * interval '1 minute')
          limit 1
        `,
        [nonce, this.nonceTtlMinutes]
      );

      if (result.rows.length > 0) {
        throw new UnauthorizedException("NONCE_REUSED");
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const pgErrorCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : null;

      if (pgErrorCode === "42P01") {
        throw new ServiceUnavailableException("INGEST_SCHEMA_NOT_READY");
      }

      throw new ServiceUnavailableException("NONCE_VALIDATION_FAILED");
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

  private toMinutesMilliseconds(input: string | undefined, fallbackMinutes: number): number {
    const value = Number(input);
    const minutes = Number.isFinite(value) && value > 0 ? value : fallbackMinutes;
    return minutes * 60 * 1000;
  }

  private toMinutesNumber(input: string | undefined, fallbackMinutes: number): number {
    const value = Number(input);
    return Number.isFinite(value) && value > 0 ? value : fallbackMinutes;
  }
}
