// BookingModal.tsx
import React, { useMemo, useState } from 'react'
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner
} from '@heroui/react'
import { FaCheck, FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import { PayPalScriptProvider } from '@paypal/react-paypal-js'
import { useRouter } from 'next/navigation'

import FormStep1 from './Forms/FormStep1'
import { FormStep2 } from './Forms'
import Confirm from './Forms/Confirm'

import { useForm } from '@/providers/FormProvider'
import { generateRandomUppercaseString } from '@/lib/utils/stringUtils/stringUtils'

const BookingModal: React.FC<{
  isOpen: boolean
  onClose: () => void
}> = ({ isOpen, onClose }) => {
  const {
    currentForm,
    handlePrevious,
    handleNext,
    formErrors,
    tourData,
    formData
  } = useForm()
  const hidePrevBtn = useMemo(() => currentForm === 'form1', [currentForm])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const isoStringDate = new Date(
    formData.date.year,
    formData.date.month - 1,
    formData.date.day
  ).toISOString()

  const buttonDisabledStep1 =
    currentForm === 'form1' &&
    (!!formErrors?.date || !!formErrors.adult || !!formErrors.children)
  const buttonDisabledStep2 =
    currentForm === 'form2' &&
    (!!formErrors?.tourLeader ||
      !!formErrors.tourLeaderEmail ||
      !!formErrors.tourLeaderPhone ||
      !!formErrors.pickupLocation)
  const buttonDisabledStep3 =
    currentForm === 'confirm' && !!formErrors.agreement

  const disabled =
    buttonDisabledStep1 ||
    buttonDisabledStep2 ||
    buttonDisabledStep3 ||
    loading ||
    success

  const options = {
    clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID as string,
    components: 'buttons,applepay,googlepay,funding-eligibility',
    enableFunding:
      'card,credit,paylater,venmo,sepa,ideal,eps,bancontact,mybank',
    locale: 'en_US'
  }

  const bookingRef = generateRandomUppercaseString(6)
  const bookingParams = {
    variantId: tourData.variant_id ?? tourData.package_id,
    packageId: tourData.package_id,
    bookingRef: `BST-${bookingRef}`,
    bookingDate: isoStringDate,
    numberOfAdult: formData.adult,
    numberOfChild: formData.children,
    mainContactName: formData.tourLeader,
    mainContactEmail: formData.tourLeaderEmail,
    phoneNumber: `+${formData.tourLeaderPhone}`,
    pickupLocation: formData.pickupLocation,
    note: formData.message
  }

  const handleCreateBooking = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/orders/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bookingParams)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create booking')
      }

      setLoading(false)
      setSuccess(true)
      setTimeout(() => {
        router.push(`/booking/${data.booking_id}`)
      }, 3000)
    } catch (error) {
      console.log(error)
      setLoading(false)
    }
  }

  return (
    <>
      <Modal
        backdrop="blur"
        isOpen={isOpen}
        placement="bottom-center"
        scrollBehavior={'outside'}
        size="xl"
        style={{ zIndex: 99999 }}
        onOpenChange={onClose}
      >
        <ModalContent>
          <>
            <ModalHeader className="flex flex-col bg-black">
              {currentForm === 'form1' && (
                <>
                  <h2 className="text-lg text-justify text-white">
                    Date and Participant
                  </h2>
                  <p className="text-xs text-justify text-white">
                    Please provide the following information to make an online
                    booking.
                  </p>
                </>
              )}
              {currentForm === 'form2' && (
                <>
                  <h2 className="text-lg text-justify text-white">
                    Contact Information
                  </h2>
                  <p className="text-xs text-justify text-white">
                    Please provide the following information to make an online
                    booking.
                  </p>
                </>
              )}
              {currentForm === 'confirm' && (
                <>
                  <h2 className="text-lg text-justify text-white">
                    Booking Details
                  </h2>
                  <p className="text-xs text-justify text-white">
                    Please review the details below to ensure everything is
                    accurate
                  </p>
                </>
              )}
              {currentForm === 'checkout' && (
                <>
                  <h2 className="text-lg text-justify text-white">Pay Now</h2>
                  <p className="text-xs text-justify text-white">
                    Pay with your preferred payment method
                  </p>
                </>
              )}
            </ModalHeader>

            <ModalBody>
              <PayPalScriptProvider options={options}>
                {currentForm === 'form1' && <FormStep1 />}
                {currentForm === 'form2' && <FormStep2 />}
                {currentForm === 'confirm' && <Confirm />}
              </PayPalScriptProvider>
            </ModalBody>
            <ModalFooter>
              {!hidePrevBtn && (
                <Button
                  color="primary"
                  size="sm"
                  variant="ghost"
                  onPress={handlePrevious}
                >
                  <span className="flex items-center gap-1 text-sm">
                    <FaChevronLeft />
                    Back
                  </span>
                </Button>
              )}
              {currentForm !== 'checkout' && (
                <Button
                  color="primary"
                  isDisabled={disabled}
                  size="sm"
                  variant={`${currentForm === 'confirm' ? 'solid' : 'ghost'}`}
                  onPress={
                    currentForm === 'confirm' ? handleCreateBooking : handleNext
                  }
                >
                  {currentForm === 'confirm' ? (
                    <span className="flex items-center gap-1 text-sm">
                      {loading ? <Spinner color="white" size="sm" /> : null}{' '}
                      {success ? <FaCheck color="white" size={14} /> : null}{' '}
                      Confirm
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-sm">
                      Next <FaChevronRight />
                    </span>
                  )}
                </Button>
              )}
            </ModalFooter>
            <ModalFooter className="flex flex-col gap-2 bg-black ">
              <div className="flex justify-start">
                <div className="text-xs text-white">
                  <p>
                    If you encounter any issues with booking, please contact our
                    support team:
                  </p>
                  <p>
                    Email:{' '}
                    <a
                      className="text-blue-300 underline"
                      href={`mailto:${process.env.NEXT_PUBLIC_INFO_EMAIL}`}
                    >
                      {process.env.NEXT_PUBLIC_INFO_EMAIL}
                    </a>
                  </p>
                  <p>
                    Phone:{' '}
                    <a
                      className="text-blue-300 underline"
                      href={`tel:${process.env.NEXT_PUBLIC_PHONE_NUMBER}`}
                    >
                      {process.env.NEXT_PUBLIC_PHONE_NUMBER}
                    </a>
                  </p>
                </div>
              </div>
            </ModalFooter>
          </>
        </ModalContent>
      </Modal>
    </>
  )
}

export default BookingModal
