'use client'
import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { Button, Card, CardFooter, Spinner } from '@heroui/react'
import { scroller } from 'react-scroll'
import Link from 'next/link'

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

const TourPackages: React.FC<TourPackagesProps> = ({ tours }) => {
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
      className="flex flex-wrap justify-center w-full px-4 mx-auto"
      id="tour-packages"
    >
      <h2 className="w-full text-center text-[2.5rem] font-bold my-[2rem]">
        Featured Tours
      </h2>
      {loading ? (
        <Spinner color="secondary" size="lg" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tours.map((tour) => (
            <div key={tour.slug} className="group h-full">
              <Card isFooterBlurred className="w-full h-[500px] mb-2">
                <div className="absolute bg-black opacity-0 h-full w-full z-20 group-hover:opacity-80 transition duration-300 flex items-center justify-center">
                  <p className="px-10 text-center text-white flex items-center">
                    {tour.short_description}
                  </p>
                </div>
                <Image
                  alt={tour.package_name}
                  className="animate-fade-in block h-full w-full scale-100 transform object-cover object-center opacity-100 transition duration-300 group-hover:scale-110"
                  height={300}
                  src={tour.thumbnail_url}
                  width={300}
                />
                <CardFooter className="group-hover:opacity-0 transition duration-300 absolute bg-black/40 bottom-0 z-10 border-t-1 border-default-600 dark:border-default-100">
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
              <Link href={`/tours/${tour.slug}`}>
                <Button className="bg-[#00A651] text-white w-full border-2">
                  View Trip
                </Button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TourPackages
