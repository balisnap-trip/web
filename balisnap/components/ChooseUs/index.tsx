import Image from 'next/image'
import heroImage from '../../public/choose-us.png'
import Link from 'next/link';
import { FaEarthAsia } from "react-icons/fa6";
import { FaPeopleGroup } from "react-icons/fa6";
import { FaMapMarkedAlt } from "react-icons/fa";
import { PiFlowerLotus } from "react-icons/pi";

const ChooseUs = () => {
  return (
    <div className="pt-10 pb-28 relative flex items-center justify-center overflow-hidden -mt-10">
      <Image
        fill
        alt="Hero Image"
        quality={100}
        src={heroImage}
        className='object-cover'
      />

      {/* Gradient overlay */}
      <div className="absolute top-0 left-0 right-0 h-[100%] bg-gradient-to-b from-black to-transparent" />
      <div className="x text-white top-20 z-10 p-4 text-center">
        <h2 className="w-full text-center text-[1.8rem] md:text-[2.5rem] font-bold my-[2rem]">
          Why you should choose us
        </h2>
        <div className='grid grid-cols-1 md:grid-cols-4 gap-6 mb-10'>
          <div className='p-8 border-slate-200 bg-black/40 rounded-lg'>
            <div className="flex justify-center mb-4">
              <PiFlowerLotus size={70} />
            </div>
            <div className='md:w-52 flex justify-center text-2xl font-bold'>
              <p>Exclusive Access</p>
            </div>
          </div>
          <div className='p-8 border-slate-200 bg-black/40 rounded-lg'>
            <div className="flex justify-center mb-4">
              <FaMapMarkedAlt size={70} />
            </div>
            <div className='md:w-52 flex justify-center text-2xl font-bold'>
              <p>Tailored Adventures</p>
            </div>
          </div>
          <div className='p-8 border-slate-200 bg-black/40 rounded-lg'>
            <div className="flex justify-center mb-4">
              <FaPeopleGroup size={70} />
            </div>
            <div className='md:w-52 flex justify-center text-2xl font-bold'>
              <p>Expert Local Guides</p>
            </div>
          </div>
          <div className='p-8 border-slate-200 bg-black/40 rounded-lg'>
            <div className="flex justify-center mb-4">
              <FaEarthAsia size={70} />
            </div>
            <div className='md:w-52 flex justify-center text-2xl font-bold'>
              <p>Sustainable and Responsible</p>
            </div>
          </div>
        </div>
        <Link
          href={'/about'}
          className="bg-white py-1 px-4 text-[#00A651] shadow-xl rounded-xl text-base cursor-pointer hover:bg-[#00A651] hover:text-white transition"
        >
          Learn More
        </Link>
      </div>
    </div>
  )
}

export default ChooseUs