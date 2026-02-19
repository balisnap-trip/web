import { Button, Chip, Spinner, Textarea } from '@heroui/react'
import { useState } from 'react'
import { FaStar } from 'react-icons/fa6'

import { formatDate } from '@/lib/utils/formatDate'
import { StarReview } from '@/components/Reviews/_components'

const BookingCard = ({ booking }: { booking: any }) => {
  const [showReview, setShowReview] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    rating: 0,
    review: '',
    booking_id: ''
  })

  const [errors, setErrors] = useState({
    rating: '',
    review: ''
  })
  const bookingStatus = (status: string) => {
    switch (status) {
      case 'waiting':
        return (
          <Chip color="warning" size="sm">
            Waiting Payment
          </Chip>
        )
      case 'paid':
        return (
          <Chip color="primary" size="sm">
            Confirmed
          </Chip>
        )
      case 'cancelled':
        return (
          <Chip color="danger" size="sm">
            Cancelled
          </Chip>
        )
      case 'completed':
        return (
          <Chip color="success" size="sm">
            Completed
          </Chip>
        )
      default:
        return null
    }
  }

  const handleSubmitReview = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    if (formData.rating === 0) {
      setErrors({ ...errors, rating: 'Please select a rating' })
      setLoading(false)

      return
    }
    if (formData.review.trim() === '') {
      setErrors({ ...errors, review: 'Please enter a review' })
      setLoading(false)

      return
    }
    setErrors({ ...errors, rating: '', review: '' })

    const data = {
      ...formData,
      booking_id: booking.booking_id
    }
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })

    if (res.ok) {
      setShowReview(false)
      setLoading(false)
      window.location.reload()
    } else {
      setLoading(false)
    }
  }

  const handleStarClick = (value: number) => {
    setErrors({ ...errors, rating: '' })
    setFormData({ ...formData, rating: value })
  }

  const handleChangeReview = (e: any) => {
    setErrors({ ...errors, review: '' })
    setFormData({ ...formData, review: e.target.value })
  }

  const handleCancelReview = () => {
    setFormData({ ...formData, review: '', rating: 0 })
    setErrors({ ...errors, review: '', rating: '' })
    setShowReview(false)
  }

  return (
    <div className="w-full md:w-[90%] bg-white rounded-lg shadow-lg p-6 border border-gray-200 mb-4 mx-auto">
      <div className="flex flex-col">
        {/* Booking Reference and Date */}
        <div className="flex items-center justify-start gap-2 text-gray-700">
          <div className="font-bold text-black">
            {booking.TourPackage?.package_name}
          </div>
          <div className="">{formatDate(booking.booking_date)}</div>
          <div className="font-bold text-gray-600">#{booking.booking_ref}</div>
        </div>

        {/* Tour Info */}
        <div className="flex items-center justify-start gap-2 text-gray-700">
          <div>Participants</div>
          <div className="">
            {booking.number_of_adult} Adults{' '}
            {booking.number_of_child
              ? ', ' + booking.number_of_child + ' Children'
              : ''}
          </div>
        </div>

        <div className="flex items-center justify-start gap-2 text-gray-700">
          <div>Total Price</div>
          <div className="font-bold">{booking.total_price} USD</div>
        </div>
        {/* Booking Status */}
        <div className="flex items-center justify-between gap-2 mt-4 text-gray-700">
          {bookingStatus(booking.status)}
          <div className="flex flex-row justify-start gap-2">
            {booking.status === 'completed' && booking.Reviews.length < 1 && (
              <Button
                color="success"
                size="sm"
                onPress={() => setShowReview(true)}
              >
                Write a Review
              </Button>
            )}
            <Button
              color="success"
              size="sm"
              onPress={() => {
                window.location.href = `/booking/${booking.booking_id}`
              }}
            >
              View Details
            </Button>
          </div>
        </div>

        {booking.status === 'completed' && booking.Reviews.length > 0 && (
          <>
            <hr className="my-2" />
            <div> Your Review</div>

            {/* Star Rating Section */}
            <div className="flex flex-row items-center justify-start gap-1 text-gray-700">
              <div>
                <StarReview rating={booking.Reviews[0].rating} />
              </div>
              <div>{booking.Reviews[0].rating}</div>
            </div>

            {/* Comment Section */}
            <p className="text-gray-700 ">{booking.Reviews[0].comment}</p>
          </>
        )}

        {showReview &&
          booking.status === 'completed' &&
          booking.Reviews.length < 1 && (
            <form
              className="w-full p-4 mx-auto bg-white border rounded-lg shadow-md"
              onSubmit={handleSubmitReview}
            >
              <h2 className="mb-4 text-xl font-bold">Leave a Review</h2>

              <div className="mb-4">
                <p className="block mb-2 font-semibold text-gray-700">Rating</p>
                <div className="flex space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      className="focus:outline-none"
                      type="button"
                      onClick={() => handleStarClick(star)}
                    >
                      <FaStar
                        className={`cursor-pointer ${formData.rating && star <= formData.rating ? 'text-yellow-400' : 'text-gray-300'} hover:text-yellow-500`}
                        size="24px"
                      />
                    </button>
                  ))}
                  {errors.rating && (
                    <p className="mt-1 text-sm text-red-500">{errors.rating}</p>
                  )}
                </div>
              </div>

              {/* Comment Section */}
              <div className="mb-4">
                <label
                  className="block mb-2 font-semibold text-gray-700"
                  htmlFor="comment"
                >
                  Review
                </label>
                <Textarea
                  fullWidth
                  className="border rounded-md"
                  id="comment"
                  minRows={4}
                  placeholder="Write your review here..."
                  value={formData.review}
                  onChange={handleChangeReview}
                />
                {errors.review && (
                  <p className="mt-1 text-sm text-red-500">{errors.review}</p>
                )}
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end gap-2">
                <Button
                  className="py-2 text-white bg-blue-500 rounded-lg hover:bg-blue-600"
                  type="submit"
                >
                  {loading ? <Spinner color="white" size="sm" /> : null} Submit
                  Review
                </Button>
                <Button
                  className="py-2 rounded-lg "
                  color="danger"
                  type="button"
                  variant="ghost"
                  onClick={handleCancelReview}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
      </div>
    </div>
  )
}

export default BookingCard
