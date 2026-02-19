import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  fetchCoreApiRequestMetrics,
  fetchCoreIngestProcessingMetrics,
  fetchCoreIngestQueueMetrics,
  fetchCoreReconciliationMetrics,
} from '@/lib/integrations/core-api-ops'

/**
 * GET /api/observability/core-api
 * Aggregate core-api metrics for ops dashboard.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const windowParam = req.nextUrl.searchParams.get('windowMinutes') || '15'
    const processingWindowParam = req.nextUrl.searchParams.get('processingWindowMinutes') || '60'
    const windowMinutes = Number.isFinite(Number(windowParam)) ? Number(windowParam) : 15
    const processingWindowMinutes = Number.isFinite(Number(processingWindowParam))
      ? Number(processingWindowParam)
      : 60

    const [apiMetrics, queueMetrics, processingMetrics, reconciliationMetrics] = await Promise.all([
      fetchCoreApiRequestMetrics(windowMinutes),
      fetchCoreIngestQueueMetrics(),
      fetchCoreIngestProcessingMetrics(processingWindowMinutes),
      fetchCoreReconciliationMetrics(),
    ])

    return NextResponse.json({
      coreApi: {
        api: {
          ok: apiMetrics.ok,
          status: apiMetrics.status,
          data: apiMetrics.data,
          error: apiMetrics.error,
        },
        ingestQueue: {
          ok: queueMetrics.ok,
          status: queueMetrics.status,
          data: queueMetrics.data,
          error: queueMetrics.error,
        },
        ingestProcessing: {
          ok: processingMetrics.ok,
          status: processingMetrics.status,
          data: processingMetrics.data,
          error: processingMetrics.error,
        },
        reconciliation: {
          ok: reconciliationMetrics.ok,
          status: reconciliationMetrics.status,
          data: reconciliationMetrics.data,
          error: reconciliationMetrics.error,
        },
      },
    })
  } catch (error) {
    console.error('[API /observability/core-api] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
