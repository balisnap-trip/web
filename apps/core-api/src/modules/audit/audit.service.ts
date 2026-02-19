import { Injectable } from "@nestjs/common";

export interface AuditLogRecord {
  eventId: string;
  eventType: string;
  actor: string;
  createdAt: string;
}

@Injectable()
export class AuditService {
  listRecent(): AuditLogRecord[] {
    return [
      {
        eventId: "audit_demo_001",
        eventType: "SYSTEM_BOOTSTRAP",
        actor: "system",
        createdAt: new Date().toISOString()
      }
    ];
  }
}
