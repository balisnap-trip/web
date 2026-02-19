'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { LoginForm } from '@/components/Auth'

const LoginPage = () => {
  const { data: session } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (session) {
      router.push('/')
    }
  }, [session, router])

  if (session) return null

  return (
    <div>
      <LoginForm />
    </div>
  )
}

export default LoginPage
