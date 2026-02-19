interface CoreApiEnvelope<T> {
  data: T
}

export interface CoreOpsBooking {
  bookingKey: string
  channelCode: string
  externalBookingRef: string
  customerPaymentStatus: string
  opsFulfillmentStatus: string
  note?: string
  meetingPoint?: string
  assignedDriverId?: number
}

export interface CoreApiResult<T> {
  ok: boolean
  status: number
  data: T | null
  error: string | null
}

export interface OpsCutoverActor {
  id?: string | number | null
  email?: string | null
}

export interface CoreApiRequestMetrics {
  windowMinutes: number
  generatedAt: string
  uptimeSeconds: number
  totals: {
    requests: number
    status2xx: number
    status3xx: number
    status4xx: number
    status5xx: number
  }
  rates: {
    successRate: number
    error4xxRate: number
    error5xxRate: number
  }
  throughput: {
    requestsPerSecond: number
    requestsPerMinute: number
  }
  latencyMs: {
    sampleCount: number
    avg: number
    median: number
    p95: number
    max: number
  }
}

export interface CoreIngestQueueMetrics {
  queue: {
    queueName: string
    enabled: boolean
    connected: boolean
    waiting: number
    active: number
    delayed: number
    completed: number
    failed: number
    paused: number
    lastError: string | null
  }
  deadLetter: {
    total: number
    byStatus: Record<string, number>
  }
}

export interface CoreIngestProcessingMetrics {
  windowMinutes: number
  totals: {
    received: number
    done: number
    failed: number
    processing: number
    pending: number
    terminal: number
  }
  successRate: number
  failureRate: number
  latenciesMs: {
    sampleCount: number
    median: number
    p95: number
    max: number
  }
}

export interface CoreReconciliationMetrics {
  generatedAt: string
  result: 'PASS' | 'FAIL'
  thresholds: {
    maxGlobalMismatchRatio: number
    maxOpsDoneNotPaidRatio: number
    maxUnmappedRatioPercent: number
  }
  metrics: {
    bookingCoreTotalRows: number
    bookingCoreNullIdentity: number
    bookingCoreDuplicateIdentityGroups: number
    bookingCoreDuplicateIdentityExcessRows: number
    paymentEventTotalRows: number
    paymentOrphanRows: number
    opsDoneTotal: number
    opsDoneNotPaid: number
    opsDoneNotPaidRatio: number
    ingestEventTotalRows: number
    ingestSecondaryDedupDuplicateGroups: number
    ingestSecondaryDedupExcessRows: number
    unmappedRows: number
    totalCatalogEntities: number
    unmappedRatioPercent: number | null
    globalMismatchRatio: number
  }
  domains: {
    booking: {
      mismatchRows: number
      denominator: number
      ratio: number | null
      thresholdRatio: number | null
      passed: boolean
    }
    payment: {
      mismatchRows: number
      denominator: number
      ratio: number | null
      thresholdRatio: number | null
      passed: boolean
    }
    ingest: {
      mismatchRows: number
      denominator: number
      ratio: number | null
      thresholdRatio: number | null
      passed: boolean
    }
    catalog: {
      mismatchRows: number
      denominator: number
      ratio: number | null
      thresholdRatio: number | null
      passed: boolean
    }
  }
  checks: Array<{
    name: string
    passed: boolean
    detail: string
  }>
}

const DEFAULT_TIMEOUT_MS = 8000

const readBoolean = (raw: string | undefined, fallback: boolean) => {
  if (raw === undefined) {
    return fallback
  }

  const normalized = raw.trim().toLowerCase()
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  )
}

const readCoreApiBaseUrl = () => process.env.CORE_API_BASE_URL?.trim() || ''
const readCoreApiAdminToken = () => process.env.CORE_API_ADMIN_TOKEN?.trim() || ''
const readCoreApiAdminRole = () =>
  (process.env.CORE_API_ADMIN_ROLE?.trim().toUpperCase() || 'ADMIN')
const readCoreApiTimeoutMs = () => {
  const raw = Number(process.env.CORE_API_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  if (!Number.isFinite(raw) || raw < 1000) {
    return DEFAULT_TIMEOUT_MS
  }
  return Math.floor(raw)
}

const readCutoverPercentage = (rawValue: string | undefined, fallback: number) => {
  const raw = Number(rawValue ?? fallback)
  if (!Number.isFinite(raw)) {
    return fallback
  }
  if (raw < 0) return 0
  if (raw > 100) return 100
  return raw
}

const readCsvSet = (rawValue: string | undefined) =>
  new Set(
    (rawValue || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  )

const normalizeActorId = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.floor(value))
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase()
  }
  return ''
}

const canaryBucket = (seed: string) => {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return hash % 100
}

const shouldEnableForActor = ({
  baseEnabled,
  percentage,
  actor,
  canaryUserIds,
  canaryEmails,
}: {
  baseEnabled: boolean
  percentage: number
  actor?: OpsCutoverActor
  canaryUserIds: Set<string>
  canaryEmails: Set<string>
}) => {
  if (!baseEnabled) {
    return false
  }

  const actorEmail = normalizeActorId(actor?.email)
  const actorId = normalizeActorId(actor?.id)
  if ((actorEmail && canaryEmails.has(actorEmail)) || (actorId && canaryUserIds.has(actorId))) {
    return true
  }

  if (percentage >= 100) {
    return true
  }
  if (percentage <= 0) {
    return false
  }

  const seed = actorEmail || actorId
  if (!seed) {
    return false
  }
  return canaryBucket(seed) < percentage
}

const normalizeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const buildCoreApiUrl = (path: string) => {
  const baseUrl = readCoreApiBaseUrl()
  if (!baseUrl) {
    return null
  }
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

const coreApiHeaders = () => ({
  authorization: `Bearer ${readCoreApiAdminToken()}`,
  'x-admin-role': readCoreApiAdminRole(),
  'content-type': 'application/json',
})

const missingCoreApiRuntimeConfig = () =>
  !readCoreApiBaseUrl() || !readCoreApiAdminToken()

const requestCoreApi = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<CoreApiResult<T>> => {
  if (missingCoreApiRuntimeConfig()) {
    return {
      ok: false,
      status: 503,
      data: null,
      error: 'CORE_API_RUNTIME_CONFIG_MISSING',
    }
  }

  const url = buildCoreApiUrl(path)
  if (!url) {
    return {
      ok: false,
      status: 503,
      data: null,
      error: 'CORE_API_BASE_URL_MISSING',
    }
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...coreApiHeaders(),
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(readCoreApiTimeoutMs()),
    })

    const text = await response.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }

    if (!response.ok) {
      const errorMessage =
        json?.error?.message || json?.message || `CORE_API_HTTP_${response.status}`
      return {
        ok: false,
        status: response.status,
        data: null,
        error: errorMessage,
      }
    }

    const data = (json as CoreApiEnvelope<T> | null)?.data ?? null
    return {
      ok: true,
      status: response.status,
      data,
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      status: 503,
      data: null,
      error: normalizeError(error),
    }
  }
}

export const isOpsReadNewModelEnabled = () =>
  readBoolean(process.env.OPS_READ_NEW_MODEL_ENABLED, false)

export const isOpsReadNewModelEnabledForActor = (actor?: OpsCutoverActor) =>
  shouldEnableForActor({
    baseEnabled: isOpsReadNewModelEnabled(),
    percentage: readCutoverPercentage(process.env.OPS_READ_NEW_MODEL_PERCENT, 100),
    actor,
    canaryUserIds: readCsvSet(process.env.OPS_READ_NEW_MODEL_CANARY_USER_IDS),
    canaryEmails: readCsvSet(process.env.OPS_READ_NEW_MODEL_CANARY_EMAILS),
  })

export const isOpsWriteCoreEnabled = () =>
  readBoolean(process.env.OPS_WRITE_CORE_ENABLED, false)

export const isOpsWriteCoreEnabledForActor = (actor?: OpsCutoverActor) =>
  shouldEnableForActor({
    baseEnabled: isOpsWriteCoreEnabled(),
    percentage: readCutoverPercentage(process.env.OPS_WRITE_CORE_PERCENT, 100),
    actor,
    canaryUserIds: readCsvSet(process.env.OPS_WRITE_CORE_CANARY_USER_IDS),
    canaryEmails: readCsvSet(process.env.OPS_WRITE_CORE_CANARY_EMAILS),
  })

export const isOpsWriteCoreStrict = () =>
  readBoolean(process.env.OPS_WRITE_CORE_STRICT, false)

export const fetchCoreOpsBookings = async () =>
  requestCoreApi<CoreOpsBooking[]>('/v1/ops/bookings')

export const fetchCoreOpsBookingDetail = async (idOrExternalRef: string) =>
  requestCoreApi<CoreOpsBooking>(
    `/v1/ops/bookings/${encodeURIComponent(idOrExternalRef)}`
  )

export const patchCoreOpsBooking = async (
  idOrExternalRef: string,
  payload: {
    note?: string
    meetingPoint?: string
    packageRefType?: string
    packageRefKey?: string
  }
) =>
  requestCoreApi<{ booking: CoreOpsBooking }>(
    `/v1/ops/bookings/${encodeURIComponent(idOrExternalRef)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )

export const assignCoreOpsBooking = async (
  idOrExternalRef: string,
  driverId: number
) =>
  requestCoreApi<CoreOpsBooking>(
    `/v1/ops/bookings/${encodeURIComponent(idOrExternalRef)}/assign`,
    {
      method: 'POST',
      body: JSON.stringify({ driverId }),
    }
  )

export const unassignCoreOpsBooking = async (idOrExternalRef: string) =>
  requestCoreApi<CoreOpsBooking>(
    `/v1/ops/bookings/${encodeURIComponent(idOrExternalRef)}/unassign`,
    {
      method: 'POST',
    }
  )

export const syncCoreOpsBookingStatus = async (idOrExternalRef: string) =>
  requestCoreApi<CoreOpsBooking>(
    `/v1/ops/bookings/${encodeURIComponent(idOrExternalRef)}/status/sync`,
    {
      method: 'POST',
    }
  )

export const fetchCoreApiRequestMetrics = async (windowMinutes = 15) =>
  requestCoreApi<CoreApiRequestMetrics>(
    `/v1/metrics/api?windowMinutes=${encodeURIComponent(String(windowMinutes))}`
  )

export const fetchCoreIngestQueueMetrics = async () =>
  requestCoreApi<CoreIngestQueueMetrics>('/v1/ingest/metrics/queue')

export const fetchCoreIngestProcessingMetrics = async (windowMinutes = 60) =>
  requestCoreApi<CoreIngestProcessingMetrics>(
    `/v1/ingest/metrics/processing?windowMinutes=${encodeURIComponent(String(windowMinutes))}`
  )

export const fetchCoreReconciliationMetrics = async () =>
  requestCoreApi<CoreReconciliationMetrics>('/v1/metrics/reconciliation')
