import { prisma } from '@/lib/db'
import { endOfDay, format, startOfDay } from 'date-fns'
import { Driver } from '@prisma/client'

export interface DriverSuggestion {
  primary: Driver | null
  reason: 'rotation' | 'none'
  alternatives: Driver[]
}

export class DriverSuggestionService {
  private readonly monthlyResetSettingKey = 'driver_rotation_monthly_reset'

  /**
   * Main method to suggest driver for a booking
   * Strategy: Rotation (counter-based, monthly)
   */
  async suggestDriverForBooking(booking: {
    tourDate: Date
    mainContactName: string
    mainContactEmail?: string
    phoneNumber: string
  }): Promise<DriverSuggestion> {
    // Rotation (counter-based)
    const rotationDrivers = await this.getRotationDrivers({ tourDate: booking.tourDate })
    
    if (rotationDrivers.length === 0) {
      return {
        primary: null,
        reason: 'none',
        alternatives: []
      }
    }
    
    return {
      primary: rotationDrivers[0],
      reason: 'rotation',
      alternatives: rotationDrivers.slice(1, 3)
    }
  }

  /**
   * Ensure the monthly counter is reset once per month.
   * This is lazily executed, so it works without cron.
   */
  private async ensureMonthlyReset(now: Date = new Date()): Promise<void> {
    const monthKey = format(now, 'yyyy-MM')
    const setting = await prisma.systemSetting.findUnique({
      where: { key: this.monthlyResetSettingKey },
      select: { value: true },
    })

    const currentValue =
      typeof setting?.value === 'string'
        ? setting.value
        : setting?.value && typeof setting.value === 'object' && 'month' in (setting.value as any)
          ? (setting.value as any).month
          : null

    if (currentValue === monthKey) return

    await prisma.$transaction(async (tx) => {
      await tx.driver.updateMany({
        data: { assignmentCount: 0 },
      })

      await tx.systemSetting.upsert({
        where: { key: this.monthlyResetSettingKey },
        update: { value: monthKey },
        create: { key: this.monthlyResetSettingKey, value: monthKey, category: 'driver' },
      })
    })
  }

  /**
   * Get drivers in rotation queue
   * Sorted by: assignmentCount ASC (lowest first), then priorityLevel ASC
   */
  private async getRotationDrivers(opts?: { tourDate?: Date }): Promise<Driver[]> {
    const settings = await this.getRotationSettings()
    await this.ensureMonthlyReset()

    // NOTE: Use Prisma query (not $queryRaw) so column mappings (@map) are applied.
    // $queryRaw returns snake_case columns which breaks Driver typing/usage in UI.
    const dayStart = opts?.tourDate ? startOfDay(opts.tourDate) : null
    const dayEnd = opts?.tourDate ? endOfDay(opts.tourDate) : null

    const drivers = await prisma.driver.findMany({
      where: {
        status: 'AVAILABLE',
        priorityLevel: { not: null, lte: settings.maxPriorityForRotation },
        ...(dayStart && dayEnd
          ? {
              // Avoid suggesting a driver that already has a non-cancelled booking on the same tour date.
              bookings: {
                none: {
                  tourDate: { gte: dayStart, lte: dayEnd },
                  status: { not: 'CANCELLED' },
                },
              },
            }
          : {}),
      },
      orderBy: [
        { assignmentCount: 'asc' },
        { priorityLevel: 'asc' },
        { id: 'asc' }, // deterministic tie-breaker
      ],
    })

    return drivers
  }

  /**
   * Get all drivers (including out of rotation) for manual selection
   */
  async getAllAvailableDrivers(): Promise<{
    inRotation: Driver[]
    manualOnly: Driver[]
  }> {
    const settings = await this.getRotationSettings()
    await this.ensureMonthlyReset()
    
    // Use Prisma query so the returned objects match `Driver` shape.
    const allDrivers = await prisma.driver.findMany({
      where: { status: 'AVAILABLE' },
      orderBy: [
        { priorityLevel: 'asc' },
        { assignmentCount: 'asc' },
        { id: 'asc' },
      ],
    })
    
    const inRotation = allDrivers.filter(
      d => d.priorityLevel !== null && d.priorityLevel <= settings.maxPriorityForRotation
    )
    
    const manualOnly = allDrivers.filter(
      d => d.priorityLevel === null || d.priorityLevel > settings.maxPriorityForRotation
    )
    
    return { inRotation, manualOnly }
  }

  /**
   * Get rotation settings from database
   */
  private async getRotationSettings(): Promise<{
    maxPriorityForRotation: number
  }> {
    const setting = await prisma.$queryRaw<Array<{ value: any }>>`
      SELECT value FROM system_settings WHERE key = 'driver_rotation'
    `
    
    if (setting && setting.length > 0) {
      const value = setting[0].value as any
      return {
        maxPriorityForRotation: typeof value?.maxPriorityForRotation === 'number' ? value.maxPriorityForRotation : 20,
      }
    }
    
    // Default settings
    return {
      maxPriorityForRotation: 20,
    }
  }

  /**
   * Increment driver assignment counter when driver is assigned
   */
  async incrementDriverCount(driverId: number): Promise<void> {
    await this.ensureMonthlyReset()
    await prisma.$executeRaw`
      UPDATE drivers 
      SET assignment_count = assignment_count + 1,
          last_assigned_at = NOW()
      WHERE id = ${driverId}
    `
    
    console.log(`[Driver Suggestion] Incremented count for driver ID ${driverId}`)
  }

  /**
   * Revert (decrement) monthly assignment counter when an assigned booking is cancelled.
   * Idempotent via audit_logs entry per booking.
   */
  async revertDriverCountForCancellation(input: {
    bookingId: number
    driverId: number
    assignedAt: Date | null
    cancelledAt: Date
  }): Promise<void> {
    const { bookingId, driverId, assignedAt, cancelledAt } = input
    if (!assignedAt) return

    // Only revert if cancellation happens in the same month as the assignment,
    // since the monthly counter is reset every month.
    if (format(assignedAt, 'yyyy-MM') !== format(cancelledAt, 'yyyy-MM')) return

    await this.ensureMonthlyReset(cancelledAt)

    const already = await prisma.auditLog.findFirst({
      where: {
        action: 'DRIVER_ROTATION_REVERT',
        entity: 'Booking',
        entityId: String(bookingId),
      },
      select: { id: true },
    })
    if (already) return

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE drivers
        SET assignment_count = GREATEST(assignment_count - 1, 0)
        WHERE id = ${driverId}
      `

      await tx.auditLog.create({
        data: {
          action: 'DRIVER_ROTATION_REVERT',
          entity: 'Booking',
          entityId: String(bookingId),
          oldValue: { driverId, assignedAt },
          newValue: { driverId, cancelledAt },
        },
      })
    })

    console.log(`[Driver Suggestion] Reverted monthly count for driver ID ${driverId} due to cancellation on booking ${bookingId}`)
  }

  /**
   * Get driver rotation statistics for admin dashboard
   */
  async getRotationStats() {
    await this.ensureMonthlyReset()

    // Include both:
    // - monthlyCount: drivers.assignment_count (resets monthly)
    // - totalCount: lifetime assignments derived from audit_logs (does not decrement)
    const drivers = await prisma.$queryRaw<Array<{
      id: number
      name: string
      priority_level: number | null
      monthly_count: number
      total_count: number
      status: string
    }>>`
      SELECT
        d.id,
        d.name,
        d.priority_level,
        d.assignment_count AS monthly_count,
        COUNT(al.id) AS total_count,
        d.status
      FROM drivers d
      LEFT JOIN audit_logs al
        ON al.action = 'ASSIGN_DRIVER'
       AND al.entity = 'Booking'
       AND (al.new_value->>'assignedDriverId')::int = d.id
      WHERE d.priority_level IS NOT NULL
      GROUP BY d.id, d.name, d.priority_level, d.assignment_count, d.status
      ORDER BY d.priority_level ASC NULLS LAST, d.id ASC
    `

    return drivers
  }
}

export const driverSuggestionService = new DriverSuggestionService()
