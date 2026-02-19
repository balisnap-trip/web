'use client'
import { FaFacebookF, FaInstagram, FaTripadvisor } from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'

import { Logo } from '../icons'
import PayPalLogo from '../PayPalLogo'
import Image from 'next/image'

import heroImage from '../../public/footer.png'

const Footer = () => {
  const year = new Date().getFullYear()

  return (
    <div>
      <div className="pt-10 h-80 pb-32 relative flex items-center justify-center overflow-hidden">
        <Image
          fill
          priority
          alt="Hero Image"
          quality={100}
          src={heroImage}
          style={{ objectFit: 'cover' }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-[80%] bg-gradient-to-t from-black to-transparent" />
      </div>
      <footer className="px-6 pt-8 pb-4 text-white bg-black">
        <div className="container mx-auto">
          <div className="flex flex-wrap justify-between">
            <div className="w-full mb-6 lg:w-1/5 md:w-1/2 sm:mb-4">
              <Logo fill="white" height={64} />
              <PayPalLogo />
            </div>
            <div className="w-full mb-6 lg:w-1/5 md:w-1/2 sm:mb-4">
              <h4 className="mb-4 text-xl font-semibold">Contact Us</h4>
              <ul>
                <li className="mb-2">Saba, Blahbatuh, Gianyar</li>
                <li className="mb-2">Bali, Indonesia 80581</li>
                <li className="mb-2">
                  Phone: {process.env.NEXT_PUBLIC_PHONE_NUMBER}
                </li>
                <li>
                  Email:{' '}
                  <a
                    className="hover:text-blue-600"
                    href={`mailto:${process.env.NEXT_PUBLIC_INFO_EMAIL}`}
                  >
                    {process.env.NEXT_PUBLIC_INFO_EMAIL}
                  </a>
                </li>
              </ul>
            </div>
            <div className="w-full mb-6 lg:w-1/5 md:w-1/2 sm:mb-4">
              <h4 className="mb-4 text-xl font-semibold">Follow Us</h4>
              <ul>
                <li className="mb-2">
                  <a
                    className="flex items-center hover:text-blue-600"
                    href="https://www.tripadvisor.co.id/Attraction_Review-g297695-d28661718-Reviews-Bali_Snap_Trip-Gianyar_Gianyar_Regency_Bali.html"
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="mr-2 text-xl">
                      <FaTripadvisor />
                    </span>
                    Tripadvisor
                  </a>
                </li>
                <li className="mb-2">
                  <a
                    className="flex items-center hover:text-blue-600"
                    href="https://www.facebook.com/profile.php?id=61565675274752"
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="mr-2 text-xl">
                      <FaFacebookF />
                    </span>
                    Facebook
                  </a>
                </li>
                <li className="mb-2">
                  <a
                    className="flex items-center hover:text-blue-600"
                    href="https://x.com/BaliSnapTrip"
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="mr-2 text-xl">
                      <FaXTwitter />
                    </span>
                    Twitter
                  </a>
                </li>
                <li className="mb-2">
                  <a
                    className="flex items-center hover:text-blue-600"
                    href="https://www.instagram.com/balisnaptrip"
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="mr-2 text-xl">
                      <FaInstagram />
                    </span>
                    Instagram
                  </a>
                </li>
              </ul>
            </div>
            <div className="w-full mb-6 lg:w-1/5 md:w-1/2 sm:mb-4">
              <h4 className="mb-4 text-xl font-semibold">Links</h4>
              <ul>
                <li className="mb-2">
                  <a className="hover:text-blue-600" href="/tours">
                    Tours
                  </a>
                </li>
                <li className="mb-2">
                  <a className="hover:text-blue-600" href="/about">
                    About Us
                  </a>
                </li>
                <li className="mb-2">
                  <a className="hover:text-blue-600" href="/contact">
                    Contact Us
                  </a>
                </li>
                <li className="mb-2">
                  <a className="hover:text-blue-600" href="/privacy-policy">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a className="hover:text-blue-600" href="/terms-of-service">
                    Terms of Service
                  </a>
                </li>
              </ul>
            </div>
            <div className="w-full mb-6 lg:w-1/5 md:w-full sm:mb-4">
              <h4 className="mb-4 text-xl font-semibold">Legal</h4>
              <p className="text-sm leading-relaxed">
                PT Bali Snap Trip is a legally registered company under Indonesian
                law with registration number AHU-049400.AH.01.30 | 1709240039297,
                based in Bali, Indonesia.
              </p>
            </div>
          </div>
          <div className="pt-4 mt-6 text-center border-t border-gray-700">
            <p>&copy; {year} Bali Snap Trip. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Footer
