import { Injectable, ServiceUnavailableException } from "@nestjs/common";

@Injectable()
export class IngestFeatureFlagsService {
  isWebhookEnabled(): boolean {
    return this.readBool(process.env.INGEST_WEBHOOK_ENABLED, false);
  }

  isQueueEnabled(): boolean {
    return this.readBool(process.env.INGEST_QUEUE_ENABLED, false);
  }

  isReplayEnabled(): boolean {
    return this.readBool(process.env.INGEST_REPLAY_ENABLED, false);
  }

  assertWebhookEnabled() {
    if (!this.isWebhookEnabled()) {
      throw new ServiceUnavailableException("INGEST_WEBHOOK_DISABLED");
    }
  }

  assertReplayEnabled() {
    if (!this.isReplayEnabled()) {
      throw new ServiceUnavailableException("INGEST_REPLAY_DISABLED");
    }
  }

  private readBool(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
      return fallback;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }
}
