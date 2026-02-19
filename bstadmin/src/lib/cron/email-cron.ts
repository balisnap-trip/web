import { prisma } from '@/lib/db'
import { getEmailSyncService } from '@/lib/email/email-sync'
import { getBookingFetchService } from '@/lib/email/booking-fetch'
import { syncAllBookingStatuses } from '@/lib/booking/status'

const LOCK_KEY = 908214531

type CronErrorInfo = {
  at: string
  name?: string
  message: string
  stack?: string
  cause?: string
}

export type EmailCronResult = {
  skipped: boolean
  reason?: 'disabled' | 'already_running' | 'not_due'
  status?: {
    running: boolean
    startedAt?: string
    finishedAt?: string
    lastError?: CronErrorInfo | null
  }
  sync?: {
    fetched: number
    stored: number
    skipped: number
    failed: number
  }
  fetch?: {
    processed: number
    created: number
    updated: number
    cancelled: number
    skipped: number
    errors: number
  }
}

function toCronErrorInfo(error: unknown, at: string): CronErrorInfo {
  if (error instanceof Error) {
    const anyErr = error as any
    const cause =
      anyErr?.cause instanceof Error
        ? anyErr.cause.message
        : typeof anyErr?.cause === 'string'
          ? anyErr.cause
          : undefined

    return {
      at,
      name: error.name,
      message: error.message,
      stack: typeof error.stack === 'string' ? error.stack.slice(0, 8000) : undefined,
      cause,
    }
  }

  return {
    at,
    name: 'Error',
    message: typeof error === 'string' ? error : String(error),
  }
}

export async function runEmailCronJob(): Promise<EmailCronResult> {
  const cronSetting = await prisma.systemSetting.findUnique({
    where: { key: 'cron_enabled' },
    select: { value: true },
  })
  const cronConfig = await prisma.systemSetting.findUnique({
    where: { key: 'cron_config' },
    select: { value: true },
  })
  const cronLastRun = await prisma.systemSetting.findUnique({
    where: { key: 'cron_last_run' },
    select: { value: true },
  })
  const cronEnabled =
    typeof cronSetting?.value === 'object' && cronSetting?.value && 'enabled' in cronSetting.value
      ? Boolean((cronSetting.value as any).enabled)
      : true

  if (!cronEnabled) {
    return { skipped: true, reason: 'disabled' }
  }

  const interval =
    typeof cronConfig?.value === 'object' && cronConfig?.value && 'interval' in cronConfig.value
      ? String((cronConfig.value as any).interval)
      : 'hourly'
  const customMinutes =
    typeof cronConfig?.value === 'object' && cronConfig?.value && 'customMinutes' in cronConfig.value
      ? Number((cronConfig.value as any).customMinutes)
      : 60
  const lastRunAt =
    typeof cronLastRun?.value === 'object' && cronLastRun?.value && 'at' in cronLastRun.value
      ? String((cronLastRun.value as any).at)
      : null

  const intervalMs =
    interval === 'daily'
      ? 24 * 60 * 60 * 1000
      : interval === 'custom'
        ? Math.max(5, Math.floor(customMinutes || 60)) * 60 * 1000
        : 60 * 60 * 1000

  if (lastRunAt) {
    const lastRunTime = new Date(lastRunAt).getTime()
    if (!Number.isNaN(lastRunTime) && Date.now() - lastRunTime < intervalMs) {
      return { skipped: true, reason: 'not_due' }
    }
  }

  const lockRows = await prisma.$queryRaw<
    Array<{ pg_try_advisory_lock: boolean }>
  >`SELECT pg_try_advisory_lock(${LOCK_KEY})`
  const lockAcquired = Boolean(lockRows?.[0]?.pg_try_advisory_lock)

  if (!lockAcquired) {
    return { skipped: true, reason: 'already_running' }
  }

  const startedAt = new Date().toISOString()

  try {
    // Preserve previous status fields (e.g., lastError) while marking as running.
    const existingStatus = await prisma.systemSetting.findUnique({
      where: { key: 'cron_status' },
      select: { value: true },
    })
    const previousValue =
      typeof existingStatus?.value === 'object' && existingStatus?.value && !Array.isArray(existingStatus.value)
        ? (existingStatus.value as any)
        : {}
  
    await prisma.systemSetting.upsert({
      where: { key: 'cron_status' },
      update: { value: { ...previousValue, running: true, startedAt } },
      create: { key: 'cron_status', value: { running: true, startedAt }, category: 'system' },
    })

    const syncService = getEmailSyncService()
    const syncResults = await syncService.syncEmails({ mode: 'cron' })

    const fetchService = getBookingFetchService()
    const fetchResults = await fetchService.fetchBookings({ mode: 'cron' })

    await syncAllBookingStatuses(prisma)

    const finishedAt = new Date().toISOString()

    await prisma.systemSetting.upsert({
      where: { key: 'cron_last_run' },
      update: { value: { at: finishedAt } },
      create: { key: 'cron_last_run', value: { at: finishedAt }, category: 'system' },
    })

    await prisma.systemSetting.upsert({
      where: { key: 'cron_status' },
      update: { value: { running: false, startedAt, finishedAt, lastError: null } },
      create: {
        key: 'cron_status',
        value: { running: false, startedAt, finishedAt, lastError: null },
        category: 'system',
      },
    })

    console.log('[Email Cron] Completed run', {
      startedAt,
      finishedAt,
      sync: syncResults,
      fetch: fetchResults,
    })

    return {
      skipped: false,
      status: { running: false, startedAt, finishedAt, lastError: null },
      sync: syncResults,
      fetch: fetchResults,
    }
  } catch (error) {
    const finishedAt = new Date().toISOString()
    const lastError = toCronErrorInfo(error, finishedAt)

    try {
      await prisma.systemSetting.upsert({
        where: { key: 'cron_status' },
        update: { value: { running: false, startedAt, finishedAt, lastError } },
        create: { key: 'cron_status', value: { running: false, startedAt, finishedAt, lastError }, category: 'system' },
      })
    } catch (statusError) {
      console.error('[Email Cron] Failed to update cron_status after error:', statusError)
    }

    console.error('[Email Cron] Failed run', {
      startedAt,
      finishedAt,
      error: lastError,
    })

    throw error
  } finally {
    try {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`
    } catch (unlockError) {
      console.error('[Email Cron] Failed to release advisory lock:', unlockError)
    }
  }
}
