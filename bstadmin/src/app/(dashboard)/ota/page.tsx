'use client'

import { Card } from '@/components/ui/card'
import { ModuleTabs } from '@/components/layout/module-tabs'

export default function OtaPage() {
  return (
    <div className="space-y-6">
      <ModuleTabs moduleId="networks" />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">OTA</h1>
        <p className="mt-1 text-gray-600">
          Atur aturan komisi OTA dan lakukan kalkulasi gross-to-net (coming soon).
        </p>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold text-gray-900">Planned scope</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>Daftar OTA + aturan komisi (mis: GYG).</li>
          <li>Kalkulator: harga jual → net company, dan target net → minimum harga jual.</li>
          <li>(Tahap berikutnya) mapping OTA ke tour/package/pattern, lalu dipakai di report revenue.</li>
        </ul>
      </Card>
    </div>
  )
}
