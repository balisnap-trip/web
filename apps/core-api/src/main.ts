import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { HttpExceptionEnvelopeFilter } from "./common/http/http-exception.filter";
import { RequestMetricsService } from "./modules/metrics/request-metrics.service";

interface RequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
}

interface ResponseLike {
  statusCode?: number;
  once: (event: string, callback: () => void) => void;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true
  });
  const requestMetricsService = app.get(RequestMetricsService);

  const config = new DocumentBuilder()
    .setTitle("Balisnaptrip Core API")
    .setDescription("Core API baseline for unified contracts and ingestion")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);
  app.useGlobalFilters(new HttpExceptionEnvelopeFilter());
  app.use((req: RequestLike, res: ResponseLike, next: () => void) => {
    const startedAt = Date.now();
    res.once("finish", () => {
      requestMetricsService.record({
        method: req.method || "UNKNOWN",
        path: (req.originalUrl || req.url || "/").split("?")[0],
        statusCode: res.statusCode ?? 500,
        durationMs: Date.now() - startedAt
      });
    });
    next();
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
}

void bootstrap();
