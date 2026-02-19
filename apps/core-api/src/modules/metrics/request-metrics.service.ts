import { Injectable } from "@nestjs/common";

interface RequestMetricSample {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  timestampMs: number;
}

export interface ApiRequestMetricsSummary {
  windowMinutes: number;
  generatedAt: string;
  uptimeSeconds: number;
  totals: {
    requests: number;
    status2xx: number;
    status3xx: number;
    status4xx: number;
    status5xx: number;
  };
  rates: {
    successRate: number;
    error4xxRate: number;
    error5xxRate: number;
  };
  throughput: {
    requestsPerSecond: number;
    requestsPerMinute: number;
  };
  latencyMs: {
    sampleCount: number;
    avg: number;
    median: number;
    p95: number;
    max: number;
  };
  byMethod: Record<string, number>;
}

@Injectable()
export class RequestMetricsService {
  private readonly startedAtMs = Date.now();
  private readonly maxSamples = this.readPositiveInteger(
    process.env.API_METRICS_MAX_SAMPLES,
    20_000
  );
  private readonly samples: RequestMetricSample[] = [];

  record(input: {
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
  }) {
    const sample: RequestMetricSample = {
      method: (input.method || "UNKNOWN").toUpperCase(),
      path: input.path || "/",
      statusCode: this.normalizeStatusCode(input.statusCode),
      durationMs: this.normalizeDurationMs(input.durationMs),
      timestampMs: Date.now()
    };

    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples);
    }
  }

  getApiRequestMetrics(windowMinutes = 15): ApiRequestMetricsSummary {
    const normalizedWindowMinutes = this.normalizeWindowMinutes(windowMinutes);
    const windowStartMs = Date.now() - normalizedWindowMinutes * 60_000;
    const selected = this.samples.filter((sample) => sample.timestampMs >= windowStartMs);

    let status2xx = 0;
    let status3xx = 0;
    let status4xx = 0;
    let status5xx = 0;

    const byMethod: Record<string, number> = {};
    const durations: number[] = [];

    for (const sample of selected) {
      byMethod[sample.method] = (byMethod[sample.method] || 0) + 1;
      durations.push(sample.durationMs);

      if (sample.statusCode >= 200 && sample.statusCode < 300) {
        status2xx += 1;
      } else if (sample.statusCode >= 300 && sample.statusCode < 400) {
        status3xx += 1;
      } else if (sample.statusCode >= 400 && sample.statusCode < 500) {
        status4xx += 1;
      } else if (sample.statusCode >= 500) {
        status5xx += 1;
      }
    }

    durations.sort((left, right) => left - right);

    const requests = selected.length;
    const avg = requests === 0 ? 0 : this.roundToTwoDecimals(durations.reduce((acc, value) => acc + value, 0) / requests);
    const median = this.percentile(durations, 0.5);
    const p95 = this.percentile(durations, 0.95);
    const max = durations.length === 0 ? 0 : durations[durations.length - 1];

    const successRate = requests === 0 ? 1 : status2xx / requests;
    const error4xxRate = requests === 0 ? 0 : status4xx / requests;
    const error5xxRate = requests === 0 ? 0 : status5xx / requests;

    return {
      windowMinutes: normalizedWindowMinutes,
      generatedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAtMs) / 1000),
      totals: {
        requests,
        status2xx,
        status3xx,
        status4xx,
        status5xx
      },
      rates: {
        successRate,
        error4xxRate,
        error5xxRate
      },
      throughput: {
        requestsPerSecond: this.roundToFourDecimals(requests / (normalizedWindowMinutes * 60)),
        requestsPerMinute: this.roundToFourDecimals(requests / normalizedWindowMinutes)
      },
      latencyMs: {
        sampleCount: requests,
        avg,
        median,
        p95,
        max
      },
      byMethod
    };
  }

  private normalizeWindowMinutes(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 15;
    }
    return Math.min(Math.max(Math.floor(numeric), 1), 1_440);
  }

  private normalizeStatusCode(statusCode: number): number {
    const parsed = Number(statusCode);
    if (!Number.isFinite(parsed) || parsed < 100) {
      return 500;
    }
    return Math.floor(parsed);
  }

  private normalizeDurationMs(durationMs: number): number {
    const parsed = Number(durationMs);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.round(parsed);
  }

  private percentile(sortedValues: number[], ratio: number): number {
    if (sortedValues.length === 0) {
      return 0;
    }

    const index = Math.max(
      0,
      Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1)
    );
    return sortedValues[index];
  }

  private readPositiveInteger(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private roundToTwoDecimals(value: number): number {
    return Number(value.toFixed(2));
  }

  private roundToFourDecimals(value: number): number {
    return Number(value.toFixed(4));
  }
}
