import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req
} from "@nestjs/common";
import { RawBodyRequest } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { successEnvelope } from "../../common/http/envelope";
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
    private readonly ingestSecurityService: IngestSecurityService
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
  ingest(
    @Body() payload: unknown,
    @Headers() headers: Record<string, unknown>,
    @Req() req: RawBodyRequest<IngestHttpRequest>
  ) {
    const rawBody =
      req.rawBody instanceof Buffer ? req.rawBody : Buffer.from(JSON.stringify(payload ?? {}));

    const requestPath = (req.originalUrl || req.url || "/").split("?")[0];
    const { idempotencyKey } = this.ingestSecurityService.validateRequest({
      method: req.method,
      path: requestPath,
      headers,
      rawBody
    });

    const { record, idempotentReplay } = this.ingestService.createEvent(payload, idempotencyKey);
    return successEnvelope({
      eventId: record.eventId,
      processStatus: record.processStatus,
      idempotentReplay
    });
  }

  @Get(":eventId")
  @ApiOperation({ summary: "Get ingest event status" })
  @ApiParam({ name: "eventId", example: "a8f0f4ee-52f2-4e20-a2d9-e7f2f806663e" })
  status(@Param("eventId") eventId: string) {
    return successEnvelope(this.ingestService.getEvent(eventId));
  }

  @Post(":eventId/replay")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Replay failed ingest event" })
  @ApiParam({ name: "eventId", example: "a8f0f4ee-52f2-4e20-a2d9-e7f2f806663e" })
  replay(@Param("eventId") eventId: string) {
    return successEnvelope(this.ingestService.replayEvent(eventId));
  }
}
