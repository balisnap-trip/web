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

export class WhatsAppService {
  private config: WhatsAppConfig

  constructor(config?: Partial<WhatsAppConfig>) {
    this.config = {
      instanceId: config?.instanceId ?? process.env.GREENAPI_INSTANCE_ID ?? '',
      apiToken: config?.apiToken ?? process.env.GREENAPI_API_TOKEN ?? '',
      groupChatId: config?.groupChatId ?? process.env.GREENAPI_GROUP_CHAT_ID ?? '',
      baseUrl: config?.baseUrl ?? process.env.GREENAPI_BASE_URL ?? 'https://7103.api.greenapi.com',
      defaultCountryCode:
        (config?.defaultCountryCode ?? process.env.GREENAPI_DEFAULT_COUNTRY_CODE ?? '62')
          .replace(/\D/g, '') || '62',
    }
  }

  /**
   * Send message to WhatsApp group
   */
  async sendToGroup(message: string, linkPreview: boolean = true): Promise<boolean> {
    if (!this.config.groupChatId) {
      console.error('[WhatsApp] Missing GREEN-API group chat ID')
      return false
    }
    return this.sendMessage(this.config.groupChatId, message, linkPreview)
  }

  /**
   * Send message to explicit chat ID
   */
  async sendToChat(chatId: string, message: string, linkPreview: boolean = true): Promise<boolean> {
    return this.sendMessage(chatId, message, linkPreview)
  }

  /**
   * Send message to phone number (converted to @c.us chat ID)
   */
  async sendToPhone(phone: string, message: string, linkPreview: boolean = true): Promise<boolean> {
    const chatId = this.toPhoneChatId(phone)
    if (!chatId) {
      console.error('[WhatsApp] Invalid phone number:', phone)
      return false
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
    let enabled = process.env.WHATSAPP_ENABLED !== 'false'
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: 'whatsapp_enabled' },
        select: { value: true },
      })
      if (setting?.value && typeof setting.value === 'object' && 'enabled' in setting.value) {
        const value = setting.value as { enabled?: unknown }
        enabled = Boolean(value.enabled)
      }
    } catch {
      console.warn('[WhatsApp] Failed to read system setting, using env fallback')
    }
    return enabled
  }

  private async sendMessage(chatId: string, message: string, linkPreview: boolean): Promise<boolean> {
    if (!chatId) {
      console.error('[WhatsApp] Missing chat ID')
      return false
    }

    const isEnabled = await this.isEnabled()
    if (!isEnabled) {
      console.log('[WhatsApp] Notifications DISABLED (testing mode)')
      console.log('[WhatsApp] Chat ID:', chatId)
      console.log('[WhatsApp] Message:')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(message)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      return false
    }

    if (!this.config.instanceId || !this.config.apiToken) {
      console.error('[WhatsApp] Missing GREEN-API credentials')
      return false
    }

    const url = `${this.config.baseUrl}/waInstance${this.config.instanceId}/sendMessage/${this.config.apiToken}`

    const payload: WhatsAppMessage = {
      chatId,
      message,
      linkPreview,
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[WhatsApp] API Error:', response.status, errorText)
        return false
      }

      const result = await response.json()
      console.log('[WhatsApp] Message sent successfully:', result)
      return true
    } catch (error) {
      console.error('[WhatsApp] Error sending message:', error)
      return false
    }
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
