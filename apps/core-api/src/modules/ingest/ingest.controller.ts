import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { RawBodyRequest } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { RequireAdminRoles } from "../../common/auth/admin-auth.decorator";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { successEnvelope } from "../../common/http/envelope";
import { AuditService } from "../audit/audit.service";
import { IngestFeatureFlagsService } from "./ingest-feature-flags.service";
import { IngestQueueService } from "./ingest-queue.service";
import { IngestSecurityService } from "./ingest-security.service";
import { IngestService } from "./ingest.service";

interface IngestHttpRequest {
  method: string;
  originalUrl?: string;
  url?: string;
  rawBody?: Buffer;
}

@ApiTags("ingest")
@Controller("v1/ingest/bookings/events")
export class IngestController {
  constructor(
    private readonly ingestService: IngestService,
    private readonly ingestSecurityService: IngestSecurityService,
    private readonly ingestQueueService: IngestQueueService,
    private readonly featureFlags: IngestFeatureFlagsService,
    private readonly auditService: AuditService
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Accept booking ingest event" })
  @ApiHeader({ name: "authorization", description: "Bearer service token", required: true })
  @ApiHeader({ name: "x-signature", description: "HMAC signature in hex", required: true })
  @ApiHeader({
    name: "x-signature-algorithm",
    description: "Signature algorithm",
    required: true,
    schema: { example: "HMAC-SHA256" }
  })
  @ApiHeader({ name: "x-timestamp", description: "UTC ISO-8601 timestamp", required: true })
  @ApiHeader({ name: "x-nonce", description: "Unique nonce per request", required: true })
  @ApiHeader({ name: "x-idempotency-key", description: "Idempotency key", required: true })
  async ingest(
    @Body() payload: unknown,
    @Headers() headers: Record<string, unknown>,
    @Req() req: RawBodyRequest<IngestHttpRequest>
  ) {
    this.featureFlags.assertWebhookEnabled();

    const rawBody =
      req.rawBody instanceof Buffer ? req.rawBody : Buffer.from(JSON.stringify(payload ?? {}));

    const requestPath = (req.originalUrl || req.url || "/").split("?")[0];
    const { idempotencyKey, nonce, payloadHash, signatureVerified } =
      await this.ingestSecurityService.validateRequest({
        method: req.method,
        path: requestPath,
        headers,
        rawBody
      });

    const { record, idempotentReplay } = await this.ingestService.createEvent({
      payload,
      idempotencyKey,
      nonce,
      payloadHash,
      signatureVerified
    });

    const queued =
      idempotentReplay === false
        ? await this.ingestQueueService.enqueueEvent(record.eventId, {
            reason: "INGEST_RECEIVED",
            attemptNumber: 1
          })
        : false;

    let processedInline = false;
    if (idempotentReplay === false && !queued && this.featureFlags.isSyncFallbackEnabled()) {
      processedInline = await this.processInline(record.eventId, 1);
    }

    return successEnvelope({
      eventId: record.eventId,
      processStatus: record.processStatus,
      idempotentReplay,
      queued,
      processedInline
    });
  }

  @Get(":eventId")
  @ApiOperation({ summary: "Get ingest event status" })
  @ApiParam({ name: "eventId", example: "a8f0f4ee-52f2-4e20-a2d9-e7f2f806663e" })
  async status(@Param("eventId") eventId: string) {
    return successEnvelope(await this.ingestService.getEvent(eventId));
  }

  @Post(":eventId/replay")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Replay failed ingest event" })
  @ApiParam({ name: "eventId", example: "a8f0f4ee-52f2-4e20-a2d9-e7f2f806663e" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/STAFF/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async replay(@Param("eventId") eventId: string, @Headers() headers: Record<string, unknown>) {
    this.featureFlags.assertReplayEnabled();
    const actor = this.resolveActor(headers);

    try {
      const replayed = await this.ingestService.replayEvent(eventId);
      const queued = await this.ingestQueueService.enqueueEvent(replayed.eventId, {
        reason: "REPLAY",
        attemptNumber: 1
      });
      const processedInline =
        !queued && this.featureFlags.isSyncFallbackEnabled()
          ? await this.processInline(replayed.eventId, 1)
          : false;

      this.auditService.record({
        eventType: "INGEST_REPLAY_REQUESTED",
        actor,
        resourceType: "INGEST_EVENT",
        resourceId: replayed.eventId,
        metadata: {
          queued,
          processedInline
        }
      });

      return successEnvelope({
        ...replayed,
        queued,
        processedInline
      });
    } catch (error) {
      this.auditService.record({
        eventType: "INGEST_REPLAY_REJECTED",
        actor,
        resourceType: "INGEST_EVENT",
        resourceId: eventId,
        metadata: {
          error: this.readErrorMessage(error)
        }
      });

      throw error;
    }
  }

  @Post(":eventId/fail")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Mark event as failed and move to dead-letter queue" })
  @ApiParam({ name: "eventId", example: "a8f0f4ee-52f2-4e20-a2d9-e7f2f806663e" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/STAFF/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async fail(
    @Param("eventId") eventId: string,
    @Headers() headers: Record<string, unknown>,
    @Body()
    body: {
      reasonCode: string;
      reasonDetail?: string;
      poisonMessage?: boolean;
    }
  ) {
    const deadLetter = await this.ingestService.markEventFailed({
      eventId,
      reasonCode: body.reasonCode,
      reasonDetail: body.reasonDetail,
      poisonMessage: body.poisonMessage
    });

    this.auditService.record({
      eventType: "INGEST_EVENT_MARKED_FAILED",
      actor: this.resolveActor(headers),
      resourceType: "INGEST_EVENT",
      resourceId: eventId,
      metadata: {
        deadLetterKey: deadLetter.deadLetterKey,
        reasonCode: body.reasonCode,
        poisonMessage: body.poisonMessage ?? false
      }
    });

    return successEnvelope(deadLetter);
  }

  private resolveActor(headers: Record<string, unknown>): string {
    const actorHeader = headers["x-actor"] ?? headers["x-admin-user"] ?? headers["x-user-id"];
    if (typeof actorHeader === "string" && actorHeader.trim()) {
      return actorHeader.trim();
    }
    return "system";
  }

  private readErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return "UNKNOWN_REPLAY_ERROR";
  }

  private async processInline(eventId: string, attemptNumber: number): Promise<boolean> {
    await this.ingestService.markProcessingAttempt(eventId, attemptNumber);
    try {
      await this.ingestService.processEvent(eventId);
      await this.ingestService.markReplaySucceeded(eventId);
      return true;
    } catch (error) {
      const classification = this.ingestService.classifyProcessingError(error);
      await this.ingestService.markEventFailed({
        eventId,
        reasonCode: classification.reasonCode,
        reasonDetail: classification.message,
        poisonMessage: true
      });
      throw error;
    }
  }
}
