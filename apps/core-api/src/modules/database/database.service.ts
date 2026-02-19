import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";

export interface DatabaseHealthItem {
  database: "ops_db" | "channel_db";
  configured: boolean;
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
}

export interface DatabaseHealthResult {
  status: "ok" | "degraded";
  checks: DatabaseHealthItem[];
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly opsPool: Pool | null;
  private readonly channelPool: Pool | null;

  constructor() {
    this.opsPool = this.createPool(process.env.OPS_DB_URL);
    this.channelPool = this.createPool(process.env.CHANNEL_DB_URL);
  }

  async onModuleDestroy() {
    await Promise.all([this.closePool(this.opsPool), this.closePool(this.channelPool)]);
  }

  async healthCheck(): Promise<DatabaseHealthResult> {
    const checks = await Promise.all([
      this.checkPool("ops_db", this.opsPool),
      this.checkPool("channel_db", this.channelPool)
    ]);

    const isDegraded = checks.some((item) => item.configured && !item.reachable);
    return {
      status: isDegraded ? "degraded" : "ok",
      checks
    };
  }

  private createPool(connectionString?: string): Pool | null {
    if (!connectionString) {
      return null;
    }

    return new Pool({
      connectionString,
      max: 5
    });
  }

  private async checkPool(database: "ops_db" | "channel_db", pool: Pool | null): Promise<DatabaseHealthItem> {
    if (!pool) {
      return {
        database,
        configured: false,
        reachable: false,
        latencyMs: null,
        error: "MISSING_CONNECTION_STRING"
      };
    }

    const startedAt = Date.now();
    try {
      await pool.query("select 1");
      return {
        database,
        configured: true,
        reachable: true,
        latencyMs: Date.now() - startedAt,
        error: null
      };
    } catch (error) {
      return {
        database,
        configured: true,
        reachable: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "DB_CHECK_FAILED"
      };
    }
  }

  private async closePool(pool: Pool | null) {
    if (!pool) {
      return;
    }
    await pool.end();
  }
}
