import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  OPS_WRITE_CUTOVER_AUDIT_ACTION,
  parseWriteCutoverAuditPayload,
  readWriteCutoverMetricThresholds,
  summarizeWriteCutoverMetrics,
} from '@/lib/cutover/write-cutover'

/**
 * GET /api/ops/cutover-metrics/write
 * Summarize write-cutover mismatch metrics from audit logs.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const windowParam = req.nextUrl.searchParams.get('windowMinutes')
    const thresholds = readWriteCutoverMetricThresholds(
      Number.isFinite(Number(windowParam)) ? Number(windowParam) : undefined
    )
    const since = new Date(Date.now() - thresholds.windowMinutes * 60 * 1000)

    const rows = await prisma.auditLog.findMany({
      where: {
        action: OPS_WRITE_CUTOVER_AUDIT_ACTION,
        createdAt: {
          gte: since,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
        newValue: true,
      },
    })

    const entries = rows
      .map((row) => {
        const payload = parseWriteCutoverAuditPayload(row.newValue)
        if (!payload) {
          return null
        }
        return {
          createdAt: row.createdAt,
          payload,
        }
      })
      .filter((item): item is { createdAt: Date; payload: NonNullable<ReturnType<typeof parseWriteCutoverAuditPayload>> } => item !== null)

    const summary = summarizeWriteCutoverMetrics(entries, thresholds)
    return NextResponse.json({ data: summary })
  } catch (error) {
    console.error('[API /ops/cutover-metrics/write] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
