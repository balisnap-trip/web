import { Suspense } from 'react'
import FinanceValidateClient from './validate-client'

export default function FinanceValidatePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading finance review...</div>}>
      <FinanceValidateClient />
    </Suspense>
  )
}
