// tours/[id]/layout.tsx
import { ReactNode } from 'react'

interface TourLayoutProps {
  children: ReactNode
}

const TourLayout = ({ children }: TourLayoutProps) => {
  return <div className="min-h-screen">{children}</div>
}

export default TourLayout
