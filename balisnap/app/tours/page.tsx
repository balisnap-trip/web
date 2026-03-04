import { TourPackages } from '@/components/TourPackages'
import { getFeaturedTours } from '@/lib/public-data'

export const dynamic = 'force-dynamic'

export default async function ToursPage() {
  let tours: Awaited<ReturnType<typeof getFeaturedTours>> = []

  try {
    tours = await getFeaturedTours()
  } catch (error) {
    console.error('Failed to load featured tours for /tours', error)
  }

  return (
    <div className="max-w-[80rem] mx-auto p-4">
      <TourPackages tours={tours} />
    </div>
  )
}
