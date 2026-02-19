import React from 'react'

type StarRatingProps = {
  rating: number // Rating is now rounded to the nearest integer
}

const StarRating: React.FC<StarRatingProps> = ({ rating }) => {
  const fullStars = Math.floor(rating)
  const hasHalfStar = rating % 1 !== 0

  return (
    <div className="flex">
      {[...Array(5)].map((_, index) => {
        if (index < fullStars) {
          return (
            <svg
              key={index}
              className="w-4 h-4"
              fill="currentColor"
              style={{ color: 'rgb(234, 179, 8)' }} // Full star color
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 .587l3.668 7.568 8.332 1.209-6.016 5.854 1.422 8.301L12 17.897l-7.406 3.957L6.016 15.22.002 9.897l8.332-1.209L12 .587z" />
            </svg>
          )
        } else if (index === fullStars && hasHalfStar) {
          return (
            <svg
              key={index}
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <mask id="half-star-mask">
                  <rect fill="white" height="24" width="12" x="0" y="0" />
                </mask>
              </defs>
              <path
                d="M12 .587l3.668 7.568 8.332 1.209-6.016 5.854 1.422 8.301L12 17.897l-7.406 3.957L6.016 15.22.002 9.897l8.332-1.209L12 .587z"
                fill="rgb(255, 215, 0)" // Half star color
                mask="url(#half-star-mask)"
              />
              <path
                d="M12 .587l3.668 7.568 8.332 1.209-6.016 5.854 1.422 8.301L12 17.897l-7.406 3.957L6.016 15.22.002 9.897l8.332-1.209L12 .587z"
                fill="rgb(234, 179, 8)" // Full star border color
                mask="url(#half-star-mask)"
                stroke="rgb(234, 179, 8)" // Full star border color
                strokeWidth="1"
              />
              <path
                d="M12 .587l3.668 7.568 8.332 1.209-6.016 5.854 1.422 8.301L12 17.897l-7.406 3.957L6.016 15.22.002 9.897l8.332-1.209L12 .587z"
                fill="none"
                opacity="0.5"
                stroke="rgb(234, 179, 8)" // Gray border color for the rest of the star
                strokeWidth="1"
              />
            </svg>
          )
        } else {
          return (
            <svg
              key={index}
              className="w-4 h-4"
              fill="currentColor"
              style={{ color: 'rgb(234, 179, 8)' }} // Empty star color
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 .587l3.668 7.568 8.332 1.209-6.016 5.854 1.422 8.301L12 17.897l-7.406 3.957L6.016 15.22.002 9.897l8.332-1.209L12 .587z" />
            </svg>
          )
        }
      })}
    </div>
  )
}

export default StarRating
