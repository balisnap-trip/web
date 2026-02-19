'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

import BookingCard from './BookingCard'
import { NoContent, UnAuthorized } from '@/components/errors'
import { Spinner } from '@heroui/react'

export default function BookingsPage() {
  const [loading, setLoading] = useState(false)
  const [bookings, setBookings] = useState<any[]>([])
  const { data: session, status } = useSession()

  useEffect(() => {
    // Cek jika ada sesi dan bookings belum di-fetch
    const fetchBookings = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/bookings', {
          cache: 'no-cache'
        })

        if (!response.ok) {
          throw new Error('Failed to fetch bookings')
        }

        const data = await response.json()
        setBookings(data)
      } catch (error) {
        console.error('Error fetching bookings:', error)
      } finally {
        setLoading(false)
      }
    }

    if (session && bookings.length === 0) {
      fetchBookings()
    }
  }, [session, bookings.length]) // Tambahkan bookings.length sebagai dependency

  if (!session && status !== 'loading') {
    return <UnAuthorized />
  } else if (session && bookings.length === 0 && !loading) {
    return <NoContent />
  }

  return (
    <>
      <h2 className="w-full text-center text-[2.5rem] font-bold my-[2rem]">
        Bookings
      </h2>
      {loading && (
        <div className="flex justify-center">
          <Spinner color="secondary" size="lg" />
        </div>
      )}

      {!loading && bookings.length > 0 && (
        <div className="mb-6">
          <div className="w-full overflow-x-auto">
            {bookings.map((booking: any) => (
              <BookingCard key={booking.booking_id} booking={booking} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
