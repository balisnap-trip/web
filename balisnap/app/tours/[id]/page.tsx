import { notFound } from 'next/navigation'

import TourPageClient from '@/components/TourPage/TourPageClient'
import { getTourBySlug } from '@/lib/public-data'

export const dynamic = 'force-dynamic'

export default async function TourPage({
  params
}: {
  params: { id: string }
}) {
  const tour = await getTourBySlug(params.id)

  if (!tour) {
    notFound()
  }

  return <TourPageClient tour={tour} />
}
