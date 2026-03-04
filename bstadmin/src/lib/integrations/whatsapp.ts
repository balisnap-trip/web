/**
 * Multi-provider WhatsApp integration.
 *
 * Supports:
 * - GREEN-API
 * - WAHA (self-hosted)
 */

import { prisma } from '@/lib/db'
import {
  loadWhatsAppProviderSettings,
  type GreenApiSettings,
  type WhatsAppProvider,
  type WhatsAppProviderSettings,
  type WahaSettings,
} from '@/lib/whatsapp/provider-settings'

export interface WhatsAppSendOutcome {
  success: boolean
  error: string | null
}

interface ProviderRequest {
  provider: WhatsAppProvider
  url: string
  headers: Record<string, string>
  body: unknown
  maxAttempts: number
  requestTimeoutMs: number
  redactValues: string[]
}

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const MAX_ERROR_SNIPPET_LENGTH = 240
const FALLBACK_COUNTRY_CODE = '62'

function parseEnabledValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return null
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false
    return null
  }

  if (value && typeof value === 'object' && !Array.isArray(value) && 'enabled' in value) {
    const maybeEnabled = value as { enabled?: unknown }
    return parseEnabledValue(maybeEnabled.enabled)
  }

  return null
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class WhatsAppService {
  private lastKnownDefaultCountryCode = this.resolveInitialDefaultCountryCode()

  private resolveInitialDefaultCountryCode(): string {
    const candidates = [
      process.env.WHATSAPP_DEFAULT_COUNTRY_CODE,
      process.env.WAHA_DEFAULT_COUNTRY_CODE,
      process.env.GREENAPI_DEFAULT_COUNTRY_CODE,
      FALLBACK_COUNTRY_CODE,
    ]

    for (const candidate of candidates) {
      const normalized = String(candidate ?? '').replace(/\D/g, '')
      if (normalized) {
        return normalized
      }
    }

    return FALLBACK_COUNTRY_CODE
  }

  private sanitizeErrorDetails(raw: string, redactValues: string[] = []): string {
    let value = String(raw || '').trim()
    if (!value) return ''

    for (const secret of redactValues) {
      if (secret) {
        value = value.split(secret).join('***')
      }
    }

    value = value.replace(/waInstance\d+/g, 'waInstance***')

    if (value.length > MAX_ERROR_SNIPPET_LENGTH) {
      value = `${value.slice(0, MAX_ERROR_SNIPPET_LENGTH)}...`
    }

    return value
  }

  private shouldRetry(status: number): boolean {
    return RETRYABLE_HTTP_STATUSES.has(status)
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(5000, 400 * Math.pow(2, Math.max(0, attempt - 1)))
  }

  private normalizePhoneNumberWithCountryCode(
    phone: string | null | undefined,
    defaultCountryCode: string
  ): string | null {
    const raw = String(phone ?? '').trim()
    if (!raw) return null

    const countryCode = String(defaultCountryCode || FALLBACK_COUNTRY_CODE).replace(/\D/g, '') || FALLBACK_COUNTRY_CODE
    let digits = raw.replace(/\D/g, '')
    if (!digits) return null

    if (digits.startsWith('00')) {
      digits = digits.slice(2)
    }

    if (digits.startsWith(countryCode)) {
      return digits
    }

    if (digits.startsWith('0')) {
      const normalized = `${countryCode}${digits.slice(1)}`
      return normalized.length > countryCode.length ? normalized : null
    }

    if (countryCode === '62' && digits.startsWith('8')) {
      return `62${digits}`
    }

    return digits
  }

  private toPhoneChatIdWithCountryCode(
    phone: string | null | undefined,
    defaultCountryCode: string
  ): string | null {
    const normalized = this.normalizePhoneNumberWithCountryCode(phone, defaultCountryCode)
    return normalized ? `${normalized}@c.us` : null
  }

  private async getRuntimeSettings(): Promise<WhatsAppProviderSettings> {
    const settings = await loadWhatsAppProviderSettings()
    this.lastKnownDefaultCountryCode = this.getDefaultCountryCode(settings)
    return settings
  }

  private getDefaultCountryCode(settings: WhatsAppProviderSettings): string {
    const code =
      settings.provider === 'waha'
        ? settings.waha.defaultCountryCode
        : settings.greenApi.defaultCountryCode

    return String(code || FALLBACK_COUNTRY_CODE).replace(/\D/g, '') || FALLBACK_COUNTRY_CODE
  }

  private getGroupChatId(settings: WhatsAppProviderSettings): string {
    return settings.provider === 'waha'
      ? settings.waha.groupChatId
      : settings.greenApi.groupChatId
  }

  private providerLabel(provider: WhatsAppProvider): string {
    return provider === 'waha' ? 'WAHA' : 'GREEN-API'
  }

  /**
   * Send message to the configured WhatsApp group.
   */
  async sendToGroup(message: string, linkPreview: boolean = true): Promise<boolean> {
    const outcome = await this.sendToGroupDetailed(message, linkPreview)
    return outcome.success
  }

  async sendToGroupDetailed(
    message: string,
    linkPreview: boolean = true
  ): Promise<WhatsAppSendOutcome> {
    const settings = await this.getRuntimeSettings()
    const chatId = this.getGroupChatId(settings)

    if (!chatId) {
      const label = this.providerLabel(settings.provider)
      console.error(`[WhatsApp] Missing ${label} group chat ID`)
      return { success: false, error: `Missing ${label} group chat ID` }
    }

    return this.sendMessage(settings, chatId, message, linkPreview)
  }

  /**
   * Send message to an explicit chat ID.
   */
  async sendToChat(chatId: string, message: string, linkPreview: boolean = true): Promise<boolean> {
    const outcome = await this.sendToChatDetailed(chatId, message, linkPreview)
    return outcome.success
  }

  async sendToChatDetailed(
    chatId: string,
    message: string,
    linkPreview: boolean = true
  ): Promise<WhatsAppSendOutcome> {
    const settings = await this.getRuntimeSettings()
    return this.sendMessage(settings, chatId, message, linkPreview)
  }

  /**
   * Send message to phone number (converted to @c.us chat ID).
   */
  async sendToPhone(phone: string, message: string, linkPreview: boolean = true): Promise<boolean> {
    const outcome = await this.sendToPhoneDetailed(phone, message, linkPreview)
    return outcome.success
  }

  async sendToPhoneDetailed(
    phone: string,
    message: string,
    linkPreview: boolean = true
  ): Promise<WhatsAppSendOutcome> {
    const settings = await this.getRuntimeSettings()
    const chatId = this.toPhoneChatIdWithCountryCode(phone, this.getDefaultCountryCode(settings))

    if (!chatId) {
      console.error('[WhatsApp] Invalid phone number:', phone)
      return { success: false, error: `Invalid phone number: ${String(phone || '').trim()}` }
    }

    return this.sendMessage(settings, chatId, message, linkPreview)
  }

  /**
   * Normalize phone number to digits only with country code.
   *
   * This stays synchronous because the booking draft builder depends on it.
   * It uses the last resolved provider country code and falls back to env/defaults.
   */
  normalizePhoneNumber(phone: string | null | undefined): string | null {
    return this.normalizePhoneNumberWithCountryCode(phone, this.lastKnownDefaultCountryCode)
  }

  /**
   * Convert phone number into chat ID format.
   */
  toPhoneChatId(phone: string | null | undefined): string | null {
    return this.toPhoneChatIdWithCountryCode(phone, this.lastKnownDefaultCountryCode)
  }

  async isEnabled(): Promise<boolean> {
    let enabled = parseEnabledValue(process.env.WHATSAPP_ENABLED)
    if (enabled === null) {
      enabled = true
    }

    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: 'whatsapp_enabled' },
        select: { value: true },
      })
      const settingEnabled = parseEnabledValue(setting?.value)
      if (settingEnabled !== null) {
        enabled = settingEnabled
      }
    } catch {
      console.warn('[WhatsApp] Failed to read system setting, using env fallback')
    }

    return enabled
  }

  private async sendMessage(
    settings: WhatsAppProviderSettings,
    chatId: string,
    message: string,
    linkPreview: boolean
  ): Promise<WhatsAppSendOutcome> {
    if (!chatId) {
      console.error('[WhatsApp] Missing chat ID')
      return { success: false, error: 'Missing chat ID' }
    }

    const isEnabled = await this.isEnabled()
    if (!isEnabled) {
      console.log('[WhatsApp] Notifications DISABLED (testing mode)')
      console.log('[WhatsApp] Chat ID:', chatId)
      console.log('[WhatsApp] Message:')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(message)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      return { success: false, error: 'WhatsApp disabled by system setting' }
    }

    if (settings.provider === 'waha') {
      return this.sendViaWaha(settings.waha, chatId, message, linkPreview)
    }

    return this.sendViaGreenApi(settings.greenApi, chatId, message, linkPreview)
  }

  private async sendViaGreenApi(
    config: GreenApiSettings,
    chatId: string,
    message: string,
    linkPreview: boolean
  ): Promise<WhatsAppSendOutcome> {
    if (!config.instanceId || !config.apiToken) {
      console.error('[WhatsApp] Missing GREEN-API credentials')
      return { success: false, error: 'Missing GREEN-API credentials' }
    }

    return this.performRequest({
      provider: 'green_api',
      url: `${config.baseUrl}/waInstance${config.instanceId}/sendMessage/${config.apiToken}`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        chatId,
        message,
        linkPreview,
      },
      maxAttempts: config.sendMaxAttempts,
      requestTimeoutMs: config.requestTimeoutMs,
      redactValues: [config.apiToken],
    })
  }

  private async sendViaWaha(
    config: WahaSettings,
    chatId: string,
    message: string,
    linkPreview: boolean
  ): Promise<WhatsAppSendOutcome> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (config.apiKey) {
      headers['X-Api-Key'] = config.apiKey
    }

    return this.performRequest({
      provider: 'waha',
      url: `${config.baseUrl}/api/sendText`,
      headers,
      body: {
        session: config.session,
        chatId,
        text: message,
        linkPreview,
      },
      maxAttempts: config.sendMaxAttempts,
      requestTimeoutMs: config.requestTimeoutMs,
      redactValues: [config.apiKey],
    })
  }

  private async performRequest(request: ProviderRequest): Promise<WhatsAppSendOutcome> {
    const label = this.providerLabel(request.provider)

    for (let attempt = 1; attempt <= request.maxAttempts; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), request.requestTimeoutMs)

      try {
        const response = await fetch(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify(request.body),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!response.ok) {
          const errorText = this.sanitizeErrorDetails(
            await response.text(),
            request.redactValues
          )
          const lastError = errorText ? `HTTP ${response.status} - ${errorText}` : `HTTP ${response.status}`

          console.error(
            `[WhatsApp] ${label} API Error (attempt ${attempt}/${request.maxAttempts}):`,
            response.status,
            errorText || '<empty>'
          )

          if (attempt < request.maxAttempts && this.shouldRetry(response.status)) {
            await wait(this.retryDelayMs(attempt))
            continue
          }

          return { success: false, error: lastError }
        }

        const result = await response.json().catch(() => null)
        console.log(`[WhatsApp] ${label} message sent successfully:`, result ?? { ok: true })
        return { success: true, error: null }
      } catch (error) {
        clearTimeout(timeout)

        const errName = error instanceof Error ? error.name : ''
        const rawMessage =
          errName === 'AbortError'
            ? `Request timeout after ${request.requestTimeoutMs}ms`
            : error instanceof Error
            ? error.message
            : String(error)
        const sanitized = this.sanitizeErrorDetails(rawMessage, request.redactValues)
        const lastError = sanitized || 'Unknown request error'

        console.error(
          `[WhatsApp] ${label} error sending message (attempt ${attempt}/${request.maxAttempts}):`,
          sanitized || error
        )

        if (attempt < request.maxAttempts) {
          await wait(this.retryDelayMs(attempt))
          continue
        }

        return { success: false, error: lastError }
      }
    }

    return { success: false, error: 'Unknown send result' }
  }

  /**
   * Format booking notification message.
   */
  formatBookingMessage(booking: {
    source: string
    bookingRef: string
    tourName: string
    tourDate: Date
    tourTime?: string
    mainContactName: string
    mainContactEmail: string
    phoneNumber?: string
    numberOfAdult: number
    numberOfChild?: number
    totalPrice: number
    currency: string
    meetingPoint?: string
    note?: string
  }): string {
    const lines: string[] = []

    lines.push(`*📧 New Booking - ${booking.source}*`)
    lines.push(`*Booking Ref:* ${booking.bookingRef}`)
    lines.push('')

    lines.push(`*Tour:* ${booking.tourName}`)
    lines.push(`*Date:* ${this.formatDate(booking.tourDate)}`)
    if (booking.tourTime) {
      lines.push(`*Time:* ${booking.tourTime}`)
    }
    lines.push('')

    lines.push(`*Customer:* ${booking.mainContactName}`)
    lines.push(`*Email:* ${booking.mainContactEmail}`)
    if (booking.phoneNumber) {
      lines.push(`*Phone:* ${booking.phoneNumber}`)
    }
    lines.push('')

    const paxParts: string[] = []
    if (booking.numberOfAdult > 0) {
      paxParts.push(`${booking.numberOfAdult} Adult${booking.numberOfAdult > 1 ? 's' : ''}`)
    }
    if (booking.numberOfChild && booking.numberOfChild > 0) {
      paxParts.push(`${booking.numberOfChild} Child${booking.numberOfChild > 1 ? 'ren' : ''}`)
    }
    lines.push(`*Pax:* ${paxParts.join(', ')}`)

    if (booking.totalPrice > 0) {
      lines.push(`*Price:* ${this.formatCurrency(booking.totalPrice, booking.currency)}`)
    }
    lines.push('')

    if (booking.meetingPoint) {
      lines.push(`*Meeting Point:* ${booking.meetingPoint}`)
      lines.push('')
    }

    if (booking.note) {
      lines.push(`*Note:* ${booking.note}`)
    }

    return lines.join('\n')
  }

  /**
   * Format cancellation message.
   */
  formatCancellationMessage(bookingRef: string, tourName: string, source: string): string {
    return [
      `*❌ Booking Cancelled - ${source}*`,
      `*Booking Ref:* ${bookingRef}`,
      `*Tour:* ${tourName}`,
      '',
      '⚠️ Please remove from calendar and spreadsheet.',
    ].join('\n')
  }

  /**
   * Format update/modification message.
   */
  formatUpdateMessage(bookingRef: string, tourName: string, source: string): string {
    return [
      `*🔄 Booking Updated - ${source}*`,
      `*Booking Ref:* ${bookingRef}`,
      `*Tour:* ${tourName}`,
      '',
      '⚠️ Please check updated details in admin dashboard.',
    ].join('\n')
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date)
  }

  private formatCurrency(amount: number, currency: string): string {
    const symbols: Record<string, string> = {
      USD: '$',
      IDR: 'Rp',
      EUR: '€',
      GBP: '£',
    }

    const symbol = symbols[currency] || currency

    if (currency === 'IDR') {
      return `${symbol} ${amount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
    }

    return `${symbol}${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
}

let whatsappService: WhatsAppService | null = null

export function getWhatsAppService(): WhatsAppService {
  if (!whatsappService) {
    whatsappService = new WhatsAppService()
  }

  return whatsappService
}

export async function sendWhatsAppToGroup(message: string): Promise<boolean> {
  const service = getWhatsAppService()
  return service.sendToGroup(message)
}
