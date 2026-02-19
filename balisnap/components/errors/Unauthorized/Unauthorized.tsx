// pages/404.tsx
import React from 'react'
import Link from 'next/link'
import { LoginForm } from '@/components/Auth'
import { usePathname } from 'next/navigation'

const UnAuthorized = () => {
  const path = usePathname()
  return (
    <div className="h-[60vh] flex flex-col justify-center items-center">
      <h1 className="text-4xl font-bold text-gray-800 mb-4">401</h1>
      <h2 className="text-2xl text-gray-600 mb-6">Unauthorized</h2>
      <p className="text-gray-500 mb-8">
        You are not authorized to access this page.
      </p>
      {/* <Link
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        href="/auth/login"
      >
        Login
      </Link> */}
      <LoginForm callbackUrl={path} />
    </div>
  )
}

export default UnAuthorized
