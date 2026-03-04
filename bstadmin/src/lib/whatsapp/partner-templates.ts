import { prisma } from '@/lib/db'

export type PartnerTemplateScope = 'ready' | 'done_invoice'
export type PartnerTemplateMap = Record<string, string>

const SETTINGS_CATEGORY = 'whatsapp_template'
const SETTINGS_KEYS: Record<PartnerTemplateScope, string> = {
  ready: 'whatsapp_partner_ready_template_xml_by_partner',
  done_invoice: 'whatsapp_partner_done_invoice_template_xml_by_partner',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

export function sanitizePartnerTemplateMap(raw: unknown): PartnerTemplateMap {
  const record = asRecord(raw)
  if (!record) return {}

  const next: PartnerTemplateMap = {}
  for (const [key, value] of Object.entries(record)) {
    if (!/^\d+$/.test(key)) continue
    if (typeof value !== 'string') continue
    const xml = value.trim()
    if (!xml) continue
    next[key] = xml
  }

  return next
}

export async function loadPartnerTemplateMap(scope: PartnerTemplateScope): Promise<PartnerTemplateMap> {
  try {
    const key = SETTINGS_KEYS[scope]
    const setting = await prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    })
    return sanitizePartnerTemplateMap(setting?.value)
  } catch {
    return {}
  }
}

export async function savePartnerTemplateMap(
  scope: PartnerTemplateScope,
  map: PartnerTemplateMap
): Promise<void> {
  const key = SETTINGS_KEYS[scope]
  const sanitized = sanitizePartnerTemplateMap(map)
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: sanitized, category: SETTINGS_CATEGORY },
    create: { key, value: sanitized, category: SETTINGS_CATEGORY },
  })
}

export function getPartnerTemplateXml(
  map: PartnerTemplateMap,
  partnerId: number | null | undefined
): string | null {
  if (!partnerId || !Number.isFinite(partnerId)) return null
  return map[String(partnerId)] ?? null
}
