import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import databaseSync, { type BidirectionalSyncResult } from '@/lib/database-sync'

let syncInProgress: Promise<BidirectionalSyncResult> | null = null
let syncStartedAt: string | null = null

function sanitizeConnectionUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const port = parsed.port || '5432'
    return `${parsed.protocol}//***:***@${parsed.hostname}:${port}${parsed.pathname}`
  } catch {
    return '<invalid-url>'
  }
}

async function getLastSyncState() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'database_sync_status' },
  })

  if (!setting || !setting.value || typeof setting.value !== 'object') {
    return null
  }

  return setting.value
}

/**
 * GET /api/settings/sync-database
 * Returns sync configuration and last run status.
 */
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const localUrl = process.env.DATABASE_URL || ''
    const peerUrl = process.env.SYNC_DATABASE_URL || ''
    const configured = Boolean(localUrl && peerUrl)
    const sameDatabase = localUrl && peerUrl ? sanitizeConnectionUrl(localUrl) === sanitizeConnectionUrl(peerUrl) : false
    const lastResult = await getLastSyncState()

    return NextResponse.json({
      success: true,
      configured,
      sameDatabase,
      local: localUrl ? sanitizeConnectionUrl(localUrl) : null,
      peer: peerUrl ? sanitizeConnectionUrl(peerUrl) : null,
      running: Boolean(syncInProgress),
      runningSince: syncStartedAt,
      lastResult,
    })
  } catch (error) {
    console.error('[API /settings/sync-database GET] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/sync-database
 * Run bidirectional database synchronization (admin only).
 */
export async function POST() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 })
  }

  if (syncInProgress) {
    return NextResponse.json(
      {
        error: 'Database sync is already running',
        runningSince: syncStartedAt,
      },
      { status: 409 }
    )
  }

  const localUrl = process.env.DATABASE_URL || ''
  const peerUrl = process.env.SYNC_DATABASE_URL || ''

  if (!localUrl || !peerUrl) {
    return NextResponse.json(
      { error: 'DATABASE_URL and SYNC_DATABASE_URL must be configured' },
      { status: 400 }
    )
  }

  if (sanitizeConnectionUrl(localUrl) === sanitizeConnectionUrl(peerUrl)) {
    return NextResponse.json(
      { error: 'Local and peer database URL point to the same database' },
      { status: 400 }
    )
  }

  try {
    syncStartedAt = new Date().toISOString()
    syncInProgress = databaseSync.runBidirectionalDatabaseSync({ localUrl, peerUrl })

    const result = await syncInProgress
    const syncPayload: Record<string, unknown> = {
      status: 'success',
      at: new Date().toISOString(),
      by: session.user.email || 'admin',
      ...result,
    }

    await prisma.systemSetting.upsert({
      where: { key: 'database_sync_status' },
      update: {
        value: syncPayload as Prisma.InputJsonValue,
        category: 'system',
        updatedBy: session.user.email || 'admin',
      },
      create: {
        key: 'database_sync_status',
        value: syncPayload as Prisma.InputJsonValue,
        category: 'system',
        updatedBy: session.user.email || 'admin',
      },
    })

    return NextResponse.json({
      success: true,
      result,
    })
  } catch (error) {
    console.error('[API /settings/sync-database POST] Error:', error)
    const failedPayload: Record<string, unknown> = {
      status: 'failed',
      at: new Date().toISOString(),
      by: session.user.email || 'admin',
      error: error instanceof Error ? error.message : 'Unknown error',
    }

    await prisma.systemSetting.upsert({
      where: { key: 'database_sync_status' },
      update: {
        value: failedPayload as Prisma.InputJsonValue,
        category: 'system',
        updatedBy: session.user.email || 'admin',
      },
      create: {
        key: 'database_sync_status',
        value: failedPayload as Prisma.InputJsonValue,
        category: 'system',
        updatedBy: session.user.email || 'admin',
      },
    })

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  } finally {
    syncInProgress = null
    syncStartedAt = null
  }
}
