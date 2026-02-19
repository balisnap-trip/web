'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { VerifyRequest } from '@/components/Auth'

const VerifyRequestPage = () => {
  const router = useRouter()

  const { data: session } = useSession()

  useEffect(() => {
    if (session) {
      router.push('/')
    }
  }, [session, router])

  if (session) return null

  return <VerifyRequest />
}

export default VerifyRequestPage
