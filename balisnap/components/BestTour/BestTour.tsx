'use client'
import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { Card, CardFooter, Spinner } from '@heroui/react'
import { scroller } from 'react-scroll'

type Tour = {
  package_id: string
  package_name: string
  thumbnail_url: string
  short_description: string
  price_per_person?: number
  slug: string
}

type TourPackagesProps = {
  tours: Tour[]
}

const BestTour: React.FC<TourPackagesProps> = ({ tours }) => {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Scroll to the element specified by the URL hash
    const hash = window.location.hash.replace('#', '')

    if (hash) {
      scroller.scrollTo(hash, {
        duration: 800,
        delay: 0,
        smooth: 'easeInOutQuart'
      })
    }
  }, [])

  useEffect(() => {
    setLoading(false)
  }, [tours])

  return (
    <div
      className="flex flex-wrap justify-center w-full max-w-screen-lg gap-4 px-4 mx-auto"
      id="tour-packages"
    >
      <h2 className="w-full text-center text-[2.5rem] font-bold my-[2rem]">
        Our Best Tours
      </h2>
      {loading ? (
        <Spinner color="secondary" size="lg" />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {tours.map((tour) => (
            <Card
              key={tour.slug}
              isFooterBlurred
              className="w-[30%] h-[250px] col-span-12 sm:col-span-7"
            >
              <Image
                alt="Relaxing app background"
                className="z-0 w-full h-full object-cover"
                height={300}
                src={tour.thumbnail_url}
                width={300}
              />
              <CardFooter className="absolute bg-black/40 bottom-0 z-10 border-t-1 border-default-600 dark:border-default-100">
                <div className="flex flex-grow gap-2 items-center">
                  <div className="flex flex-col">
                    <h4 className="text-white/90 font-medium text-xl">
                      {tour.package_name}
                    </h4>
                    <p className="text-tiny text-white/60 uppercase font-bold">
                      {`USD${tour.price_per_person}`}/pax
                    </p>
                  </div>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default BestTour
