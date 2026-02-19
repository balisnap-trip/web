import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOpsCutoverDecisionForActor } from '@/lib/integrations/core-api-ops'

/**
 * GET /api/ops/cutover-state
 * Return cutover flag evaluation for current authenticated actor.
 */
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const actor = {
    id: session.user.id,
    email: session.user.email,
  }
  const decision = getOpsCutoverDecisionForActor(actor)

  return NextResponse.json({
    cutover: {
      generatedAt: new Date().toISOString(),
      actor: {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
      },
      read: decision.read,
      write: decision.write,
      writeStrict: decision.writeStrict,
    },
  })
}
