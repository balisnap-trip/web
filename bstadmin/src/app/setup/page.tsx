'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { createAdminUser } from '../actions/setup'

export default function SetupPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const handleSetup = async () => {
    setLoading(true)
    const res = await createAdminUser()
    setResult(res)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4">Initial Setup</h1>
        <p className="text-gray-600 mb-6">
          Click the button below to create the admin user for first-time setup.
        </p>

        <Button
          type="button"
          onClick={handleSetup}
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Creating...' : 'Create Admin User'}
        </Button>

        {result && (
          <div
            className={`mt-4 p-4 rounded ${
              result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            <p className="font-medium">{result.message}</p>
            {result.user && (
              <div className="mt-2 text-sm">
                <p>Email: {result.user.email}</p>
                <p>Password: admin123</p>
                <p>Role: {result.user.role}</p>
              </div>
            )}
            {result.success && (
              <Link
                href="/login"
                className="mt-4 inline-block text-blue-600 hover:underline"
              >
                → Go to Login
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
