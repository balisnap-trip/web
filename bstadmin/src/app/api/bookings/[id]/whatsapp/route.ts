import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getWhatsAppService } from '@/lib/integrations/whatsapp'
import {
  extractTemplateXmlFromSettingValue,
  getWhatsAppTemplateDefinition,
  renderWhatsAppTemplateXml,
  type WhatsAppTemplateKey,
} from '@/lib/whatsapp/templates'

const WA_SEND_TYPES = [
  'BOOKING_GROUP',
  'BOOKING_GUEST',
  'READY_DRIVER',
  'READY_PARTNERS',
  'READY_GUEST',
  'ATTENTION_GUEST',
  'ATTENTION_DRIVER',
  'DONE_PAID_INVOICE',
] as const

type WaSendType = (typeof WA_SEND_TYPES)[number]
type WaMode = 'preview' | 'send'

type MessageDraft = {
  id: string
  target: string
  chatType: 'group' | 'phone'
  phone: string | null
  chatId: string | null
  message: string
  canSend: boolean
  error: string | null
}

type SendResult = {
  id: string
  target: string
  phone: string | null
  success: boolean
  message: string
}

const READY_ONLY_TYPES: WaSendType[] = ['READY_DRIVER', 'READY_PARTNERS', 'READY_GUEST']
const ATTENTION_ONLY_TYPES: WaSendType[] = ['ATTENTION_GUEST', 'ATTENTION_DRIVER']
const DONE_ONLY_TYPES: WaSendType[] = ['DONE_PAID_INVOICE']

function isWaSendType(value: unknown): value is WaSendType {
  return typeof value === 'string' && WA_SEND_TYPES.includes(value as WaSendType)
}

function isWaMode(value: unknown): value is WaMode {
  return value === 'preview' || value === 'send'
}

function normalizeTourTimeToAmPm(tourTime?: string | null): string | null {
  const raw = String(tourTime ?? '').trim()
  if (!raw) return null

  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampmMatch) {
    const hour = Number(ampmMatch[1])
    const minute = ampmMatch[2]
    const suffix = ampmMatch[3].toUpperCase()
    if (hour >= 1 && hour <= 12) {
      return `${hour}:${minute} ${suffix}`
    }
    return null
  }

  const hmMatch = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (!hmMatch) return null

  const hour24 = Number(hmMatch[1])
  const minute = hmMatch[2]
  if (hour24 < 0 || hour24 > 23) return null
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${minute} ${suffix}`
}

function formatTourDate(date: Date, tourTime?: string | null): string {
  const dateLabel = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Makassar',
  }).format(date)

  const normalized = normalizeTourTimeToAmPm(tourTime)
  if (normalized) {
    return `${dateLabel} ${normalized} WITA`
  }

  const timeLabel = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Makassar',
  }).format(date)

  return `${dateLabel} ${timeLabel} WITA`
}

function formatAmount(amount: number, currency: string): string {
  if (currency === 'IDR') {
    return `Rp ${amount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
  }
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPax(adult: number, child?: number | null): string {
  const parts: string[] = []
  if (adult > 0) parts.push(`${adult} dewasa`)
  if (child && child > 0) parts.push(`${child} anak`)
  return parts.length > 0 ? parts.join(' + ') : 'N/A'
}

function monthKeyInBali(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value ?? String(date.getUTCFullYear())
  const month = parts.find((p) => p.type === 'month')?.value ?? String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function getBaseUrl(req: NextRequest): string {
  const envBase = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL
  if (envBase) return envBase.replace(/\/+$/, '')

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (!host) return ''

  const proto = req.headers.get('x-forwarded-proto') || 'https'
  return `${proto}://${host}`
}

function getBookingIdentity(booking: { id: number; bookingRef: string | null }) {
  return booking.bookingRef || `#${booking.id}`
}

function extractLineFromNote(note: string | null | undefined, key: string): string | null {
  if (!note) return null
  const regex = new RegExp(`^${key}\\s*:`, 'i')
  const line = note
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => regex.test(item))
  return line || null
}

async function loadTemplateXmlMap(keys: WhatsAppTemplateKey[]): Promise<Map<WhatsAppTemplateKey, string>> {
  if (keys.length === 0) return new Map()

  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  })
  const map = new Map<WhatsAppTemplateKey, string>()

  for (const setting of settings) {
    const key = setting.key as WhatsAppTemplateKey
    const xml = extractTemplateXmlFromSettingValue(setting.value)
    if (xml) {
      map.set(key, xml)
    }
  }

  return map
}

function renderFromTemplate(
  key: WhatsAppTemplateKey,
  templates: Map<WhatsAppTemplateKey, string>,
  variables: Record<string, string | null | undefined>
): string {
  const definition = getWhatsAppTemplateDefinition(key)
  const customXml = templates.get(key)
  const candidate = customXml || definition.defaultXml

  const rendered = renderWhatsAppTemplateXml(candidate, variables)
  if (!rendered.error) {
    return rendered.message
  }

  const fallback = renderWhatsAppTemplateXml(definition.defaultXml, variables)
  if (!fallback.error) {
    console.warn(`[WA Template] Invalid XML for ${key}, using default template.`)
    return fallback.message
  }

  console.error(`[WA Template] Failed to render template ${key}:`, rendered.error, fallback.error)
  return ''
}

function buildPhoneDraft(
  whatsapp: ReturnType<typeof getWhatsAppService>,
  id: string,
  target: string,
  phone: string | null | undefined,
  message: string
): MessageDraft {
  const normalized = whatsapp.normalizePhoneNumber(phone)
  if (!normalized) {
    return {
      id,
      target,
      chatType: 'phone',
      phone: null,
      chatId: null,
      message,
      canSend: false,
      error: 'Nomor WhatsApp kosong / tidak valid',
    }
  }

  return {
    id,
    target,
    chatType: 'phone',
    phone: normalized,
    chatId: `${normalized}@c.us`,
    message,
    canSend: true,
    error: null,
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)

  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const bookingId = Number(id)
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return NextResponse.json({ error: 'Invalid booking ID' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    if (!isWaSendType(body?.type)) {
      return NextResponse.json(
        { error: `Invalid send type. Allowed: ${WA_SEND_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
    const sendType = body.type
    const mode: WaMode = isWaMode(body?.mode) ? body.mode : 'send'

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        package: {
          include: {
            tour: true,
          },
        },
        driver: true,
        finance: {
          include: {
            items: {
              include: {
                partner: true,
                driver: true,
              },
              orderBy: { id: 'asc' },
            },
          },
        },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (READY_ONLY_TYPES.includes(sendType) && booking.status !== 'READY') {
      return NextResponse.json(
        { error: 'Notifikasi ini hanya bisa dikirim saat status booking READY.' },
        { status: 400 }
      )
    }

    if (ATTENTION_ONLY_TYPES.includes(sendType) && booking.status !== 'ATTENTION') {
      return NextResponse.json(
        { error: 'Notifikasi ini hanya bisa dikirim saat status booking ATTENTION.' },
        { status: 400 }
      )
    }

    if (DONE_ONLY_TYPES.includes(sendType) && booking.status !== 'DONE') {
      return NextResponse.json(
        { error: 'Notifikasi invoice hanya bisa dikirim saat status booking DONE.' },
        { status: 400 }
      )
    }

    const whatsapp = getWhatsAppService()
    const bookingRef = getBookingIdentity(booking)
    const tourName = booking.package?.packageName || booking.tourName || 'Tour'
    const tourDateLabel = formatTourDate(booking.tourDate, booking.tourTime)
    const paxLabel = formatPax(booking.numberOfAdult, booking.numberOfChild)
    const amountLabel = formatAmount(Number(booking.totalPrice), booking.currency)
    const guestName = booking.mainContactName || 'Tamu'
    const noteTourLine = extractLineFromNote(booking.note, 'Tour')
    const notePackageLine = extractLineFromNote(booking.note, 'Package')
    const meetingPointLine = booking.meetingPoint || booking.pickupLocation || null
    const templateKeys: WhatsAppTemplateKey[] = []
    if (sendType === 'READY_DRIVER') templateKeys.push('whatsapp_template_ready_driver_xml')
    if (sendType === 'READY_PARTNERS') templateKeys.push('whatsapp_template_ready_partner_xml')
    if (sendType === 'ATTENTION_DRIVER') templateKeys.push('whatsapp_template_attention_driver_xml')
    if (sendType === 'DONE_PAID_INVOICE') {
      templateKeys.push('whatsapp_template_done_partner_invoice_xml')
      templateKeys.push('whatsapp_template_done_driver_invoice_xml')
    }
    const templateXmlMap = await loadTemplateXmlMap(templateKeys)
    const drafts: MessageDraft[] = []
    const pushGroupDraft = (id: string, target: string, message: string) => {
      drafts.push({
        id,
        target,
        chatType: 'group',
        phone: null,
        chatId: null,
        message,
        canSend: true,
        error: null,
      })
    }
    const pushPhoneDraft = (
      id: string,
      target: string,
      phone: string | null | undefined,
      message: string
    ) => {
      drafts.push(buildPhoneDraft(whatsapp, id, target, phone, message))
    }

    if (sendType === 'BOOKING_GROUP') {
      const msg = [
        '*Booking Baru Masuk*',
        `Ref: ${bookingRef}`,
        `Source: ${booking.source}`,
        `Tour: ${tourName}`,
        `Tanggal: ${tourDateLabel}`,
        `Tamu: ${guestName}`,
        `WA Tamu: ${booking.phoneNumber || '-'}`,
        `Pax: ${paxLabel}`,
        `Total: ${amountLabel}`,
        booking.meetingPoint ? `Meeting Point: ${booking.meetingPoint}` : null,
        booking.note ? `Catatan: ${booking.note}` : null,
      ]
        .filter(Boolean)
        .join('\n')

      pushGroupDraft('GROUP', 'GROUP', msg)
    }

    if (sendType === 'BOOKING_GUEST') {
      const msg = [
        `Halo ${guestName},`,
        '',
        'Terima kasih sudah booking di Bali Snap Trip.',
        'Booking Anda sudah kami terima.',
        '',
        `Ref Booking: ${bookingRef}`,
        `Tour: ${tourName}`,
        `Tanggal: ${tourDateLabel}`,
        `Pax: ${paxLabel}`,
        '',
        'Tim kami akan menyiapkan penugasan driver dan mengabari Anda kembali.',
      ].join('\n')

      pushPhoneDraft('GUEST', 'GUEST', booking.phoneNumber, msg)
    }

    if (sendType === 'READY_DRIVER') {
      if (!booking.driver) {
        return NextResponse.json({ error: 'Driver belum ditugaskan.' }, { status: 400 })
      }

      const msg = renderFromTemplate('whatsapp_template_ready_driver_xml', templateXmlMap, {
        driver_name: booking.driver.name,
        booking_ref: bookingRef,
        package_name: booking.package?.packageName || booking.tourName || '-',
        tour_date_time: tourDateLabel,
        guest_name: guestName,
        guest_phone: booking.phoneNumber || '-',
        pax: paxLabel,
        meeting_point: meetingPointLine || '-',
        tour_line: noteTourLine || '',
        package_line: notePackageLine || '',
      })

      if (!msg.trim()) {
        return NextResponse.json(
          { error: 'Template READY driver tidak valid. Periksa XML template di halaman Drivers.' },
          { status: 400 }
        )
      }

      pushPhoneDraft('DRIVER', 'DRIVER', booking.driver.phone, msg)
    }

    if (sendType === 'READY_PARTNERS') {
      const partnerMap = new Map<number, { id: number; name: string; picName: string | null; picWhatsapp: string | null }>()
      for (const item of booking.finance?.items || []) {
        if (item.partner) {
          partnerMap.set(item.partner.id, {
            id: item.partner.id,
            name: item.partner.name,
            picName: item.partner.picName,
            picWhatsapp: item.partner.picWhatsapp,
          })
        }
      }

      if (partnerMap.size === 0) {
        return NextResponse.json({ error: 'Partner belum tersedia pada finance items booking ini.' }, { status: 400 })
      }

      await Promise.all(
        [...partnerMap.values()].map(async (partner) => {
          const msg = renderFromTemplate('whatsapp_template_ready_partner_xml', templateXmlMap, {
            partner_name: partner.picName || partner.name,
            booking_ref: bookingRef,
            package_name: tourName,
            tour_date_time: tourDateLabel,
            guest_name: guestName,
            guest_phone: booking.phoneNumber || '-',
            pax: paxLabel,
            driver_name: booking.driver?.name || '-',
            driver_phone: booking.driver?.phone || '-',
            meeting_point: meetingPointLine || '-',
            tour_line: noteTourLine || '',
            package_line: notePackageLine || '',
          })

          if (!msg.trim()) {
            return
          }

          pushPhoneDraft(
            `PARTNER:${partner.id}`,
            `PARTNER:${partner.name}`,
            partner.picWhatsapp,
            msg
          )
        })
      )
    }

    if (sendType === 'READY_GUEST') {
      if (!booking.driver) {
        return NextResponse.json({ error: 'Driver belum ditugaskan.' }, { status: 400 })
      }

      const msg = [
        `Halo ${guestName},`,
        '',
        'Booking Anda sudah siap. Berikut detail driver yang akan bertugas:',
        `Nama Driver: ${booking.driver.name}`,
        `WA Driver: ${booking.driver.phone || '-'}`,
        `Kendaraan: ${booking.driver.vehicleType || '-'}`,
        '',
        `Ref Booking: ${bookingRef}`,
        `Tour: ${tourName}`,
        `Tanggal: ${tourDateLabel}`,
        '',
        'Sampai jumpa di hari tour.',
      ].join('\n')

      pushPhoneDraft('GUEST_READY', 'GUEST', booking.phoneNumber, msg)
    }

    if (sendType === 'ATTENTION_GUEST') {
      const reviewLink = String(process.env.WHATSAPP_REVIEW_LINK || '').trim()
      const msg = [
        `Halo ${guestName},`,
        '',
        'Terima kasih sudah menggunakan layanan Bali Snap Trip.',
        'Kami harap perjalanan Anda menyenangkan.',
        reviewLink ? `Mohon bantu review kami di: ${reviewLink}` : 'Mohon bantu review layanan kami. Terima kasih.',
      ].join('\n')

      pushPhoneDraft('GUEST_ATTENTION', 'GUEST', booking.phoneNumber, msg)
    }

    if (sendType === 'ATTENTION_DRIVER') {
      if (!booking.driver) {
        return NextResponse.json({ error: 'Driver belum ditugaskan.' }, { status: 400 })
      }

      const msg = renderFromTemplate('whatsapp_template_attention_driver_xml', templateXmlMap, {
        driver_name: booking.driver.name,
        booking_ref: bookingRef,
      })

      if (!msg.trim()) {
        return NextResponse.json(
          { error: 'Template ATTENTION driver tidak valid. Periksa XML template di halaman Drivers.' },
          { status: 400 }
        )
      }

      pushPhoneDraft('DRIVER_ATTENTION', 'DRIVER', booking.driver.phone, msg)
    }

    if (sendType === 'DONE_PAID_INVOICE') {
      const baseUrl = getBaseUrl(req)
      if (!baseUrl) {
        return NextResponse.json(
          { error: 'Base URL tidak terdeteksi. Set NEXT_PUBLIC_APP_URL atau APP_URL di environment.' },
          { status: 500 }
        )
      }

      const monthKey = monthKeyInBali(booking.tourDate)
      const partnerMap = new Map<number, { id: number; name: string; picName: string | null; picWhatsapp: string | null }>()
      for (const item of booking.finance?.items || []) {
        if (item.partner) {
          partnerMap.set(item.partner.id, {
            id: item.partner.id,
            name: item.partner.name,
            picName: item.partner.picName,
            picWhatsapp: item.partner.picWhatsapp,
          })
        }
      }

      const driverMap = new Map<number, { id: number; name: string; phone: string | null }>()
      if (booking.driver) {
        driverMap.set(booking.driver.id, {
          id: booking.driver.id,
          name: booking.driver.name,
          phone: booking.driver.phone || null,
        })
      }
      for (const item of booking.finance?.items || []) {
        if (item.driver) {
          driverMap.set(item.driver.id, {
            id: item.driver.id,
            name: item.driver.name,
            phone: item.driver.phone || null,
          })
        }
      }

      if (partnerMap.size === 0 && driverMap.size === 0) {
        return NextResponse.json(
          { error: 'Tidak ada partner/driver yang bisa dikirim invoice untuk booking ini.' },
          { status: 400 }
        )
      }

      await Promise.all(
        [...partnerMap.values()].map(async (partner) => {
          const invoiceUrl = `${baseUrl}/print/invoice/vendor?partnerId=${partner.id}&month=${monthKey}&includePaid=1&autoPrint=0`
          const msg = renderFromTemplate('whatsapp_template_done_partner_invoice_xml', templateXmlMap, {
            partner_name: partner.picName || partner.name,
            booking_ref: bookingRef,
            invoice_url: invoiceUrl,
          })

          if (!msg.trim()) {
            return
          }

          pushPhoneDraft(
            `PARTNER_INVOICE:${partner.id}`,
            `PARTNER_INVOICE:${partner.name}`,
            partner.picWhatsapp,
            msg
          )
        })
      )

      await Promise.all(
        [...driverMap.values()].map(async (driver) => {
          const invoiceUrl = `${baseUrl}/print/invoice/driver?driverId=${driver.id}&month=${monthKey}&includePaid=1&autoPrint=0`
          const msg = renderFromTemplate('whatsapp_template_done_driver_invoice_xml', templateXmlMap, {
            driver_name: driver.name,
            booking_ref: bookingRef,
            invoice_url: invoiceUrl,
          })

          if (!msg.trim()) {
            return
          }

          pushPhoneDraft(
            `DRIVER_INVOICE:${driver.id}`,
            `DRIVER_INVOICE:${driver.name}`,
            driver.phone,
            msg
          )
        })
      )
    }

    if (drafts.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada pesan yang dijadwalkan untuk dikirim.' },
        { status: 400 }
      )
    }

    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        type: sendType,
        drafts: drafts.map((draft) => ({
          id: draft.id,
          target: draft.target,
          phone: draft.phone,
          message: draft.message,
          canSend: draft.canSend,
          error: draft.error,
        })),
      })
    }

    const waEnabled = await whatsapp.isEnabled()
    if (!waEnabled) {
      return NextResponse.json(
        {
          error:
            'WhatsApp belum aktif. Aktifkan flag WhatsApp di Settings atau set WHATSAPP_ENABLED=true.',
        },
        { status: 400 }
      )
    }

    const editMap = new Map<string, string>()
    if (Array.isArray(body?.drafts)) {
      for (const item of body.drafts) {
        const id = typeof item?.id === 'string' ? item.id : null
        const message = typeof item?.message === 'string' ? item.message : null
        if (id && message !== null) {
          editMap.set(id, message)
        }
      }
    }

    const results: SendResult[] = []
    let editedCount = 0
    for (const draft of drafts) {
      const customMessage = editMap.get(draft.id)
      const hasCustomMessage = customMessage !== undefined
      const finalMessage = hasCustomMessage ? customMessage : draft.message

      if (hasCustomMessage && customMessage !== draft.message) {
        editedCount += 1
      }

      if (!finalMessage.trim()) {
        results.push({
          id: draft.id,
          target: draft.target,
          phone: draft.phone,
          success: false,
          message: 'Isi pesan kosong',
        })
        continue
      }

      if (!draft.canSend) {
        results.push({
          id: draft.id,
          target: draft.target,
          phone: draft.phone,
          success: false,
          message: draft.error || 'Target tidak valid',
        })
        continue
      }

      let sent = false
      if (draft.chatType === 'group') {
        sent = await whatsapp.sendToGroup(finalMessage)
      } else if (draft.chatId) {
        sent = await whatsapp.sendToChat(draft.chatId, finalMessage)
      }

      results.push({
        id: draft.id,
        target: draft.target,
        phone: draft.phone,
        success: sent,
        message: sent ? 'Terkirim' : 'Gagal kirim ke GREEN-API',
      })
    }

    const sent = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'SEND_WHATSAPP',
        entity: 'Booking',
        entityId: booking.id.toString(),
        newValue: {
          type: sendType,
          mode,
          total: results.length,
          sent,
          failed,
          editedCount,
          results,
        },
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
      },
    })

    return NextResponse.json({
      success: failed === 0,
      message: failed === 0 ? 'Semua WhatsApp berhasil dikirim.' : 'Sebagian WhatsApp gagal dikirim.',
      summary: {
        total: results.length,
        sent,
        failed,
      },
      results,
    })
  } catch (error) {
    console.error('[API /bookings/[id]/whatsapp] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
