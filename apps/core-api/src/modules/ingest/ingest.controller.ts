import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { successEnvelope } from "../../common/http/envelope";
import { IngestService } from "./ingest.service";

@ApiTags("ingest")
@Controller("v1/ingest/bookings/events")
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Accept booking ingest event" })
  ingest(
    @Body() payload: unknown,
    @Headers("x-idempotency-key") idempotencyKey?: string
  ) {
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
