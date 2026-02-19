import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFinanceReportPayload } from '@/lib/finance/report'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const monthKey = searchParams.get('month')
    const yearKey = searchParams.get('year')
    const payload = await getFinanceReportPayload({ monthKey, yearKey })
    return NextResponse.json(payload)
  } catch (error) {
    console.error('[API /finance/report] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
