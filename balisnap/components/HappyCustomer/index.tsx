import Image from 'next/image'
import heroImage from '../../public/happy.png'

const HappyCustomer = () => {
  return (
    <div className="pt-10 h-screen pb-32 relative flex items-center justify-center overflow-hidden">
      <Image
        fill
        priority
        alt="Hero Image"
        quality={100}
        src={heroImage}
        style={{ objectFit: 'cover' }}
      />

      {/* Gradient overlay */}
      <div className="absolute md:left-0 md:top-20 text-white bg-black/30 z-10 p-6 mx-10 md:mr-20 rounded-xl">
        <h2 className="text-7xl md:text-7xl font-bold text-center">
          We have 10000+ happy customer
        </h2>
      </div>
    </div>
  )
}

export default HappyCustomer