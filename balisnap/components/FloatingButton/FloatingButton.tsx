'use client'
import React, { useState } from 'react'
import { Button, useDisclosure } from '@heroui/react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'

import BookingModal from '../BookingModal'
import Login from '../Auth/Login'

import FormProvider from '@/providers/FormProvider/FormContext'

type Props = {
  onClick?: () => void
  data: any
  isFloating?: boolean
}

const FloatingButton: React.FC<Props> = (props: Props) => {
  const { onClick, data, isFloating } = props
  const [showLogin, setShowLogin] = useState(false)
  const { data: session } = useSession()
  const pathname = usePathname()

  // Use useDisclosure to manage modal state
  const { isOpen, onOpen, onOpenChange } = useDisclosure()

  const handleClick = () => {
    // Call onClick prop if provided
    if (onClick) {
      onClick()
    }
    // Open the modal
    onOpen()
  }

  const handleLogin = () => {
    setShowLogin(true)
  }

  return (
    <>
      <FormProvider tourData={data}>
        <BookingModal isOpen={isOpen} onClose={onOpenChange} />
        {showLogin && <Login callbackUrl={pathname} />}
      </FormProvider>
      <div
        className={`${isFloating
          ? 'fixed md:static md:w-full bottom-[3rem] right-[3rem] transition-opacity duration-300 ease-in-out w-auto'
          : 'md:w-full'
          }`}
      >
        <Button
          className={`bg-green-500 text-white ${isFloating ? 'w-auto' : 'w-full'} md:w-full mt-2`}
          size="lg"
          variant="flat"
          onClick={session ? handleClick : handleLogin}
        >
          Book Now
        </Button>
      </div>
    </>
  )
}

export default FloatingButton
