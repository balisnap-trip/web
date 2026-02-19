'use client'
import Image from 'next/image'
import { Link } from 'react-scroll'

import heroImage from '../public/hero.jpg'

const HeroSection = () => {
  return (
    <div className="relative h-screen flex items-center justify-center overflow-hidden">
      <Image
        fill // Ensures the image covers the parent container
        priority
        alt="Hero Image"
        quality={100}
        src={heroImage}
        style={{ objectFit: 'cover' }} // Ensures the image covers the area
      />

      {/* Gradient overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-[60%] bg-gradient-to-t from-black/40 p-4 z-0" />
      <div className="absolute bottom-0 left-0 right-0 h-[60%] bg-gradient-to-t from-black p-4 z-0" />
      <div className="absolute text-white -mt-28 z-10 p-4 md:max-w-[50%] max-w-[90%] text-center">
        <h1 className="text-6xl md:text-8xl font-bold">
          BALISNAP TRIP
        </h1>
        <h2 className='text-2xl md:text-3xl'>
          Beyond the Common Trail
        </h2>
        <div className='text-gray-300 absolute -bottom-52 -mb-32'>
          <p className='mb-8'>
            Discover Bali beyond the ordinary with Bali Snap Trip. Explore
            hidden gems, local traditions, and breathtaking landscapes on
            immersive tours that connect you with the heart of the island. Your
            adventure starts here.
          </p>
          <Link
            className="animate-pulse py-1 px-4 text-white border-white border-1 rounded-xl text-base cursor-pointer"
            to="tour-packages"
          >
            Discover More
          </Link>
        </div>

      </div>
    </div>
  )
}

export default HeroSection
