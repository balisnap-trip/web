import { Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { successEnvelope } from "../../common/http/envelope";
import { IngestDeadLetterStatus, IngestService } from "./ingest.service";

@ApiTags("ingest-dead-letter")
@Controller("v1/ingest/dead-letter")
export class IngestDeadLetterController {
  constructor(private readonly ingestService: IngestService) {}

  @Get()
  @ApiOperation({ summary: "List dead-letter events" })
  @ApiQuery({ name: "status", required: false, example: "OPEN" })
  @ApiQuery({ name: "limit", required: false, example: 50 })
  async list(
    @Query("status") status?: IngestDeadLetterStatus,
    @Query("limit") limit?: string
  ) {
    const parsedLimit = Number.isFinite(Number(limit)) ? Number(limit) : undefined;
    return successEnvelope(
      await this.ingestService.listDeadLetters({
        status,
        limit: parsedLimit
      })
    );
  }

  @Get(":deadLetterKey")
  @ApiOperation({ summary: "Get dead-letter detail" })
  @ApiParam({ name: "deadLetterKey", example: "11ba6d8e-9bfd-4c9d-bcf3-537abcbf2d73" })
  async get(@Param("deadLetterKey") deadLetterKey: string) {
    return successEnvelope(await this.ingestService.getDeadLetter(deadLetterKey));
  }

  @Patch(":deadLetterKey/status/:status")
  @ApiOperation({ summary: "Update dead-letter status" })
  @ApiParam({ name: "deadLetterKey", example: "11ba6d8e-9bfd-4c9d-bcf3-537abcbf2d73" })
  @ApiParam({ name: "status", example: "READY" })
  async updateStatus(
    @Param("deadLetterKey") deadLetterKey: string,
    @Param("status") status: IngestDeadLetterStatus
  ) {
    return successEnvelope(
      await this.ingestService.updateDeadLetterStatus({
        deadLetterKey,
        toStatus: status
      })
    );
  }
}
