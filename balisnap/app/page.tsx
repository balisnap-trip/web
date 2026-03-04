import Script from 'next/script'

import { TourPackages } from '@/components/TourPackages'
import { Reviews } from '@/components/Reviews'
import HeroSection from '@/components/hero'
import ChooseUs from '@/components/ChooseUs'
import HappyCustomer from '@/components/HappyCustomer'
import { getFeaturedTours, getLatestReviews } from '@/lib/public-data'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const [toursResult, reviewsResult] = await Promise.allSettled([
    getFeaturedTours(),
    getLatestReviews()
  ])
  const tours = toursResult.status === 'fulfilled' ? toursResult.value : []
  const reviews =
    reviewsResult.status === 'fulfilled' ? reviewsResult.value : []

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
