import '@/styles/globals.css'
import { Metadata, Viewport } from 'next'
import clsx from 'clsx'

import { Providers } from './providers'

import { siteConfig } from '@/config/site'
import { fontSans } from '@/config/fonts'
import Navbar from '@/components/navbar'
import Footer from '@/components/Footer'
import { fetchReviews } from '@/components/Reviews/fetchData'

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`
  },
  description: siteConfig.description.home,
  openGraph: {
    type: 'website',
    url: `${process.env.NEXT_PUBLIC_BASE_URL}`, // Specific URL for the tours page
    title: {
      default: siteConfig.name,
      template: `%s - ${siteConfig.name}`
    },
    description: siteConfig.description.home,
    siteName: siteConfig.name,
    images: [
      {
        url: `${process.env.NEXT_PUBLIC_BASE_URL}/seo/home/og-image.jpg`, // Replace with your OG image URL for tours
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
      default: siteConfig.name,
      template: `%s - ${siteConfig.name}`
    },
    description: siteConfig.description.home,
    images: [`${process.env.NEXT_PUBLIC_BASE_URL}/seo/home/og-image.jpg`] // Replace with your Twitter Card image URL for tours
  },
  icons: {
    icon: '/favicon.ico'
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' }
  ]
}

export default async function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  let reviews = []

  try {
    reviews = await fetchReviews()
  } catch (error) {
    console.log(error)
  }

  const showReviews = reviews.length > 0

  return (
    <html suppressHydrationWarning lang="en">
      <head>
        {/* Google Tag Manager */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-K23JXSCZ');`
          }}
        />
        <meta content="notranslate" name="google" />
        <meta content="3939445996274895" property="fb:app_id" />
        <meta content="5ad39924dc8aacaa" name="yandex-verification" />
      </head>
      <body
        className={clsx(
          'min-h-screen bg-background font-sans antialiased',
          fontSans.variable
        )}
      >
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <noscript>
            <iframe
              height="0"
              src="https://www.googletagmanager.com/ns.html?id=GTM-K23JXSCZ"
              style={{ display: 'none', visibility: 'hidden' }}
              title="Google Tag Manager"
              width="0"
            />
          </noscript>
        </noscript>
        <Providers themeProps={{ attribute: 'class', defaultTheme: 'light' }}>
          <div className="relative flex flex-col h-screen">
            <Navbar showReviews={showReviews} />
            <main className="flex-grow px-0 py-0 w-full">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  )
}
