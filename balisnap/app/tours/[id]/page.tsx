'use client'
import { notFound } from 'next/navigation'
import {
  FaCar,
  FaCheck,
  FaChevronDown,
  FaChevronUp,
  FaClock,
  FaInfoCircle,
  FaTimes
} from 'react-icons/fa'
import { useEffect, useState } from 'react'
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  useDisclosure
} from '@heroui/react'
import { FaTicket, FaUtensils } from 'react-icons/fa6'

import { fetchTourBySlug } from '@/components/TourPackages' // Adjust import path
import ImageSlider from '@/components/ImageSlider'
import { newLineToBreak } from '@/config/newLineToBreak'
import FloatingButton from '@/components/FloatingButton'
import { dateToTimeFormat } from '@/lib/utils/formatDate'
import { NotFound } from '@/components/errors'

export default function TourPage({ params }: { params: { id: string } }) {
  // Find the tour by ID from the static data
  const path = params.id
  const [tour, setTour] = useState<any | []>([])

  const [isExpanded, setIsExpanded] = useState(false)
  const { isOpen, onOpen, onOpenChange } = useDisclosure()
  const { onOpen: onBookingModalOpen } = useDisclosure()
  const [loading, setLoading] = useState(true)
  const [isVisible, setIsVisible] = useState(true)

  const handleScroll = () => {
    // Check if the user has scrolled near the bottom of the page
    const scrollTop = window.scrollY
    const windowHeight = window.innerHeight
    const documentHeight = document.documentElement.scrollHeight

    // Show button if not at the bottom, hide if at the bottom
    if (scrollTop + windowHeight < documentHeight - 200) {
      setIsVisible(true)
    } else {
      setIsVisible(false)
    }
  }

  useEffect(() => {
    window.addEventListener('scroll', handleScroll)

    // Cleanup event listener on component unmount
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const toggleAccordion = () => {
    setIsExpanded(!isExpanded)
  }

  if (!tour) {
    notFound()
  }

  useEffect(() => {
    setLoading(true)
    const getTour = async () => {
      const tour = await fetchTourBySlug(path)

      setTour(tour)

      setLoading(false)
    }

    getTour()
  }, [path])

  const tourImages = tour?.TourImages
    ? tour.TourImages.map((image: any) => image.url)
    : []
  const highlights = tour?.Highlights
    ? tour.Highlights.map((highlight: any) => highlight.description)
    : []
  const groupItineraries = (
    itineraries: []
  ): { day: number; itineraries: [] }[] => {
    if (!itineraries) return []

    // Kelompokkan berdasarkan hari
    const grouped = itineraries.reduce(
      (acc: { [key: number]: any }, itinerary: any) => {
        const day = itinerary.day

        if (!acc[day]) {
          acc[day] = []
        }
        acc[day].push(itinerary)

        return acc
      },
      {}
    )

    // Ubah objek hasil kelompokkan menjadi array
    return Object.keys(grouped).map((day) => ({
      day: parseInt(day),
      itineraries: grouped[parseInt(day)]
    }))
  }

  const itineraries = groupItineraries(tour.TourItineraries)

  if (tour.length < 1 && !loading) {
    return <NotFound />
  }

  return (
    <>
      {loading ? (
        <Spinner color="secondary" size="lg" />
      ) : (
        <>
          <div className="max-w-3xl p-6 mx-auto overflow-hidden bg-white rounded-lg shadow-lg">
            <div className="mb-2 text-start">
              {tour.is_featured && <p>Featured Tour</p>}
            </div>
            <div className="flex items-start justify-between">
              <div className="flex flex-col items-start">
                <h2 className="text-3xl font-bold text-gray-900 md:text-5xl">
                  {tour.package_name}
                </h2>
              </div>
            </div>

            {tour.color_code ? (
              <hr
                className={`w-full h-4 my-6`}
                style={{ backgroundColor: tour.color_code }}
              />
            ) : (
              <hr className={`w-full border-gray-300 h-4 my-6`} />
            )}
            {/* Tour Features */}
            <div className="mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-1 text-[0.7rem]">
                {tour.duration && (
                  <div className="flex items-center space-x-2">
                    <FaClock className="text-xl text-green-800 " size={20} />
                    <div className="p-2">
                      <h4 className="font-semibold text-gray-900">Duration</h4>
                      <p className="text-justify text-gray-700">
                        {tour.duration_days}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  <FaUtensils className="text-xl text-green-800" size={20} />
                  <div className="p-2">
                    <h4 className="font-semibold text-gray-900">Breakfast</h4>
                    <p className="text-justify text-gray-700">{'Yes'}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <FaCar className="text-xl text-green-800" size={20} />
                  <div className="p-2">
                    <h4 className="font-semibold text-gray-900">
                      Transportation
                    </h4>
                    <p className="text-justify text-gray-700">{'Yes'}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <FaTicket className="text-xl text-green-800" size={20} />
                  <div className="p-2">
                    <h4 className="font-semibold text-gray-900">
                      Free Entrance Fees
                    </h4>
                    <p className="text-justify text-gray-700">{'Yes'}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <FaTimes className="text-xl text-green-800" size={20} />
                  <div className="p-2">
                    <div className="flex flex-row items-center space-x-2 ">
                      <h4 className="font-semibold text-gray-900">
                        Cancellation
                      </h4>
                      <button className="" onClick={onOpen}>
                        <FaInfoCircle
                          className="text-xl text-yellow-800"
                          size={12}
                        />
                      </button>
                    </div>
                    <p className="text-justify text-gray-700">{'Yes'}</p>
                  </div>
                </div>
              </div>
              <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
                <ModalContent>
                  {(onClose) => (
                    <>
                      <ModalHeader className="flex flex-col gap-1">
                        Cancelation Policy
                      </ModalHeader>
                      <ModalBody>
                        <p className="text-justify text-gray-700 text-[0.6rem]">
                          Cancellations requested by customers must be made at
                          least 2 days before the tour departure date to receive
                          a 50% refund. Cancellations made less than 2 days
                          before the tour departure date will not be eligible
                          for a refund.
                        </p>
                        <p className="text-justify text-gray-700 text-[0.6rem]">
                          Schedule changes can only be made up to 2 days before
                          the scheduled departure date. Requests for schedule
                          changes made less than 2 days before the departure
                          date will not be accommodated.
                        </p>
                        <p className="text-justify text-gray-700 text-[0.6rem]">
                          PT. Bali Snap Trip reserves the right to cancel tours
                          due to certain reasons such as bad weather,
                          emergencies, or other situations beyond the
                          company&apos;s control. In such cases, customers will
                          receive a full refund.
                        </p>
                      </ModalBody>
                      <ModalFooter>
                        <Button
                          color="danger"
                          size="sm"
                          variant="light"
                          onPress={onClose}
                        >
                          Close
                        </Button>
                        <Button
                          color="primary"
                          size="sm"
                          variant="ghost"
                          onPress={onClose}
                        >
                          OK
                        </Button>
                      </ModalFooter>
                    </>
                  )}
                </ModalContent>
              </Modal>
            </div>
            {/* Image slider */}
            <div className="relative w-full mb-6">
              <ImageSlider options={{ loop: true }} slides={tourImages} />
            </div>
            {/* Overview */}
            {tour.description && (
              <div className="flex flex-col items-start mb-6">
                <h3 className="mb-4 text-2xl font-semibold text-gray-900">
                  Overview
                </h3>
                <div
                  className={`text-sm text-gray-700 leading-relaxed transition-all duration-300 ease-in-out ${isExpanded || 'md:max-h-none'
                    } ${isExpanded ? 'max-h-none' : 'max-h-24 overflow-hidden'}`}
                  id="overview-content"
                >
                  <div className="text-start">
                    {newLineToBreak(tour.description)}
                  </div>
                </div>
                {/* Button is visible and functional only on small screens */}
                <button
                  aria-controls="overview-content"
                  aria-expanded={isExpanded}
                  className={`text-blue-400 flex items-center space-x-2 ${isExpanded ? 'cursor-pointer' : 'cursor-pointer'} md:hidden`}
                  onClick={toggleAccordion}
                >
                  <span className="text-sm">
                    {isExpanded ? 'Show less' : 'Show more'}
                  </span>
                  {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                </button>
              </div>
            )}
            {/* Highlights */}
            {highlights && (
              <div className="mb-6">
                <h3 className="mb-4 text-2xl font-semibold text-gray-900 text-start">
                  Highlights
                </h3>
                <ul className="list-disc pl-5 space-y-2 text-gray-700 text-[0.8rem]">
                  {highlights.map((highlight: any, index: number) => (
                    <li key={`highlight-${index}`}>
                      <div className="flex items-start">
                        <span className="pl-2 text-start">{highlight}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Itineraries */}
            {itineraries.length > 1 ? (
              <div className="flex flex-col items-start mb-6">
                <h3 className="mb-4 text-2xl font-semibold text-gray-900">
                  Itineraries
                </h3>
                <ul className="text-sm text-justify text-gray-700 list-none">
                  {itineraries.map((item: any, index: any) => (
                    <li key={`group-${index}`} className="mb-6">
                      <div className="mb-2">
                        <div className="">
                          <div className="my-2 text-lg font-bold">
                            Day {item.day}
                          </div>
                          <ul className="text-sm text-justify text-gray-700 list-none">
                            {item.itineraries.map(
                              (itinerary: any, index: number) => (
                                <li key={`item-${index} `} className="mb-4">
                                  <div className="flex flex-col items-start mb-2">
                                    <div className="flex items-start">
                                      <FaClock
                                        className="flex-shrink-0 mr-2 text-gray-600"
                                        size={16}
                                      />
                                      <span className="font-semibold text-gray-900">
                                        {dateToTimeFormat(itinerary.start_time)}{' '}
                                        - {itinerary.Activity.activity_name}
                                      </span>
                                    </div>
                                    <div className="flex items-start mt-1">
                                      <span className="text-start text-[0.8rem]">
                                        {itinerary.Activity.description}
                                      </span>
                                    </div>
                                  </div>
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                {tour.TourItineraries && (
                  <div className="flex flex-col items-start mb-6">
                    <h3 className="mb-4 text-2xl font-semibold text-gray-900">
                      Itineraries
                    </h3>
                    <ul className="text-sm text-justify text-gray-700 list-none">
                      {tour.TourItineraries.map((item: any, index: number) => (
                        <li key={index} className="mb-6">
                          <div className="flex flex-col items-start mb-2">
                            <div className="flex items-start">
                              <FaClock
                                className="flex-shrink-0 mr-2 text-gray-600"
                                size={16}
                              />
                              <span className="font-semibold text-gray-900">
                                {dateToTimeFormat(item.start_time)} -{' '}
                                {item.Activity.activity_name}
                              </span>
                            </div>
                            <div className="flex items-start mt-1">
                              <span className="text-start text-[0.8rem]">
                                {item.Activity.description}
                              </span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* Optionals */}
            {tour.OptionalFeatures && (
              <div className="flex flex-col items-start mb-6">
                <h3 className="mb-4 text-2xl font-semibold text-gray-900 text-start">
                  Optional Features (On Request)
                </h3>
                <ul className="text-sm text-gray-700 list-none list-inside text-start">
                  {tour.OptionalFeatures.map((features: any, index: number) => (
                    <li key={index} className="mb-2">
                      {features.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Inclusions */}
            {tour.TourInclusion && (
              <div className="mb-6">
                <h3 className="mb-4 text-2xl font-semibold text-gray-900 text-start">
                  Inclusions
                </h3>
                <ul className="text-sm text-gray-700 list-none">
                  {tour.TourInclusion.map((item: any, index: number) => (
                    <li key={index} className="flex items-start mb-4">
                      <FaCheck
                        className="flex-shrink-0 text-green-600"
                        size={16}
                      />
                      <span className="ml-2 text-start text-[0.8rem]">
                        {item.Inclusion.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Exclusions */}
            {tour.TourExclusion && (
              <div className="mb-6">
                <h3 className="mb-4 text-2xl font-semibold text-gray-900 text-start">
                  Exclusions
                </h3>
                <ul className="text-sm text-gray-700 list-none">
                  {tour.TourExclusion.map((item: any, index: number) => (
                    <li key={index} className="flex items-start mb-4">
                      <FaTimes
                        className="flex-shrink-0 text-red-600"
                        size={16}
                      />
                      <span className="ml-2 text-start text-[0.8rem]">
                        {item.Exclusion.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Duration */}
            {tour.duration_days && (
              <div className="flex flex-col items-start mb-6">
                <h3 className="mb-4 text-2xl font-semibold text-gray-900">
                  Duration
                </h3>
                <p className="text-lg leading-relaxed text-justify text-gray-700 font-lg">
                  {tour.duration_days} Days
                </p>
              </div>
            )}
            {/* Additional Info */}
            {tour.AdditionalInfos && (
              <div className="mb-6">
                <h3 className="mb-4 text-2xl font-semibold text-gray-900 text-start">
                  Additional Info
                </h3>
                <ul className="text-sm text-gray-700 list-none">
                  {tour.AdditionalInfos.map((info: any, index: number) => (
                    <li key={index} className="flex items-start mb-4">
                      <FaInfoCircle
                        className="flex-shrink-0 text-yellow-600"
                        size={16}
                      />
                      <span className="ml-2 text-start text-[0.8rem]">
                        {info.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-6">
              <h3 className="mb-4 text-2xl font-semibold text-gray-900 text-start">
                Price
              </h3>
              <Table removeWrapper aria-labelledby="pricing">
                <TableHeader>
                  <TableColumn>Group Size</TableColumn>
                  <TableColumn>Per Adult</TableColumn>
                  <TableColumn>Per Child</TableColumn>
                </TableHeader>
                <TableBody>
                  <TableRow key="1">
                    <TableCell>
                      {tour.min_booking} - {tour.max_booking} Adult
                    </TableCell>
                    <TableCell>{tour.price_per_person} USD</TableCell>
                    <TableCell>{tour.price_per_child} USD</TableCell>
                  </TableRow>
                  <TableRow key="2">
                    <TableCell>
                      {tour.max_booking + 1} or more adult (10% discount
                      applied)
                    </TableCell>
                    <TableCell>{tour.price_per_person * 0.9} USD</TableCell>
                    <TableCell>{tour.price_per_child} USD</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-center mb-6">
              <FloatingButton
                data={tour}
                isFloating={isVisible}
                onClick={onBookingModalOpen}
              />
            </div>
          </div>
        </>
      )}
    </>
  )
}
