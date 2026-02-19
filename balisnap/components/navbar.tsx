'use client'
import {
  Navbar as NextUINavbar,
  NavbarContent,
  NavbarMenu,
  NavbarMenuToggle,
  NavbarBrand,
  NavbarItem,
  NavbarMenuItem
} from '@heroui/navbar'
import { Link } from '@heroui/link'
import { link as linkStyles } from '@heroui/theme'
import NextLink from 'next/link'
import clsx from 'clsx'
import { useReducer } from 'react'
import { useMediaQuery } from 'react-responsive'
import {
  Avatar,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger
} from '@heroui/react'
import { signOut, useSession } from 'next-auth/react'

import { siteConfig } from '@/config/site'
import { Logo } from '@/components/icons'

const Navbar = ({ showReviews }: { showReviews: boolean }) => {
  const [isMenuOpen, setIsMenuOpen] = useReducer((current) => !current, false)
  const isSmallScreen = useMediaQuery({ query: '(max-width: 768px)' })
  const { data: sessionData } = useSession()

  return (
    <NextUINavbar
      className='fixed top-0 right-0 left-0 z-40'
      isBordered
      isMenuOpen={isMenuOpen}
      maxWidth="xl"
      onMenuOpenChange={setIsMenuOpen}
    >
      {/* <NavbarContent className="pl-4 sm:hidden basis-1" justify="end"> */}
      <NavbarMenuToggle
        aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
        className="lg:hidden"
        onClick={() => setIsMenuOpen()}
      />
      {/* </NavbarContent> */}
      <NavbarContent className="basis-1/5 sm:basis-full" justify="start">
        <NavbarBrand as="li" className="gap-3 max-w-fit">
          <NextLink
            className="flex items-center justify-start gap-1"
            href="/"
            onClick={isSmallScreen ? () => setIsMenuOpen() : undefined}
          >
            <Logo height={64} />
            <p className="font-bold text-inherit" />
          </NextLink>
        </NavbarBrand>
        <ul className="justify-start hidden gap-4 ml-2 lg:flex">
          {siteConfig.navItems
            .filter((item) => item.href !== '/#reviews' || showReviews)
            .filter((item) => item.href !== '/bookings')
            .map((item) => (
              <NavbarItem key={item.href}>
                <NextLink
                  className={clsx(
                    linkStyles({ color: 'foreground' }),
                    'data-[active=true]:text-primary data-[active=true]:font-medium'
                  )}
                  color="foreground"
                  href={item.href}
                >
                  {item.label}
                </NextLink>
              </NavbarItem>
            ))}
        </ul>
      </NavbarContent>

      {sessionData && sessionData.user && (
        <NavbarContent className="pl-4 basis-1" justify="end">
          <NavbarMenuItem>
            <Link
              className="hidden md:block"
              color={'foreground'}
              href={'/bookings'}
              size="sm"
            >
              My Bookings
            </Link>
          </NavbarMenuItem>
          <Dropdown placement="bottom">
            <NavbarItem>
              <DropdownTrigger>
                <Avatar
                  as="button"
                  color="primary"
                  size="md"
                  src={sessionData.user.image || ''}
                />
              </DropdownTrigger>
            </NavbarItem>
            <DropdownMenu aria-label="User menu actions" color="warning">
              <DropdownItem key="profile" style={{ height: '$18' }}>
                <p color="inherit" style={{ display: 'flex' }}>
                  Signed in as
                </p>
                <p color="inherit" style={{ display: 'flex' }}>
                  {sessionData.user.name || sessionData.user.email}
                </p>
              </DropdownItem>
              <DropdownItem
                key="bookings"
                className="block md:hidden"
                href="/bookings"
              >
                My Bookings
              </DropdownItem>
              <DropdownItem
                key="logout"
                className="text-red-500"
                onClick={() => signOut({ callbackUrl: '/' })}
              >
                Log Out
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </NavbarContent>
      )}

      <NavbarMenu style={{ backgroundColor: '#fff' }}>
        <div className="flex flex-col gap-2 mx-4 mt-2">
          {siteConfig.navMenuItems.map(
            (item, index) =>
              (item.href !== '/bookings' ||
                (item.href === '/bookings' && sessionData)) && (
                <NavbarMenuItem key={`${item}-${index}`}>
                  <Link
                    color={'foreground'}
                    href={item.href}
                    size="lg"
                    onPress={() => setIsMenuOpen()}
                  >
                    {item.label}
                  </Link>
                </NavbarMenuItem>
              )
          )}
        </div>
      </NavbarMenu>
    </NextUINavbar>
  )
}

export default Navbar
