'use client'
import { useEffect } from 'react'
import { scroller } from 'react-scroll'

import { ReviewSlider } from './_components'

// Define a type for the reviews if possible
type Review = {
  Booking: {
    User: {
      image: string
      name: string
      email: string
    }
  }

  comment: string
  rating: number
}

interface ReviewsProps {
  reviews: Review[]
}

const Reviews: React.FC<ReviewsProps> = ({ reviews }) => {
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

  return reviews.length > 0 ? (
    <div className="gap-4 py-8 md:py-10 mx-auto max-w-[70rem]" id="reviews">
      <h2 className="w-full text-center text-[2.5rem] font-bold my-[2rem]">
        What Our Customers Say
      </h2>
      <ReviewSlider items={reviews} />
    </div>
  ) : null
}

export default Reviews
