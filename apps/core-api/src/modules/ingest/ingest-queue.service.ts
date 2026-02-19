import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Queue, Worker } from "bullmq";
import { IngestFeatureFlagsService } from "./ingest-feature-flags.service";
import { IngestService } from "./ingest.service";

interface IngestJobPayload {
  eventId: string;
  attemptNumber: number;
  reason: "INGEST_RECEIVED" | "REPLAY" | "RETRY";
}

export interface IngestQueueRuntimeMetrics {
  queueName: string;
  enabled: boolean;
  connected: boolean;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
  lastError: string | null;
}

@Injectable()
export class IngestQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestQueueService.name);
  private readonly retryDelaysMs = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];
  private readonly maxAttempts = 5;
  private readonly queueName = process.env.INGEST_QUEUE_NAME || "ingest-bookings-events";

  private redisConnection: { url: string } | null = null;
  private queue: Queue<any, any, string> | null = null;
  private worker: Worker<any, any, string> | null = null;

  constructor(
    private readonly ingestService: IngestService,
    private readonly featureFlags: IngestFeatureFlagsService
  ) {}

  async onModuleInit() {
    if (!this.featureFlags.isQueueEnabled()) {
      this.logger.log("INGEST_QUEUE_ENABLED=false; queue worker not started");
      return;
    }

    const redisUrl = process.env.INGEST_REDIS_URL || process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.warn("Queue enabled but no Redis URL provided; queue runtime is disabled");
      return;
    }

    this.redisConnection = {
      url: redisUrl
    };
    this.queue = new Queue(this.queueName, {
      connection: this.redisConnection
    });
    this.worker = new Worker(
      this.queueName,
      async (job: Job<IngestJobPayload>) => {
        await this.handleJob(job);
      },
      {
        connection: this.redisConnection
      }
    );

    this.worker.on("failed", (job: Job<IngestJobPayload> | undefined, error: Error) => {
      this.logger.error(
        `Worker failed event=${job?.data?.eventId ?? "unknown"} reason=${error?.message ?? "unknown"}`
      );
    });
    this.worker.on("error", (error: Error) => {
      this.logger.error(`Worker runtime error: ${error.message}`);
    });

    this.logger.log(`Queue worker started: ${this.queueName}`);
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
  }

  async enqueueEvent(
    eventId: string,
    options: {
      attemptNumber?: number;
      reason?: IngestJobPayload["reason"];
      delayMs?: number;
    } = {}
  ): Promise<boolean> {
    if (!this.queue || !this.featureFlags.isQueueEnabled()) {
      return false;
    }

    const payload: IngestJobPayload = {
      eventId,
      attemptNumber: options.attemptNumber ?? 1,
      reason: options.reason ?? "INGEST_RECEIVED"
    };

    await this.queue.add(`event:${eventId}:attempt:${payload.attemptNumber}:${Date.now()}`, payload, {
      delay: options.delayMs ?? 0,
      removeOnComplete: {
        age: 14 * 24 * 60 * 60
      },
      removeOnFail: {
        age: 30 * 24 * 60 * 60
      }
    });

    return true;
  }

  async getRuntimeMetrics(): Promise<IngestQueueRuntimeMetrics> {
    const base: IngestQueueRuntimeMetrics = {
      queueName: this.queueName,
      enabled: this.featureFlags.isQueueEnabled(),
      connected: false,
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
      paused: 0,
      lastError: null
    };

    if (!base.enabled || !this.queue) {
      return base;
    }

    try {
      const counts = await this.queue.getJobCounts(
        "waiting",
        "active",
        "delayed",
        "completed",
        "failed",
        "paused"
      );

      return {
        ...base,
        connected: true,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        paused: counts.paused ?? 0
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "QUEUE_METRICS_ERROR";
      this.logger.warn(`Queue metrics unavailable: ${message}`);
      return {
        ...base,
        lastError: message
      };
    }
  }

  private async handleJob(job: Job<IngestJobPayload>) {
    const { eventId, attemptNumber } = job.data;
    await this.ingestService.markProcessingAttempt(eventId, attemptNumber);

    try {
      await this.ingestService.processEvent(eventId);
      await this.ingestService.markReplaySucceeded(eventId);
      this.logger.log(`Event processed: ${eventId} attempt=${attemptNumber}`);
      return;
    } catch (error) {
      const classification = this.ingestService.classifyProcessingError(error);
      const shouldRetry = classification.retryable && attemptNumber < this.maxAttempts;

      if (shouldRetry) {
        const delayMs =
          this.retryDelaysMs[Math.min(attemptNumber - 1, this.retryDelaysMs.length - 1)] ?? 30_000;
        const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

        await this.ingestService.markRetryableFailure({
          eventId,
          errorMessage: classification.message,
          nextRetryAt
        });

        await this.enqueueEvent(eventId, {
          reason: "RETRY",
          attemptNumber: attemptNumber + 1,
          delayMs
        });

        this.logger.warn(
          `Retry scheduled event=${eventId} attempt=${attemptNumber + 1} delayMs=${delayMs} reason=${classification.reasonCode}`
        );
        return;
      }

      await this.ingestService.markEventFailed({
        eventId,
        reasonCode: classification.reasonCode,
        reasonDetail: classification.message,
        poisonMessage: true
      });

      this.logger.error(
        `Event sent to DLQ event=${eventId} attempt=${attemptNumber} reason=${classification.reasonCode}`
      );
    }
  }
}
