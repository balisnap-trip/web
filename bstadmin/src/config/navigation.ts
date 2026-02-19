export type NavTab = {
  title: string
  href: string
  match?: {
    pathname: string
    query?: Record<string, string>
  }
}

export type NavModule = {
  id: string
  title: string
  href: string
  icon: string
  description?: string
  match?: {
    exact?: string[]
    prefixes?: string[]
  }
  tabs?: NavTab[]
}

export const navItems: NavModule[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    href: '/dashboard',
    icon: 'LayoutDashboard',
    match: { prefixes: ['/dashboard'] },
  },
  {
    id: 'bookings',
    title: 'Bookings',
    href: '/bookings',
    icon: 'Calendar',
    match: { prefixes: ['/bookings', '/email-inbox'] },
    tabs: [
      { title: 'Booking', href: '/bookings' },
      { title: 'Emails', href: '/email-inbox' },
    ],
  },
  {
    id: 'finances',
    title: 'Finances',
    href: '/finance/validate',
    icon: 'Wallet',
    match: { exact: ['/finance'], prefixes: ['/finance/validate', '/finance/settlements', '/finance/report'] },
    tabs: [
      { title: 'Reviews', href: '/finance/validate' },
      { title: 'Settlements', href: '/finance/settlements' },
      { title: 'Report', href: '/finance/report' },
    ],
  },
  {
    id: 'networks',
    title: 'Networks',
    href: '/drivers',
    icon: 'Users',
    match: { prefixes: ['/drivers', '/finance/partners', '/ota'] },
    tabs: [
      { title: 'Drivers', href: '/drivers' },
      { title: 'Partners', href: '/finance/partners' },
      { title: 'OTAs', href: '/ota' },
    ],
  },
  {
    id: 'tours_packages',
    title: 'Tours & Packages',
    href: '/tours?view=tours',
    icon: 'Package',
    match: { prefixes: ['/tours', '/finance/patterns'] },
    tabs: [
      { title: 'Tours', href: '/tours?view=tours', match: { pathname: '/tours', query: { view: 'tours' } } },
      { title: 'Package', href: '/tours?view=packages', match: { pathname: '/tours', query: { view: 'packages' } } },
      { title: 'Cost Pattern', href: '/finance/patterns' },
    ],
  },
  {
    id: 'master_rules',
    title: 'Master & Rules',
    href: '/finance/tour-items',
    icon: 'Tags',
    match: { prefixes: ['/finance/tour-items', '/finance/tour-item-categories'] },
    tabs: [
      { title: 'Tour Items', href: '/finance/tour-items' },
      { title: 'Tour Item Categories', href: '/finance/tour-item-categories' },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    href: '/settings?view=settings',
    icon: 'Settings',
    match: { prefixes: ['/settings', '/users'] },
    tabs: [
      { title: 'Settings', href: '/settings?view=settings', match: { pathname: '/settings', query: { view: 'settings' } } },
      { title: 'Users', href: '/users' },
      { title: 'System', href: '/settings?view=system', match: { pathname: '/settings', query: { view: 'system' } } },
    ],
  },
]
