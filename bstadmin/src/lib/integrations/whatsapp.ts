/**
 * GREEN-API WhatsApp Integration
 * Based on WAUtils.py from bookingautomation
 * 
 * Sends messages to WhatsApp group using GREEN-API
 */

import { prisma } from '@/lib/db'

export interface WhatsAppConfig {
  instanceId: string
  apiToken: string
  groupChatId: string
  baseUrl: string
  defaultCountryCode: string
}

export interface WhatsAppMessage {
  chatId: string
  message: string
  linkPreview?: boolean
}

export interface WhatsAppSendOutcome {
  success: boolean
  error: string | null
}

const DEFAULT_GREENAPI_BASE_URL = 'https://7103.api.greenapi.com'
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const MAX_ERROR_SNIPPET_LENGTH = 240

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

function parseBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.floor(parsed)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class WhatsAppService {
  private config: WhatsAppConfig
  private readonly sendMaxAttempts: number
  private readonly requestTimeoutMs: number

  constructor(config?: Partial<WhatsAppConfig>) {
    const baseUrlCandidate = String(
      config?.baseUrl ?? process.env.GREENAPI_BASE_URL ?? DEFAULT_GREENAPI_BASE_URL
    )
      .trim()
      .replace(/\/+$/, '')

    this.config = {
      instanceId: config?.instanceId ?? process.env.GREENAPI_INSTANCE_ID ?? '',
      apiToken: config?.apiToken ?? process.env.GREENAPI_API_TOKEN ?? '',
      groupChatId: config?.groupChatId ?? process.env.GREENAPI_GROUP_CHAT_ID ?? '',
      baseUrl: baseUrlCandidate || DEFAULT_GREENAPI_BASE_URL,
      defaultCountryCode:
        (config?.defaultCountryCode ?? process.env.GREENAPI_DEFAULT_COUNTRY_CODE ?? '62')
          .replace(/\D/g, '') || '62',
    }
    this.sendMaxAttempts = parseBoundedInt(process.env.GREENAPI_SEND_MAX_ATTEMPTS, 3, 1, 8)
    this.requestTimeoutMs = parseBoundedInt(process.env.GREENAPI_REQUEST_TIMEOUT_MS, 20000, 1000, 120000)
  }

  private sanitizeErrorDetails(raw: string): string {
    let value = String(raw || '').trim()
    if (!value) return ''
    if (this.config.apiToken) {
      value = value.split(this.config.apiToken).join('***')
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

  /**
   * Send message to WhatsApp group
   */
  async sendToGroup(message: string, linkPreview: boolean = true): Promise<boolean> {
    const outcome = await this.sendToGroupDetailed(message, linkPreview)
    return outcome.success
  }

  async sendToGroupDetailed(message: string, linkPreview: boolean = true): Promise<WhatsAppSendOutcome> {
    if (!this.config.groupChatId) {
      console.error('[WhatsApp] Missing GREEN-API group chat ID')
      return { success: false, error: 'Missing GREEN-API group chat ID' }
    }
    return this.sendMessage(this.config.groupChatId, message, linkPreview)
  }

  /**
   * Send message to explicit chat ID
   */
  async sendToChat(chatId: string, message: string, linkPreview: boolean = true): Promise<boolean> {
    const outcome = await this.sendToChatDetailed(chatId, message, linkPreview)
    return outcome.success
  }

  async sendToChatDetailed(chatId: string, message: string, linkPreview: boolean = true): Promise<WhatsAppSendOutcome> {
    return this.sendMessage(chatId, message, linkPreview)
  }

  /**
   * Send message to phone number (converted to @c.us chat ID)
   */
  async sendToPhone(phone: string, message: string, linkPreview: boolean = true): Promise<boolean> {
    const outcome = await this.sendToPhoneDetailed(phone, message, linkPreview)
    return outcome.success
  }

  async sendToPhoneDetailed(phone: string, message: string, linkPreview: boolean = true): Promise<WhatsAppSendOutcome> {
    const chatId = this.toPhoneChatId(phone)
    if (!chatId) {
      console.error('[WhatsApp] Invalid phone number:', phone)
      return { success: false, error: `Invalid phone number: ${String(phone || '').trim()}` }
    }
    return this.sendMessage(chatId, message, linkPreview)
  }

  /**
   * Normalize phone number to digits only with country code
   */
  normalizePhoneNumber(phone: string | null | undefined): string | null {
    const raw = String(phone ?? '').trim()
    if (!raw) return null

    let digits = raw.replace(/\D/g, '')
    if (!digits) return null

    if (digits.startsWith('00')) {
      digits = digits.slice(2)
    }

    if (digits.startsWith(this.config.defaultCountryCode)) {
      return digits
    }

    if (digits.startsWith('0')) {
      const normalized = `${this.config.defaultCountryCode}${digits.slice(1)}`
      return normalized.length > this.config.defaultCountryCode.length ? normalized : null
    }

    if (this.config.defaultCountryCode === '62' && digits.startsWith('8')) {
      return `62${digits}`
    }

    return digits
  }

  /**
   * Convert phone number into GREEN-API chat ID format
   */
  toPhoneChatId(phone: string | null | undefined): string | null {
    const normalized = this.normalizePhoneNumber(phone)
    return normalized ? `${normalized}@c.us` : null
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

  private async sendMessage(chatId: string, message: string, linkPreview: boolean): Promise<WhatsAppSendOutcome> {
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

    if (!this.config.instanceId || !this.config.apiToken) {
      console.error('[WhatsApp] Missing GREEN-API credentials')
      return { success: false, error: 'Missing GREEN-API credentials' }
    }

    const url = `${this.config.baseUrl}/waInstance${this.config.instanceId}/sendMessage/${this.config.apiToken}`

    const payload: WhatsAppMessage = {
      chatId,
      message,
      linkPreview,
    }

    for (let attempt = 1; attempt <= this.sendMaxAttempts; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!response.ok) {
          const errorText = this.sanitizeErrorDetails(await response.text())
          const lastError = errorText ? `HTTP ${response.status} - ${errorText}` : `HTTP ${response.status}`
          console.error(
            `[WhatsApp] API Error (attempt ${attempt}/${this.sendMaxAttempts}):`,
            response.status,
            errorText || '<empty>'
          )

          if (attempt < this.sendMaxAttempts && this.shouldRetry(response.status)) {
            await wait(this.retryDelayMs(attempt))
            continue
          }

          return { success: false, error: lastError }
        }

        const result = await response.json().catch(() => null)
        console.log('[WhatsApp] Message sent successfully:', result ?? { ok: true })
        return { success: true, error: null }
      } catch (error) {
        clearTimeout(timeout)
        const errName = error instanceof Error ? error.name : ''
        const rawMessage =
          errName === 'AbortError'
            ? `Request timeout after ${this.requestTimeoutMs}ms`
            : error instanceof Error
            ? error.message
              : String(error)
        const sanitized = this.sanitizeErrorDetails(rawMessage)
        const lastError = sanitized || 'Unknown request error'
        console.error(
          `[WhatsApp] Error sending message (attempt ${attempt}/${this.sendMaxAttempts}):`,
          sanitized || error
        )

        if (attempt < this.sendMaxAttempts) {
          await wait(this.retryDelayMs(attempt))
          continue
        }

        return { success: false, error: lastError }
      }
    }

    return { success: false, error: 'Unknown send result' }
  }

  /**
   * Format booking notification message
   * Based on message formatting in Python scripts
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

    // Header with source and booking ref
    lines.push(`*📧 New Booking - ${booking.source}*`)
    lines.push(`*Booking Ref:* ${booking.bookingRef}`)
    lines.push('')

    // Tour details
    lines.push(`*Tour:* ${booking.tourName}`)
    lines.push(`*Date:* ${this.formatDate(booking.tourDate)}`)
    if (booking.tourTime) {
      lines.push(`*Time:* ${booking.tourTime}`)
    }
    lines.push('')

    // Customer details
    lines.push(`*Customer:* ${booking.mainContactName}`)
    lines.push(`*Email:* ${booking.mainContactEmail}`)
    if (booking.phoneNumber) {
      lines.push(`*Phone:* ${booking.phoneNumber}`)
    }
    lines.push('')

    // Pax and pricing
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

    // Meeting point
    if (booking.meetingPoint) {
      lines.push(`*Meeting Point:* ${booking.meetingPoint}`)
      lines.push('')
    }

    // Additional notes
    if (booking.note) {
      lines.push(`*Note:* ${booking.note}`)
    }

    return lines.join('\n')
  }

  /**
   * Format cancellation message
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
   * Format update/modification message
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

    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}

// Singleton instance
let whatsappService: WhatsAppService | null = null

export function getWhatsAppService(): WhatsAppService {
  if (!whatsappService) {
    whatsappService = new WhatsAppService()
  }
  return whatsappService
}

// Convenience function
export async function sendWhatsAppToGroup(message: string): Promise<boolean> {
  const service = getWhatsAppService()
  return service.sendToGroup(message)
}
