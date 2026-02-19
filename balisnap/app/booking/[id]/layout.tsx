import { ReactNode } from 'react'

interface BookingLayoutProps {
  children: ReactNode
}

const BookingLayout = ({ children }: BookingLayoutProps) => {
  return (
    <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
      <div className="inline-block w-full text-center justify-center">
        {children}
      </div>
    </section>
  )
}

export default BookingLayout
