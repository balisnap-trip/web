import { randomUUID } from "crypto";

export interface SuccessEnvelope<T> {
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export function successEnvelope<T>(data: T, requestId = randomUUID()): SuccessEnvelope<T> {
  return {
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString()
    }
  };
}
