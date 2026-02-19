'use client'

import { Card } from '@/components/ui/card'
import { ModuleTabs } from '@/components/layout/module-tabs'

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <ModuleTabs moduleId="settings" />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="mt-1 text-gray-600">User management (coming soon).</p>
      </div>

      <Card className="p-4 text-sm text-gray-700">
        Rencana: masteradmin bisa kelola user dan role. Admin hanya boleh tambah user driver.
      </Card>
    </div>
  )
}
