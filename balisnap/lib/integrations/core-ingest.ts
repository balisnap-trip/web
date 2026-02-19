import { createHash, createHmac, randomUUID } from 'crypto'

type BookingEventType = 'CREATED' | 'UPDATED' | 'CANCELLED'

interface BookingIngestEventV1 {
  payloadVersion: 'v1'
  eventType: BookingEventType
  eventTime: string
  source: 'DIRECT'
  externalBookingRef: string
  customer: {
    name?: string
    email?: string
    phone?: string
  }
  booking: {
    tourDate: string
    tourTime?: string
    adult: number
    child: number
    currency: string
    totalPrice: number
    pickupLocation?: string
    meetingPoint?: string
    note?: string
  }
  raw: {
    providerPayload: unknown
  }
}

interface EmitBookingEventInput {
  idempotencyKey: string
  event: BookingIngestEventV1
}

interface EmitBookingEventResult {
  disabled: boolean
  accepted: boolean
  status: number | null
  attempts: number
  error: string | null
}

const DEFAULT_INGEST_PATH = '/v1/ingest/bookings/events'
const DEFAULT_MAX_ATTEMPTS = 4
const DEFAULT_RETRY_DELAYS_MS = [500, 1_500, 4_000]

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

const readNumber = (raw: string | undefined, fallback: number, minValue = 1) => {
  if (!raw) {
    return fallback
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < minValue) {
    return fallback
  }

  return Math.floor(parsed)
}

const ingestFeatureEnabled = () =>
  readBoolean(process.env.WEB_EMIT_BOOKING_EVENT_ENABLED, false)

const ingestCoreApiBaseUrl = () => process.env.CORE_API_BASE_URL?.trim() || ''
const ingestPath = () => process.env.CORE_API_INGEST_PATH?.trim() || DEFAULT_INGEST_PATH
const ingestServiceToken = () => process.env.INGEST_SERVICE_TOKEN?.trim() || ''
const ingestServiceSecret = () => process.env.INGEST_SERVICE_SECRET?.trim() || ''
const ingestMaxAttempts = () =>
  readNumber(
    process.env.WEB_EMIT_BOOKING_EVENT_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
    1
  )
const ingestTimeoutMs = () =>
  readNumber(process.env.WEB_EMIT_BOOKING_EVENT_TIMEOUT_MS, 8_000, 1_000)

const buildRetryDelays = () => {
  const raw = process.env.WEB_EMIT_BOOKING_EVENT_RETRY_DELAYS_MS
  if (!raw) {
    return DEFAULT_RETRY_DELAYS_MS
  }

  const parsed = raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item))

  return parsed.length > 0 ? parsed : DEFAULT_RETRY_DELAYS_MS
}

const toSha256Hex = (input: string) =>
  createHash('sha256').update(input).digest('hex')

const signRequest = (input: {
  method: 'POST'
  path: string
  timestamp: string
  nonce: string
  idempotencyKey: string
  body: string
}) => {
  const canonical = [
    input.method,
    input.path,
    input.timestamp,
    input.nonce,
    input.idempotencyKey,
    toSha256Hex(input.body),
  ].join('\n')

  return createHmac('sha256', ingestServiceSecret()).update(canonical).digest('hex')
}

const isRetryableStatus = (status: number) => status >= 500 || status === 429

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const hasRequiredConfig = () =>
  Boolean(ingestCoreApiBaseUrl()) &&
  Boolean(ingestServiceToken()) &&
  Boolean(ingestServiceSecret())

const buildTargetUrl = () =>
  `${ingestCoreApiBaseUrl().replace(/\/+$/, '')}${ingestPath()}`

export const emitBookingEventToCore = async (
  input: EmitBookingEventInput
): Promise<EmitBookingEventResult> => {
  if (!ingestFeatureEnabled()) {
    return {
      disabled: true,
      accepted: false,
      status: null,
      attempts: 0,
      error: null,
    }
  }

  if (!hasRequiredConfig()) {
    return {
      disabled: false,
      accepted: false,
      status: null,
      attempts: 0,
      error: 'CORE_INGEST_RUNTIME_CONFIG_MISSING',
    }
  }

  const body = JSON.stringify(input.event)
  const retryDelays = buildRetryDelays()
  const maxAttempts = ingestMaxAttempts()
  const timeoutMs = ingestTimeoutMs()
  const requestPath = ingestPath()
  const targetUrl = buildTargetUrl()

  let lastStatus: number | null = null
  let lastError: string | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const timestamp = new Date().toISOString()
    const nonce = randomUUID()
    const signature = signRequest({
      method: 'POST',
      path: requestPath,
      timestamp,
      nonce,
      idempotencyKey: input.idempotencyKey,
      body,
    })

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ingestServiceToken()}`,
          'content-type': 'application/json',
          'x-signature': signature,
          'x-signature-algorithm': 'HMAC-SHA256',
          'x-timestamp': timestamp,
          'x-nonce': nonce,
          'x-idempotency-key': input.idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })

      lastStatus = response.status
      if (response.ok) {
        return {
          disabled: false,
          accepted: true,
          status: response.status,
          attempts: attempt,
          error: null,
        }
      }

      lastError = `HTTP_${response.status}`
      if (!isRetryableStatus(response.status) || attempt === maxAttempts) {
        return {
          disabled: false,
          accepted: false,
          status: response.status,
          attempts: attempt,
          error: lastError,
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt === maxAttempts) {
        return {
          disabled: false,
          accepted: false,
          status: lastStatus,
          attempts: attempt,
          error: lastError,
        }
      }
    }

    const delayMs =
      retryDelays[Math.min(attempt - 1, retryDelays.length - 1)] || retryDelays[0]
    await sleep(delayMs)
  }

  return {
    disabled: false,
    accepted: false,
    status: lastStatus,
    attempts: maxAttempts,
    error: lastError || 'UNKNOWN_INGEST_ERROR',
  }
}
