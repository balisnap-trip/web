import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { successEnvelope } from "../../common/http/envelope";
import { MappingService } from "./mapping.service";

@ApiTags("channel-mappings")
@Controller("v1/channel-mappings")
export class MappingController {
  constructor(private readonly mappingService: MappingService) {}

  @Get()
  @ApiOperation({ summary: "List channel mappings" })
  list() {
    return successEnvelope(this.mappingService.list());
  }

  @Post()
  @ApiOperation({ summary: "Create channel mapping" })
  create(
    @Body()
    body: {
      entityType: string;
      channelCode: string;
      externalRefKind: string;
      externalRef: string;
      entityKey: string;
      mappingStatus: "UNMAPPED" | "MAPPED" | "REVIEW_REQUIRED";
    }
  ) {
    return successEnvelope(this.mappingService.create(body));
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update channel mapping" })
  @ApiParam({ name: "id", example: "e6f313cf-d00d-4aa0-8a89-b48f5a66f5cd" })
  patch(
    @Param("id") id: string,
    @Body()
    body: {
      entityType?: string;
      channelCode?: string;
      externalRefKind?: string;
      externalRef?: string;
      entityKey?: string;
      mappingStatus?: "UNMAPPED" | "MAPPED" | "REVIEW_REQUIRED";
    }
  ) {
    return successEnvelope(this.mappingService.update(id, body));
  }

  @Get("unmapped")
  @ApiOperation({ summary: "List unmapped queue records" })
  listUnmapped() {
    return successEnvelope(this.mappingService.listUnmapped());
  }
}
