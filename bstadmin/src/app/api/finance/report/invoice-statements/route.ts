import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getInvoiceStatements } from '@/lib/finance/invoice-statements'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const month = searchParams.get('month')
    const includePaid = searchParams.get('includePaid') === '1'

    const payload = await getInvoiceStatements({ month, includePaid })
    return NextResponse.json(payload)
  } catch (error) {
    console.error('[API /finance/report/invoice-statements] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

