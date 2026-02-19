import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";

export interface ChannelMappingRecord {
  mappingId: string;
  entityType: string;
  channelCode: string;
  externalRefKind: string;
  externalRef: string;
  entityKey: string;
  mappingStatus: "UNMAPPED" | "MAPPED" | "REVIEW_REQUIRED";
}

export interface UnmappedRecord {
  queueId: string;
  channelCode: string;
  reasonCode: string;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED";
}

@Injectable()
export class MappingService {
  private readonly mappings = new Map<string, ChannelMappingRecord>();
  private readonly unmapped: UnmappedRecord[] = [
    {
      queueId: "unmapped_demo_001",
      channelCode: "VIATOR",
      reasonCode: "NO_MATCH",
      status: "OPEN"
    }
  ];

  list() {
    return Array.from(this.mappings.values());
  }

  create(input: Omit<ChannelMappingRecord, "mappingId">) {
    const mapping: ChannelMappingRecord = {
      ...input,
      mappingId: randomUUID()
    };
    this.mappings.set(mapping.mappingId, mapping);
    return mapping;
  }

  update(mappingId: string, input: Partial<Omit<ChannelMappingRecord, "mappingId">>) {
    const current = this.mappings.get(mappingId);
    if (!current) {
      throw new NotFoundException(`Channel mapping not found: ${mappingId}`);
    }
    const updated: ChannelMappingRecord = {
      ...current,
      ...input
    };
    this.mappings.set(mappingId, updated);
    return updated;
  }

  listUnmapped() {
    return this.unmapped;
  }
}
