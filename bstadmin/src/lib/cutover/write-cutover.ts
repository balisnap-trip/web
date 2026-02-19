import { prisma } from '@/lib/db'

export const OPS_WRITE_CUTOVER_AUDIT_ACTION = 'OPS_WRITE_CUTOVER_EVENT'

const DEFAULT_WINDOW_MINUTES = 60
const DEFAULT_MAX_MISMATCH_RATIO = 0.001
const DEFAULT_MIN_SAMPLES = 1

export interface WriteCutoverAuditInput {
  userId?: string | null
  actorRole?: string | null
  bookingId?: number | string | null
  operation: string
  coreAttempted: boolean
  coreSuccess: boolean | null
  coreStatus?: number | null
  coreError?: string | null
  strictMode: boolean
  fallbackUsed?: boolean
  legacyAttempted: boolean
  legacySuccess: boolean | null
  legacyError?: string | null
  metadata?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}

export interface WriteCutoverAuditPayload {
  operation: string
  actorRole: string | null
  bookingId: string | null
  coreAttempted: boolean
  coreSuccess: boolean | null
  coreStatus: number | null
  coreError: string | null
  strictMode: boolean
  fallbackUsed: boolean
  legacyAttempted: boolean
  legacySuccess: boolean | null
  legacyError: string | null
  mismatch: boolean
  metadata: Record<string, unknown>
}

export interface WriteCutoverMetricEntry {
  createdAt: Date
  payload: WriteCutoverAuditPayload
}

export interface WriteCutoverMetricThresholds {
  windowMinutes: number
  maxMismatchRatio: number
  minSamples: number
}

export interface WriteCutoverMetricsSummary {
  generatedAt: string
  windowMinutes: number
  thresholds: {
    maxMismatchRatio: number
    minSamples: number
  }
  result: 'PASS' | 'FAIL'
  summary: {
    totalEvents: number
    coreAttempted: number
    coreSuccess: number
    coreFailed: number
    fallbackUsed: number
    strictRejected: number
    legacyAttempted: number
    legacySuccess: number
    legacyFailed: number
    mismatch: number
    mismatchRatio: number
    hasEnoughSamples: boolean
  }
  byOperation: Array<{
    operation: string
    totalEvents: number
    coreAttempted: number
    mismatch: number
    mismatchRatio: number
    fallbackUsed: number
  }>
  recentMismatch: Array<{
    createdAt: string
    operation: string
    bookingId: string | null
    coreStatus: number | null
    coreError: string | null
    legacyError: string | null
    strictMode: boolean
    fallbackUsed: boolean
  }>
  failures: string[]
}

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const normalizeBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value
  }
  return null
}

const normalizeNumber = (value: unknown): number | null => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return null
  }
  return numeric
}

const ratioOrZero = (numerator: number, denominator: number) => {
  if (denominator <= 0) {
    return 0
  }
  return Number((numerator / denominator).toFixed(6))
}

const readNumber = (rawValue: string | undefined, fallback: number, minValue: number) => {
  const numeric = Number(rawValue ?? fallback)
  if (!Number.isFinite(numeric) || numeric < minValue) {
    return fallback
  }
  return numeric
}

export const computeWriteCutoverMismatch = (
  coreAttempted: boolean,
  coreSuccess: boolean | null,
  legacySuccess: boolean | null
) => {
  if (!coreAttempted || coreSuccess === null || legacySuccess === null) {
    return false
  }
  return coreSuccess !== legacySuccess
}

export const buildWriteCutoverAuditPayload = (
  input: WriteCutoverAuditInput
): WriteCutoverAuditPayload => {
  const operation = normalizeString(input.operation) || 'UNKNOWN'
  const bookingId =
    input.bookingId === undefined || input.bookingId === null
      ? null
      : String(input.bookingId).trim() || null
  const coreAttempted = Boolean(input.coreAttempted)
  const coreSuccess = input.coreSuccess === null ? null : Boolean(input.coreSuccess)
  const legacyAttempted = Boolean(input.legacyAttempted)
  const legacySuccess = input.legacySuccess === null ? null : Boolean(input.legacySuccess)
  const payload: WriteCutoverAuditPayload = {
    operation,
    actorRole: normalizeString(input.actorRole) || null,
    bookingId,
    coreAttempted,
    coreSuccess,
    coreStatus: normalizeNumber(input.coreStatus),
    coreError: normalizeString(input.coreError),
    strictMode: Boolean(input.strictMode),
    fallbackUsed: Boolean(input.fallbackUsed),
    legacyAttempted,
    legacySuccess,
    legacyError: normalizeString(input.legacyError),
    mismatch: computeWriteCutoverMismatch(coreAttempted, coreSuccess, legacySuccess),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  }
  return payload
}

export const parseWriteCutoverAuditPayload = (
  rawValue: unknown
): WriteCutoverAuditPayload | null => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return null
  }

  const row = rawValue as Record<string, unknown>
  const operation = normalizeString(row.operation)
  const coreAttempted = normalizeBoolean(row.coreAttempted)
  const strictMode = normalizeBoolean(row.strictMode)
  const fallbackUsed = normalizeBoolean(row.fallbackUsed)
  const legacyAttempted = normalizeBoolean(row.legacyAttempted)
  const mismatch = normalizeBoolean(row.mismatch)

  if (
    !operation ||
    coreAttempted === null ||
    strictMode === null ||
    fallbackUsed === null ||
    legacyAttempted === null ||
    mismatch === null
  ) {
    return null
  }

  const coreSuccessRaw = normalizeBoolean(row.coreSuccess)
  const legacySuccessRaw = normalizeBoolean(row.legacySuccess)
  const coreSuccess = row.coreSuccess === null ? null : coreSuccessRaw
  const legacySuccess = row.legacySuccess === null ? null : legacySuccessRaw
  if (row.coreSuccess !== null && coreSuccessRaw === null) {
    return null
  }
  if (row.legacySuccess !== null && legacySuccessRaw === null) {
    return null
  }

  return {
    operation,
    actorRole: normalizeString(row.actorRole),
    bookingId: normalizeString(row.bookingId),
    coreAttempted,
    coreSuccess,
    coreStatus: normalizeNumber(row.coreStatus),
    coreError: normalizeString(row.coreError),
    strictMode,
    fallbackUsed,
    legacyAttempted,
    legacySuccess,
    legacyError: normalizeString(row.legacyError),
    mismatch,
    metadata: row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {},
  }
}

export const safeRecordWriteCutoverAudit = async (
  input: WriteCutoverAuditInput
): Promise<void> => {
  try {
    const payload = buildWriteCutoverAuditPayload(input)
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: OPS_WRITE_CUTOVER_AUDIT_ACTION,
        entity: 'Booking',
        entityId: payload.bookingId,
        oldValue: null,
        newValue: payload,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
  } catch (error) {
    console.warn('[cutover] failed to write audit event:', error)
  }
}

export const readWriteCutoverMetricThresholds = (
  windowMinutes?: number
): WriteCutoverMetricThresholds => ({
  windowMinutes:
    Number.isFinite(Number(windowMinutes)) && Number(windowMinutes) > 0
      ? Math.min(Math.max(Math.floor(Number(windowMinutes)), 1), 1440)
      : Math.floor(readNumber(process.env.OPS_WRITE_GATE_WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES, 1)),
  maxMismatchRatio: readNumber(
    process.env.OPS_WRITE_MISMATCH_MAX_RATIO,
    DEFAULT_MAX_MISMATCH_RATIO,
    0
  ),
  minSamples: Math.floor(
    readNumber(process.env.OPS_WRITE_MISMATCH_MIN_SAMPLES, DEFAULT_MIN_SAMPLES, 0)
  ),
})

export const summarizeWriteCutoverMetrics = (
  entries: WriteCutoverMetricEntry[],
  thresholds: WriteCutoverMetricThresholds
): WriteCutoverMetricsSummary => {
  const totals = {
    totalEvents: entries.length,
    coreAttempted: 0,
    coreSuccess: 0,
    coreFailed: 0,
    fallbackUsed: 0,
    strictRejected: 0,
    legacyAttempted: 0,
    legacySuccess: 0,
    legacyFailed: 0,
    mismatch: 0,
  }

  const byOperationMap = new Map<
    string,
    {
      operation: string
      totalEvents: number
      coreAttempted: number
      mismatch: number
      fallbackUsed: number
    }
  >()

  const recentMismatch = entries
    .filter((item) => item.payload.mismatch)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20)
    .map((item) => ({
      createdAt: item.createdAt.toISOString(),
      operation: item.payload.operation,
      bookingId: item.payload.bookingId,
      coreStatus: item.payload.coreStatus,
      coreError: item.payload.coreError,
      legacyError: item.payload.legacyError,
      strictMode: item.payload.strictMode,
      fallbackUsed: item.payload.fallbackUsed,
    }))

  for (const item of entries) {
    const payload = item.payload
    const bucket = byOperationMap.get(payload.operation) || {
      operation: payload.operation,
      totalEvents: 0,
      coreAttempted: 0,
      mismatch: 0,
      fallbackUsed: 0,
    }

    bucket.totalEvents += 1

    if (payload.coreAttempted) {
      totals.coreAttempted += 1
      bucket.coreAttempted += 1
      if (payload.coreSuccess === true) {
        totals.coreSuccess += 1
      }
      if (payload.coreSuccess === false) {
        totals.coreFailed += 1
      }
    }

    if (payload.fallbackUsed) {
      totals.fallbackUsed += 1
      bucket.fallbackUsed += 1
    }

    if (payload.strictMode && payload.coreAttempted && payload.legacyAttempted === false) {
      totals.strictRejected += 1
    }

    if (payload.legacyAttempted) {
      totals.legacyAttempted += 1
      if (payload.legacySuccess === true) {
        totals.legacySuccess += 1
      }
      if (payload.legacySuccess === false) {
        totals.legacyFailed += 1
      }
    }

    if (payload.mismatch) {
      totals.mismatch += 1
      bucket.mismatch += 1
    }

    byOperationMap.set(payload.operation, bucket)
  }

  const mismatchRatio = ratioOrZero(totals.mismatch, totals.coreAttempted)
  const hasEnoughSamples = totals.coreAttempted >= thresholds.minSamples
  const failures: string[] = []

  if (!hasEnoughSamples) {
    failures.push(
      `samples=${totals.coreAttempted} below min=${thresholds.minSamples}`
    )
  }
  if (mismatchRatio > thresholds.maxMismatchRatio) {
    failures.push(
      `mismatchRatio=${mismatchRatio.toFixed(6)} exceeds max=${thresholds.maxMismatchRatio.toFixed(6)}`
    )
  }

  const byOperation = Array.from(byOperationMap.values())
    .map((item) => ({
      ...item,
      mismatchRatio: ratioOrZero(item.mismatch, item.coreAttempted),
    }))
    .sort((a, b) => b.mismatchRatio - a.mismatchRatio || b.coreAttempted - a.coreAttempted)

  return {
    generatedAt: new Date().toISOString(),
    windowMinutes: thresholds.windowMinutes,
    thresholds: {
      maxMismatchRatio: thresholds.maxMismatchRatio,
      minSamples: thresholds.minSamples,
    },
    result: failures.length === 0 ? 'PASS' : 'FAIL',
    summary: {
      ...totals,
      mismatchRatio,
      hasEnoughSamples,
    },
    byOperation,
    recentMismatch,
    failures,
  }
}
