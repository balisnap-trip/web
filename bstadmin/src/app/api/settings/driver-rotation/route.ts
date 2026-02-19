import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * GET /api/settings/driver-rotation
 * Fetch driver rotation settings
 */
export async function GET() {
  try {
    const setting = await prisma.$queryRaw<Array<{ id: string; key: string; value: any }>>`
      SELECT id, key, value 
      FROM system_settings 
      WHERE key = 'driver_rotation'
      LIMIT 1
    `
    
    if (setting && setting.length > 0) {
      return NextResponse.json({
        key: setting[0].key,
        value: setting[0].value
      })
    }
    
    // Return default settings if not found
    return NextResponse.json({
      key: 'driver_rotation',
      value: {
        maxPriorityForRotation: 20,
      }
    })
  } catch (error) {
    console.error('[Settings API] Error fetching driver rotation settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/driver-rotation
 * Update driver rotation settings
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    
    // Validate input
    if (typeof body.maxPriorityForRotation !== 'number') {
      return NextResponse.json(
        { error: 'maxPriorityForRotation must be a number' },
        { status: 400 }
      )
    }
    
    // Check if setting exists
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM system_settings WHERE key = 'driver_rotation'
    `
    
    if (existing && existing.length > 0) {
      // Update existing
      await prisma.$executeRaw`
        UPDATE system_settings 
        SET value = ${JSON.stringify(body)}::jsonb,
            updated_by = ${session.user.email || 'admin'},
            updated_at = NOW()
        WHERE key = 'driver_rotation'
      `
    } else {
      // Create new
      const settingId = `setting_${Date.now()}`
      await prisma.$executeRaw`
        INSERT INTO system_settings (id, key, value, category, updated_by)
        VALUES (
          ${settingId},
          'driver_rotation',
          ${JSON.stringify(body)}::jsonb,
          'driver',
          ${session.user.email || 'admin'}
        )
      `
    }
    
    console.log('[Settings API] Driver rotation settings updated by', session.user.email)
    
    return NextResponse.json({
      key: 'driver_rotation',
      value: body,
      success: true
    })
  } catch (error) {
    console.error('[Settings API] Error updating driver rotation settings:', error)
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    )
  }
}
