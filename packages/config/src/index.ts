export interface CoreApiRuntimeConfig {
  appName: "core-api";
  port: number;
  envName: "development" | "staging" | "production" | "test";
  ingest: {
    signatureAlgorithm: "HMAC-SHA256";
    timestampDriftMinutes: 5;
    nonceTtlMinutes: 10;
    idempotencyTtlDays: 35;
  };
}

export const defaultCoreApiRuntimeConfig: CoreApiRuntimeConfig = {
  appName: "core-api",
  port: 4000,
  envName: "development",
  ingest: {
    signatureAlgorithm: "HMAC-SHA256",
    timestampDriftMinutes: 5,
    nonceTtlMinutes: 10,
    idempotencyTtlDays: 35
  }
};
