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

export const isOpsWriteCoreEnabled = () =>
  readBoolean(process.env.OPS_WRITE_CORE_ENABLED, false)

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
