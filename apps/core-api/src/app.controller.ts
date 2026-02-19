import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { successEnvelope } from "./common/http/envelope";

@ApiTags("system")
@Controller()
export class AppController {
  @Get("health")
  @ApiOkResponse({
    description: "Healthcheck endpoint",
    schema: {
      example: {
        data: {
          status: "ok",
          service: "core-api",
          timestamp: "2026-02-19T00:00:00.000Z"
        },
        meta: {
          requestId: "00000000-0000-0000-0000-000000000000",
          timestamp: "2026-02-19T00:00:00.000Z"
        }
      }
    }
  })
  health() {
    return successEnvelope({
      status: "ok",
      service: "core-api",
      timestamp: new Date().toISOString()
    });
  }
}
