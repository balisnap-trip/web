export type WhatsAppTemplateScope = 'driver' | 'partner'

export type WhatsAppTemplateKey =
  | 'whatsapp_template_ready_driver_xml'
  | 'whatsapp_template_attention_driver_xml'
  | 'whatsapp_template_done_driver_invoice_xml'
  | 'whatsapp_template_ready_partner_xml'
  | 'whatsapp_template_done_partner_invoice_xml'

export interface WhatsAppTemplateDefinition {
  key: WhatsAppTemplateKey
  scope: WhatsAppTemplateScope
  title: string
  description: string
  defaultXml: string
  placeholders: string[]
}

const XML_READY_DRIVER = `<template>
  <line>Halo {{driver_name}},</line>
  <line>*Anda ditugaskan untuk booking berikut:*</line>
  <line>Ref Booking: {{booking_ref}}</line>
  <line>Tour: {{package_name}}</line>
  <line>Tanggal: {{tour_date_time}}</line>
  <line>Tamu: {{guest_name}}</line>
  <line>WA Tamu: {{guest_phone}}</line>
  <line>Pax: {{pax}}</line>
  <line>Meeting Point: {{meeting_point}}</line>
  <line>{{tour_line}}</line>
  <line>{{package_line}}</line>
  <blank />
  <line>Mohon konfirmasi kesiapan dan handle booking ini.</line>
</template>`

const XML_ATTENTION_DRIVER = `<template>
  <line>Halo {{driver_name}},</line>
  <blank />
  <line>Terima kasih sudah handle booking {{booking_ref}}.</line>
  <line>Mohon kirim laporan perjalanan.</line>
  <line>Jika ada komisi/laporan keuangan, mohon ikut dilaporkan.</line>
</template>`

const XML_DONE_DRIVER_INVOICE = `<template>
  <line>Halo {{driver_name}},</line>
  <blank />
  <line>Pembayaran invoice untuk booking {{booking_ref}} sudah *PAID*.</line>
  <line>Invoice driver: {{invoice_url}}</line>
</template>`

const XML_READY_PARTNER = `<template>
  <line>Halo {{partner_name}},</line>
  <blank />
  <line>*Informasi booking siap operasional:*</line>
  <line>Ref Booking: {{booking_ref}}</line>
  <line>Tour: {{package_name}}</line>
  <line>Tanggal: {{tour_date_time}}</line>
  <line>Tamu: {{guest_name}}</line>
  <line>WA Tamu: {{guest_phone}}</line>
  <line>Pax: {{pax}}</line>
  <line>Driver: {{driver_name}} ({{driver_phone}})</line>
  <line>Meeting Point: {{meeting_point}}</line>
  <line>{{tour_line}}</line>
  <line>{{package_line}}</line>
  <blank />
  <line>Mohon siapkan layanan sesuai jadwal.</line>
</template>`

const XML_DONE_PARTNER_INVOICE = `<template>
  <line>Halo {{partner_name}},</line>
  <blank />
  <line>Pembayaran invoice untuk booking {{booking_ref}} sudah *PAID*.</line>
  <line>Invoice vendor: {{invoice_url}}</line>
</template>`

export const WHATSAPP_TEMPLATE_DEFINITIONS: WhatsAppTemplateDefinition[] = [
  {
    key: 'whatsapp_template_ready_driver_xml',
    scope: 'driver',
    title: 'READY - Driver Assignment',
    description: 'Template notifikasi penugasan driver saat booking status READY.',
    defaultXml: XML_READY_DRIVER,
    placeholders: [
      'driver_name',
      'booking_ref',
      'package_name',
      'tour_date_time',
      'guest_name',
      'guest_phone',
      'pax',
      'meeting_point',
      'tour_line',
      'package_line',
    ],
  },
  {
    key: 'whatsapp_template_attention_driver_xml',
    scope: 'driver',
    title: 'ATTENTION - Driver Thank You',
    description: 'Template ucapan terima kasih + permintaan laporan ke driver.',
    defaultXml: XML_ATTENTION_DRIVER,
    placeholders: ['driver_name', 'booking_ref'],
  },
  {
    key: 'whatsapp_template_done_driver_invoice_xml',
    scope: 'driver',
    title: 'DONE - Driver Paid Invoice',
    description: 'Template notifikasi paid invoice untuk driver.',
    defaultXml: XML_DONE_DRIVER_INVOICE,
    placeholders: ['driver_name', 'booking_ref', 'invoice_url'],
  },
  {
    key: 'whatsapp_template_ready_partner_xml',
    scope: 'partner',
    title: 'READY - Partner Notification',
    description: 'Template notifikasi ke partner saat booking status READY.',
    defaultXml: XML_READY_PARTNER,
    placeholders: [
      'partner_name',
      'booking_ref',
      'package_name',
      'tour_date_time',
      'guest_name',
      'guest_phone',
      'pax',
      'driver_name',
      'driver_phone',
      'meeting_point',
      'tour_line',
      'package_line',
    ],
  },
  {
    key: 'whatsapp_template_done_partner_invoice_xml',
    scope: 'partner',
    title: 'DONE - Partner Paid Invoice',
    description: 'Template notifikasi paid invoice untuk partner.',
    defaultXml: XML_DONE_PARTNER_INVOICE,
    placeholders: ['partner_name', 'booking_ref', 'invoice_url'],
  },
]

export function getWhatsAppTemplateDefinition(key: WhatsAppTemplateKey): WhatsAppTemplateDefinition {
  const definition = WHATSAPP_TEMPLATE_DEFINITIONS.find((item) => item.key === key)
  if (!definition) {
    throw new Error(`Unknown WhatsApp template key: ${key}`)
  }
  return definition
}

export function getWhatsAppTemplateDefinitionsByScope(
  scope: WhatsAppTemplateScope
): WhatsAppTemplateDefinition[] {
  return WHATSAPP_TEMPLATE_DEFINITIONS.filter((item) => item.scope === scope)
}

export function isWhatsAppTemplateScope(value: unknown): value is WhatsAppTemplateScope {
  return value === 'driver' || value === 'partner'
}

export function isWhatsAppTemplateKey(value: unknown): value is WhatsAppTemplateKey {
  return (
    typeof value === 'string' &&
    WHATSAPP_TEMPLATE_DEFINITIONS.some((item) => item.key === value)
  )
}

type TemplateNode = { type: 'line'; value: string } | { type: 'blank' }

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseTemplateXml(xml: string): { nodes: TemplateNode[]; error: string | null } {
  const source = String(xml ?? '').trim()
  if (!source) {
    return { nodes: [], error: 'Template XML kosong' }
  }

  const rootMatch = source.match(/<template(?:\s+[^>]*)?>([\s\S]*?)<\/template>/i)
  if (!rootMatch) {
    return { nodes: [], error: 'Root XML harus menggunakan <template>...</template>' }
  }

  const body = rootMatch[1]
  const nodes: TemplateNode[] = []
  const nodePattern = /<blank\s*\/\s*>|<line(?:\s+[^>]*)?>([\s\S]*?)<\/line>/gi
  let match: RegExpExecArray | null

  while ((match = nodePattern.exec(body)) !== null) {
    const raw = match[0]
    if (/^<blank/i.test(raw)) {
      nodes.push({ type: 'blank' })
      continue
    }
    nodes.push({ type: 'line', value: decodeXmlEntities(match[1] || '') })
  }

  if (nodes.length === 0) {
    return { nodes: [], error: 'Template XML harus memiliki minimal satu <line> atau <blank />' }
  }

  return { nodes, error: null }
}

export function renderWhatsAppTemplateXml(
  xml: string,
  variables: Record<string, string | null | undefined>
): { message: string; error: string | null } {
  const parsed = parseTemplateXml(xml)
  if (parsed.error) {
    return { message: '', error: parsed.error }
  }

  const lines: string[] = []

  for (const node of parsed.nodes) {
    if (node.type === 'blank') {
      lines.push('')
      continue
    }

    const rendered = node.value
      .replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => {
        const value = variables[key]
        return value == null ? '' : String(value)
      })
      .replace(/\r/g, '')
      .trimEnd()

    if (rendered.trim().length === 0) {
      continue
    }

    lines.push(rendered)
  }

  return { message: lines.join('\n'), error: null }
}

export function extractTemplateXmlFromSettingValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object' && 'xml' in value) {
    const withXml = value as { xml?: unknown }
    if (typeof withXml.xml === 'string') {
      return withXml.xml
    }
  }

  return null
}
