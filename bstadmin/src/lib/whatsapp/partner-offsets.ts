import { prisma } from '@/lib/db'

export type PatternItemOffsetMap = Record<string, number>

const SETTINGS_KEY = 'whatsapp_partner_offset_minutes_by_pattern_item'
const SETTINGS_CATEGORY = 'whatsapp_config'
const OFFSET_MINUTES_MIN = -1440
const OFFSET_MINUTES_MAX = 1440

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

export function normalizeOffsetMinutes(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  const rounded = Math.round(parsed)
  if (rounded < OFFSET_MINUTES_MIN) return OFFSET_MINUTES_MIN
  if (rounded > OFFSET_MINUTES_MAX) return OFFSET_MINUTES_MAX
  return rounded
}

export function sanitizePatternItemOffsetMap(raw: unknown): PatternItemOffsetMap {
  const record = asRecord(raw)
  if (!record) return {}

  const next: PatternItemOffsetMap = {}
  for (const [key, value] of Object.entries(record)) {
    if (!/^\d+$/.test(key)) continue
    const normalized = normalizeOffsetMinutes(value)
    if (normalized === null || normalized === 0) continue
    next[key] = normalized
  }

  return next
}

export async function loadPatternItemOffsetMap(): Promise<PatternItemOffsetMap> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: SETTINGS_KEY },
      select: { value: true },
    })
    return sanitizePatternItemOffsetMap(setting?.value)
  } catch {
    return {}
  }
}

export async function savePatternItemOffsetMap(map: PatternItemOffsetMap): Promise<void> {
  const sanitized = sanitizePatternItemOffsetMap(map)
  await prisma.systemSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: sanitized },
    create: { key: SETTINGS_KEY, value: sanitized, category: SETTINGS_CATEGORY },
  })
}

