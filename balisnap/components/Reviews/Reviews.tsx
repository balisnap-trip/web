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
