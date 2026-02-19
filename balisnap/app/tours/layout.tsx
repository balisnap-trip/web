import { Metadata } from 'next'

import { siteConfig } from '@/config/site'

export const metadata: Metadata = {
  title: {
    default: 'Tour Packages',
    template: `%s - ${siteConfig.name}` // Will show as "Tour Packages - Bali Snap Trip"
  },
  description: siteConfig.description.tours,
  openGraph: {
    type: 'website',
    url: `${process.env.NEXT_PUBLIC_BASE_URL}/tours`, // Specific URL for the tours page
    title: {
      default: 'Tour Packages',
      template: `%s - ${siteConfig.name}` // Will show as "Tour Packages - Bali Snap Trip"
    },
    description: siteConfig.description.tours,
    siteName: siteConfig.name,
    images: [
      {
        url: `${process.env.NEXT_PUBLIC_BASE_URL}/seo/tours/og-image.jpg`, // Replace with your OG image URL for tours
        width: 1200,
        height: 630,
        alt: 'Bali Snap Trip Tour Packages'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image', // Use "summary" for a smaller image
    site: '@balisnaptrip', // Replace with your Twitter handle
    creator: '@balisnaptrip', // Replace with your Twitter creator handle
    title: {
      default: 'Tour Packages',
      template: `%s - ${siteConfig.name}` // Will show as "Tour Packages - Bali Snap Trip"
    },
    description: siteConfig.description.tours,
    images: [`${process.env.NEXT_PUBLIC_BASE_URL}/seo/tours/og-image.jpg`] // Replace with your Twitter Card image URL for tours
  }
}
export default function ToursLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
      <div className="inline-block text-center justify-center">{children}</div>
    </section>
  )
}
