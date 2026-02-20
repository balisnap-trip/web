import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException
} from "@nestjs/common";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { AuditService } from "../audit/audit.service";
import { CatalogEditorItem, CatalogEditorService } from "./catalog-editor.service";

export type CatalogPublishJobStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "FAILED";

export interface CatalogPublishJob {
  jobId: string;
  payloadVersion: "v1";
  status: CatalogPublishJobStatus;
  itemIds: string[];
  itemCount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  reviewedBy: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  snapshotPath: string | null;
  checksum: string | null;
  failureReason: string | null;
}

export interface CatalogPublishDraftInput {
  itemIds?: string[];
  note?: string;
  payloadVersion?: "v1";
}

export interface CatalogPublishSignedRequest {
  method: string;
  path: string;
  headers: Record<string, unknown>;
  rawBody: Buffer;
}

interface CatalogPublishPayloadV1 {
  payloadVersion: "v1";
  generatedAt: string;
  jobId: string;
  items: CatalogEditorItem[];
}

@Injectable()
export class CatalogPublishService implements OnModuleInit {
  private readonly jobs = new Map<string, CatalogPublishJob>();
  private readonly maxJobs = 1000;
  private readonly persistenceEnabled = this.readBoolean(process.env.CATALOG_PUBLISH_PERSISTENCE_ENABLED, true);
  private readonly jobsPath = path.resolve(
    process.cwd(),
    process.env.CATALOG_PUBLISH_JOBS_PATH || "reports/publish/catalog-jobs.ndjson"
  );
  private readonly publishDir = path.resolve(
    process.cwd(),
    process.env.CATALOG_PUBLISH_DIR || "reports/publish/catalog"
  );
  private readonly signatureSecret = process.env.CATALOG_PUBLISH_SECRET?.trim() || "";
  private readonly signatureRequired = this.readBoolean(
    process.env.CATALOG_PUBLISH_SIGNATURE_REQUIRED,
    Boolean(this.signatureSecret)
  );
  private readonly driftWindowMs = this.readMinutes(process.env.CATALOG_PUBLISH_TIMESTAMP_DRIFT_MINUTES, 5) * 60 * 1000;
  private readonly nonceTtlMs = this.readMinutes(process.env.CATALOG_PUBLISH_NONCE_TTL_MINUTES, 10) * 60 * 1000;
  private readonly seenNonce = new Map<string, number>();
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly catalogEditorService: CatalogEditorService,
    private readonly auditService: AuditService
  ) {}

  async onModuleInit() {
    if (!this.persistenceEnabled) {
      return;
    }

    try {
      const content = await readFile(this.jobsPath, "utf8");
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const latestById = new Map<string, CatalogPublishJob>();
      for (const line of lines) {
        let parsed: CatalogPublishJob | null = null;
        try {
          parsed = JSON.parse(line) as CatalogPublishJob;
        } catch {
          parsed = null;
        }

        if (!parsed || !parsed.jobId) {
          continue;
        }

        const existing = latestById.get(parsed.jobId);
        if (!existing || Date.parse(parsed.updatedAt) >= Date.parse(existing.updatedAt)) {
          latestById.set(parsed.jobId, parsed);
        }
      }

      const recovered = [...latestById.values()]
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, this.maxJobs);

      this.jobs.clear();
      for (const job of recovered) {
        this.jobs.set(job.jobId, job);
      }
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  list(limit = 50): CatalogPublishJob[] {
    const normalizedLimit = Math.min(Math.max(Math.trunc(Number(limit) || 50), 1), this.maxJobs);
    return [...this.jobs.values()]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, normalizedLimit);
  }

  get(jobId: string): CatalogPublishJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException(`Catalog publish job not found: ${jobId}`);
    }
    return job;
  }

  assertSignedRequest(input: CatalogPublishSignedRequest) {
    if (!this.signatureRequired) {
      return;
    }

    if (!this.signatureSecret) {
      throw new UnauthorizedException("CATALOG_PUBLISH_SIGNATURE_SECRET_MISSING");
    }

    const signature = this.readHeader(input.headers, "x-signature");
    const algorithm = this.readHeader(input.headers, "x-signature-algorithm");
    const timestamp = this.readHeader(input.headers, "x-timestamp");
    const nonce = this.readHeader(input.headers, "x-nonce");
    const idempotencyKey = this.readHeader(input.headers, "x-idempotency-key");

    if (!signature || !algorithm || !timestamp || !nonce || !idempotencyKey) {
      throw new UnauthorizedException("CATALOG_PUBLISH_SIGNATURE_HEADERS_REQUIRED");
    }

    if (algorithm !== "HMAC-SHA256") {
      throw new UnauthorizedException("CATALOG_PUBLISH_SIGNATURE_ALGORITHM_INVALID");
    }

    const parsedTimestamp = Date.parse(timestamp);
    if (Number.isNaN(parsedTimestamp)) {
      throw new BadRequestException("CATALOG_PUBLISH_TIMESTAMP_INVALID");
    }

    const drift = Math.abs(Date.now() - parsedTimestamp);
    if (drift > this.driftWindowMs) {
      throw new UnauthorizedException("CATALOG_PUBLISH_TIMESTAMP_DRIFT_EXCEEDED");
    }

    this.cleanupSeenNonce();
    if (this.seenNonce.has(nonce)) {
      throw new UnauthorizedException("CATALOG_PUBLISH_NONCE_REUSED");
    }
    this.seenNonce.set(nonce, Date.now());

    const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
    const canonicalString = [
      input.method.toUpperCase(),
      input.path,
      timestamp,
      nonce,
      idempotencyKey,
      payloadHash
    ].join("\n");

    const expected = createHmac("sha256", this.signatureSecret).update(canonicalString).digest("hex");
    if (!this.safeEqualHex(signature, expected)) {
      throw new UnauthorizedException("CATALOG_PUBLISH_SIGNATURE_MISMATCH");
    }
  }

  async createDraft(actor: string, input: CatalogPublishDraftInput): Promise<CatalogPublishJob> {
    const normalizedActor = this.normalizeActor(actor);
    const normalizedItemIds = [...new Set((input.itemIds || []).map((itemId) => itemId.trim()).filter(Boolean))];

    if (normalizedItemIds.length > 0) {
      const existingItems = await this.catalogEditorService.listItemsByIds(normalizedItemIds, true);
      if (existingItems.length !== normalizedItemIds.length) {
        const existingSet = new Set(existingItems.map((item) => item.itemId));
        const missingIds = normalizedItemIds.filter((itemId) => !existingSet.has(itemId));
        throw new BadRequestException(`CATALOG_PUBLISH_ITEM_IDS_INVALID:${missingIds.join(",")}`);
      }
    }

    const now = new Date().toISOString();
    const job: CatalogPublishJob = {
      jobId: randomUUID(),
      payloadVersion: input.payloadVersion || "v1",
      status: "DRAFT",
      itemIds: normalizedItemIds,
      itemCount: normalizedItemIds.length,
      note: this.normalizeOptionalText(input.note),
      createdAt: now,
      updatedAt: now,
      createdBy: normalizedActor,
      reviewedBy: null,
      publishedBy: null,
      publishedAt: null,
      snapshotPath: null,
      checksum: null,
      failureReason: null
    };

    this.upsertJob(job);

    this.auditService.record({
      eventType: "CATALOG_PUBLISH_JOB_CREATED",
      actor: normalizedActor,
      resourceType: "CATALOG_PUBLISH_JOB",
      resourceId: job.jobId,
      metadata: {
        payloadVersion: job.payloadVersion,
        itemCount: job.itemCount
      }
    });

    return job;
  }

  async submitReview(jobId: string, actor: string): Promise<CatalogPublishJob> {
    const job = this.get(jobId);
    if (job.status !== "DRAFT" && job.status !== "FAILED") {
      throw new ConflictException(`CATALOG_PUBLISH_JOB_STATUS_INVALID:${job.status}`);
    }

    const now = new Date().toISOString();
    const updated: CatalogPublishJob = {
      ...job,
      status: "IN_REVIEW",
      reviewedBy: this.normalizeActor(actor),
      updatedAt: now,
      failureReason: null
    };

    this.upsertJob(updated);

    this.auditService.record({
      eventType: "CATALOG_PUBLISH_JOB_SUBMITTED_REVIEW",
      actor: this.normalizeActor(actor),
      resourceType: "CATALOG_PUBLISH_JOB",
      resourceId: updated.jobId,
      metadata: {
        previousStatus: job.status
      }
    });

    return updated;
  }

  async publish(jobId: string, actor: string): Promise<CatalogPublishJob> {
    const job = this.get(jobId);
    if (job.status !== "IN_REVIEW") {
      throw new ConflictException(`CATALOG_PUBLISH_JOB_STATUS_INVALID:${job.status}`);
    }

    return this.executePublish(job, this.normalizeActor(actor), false);
  }

  async retry(jobId: string, actor: string): Promise<CatalogPublishJob> {
    const current = this.get(jobId);
    if (current.status !== "FAILED") {
      throw new ConflictException(`CATALOG_PUBLISH_JOB_RETRY_INVALID_STATUS:${current.status}`);
    }

    const reviewReady: CatalogPublishJob = {
      ...current,
      status: "IN_REVIEW",
      reviewedBy: this.normalizeActor(actor),
      updatedAt: new Date().toISOString(),
      failureReason: null
    };

    this.upsertJob(reviewReady);
    return this.executePublish(reviewReady, this.normalizeActor(actor), true);
  }

  private async executePublish(
    job: CatalogPublishJob,
    actor: string,
    isRetry: boolean
  ): Promise<CatalogPublishJob> {
    const now = new Date().toISOString();

    try {
      const items = await this.resolveItemsForPublish(job);
      if (items.length === 0) {
        throw new BadRequestException("CATALOG_PUBLISH_EMPTY_PAYLOAD");
      }

      const payload: CatalogPublishPayloadV1 = {
        payloadVersion: job.payloadVersion,
        generatedAt: now,
        jobId: job.jobId,
        items
      };

      const serializedPayload = `${JSON.stringify(payload, null, 2)}\n`;
      const snapshotPath = path.join(this.publishDir, `${job.jobId}.json`);
      const latestPath = path.join(this.publishDir, `latest-${job.payloadVersion}.json`);

      await mkdir(this.publishDir, { recursive: true });
      await writeFile(snapshotPath, serializedPayload, "utf8");
      await writeFile(latestPath, serializedPayload, "utf8");

      const published: CatalogPublishJob = {
        ...job,
        status: "PUBLISHED",
        itemCount: items.length,
        publishedBy: actor,
        publishedAt: now,
        updatedAt: now,
        snapshotPath,
        checksum: createHash("sha256").update(serializedPayload).digest("hex"),
        failureReason: null
      };

      this.upsertJob(published);

      this.auditService.record({
        eventType: isRetry ? "CATALOG_PUBLISH_JOB_RETRIED" : "CATALOG_PUBLISH_JOB_PUBLISHED",
        actor,
        resourceType: "CATALOG_PUBLISH_JOB",
        resourceId: published.jobId,
        metadata: {
          payloadVersion: published.payloadVersion,
          itemCount: published.itemCount,
          snapshotPath: published.snapshotPath
        }
      });

      return published;
    } catch (error) {
      const failed: CatalogPublishJob = {
        ...job,
        status: "FAILED",
        updatedAt: now,
        publishedBy: null,
        publishedAt: null,
        failureReason: this.readErrorMessage(error)
      };

      this.upsertJob(failed);

      this.auditService.record({
        eventType: "CATALOG_PUBLISH_JOB_FAILED",
        actor,
        resourceType: "CATALOG_PUBLISH_JOB",
        resourceId: failed.jobId,
        metadata: {
          reason: failed.failureReason
        }
      });

      throw error;
    }
  }

  private async resolveItemsForPublish(job: CatalogPublishJob): Promise<CatalogEditorItem[]> {
    if (job.itemIds.length === 0) {
      return this.catalogEditorService.listActiveItemsForPublish();
    }

    const items = await this.catalogEditorService.listItemsByIds(job.itemIds, false);
    if (items.length !== job.itemIds.length) {
      const activeIds = new Set(items.map((item) => item.itemId));
      const missing = job.itemIds.filter((itemId) => !activeIds.has(itemId));
      throw new BadRequestException(`CATALOG_PUBLISH_ITEM_NOT_ACTIVE:${missing.join(",")}`);
    }

    return items;
  }

  private upsertJob(job: CatalogPublishJob) {
    this.jobs.set(job.jobId, job);

    if (this.jobs.size > this.maxJobs) {
      const ordered = [...this.jobs.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      this.jobs.clear();
      for (const record of ordered.slice(0, this.maxJobs)) {
        this.jobs.set(record.jobId, record);
      }
    }

    if (this.persistenceEnabled) {
      this.persistQueue = this.persistQueue
        .then(async () => {
          await mkdir(path.dirname(this.jobsPath), { recursive: true });
          await appendFile(this.jobsPath, `${JSON.stringify(job)}\n`, "utf8");
        })
        .catch(() => {
          // ignore persistence write failures, runtime state remains available
        });
    }
  }

  private cleanupSeenNonce() {
    const now = Date.now();
    for (const [nonce, seenAt] of this.seenNonce.entries()) {
      if (now - seenAt > this.nonceTtlMs) {
        this.seenNonce.delete(nonce);
      }
    }
  }

  private readHeader(headers: Record<string, unknown>, name: string): string | undefined {
    const direct = headers[name];
    if (typeof direct === "string") {
      return direct;
    }

    const lowerName = name.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() !== lowerName) {
        continue;
      }
      const value = headers[key];
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

  private normalizeActor(actor: string): string {
    const normalized = actor.trim();
    return normalized || "system";
  }

  private normalizeOptionalText(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }
    const normalized = value.trim();
    return normalized || null;
  }

  private readBoolean(rawValue: string | undefined, fallback: boolean): boolean {
    if (rawValue === undefined) {
      return fallback;
    }
    const normalized = rawValue.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }

  private readMinutes(rawValue: string | undefined, fallback: number): number {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.trunc(parsed);
  }

  private readErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof error === "string" && error.trim()) {
      return error;
    }
    return "CATALOG_PUBLISH_UNKNOWN_ERROR";
  }
}
