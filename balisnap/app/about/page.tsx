'use client'
import { Image } from '@heroui/react'

import { title } from '@/components/primitives'

export default function AboutPage() {
  return (
    <div className="max-w-screen-xl px-8 py-8 mx-auto bg-white shadow-lg">
      <h1 className={title()}>About</h1>

      <p className="my-4 text-lg font-bold text-gray-600">
        Welcome to BaliSnap Trip
      </p>
      <p className="leading-relaxed text-gray-600 text-md">
        At BaliSnap Trip, we transform every journey into an authentic adventure
        that connects you deeply with Bali&apos;s rich cultural heritage and
        breathtaking natural landscapes. Our personalized travel experiences go
        beyond the ordinary, offering you exclusive access to Bali&apos;s hidden
        gems and allowing you to immerse yourself in the island&apos;s vibrant
        traditions.
      </p>

      <p className="my-4 text-lg font-bold text-gray-600">What Sets Us Apart</p>
      <p className="leading-relaxed text-gray-600 text-md">
        We specialize in creating unique, tailored experiences that reveal the
        true spirit of Bali. Whether you&apos;re looking to connect with local
        communities, explore untouched nature, or engage in cultural practices,
        each trip is designed around your interests. With BaliSnap Trip,
        you&apos;ll experience Bali in an immersive, meaningful, and memorable
        way.
      </p>

      <p className="my-4 text-lg font-bold text-gray-600">Our Philosophy</p>
      <p className="leading-relaxed text-gray-600 text-md">
        We are dedicated to preserving and sharing Bali&apos;s pristine beauty
        and time-honored traditions. Our guided tours take you off the beaten
        path to explore sacred temples, witness traditional ceremonies, and
        visit local villages that still uphold their ancient customs. We are
        proud to support sustainable tourism, ensuring your journey helps
        protect Bali&apos;s environment and supports its local communities.
      </p>

      <p className="my-4 text-lg font-bold text-gray-600">
        Why Choose BaliSnap Trip?
      </p>
      <ol className="pl-5 my-2 space-y-4 text-gray-700 list-decimal">
        <li>
          <strong className="text-lg font-semibold">Exclusive Access: </strong>
          <span className="leading-relaxed text-gray-600 text-md">
            Gain rare insights into Bali&apos;s spiritual life by visiting
            secluded temples, attending sacred rituals, and meeting local
            artisans in their villages. We take you where culture thrives.
          </span>
        </li>
        <li>
          <strong className="text-lg font-semibold">
            Tailored Adventures for Every Traveler:
          </strong>
          <span className="leading-relaxed text-gray-600 text-md">
            Whether you seek thrilling outdoor activities, serene natural
            escapes, or deep cultural immersion, we craft personalized
            itineraries based on your preferences for an enriching experience.
          </span>
        </li>
        <li>
          <strong className="text-lg font-semibold">
            Expert Local Guides:
          </strong>
          <span className="leading-relaxed text-gray-600 text-md">
            Our guides are passionate about Bali&apos;s history, culture, and
            natural wonders. They share unique stories and local knowledge,
            ensuring you leave with a deeper connection to the island.
          </span>
        </li>
        <li>
          <strong className="text-lg font-semibold">
            Sustainable and Responsible Tourism:
          </strong>
          <span className="leading-relaxed text-gray-600 text-md">
            We prioritize eco-friendly tourism, working closely with local
            communities to preserve their traditions and protect Bali&apos;s
            environment. By traveling with us, you contribute to safeguarding
            Bali&apos;s cultural and natural heritage.
          </span>
        </li>
      </ol>
      <p className="my-4 text-lg font-bold text-gray-600">Join Us</p>
      <p className="leading-relaxed text-gray-600 text-md">
        Embark on a journey with BaliSnap Trip to discover Bali&apos;s untouched
        landscapes and living traditions. Whether you&apos;re looking to connect
        with local communities, uncover the island&apos;s sacred sites, or enjoy
        its pristine nature, we&apos;re here to craft an unforgettable travel
        experience just for you.
      </p>
      <p className="leading-relaxed text-gray-600 text-md">
        Let us show you the true essence of Bali and create memories that will
        last a lifetime.
      </p>
      <div className="flex flex-wrap justify-center w-full max-w-screen-lg gap-4 mx-auto my-8">
        <Image
          alt={'Bali'}
          className="object-cover w-full rounded-md"
          src={'/tours/bali.jpg'}
        />
      </div>
    </div>
  )
}
