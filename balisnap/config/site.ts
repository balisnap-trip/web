export type SiteConfig = typeof siteConfig

export const siteConfig = {
  name: 'Bali Snap Trip',
  description: {
    home: 'Discover Bali beyond the ordinary with Bali Snap Trip. Explore hidden gems, local traditions, and breathtaking landscapes on immersive tours that connect you with the heart of the island. Your adventure starts here.',
    tours:
      "Join Bali Snap Trip's exclusive tours that showcase Bali's rich culture and natural beauty. From serene village explorations to adventure packed activities, find the perfect tour for your dream Bali experience."
  },
  navItems: [
    {
      label: 'Home',
      href: '/'
    },
    {
      label: 'Tour Packages',
      href: '/tours'
    },
    {
      label: 'What They Say',
      href: '/#reviews'
    },
    {
      label: 'About Us',
      href: '/about'
    },
    {
      label: 'Contact',
      href: '/contact'
    },
    {
      label: 'My Booking',
      href: '/bookings'
    }
  ],
  navMenuItems: [
    {
      label: 'Home',
      href: '/'
    },
    {
      label: 'Tour Packages',
      href: '/tours'
    },
    {
      label: 'What They Say',
      href: '/#reviews'
    },
    {
      label: 'About Us',
      href: '/about'
    },
    {
      label: 'Contact',
      href: '/contact'
    },
    {
      label: 'My Booking',
      href: '/bookings'
    }
  ],
  links: {
    github: 'https://github.com/nextui-org/nextui',
    twitter: 'https://twitter.com/getnextui',
    docs: 'https://nextui.org',
    discord: 'https://discord.gg/9b6yyZKmH4',
    sponsor: 'https://patreon.com/jrgarciadev'
  }
}
