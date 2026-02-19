'use client'
import { useEffect, useState } from 'react'

import { fetchFeaturedTours, TourPackages } from '@/components/TourPackages'
export default function ToursPage() {
  const [tours, setTours] = useState<any[]>([])

  useEffect(() => {
    // Define an async function and call it
    const fetchTourData = async () => {
      try {
        const data = await fetchFeaturedTours()

        setTours(data)
      } catch (error) {
        console.log(error)
      }
    }

    fetchTourData()
  }, [])

  return (
    <div className="max-w-[80rem] mx-auto p-4">
      <TourPackages tours={tours} />
    </div>
  )
}
