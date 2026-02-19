export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/bookings/:path*',
    '/ota/:path*',
    '/drivers/:path*',
    '/email-inbox/:path*',
    '/tours/:path*',
    '/finance/:path*',
    '/settings/:path*',
    '/users/:path*',
  ],
}
