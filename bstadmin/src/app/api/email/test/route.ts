import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * POST /api/email/test
 * Test email integration
 * Admin only
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const body = await req.json()
    const { testType } = body

    if (testType === 'email') {
      // Test email connection (just check credentials)
      const { createGYGClient, createOTAClient } = await import('@/lib/email/imap-client')
      
      try {
        const gygClient = createGYGClient()
        await gygClient.connect()
        await gygClient.disconnect()
      } catch (error) {
        return NextResponse.json({
          success: false,
          message: 'GYG email connection failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }

      try {
        const otaClient = createOTAClient()
        await otaClient.connect()
        await otaClient.disconnect()
      } catch (error) {
        return NextResponse.json({
          success: false,
          message: 'OTA email connection failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }

      return NextResponse.json({
        success: true,
        message: 'Both email accounts connected successfully!',
      })
    }

    return NextResponse.json(
      { error: 'Invalid test type. Use "email".' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[API /email/test] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
