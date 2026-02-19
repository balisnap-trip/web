import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { successEnvelope } from "./common/http/envelope";
import { DatabaseService } from "./modules/database/database.service";

@ApiTags("system")
@Controller()
export class AppController {
  constructor(private readonly databaseService: DatabaseService) {}

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

  @Get("health/db")
  @ApiOkResponse({
    description: "Database healthcheck endpoint for ops_db and channel_db",
    schema: {
      example: {
        data: {
          status: "ok",
          checks: [
            {
              database: "ops_db",
              configured: true,
              reachable: true,
              latencyMs: 8,
              error: null
            },
            {
              database: "channel_db",
              configured: true,
              reachable: true,
              latencyMs: 5,
              error: null
            }
          ]
        },
        meta: {
          requestId: "00000000-0000-0000-0000-000000000000",
          timestamp: "2026-02-19T00:00:00.000Z"
        }
      }
    }
  })
  async healthDb() {
    return successEnvelope(await this.databaseService.healthCheck());
  }
}
