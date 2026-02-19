'use client'
import { useEffect, useState } from 'react'
import Script from 'next/script'

import { fetchFeaturedTours, TourPackages } from '@/components/TourPackages'
import { Reviews } from '@/components/Reviews'
import HeroSection from '@/components/hero'
import { fetchReviews } from '@/components/Reviews/fetchData'
import ChooseUs from '@/components/ChooseUs'
import HappyCustomer from '@/components/HappyCustomer'

export default function Home() {
  const [reviews, setReviews] = useState<any[]>([])
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
    const fetchReviewData = async () => {
      try {
        const data = await fetchReviews()

        setReviews(data)
      } catch (error) {
        console.log(error)
      }
    }

    fetchTourData()
    fetchReviewData() // Call the async function
  }, [])

  return (
    <>
      <Script
        id="trustmary-script"
        src="https://embed.trustmary.com/embed.js"
        strategy="afterInteractive"
      />
      <div>
        <div className="relative top-0">
          <HeroSection />
        </div>
        <section>
          <ChooseUs />
        </section>
        <section className="flex justify-center my-20 mb-32">
          <TourPackages tours={tours} />
        </section>
        <section>
          <HappyCustomer />
        </section>
        {reviews.length > 0 && (
          <section className="gap-4 py-8 md:py-10 mx-auto max-w-[100rem] h-[50rem]">
            <Reviews reviews={reviews} />
          </section>
        )}
        <section className="gap-4 py-8 md:py-10 mx-auto max-w-[100rem] h-[50rem]">
          <div data-trustmary-widget="Luj4XsQWw" />
        </section>
      </div>
    </>
  )
}
