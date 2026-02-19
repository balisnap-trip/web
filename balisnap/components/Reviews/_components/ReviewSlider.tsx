import React from 'react'
import { Avatar, Card, CardBody, CardHeader } from '@heroui/react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination, EffectCoverflow } from 'swiper/modules'

import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'
import 'swiper/css/effect-coverflow'
import { StarReview } from '.'

// Define Review type
type Review = {
  Booking: {
    User: {
      image: string
      name?: string
      email?: string
    }
  }

  comment: string
  rating: number
}

type SwiperProps = {
  items: Review[]
}

const ReviewSlider: React.FC<SwiperProps> = ({ items }) => {
  // Centered slides style
  const centeredSlidesStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center', // Center the slides
    alignItems: 'center'
  }

  return (
    <div className="relative w-full">
      <Swiper
        navigation
        breakpoints={{
          640: {
            slidesPerView: 1,
            spaceBetween: 20
          },
          768: {
            slidesPerView: 3,
            spaceBetween: 40
          },
          1024: {
            slidesPerView: 3,
            spaceBetween: 50
          }
        }}
        centeredSlides={items.length <= 2} // Center slides if 1 or 2 items
        className="w-full"
        coverflowEffect={{
          rotate: 30,
          stretch: 0,
          depth: 100,
          modifier: 1,
          slideShadows: false
        }}
        effect="coverflow"
        modules={[Pagination, Navigation, EffectCoverflow]}
        pagination={{ clickable: true }}
        slidesPerView={1}
        spaceBetween={20}
        style={items.length <= 2 ? centeredSlidesStyle : {}}
      >
        {items.map((item, index) => (
          <SwiperSlide key={index}>
            <Card className="w-full h-[300px] p-5" radius="sm">
              <CardHeader className="justify-between">
                <div className="flex gap-5">
                  <Avatar
                    isBordered
                    radius="full"
                    size="md"
                    src={item.Booking.User?.image}
                  />
                  <div className="flex flex-col items-start justify-center gap-1">
                    <h4 className="font-semibold leading-none text-small text-default-600">
                      {item.Booking.User?.name ??
                        item.Booking.User?.email ??
                        'Anonymous'}
                    </h4>
                    <div className="flex flex-row items-center justify-start gap-1">
                      <StarReview rating={item.rating} /> {item.rating}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardBody className="px-3 py-0 overflow-hidden text-small text-default-400">
                <p className="text-ellipsis">{item.comment}</p>
              </CardBody>
            </Card>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  )
}

export default ReviewSlider
