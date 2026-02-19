'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ModuleTabs } from '@/components/layout/module-tabs'

export default function NewBookingPage() {
  return (
    <div className="space-y-6">
      <ModuleTabs moduleId="bookings" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Booking (Wizard)</h1>
          <p className="mt-1 text-gray-600">
            Step-by-step booking creation flow (placeholder).
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/bookings">Back to Bookings</Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold text-gray-900">Planned steps</div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
          <li>Source (OTA / manual)</li>
          <li>Guest details</li>
          <li>Tour / package selection</li>
          <li>Date & time</li>
          <li>Pax</li>
          <li>Pickup / meeting point</li>
          <li>Assign driver + pattern</li>
          <li>WhatsApp preview</li>
          <li>Confirm</li>
        </ol>
      </Card>
    </div>
  )
}
