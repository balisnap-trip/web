import { prisma } from '@/lib/db'

export type WhatsAppProvider = 'green_api' | 'waha'

export interface GreenApiSettings {
  instanceId: string
  apiToken: string
  groupChatId: string
  baseUrl: string
  defaultCountryCode: string
  sendMaxAttempts: number
  requestTimeoutMs: number
}

export interface WahaSettings {
  baseUrl: string
  apiKey: string
  session: string
  groupChatId: string
  defaultCountryCode: string
  sendMaxAttempts: number
  requestTimeoutMs: number
}

export interface WhatsAppProviderSettings {
  provider: WhatsAppProvider
  greenApi: GreenApiSettings
  waha: WahaSettings
}

export const WHATSAPP_PROVIDER_SETTING_KEYS = {
  provider: 'whatsapp_provider',
  greenApi: 'whatsapp_green_api_config',
  waha: 'whatsapp_waha_config',
} as const

const DEFAULT_GREENAPI_BASE_URL = 'https://7103.api.greenapi.com'
const DEFAULT_WAHA_BASE_URL = 'http://127.0.0.1:3100'
const DEFAULT_COUNTRY_CODE = '62'
const DEFAULT_SEND_MAX_ATTEMPTS = 3
const DEFAULT_REQUEST_TIMEOUT_MS = 20000

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function parseString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }
  return value.trim()
}

function parseBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.floor(parsed)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

function normalizeBaseUrl(value: string, fallback: string): string {
  const normalized = parseString(value, fallback).replace(/\/+$/, '')
  return normalized || fallback
}

function normalizeCountryCode(value: string, fallback: string): string {
  const digits = parseString(value, fallback).replace(/\D/g, '')
  return digits || fallback
}

export function parseWhatsAppProvider(value: unknown, fallback: WhatsAppProvider = 'green_api'): WhatsAppProvider {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'provider' in value) {
    const record = value as { provider?: unknown }
    return parseWhatsAppProvider(record.provider, fallback)
  }

  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (normalized === 'waha') return 'waha'
  if (normalized === 'greenapi' || normalized === 'green_api') return 'green_api'
  return fallback
}

export function getDefaultGreenApiSettings(): GreenApiSettings {
  return {
    instanceId: String(process.env.GREENAPI_INSTANCE_ID ?? '').trim(),
    apiToken: String(process.env.GREENAPI_API_TOKEN ?? '').trim(),
    groupChatId: String(process.env.GREENAPI_GROUP_CHAT_ID ?? '').trim(),
    baseUrl: normalizeBaseUrl(
      String(process.env.GREENAPI_BASE_URL ?? DEFAULT_GREENAPI_BASE_URL),
      DEFAULT_GREENAPI_BASE_URL
    ),
    defaultCountryCode: normalizeCountryCode(
      String(process.env.GREENAPI_DEFAULT_COUNTRY_CODE ?? DEFAULT_COUNTRY_CODE),
      DEFAULT_COUNTRY_CODE
    ),
    sendMaxAttempts: parseBoundedInt(
      process.env.GREENAPI_SEND_MAX_ATTEMPTS,
      DEFAULT_SEND_MAX_ATTEMPTS,
      1,
      8
    ),
    requestTimeoutMs: parseBoundedInt(
      process.env.GREENAPI_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
      1000,
      120000
    ),
  }
}

export function getDefaultWahaSettings(): WahaSettings {
  return {
    baseUrl: normalizeBaseUrl(
      String(process.env.WAHA_BASE_URL ?? DEFAULT_WAHA_BASE_URL),
      DEFAULT_WAHA_BASE_URL
    ),
    apiKey: String(process.env.WAHA_API_KEY ?? '').trim(),
    session: String(process.env.WAHA_SESSION ?? 'default').trim() || 'default',
    groupChatId: String(process.env.WAHA_GROUP_CHAT_ID ?? '').trim(),
    defaultCountryCode: normalizeCountryCode(
      String(process.env.WAHA_DEFAULT_COUNTRY_CODE ?? DEFAULT_COUNTRY_CODE),
      DEFAULT_COUNTRY_CODE
    ),
    sendMaxAttempts: parseBoundedInt(
      process.env.WAHA_SEND_MAX_ATTEMPTS,
      DEFAULT_SEND_MAX_ATTEMPTS,
      1,
      8
    ),
    requestTimeoutMs: parseBoundedInt(
      process.env.WAHA_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
      1000,
      120000
    ),
  }
}

export function getDefaultWhatsAppProviderSettings(): WhatsAppProviderSettings {
  return {
    provider: parseWhatsAppProvider(process.env.WHATSAPP_PROVIDER, 'green_api'),
    greenApi: getDefaultGreenApiSettings(),
    waha: getDefaultWahaSettings(),
  }
}

function mergeGreenApiSettings(
  value: unknown,
  fallback: GreenApiSettings
): GreenApiSettings {
  const record = asRecord(value)

  return {
    instanceId: parseString(record?.instanceId, fallback.instanceId),
    apiToken: parseString(record?.apiToken, fallback.apiToken),
    groupChatId: parseString(record?.groupChatId, fallback.groupChatId),
    baseUrl: normalizeBaseUrl(String(record?.baseUrl ?? fallback.baseUrl), fallback.baseUrl),
    defaultCountryCode: normalizeCountryCode(
      String(record?.defaultCountryCode ?? fallback.defaultCountryCode),
      fallback.defaultCountryCode
    ),
    sendMaxAttempts: parseBoundedInt(record?.sendMaxAttempts, fallback.sendMaxAttempts, 1, 8),
    requestTimeoutMs: parseBoundedInt(
      record?.requestTimeoutMs,
      fallback.requestTimeoutMs,
      1000,
      120000
    ),
  }
}

function mergeWahaSettings(
  value: unknown,
  fallback: WahaSettings
): WahaSettings {
  const record = asRecord(value)

  return {
    baseUrl: normalizeBaseUrl(String(record?.baseUrl ?? fallback.baseUrl), fallback.baseUrl),
    apiKey: parseString(record?.apiKey, fallback.apiKey),
    session: parseString(record?.session, fallback.session) || fallback.session,
    groupChatId: parseString(record?.groupChatId, fallback.groupChatId),
    defaultCountryCode: normalizeCountryCode(
      String(record?.defaultCountryCode ?? fallback.defaultCountryCode),
      fallback.defaultCountryCode
    ),
    sendMaxAttempts: parseBoundedInt(record?.sendMaxAttempts, fallback.sendMaxAttempts, 1, 8),
    requestTimeoutMs: parseBoundedInt(
      record?.requestTimeoutMs,
      fallback.requestTimeoutMs,
      1000,
      120000
    ),
  }
}

export function normalizeWhatsAppProviderSettings(
  input: Partial<WhatsAppProviderSettings> | null | undefined
): WhatsAppProviderSettings {
  const defaults = getDefaultWhatsAppProviderSettings()

  return {
    provider: parseWhatsAppProvider(input?.provider, defaults.provider),
    greenApi: mergeGreenApiSettings(input?.greenApi, defaults.greenApi),
    waha: mergeWahaSettings(input?.waha, defaults.waha),
  }
}

export function resolveWhatsAppProviderSettings(
  values: Map<string, unknown> | Record<string, unknown> | null | undefined
): WhatsAppProviderSettings {
  const valueMap =
    values instanceof Map
      ? values
      : new Map<string, unknown>(Object.entries(values ?? {}))

  const defaults = getDefaultWhatsAppProviderSettings()

  return {
    provider: parseWhatsAppProvider(valueMap.get(WHATSAPP_PROVIDER_SETTING_KEYS.provider), defaults.provider),
    greenApi: mergeGreenApiSettings(
      valueMap.get(WHATSAPP_PROVIDER_SETTING_KEYS.greenApi),
      defaults.greenApi
    ),
    waha: mergeWahaSettings(valueMap.get(WHATSAPP_PROVIDER_SETTING_KEYS.waha), defaults.waha),
  }
}

export async function loadWhatsAppProviderSettings(): Promise<WhatsAppProviderSettings> {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: Object.values(WHATSAPP_PROVIDER_SETTING_KEYS),
        },
      },
      select: {
        key: true,
        value: true,
      },
    })

    return resolveWhatsAppProviderSettings(
      new Map<string, unknown>(settings.map((setting) => [setting.key, setting.value]))
    )
  } catch (error) {
    console.warn('[WhatsApp] Failed to read provider settings, using env fallback:', error)
    return getDefaultWhatsAppProviderSettings()
  }
}

export async function saveWhatsAppProviderSettings(
  input: Partial<WhatsAppProviderSettings> | null | undefined,
  updatedBy?: string | null
): Promise<WhatsAppProviderSettings> {
  const normalized = normalizeWhatsAppProviderSettings(input)

  await Promise.all([
    prisma.systemSetting.upsert({
      where: { key: WHATSAPP_PROVIDER_SETTING_KEYS.provider },
      update: {
        value: normalized.provider,
        category: 'system',
        updatedBy: updatedBy ?? null,
      },
      create: {
        key: WHATSAPP_PROVIDER_SETTING_KEYS.provider,
        value: normalized.provider,
        category: 'system',
        updatedBy: updatedBy ?? null,
      },
    }),
    prisma.systemSetting.upsert({
      where: { key: WHATSAPP_PROVIDER_SETTING_KEYS.greenApi },
      update: {
        value: normalized.greenApi,
        category: 'system',
        updatedBy: updatedBy ?? null,
      },
      create: {
        key: WHATSAPP_PROVIDER_SETTING_KEYS.greenApi,
        value: normalized.greenApi,
        category: 'system',
        updatedBy: updatedBy ?? null,
      },
    }),
    prisma.systemSetting.upsert({
      where: { key: WHATSAPP_PROVIDER_SETTING_KEYS.waha },
      update: {
        value: normalized.waha,
        category: 'system',
        updatedBy: updatedBy ?? null,
      },
      create: {
        key: WHATSAPP_PROVIDER_SETTING_KEYS.waha,
        value: normalized.waha,
        category: 'system',
        updatedBy: updatedBy ?? null,
      },
    }),
  ])

  return normalized
}
