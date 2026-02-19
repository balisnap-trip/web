import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from '@heroui/react'

import { formatDate } from '@/lib/utils/formatDate'

const BookingPaid = ({ booking }: { booking: any }) => {
  const childUnitPrice =
    booking?.TourPackage?.price_per_child ??
    Number(booking?.TourPackage?.price_per_person || 0) / 2

  return (
    <div className="w-full md:w-[65%] mx-auto">
      <div className="my-4">
        <div className="flex flex-col justify-between gap-4 md:flex-row">
          <div className="w-full p-4 bg-gray-100">
            <h2 className="mb-4 text-2xl font-bold text-gray-900 md:text-3xl">
              Booking Details
            </h2>
            <div className="flex flex-col items-start w-full gap-4 p-3 mx-auto md:flex-row">
              <div className="w-full md:w-1/2">
                {/* Column 1 with justify-between */}
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto font-bold">
                  <div className="">Booking Number </div>
                  <div className="">{booking.booking_ref}</div>
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto">
                  <div className="">Booking Date </div>
                  <div className="">{formatDate(booking.created_at)}</div>
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto mt-2">
                  <div className="font-bold">Booked By </div>
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto">
                  <div className="">Name</div>
                  <div className="">{booking.main_contact_name}</div>
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto">
                  <div className="">Email</div>
                  <div className="">{booking.main_contact_email}</div>
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto">
                  <div className="">Phone</div>
                  <div className="">{booking.phone_number}</div>
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto mt-2">
                  <div className="font-bold">Tour Name</div>
                  <div className="font-bold">
                    {booking.TourPackage?.package_name}
                  </div>
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto">
                  <div className="">Start Date</div>
                  <div className="">{formatDate(booking.booking_date)}</div>
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto">
                  <div className="">End Date</div>
                  <div className="">{formatDate(booking.endDate)}</div>
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto">
                  <div className="">Duration</div>
                  <div className="">
                    {booking.TourPackage.duration_days} Day(s)
                  </div>
                </div>
                <div className="flex flex-row items-center justify-start w-full gap-2 mx-auto">
                  <div className="">Booking Status</div>
                  <div className="">
                    <Chip color="success" size="sm">
                      Paid
                    </Chip>
                  </div>
                </div>
              </div>
              <div className="w-full md:w-1/2">
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto font-bold">
                  <div className="">Payment Details </div>
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto">
                  <div className="text-start">Payment Method</div>
                  <div className="capitalize">
                    {booking.Payments?.[0].payment_method}
                  </div>
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto">
                  <div className="text-start">Payment Date</div>
                  <div className="">
                    {formatDate(booking.Payments?.[0].payment_date)}
                  </div>
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto">
                  <div className="text-start">Payment Detail Number</div>
                  <div className="">{booking.Payments?.[0].payment_ref}</div>
                </div>
              </div>
            </div>
            <div className="w-full my-4">
              <Table
                removeWrapper
                aria-labelledby="pricing"
                className="min-w-full"
              >
                <TableHeader>
                  <TableColumn align="start" className="w-full px-1 md:w-auto">
                    Description
                  </TableColumn>
                  <TableColumn align="center" className="w-full px-1 md:w-auto">
                    Unit Cost
                  </TableColumn>
                  <TableColumn align="center" className="w-full px-1 md:w-auto">
                    Quantity
                  </TableColumn>
                  <TableColumn align="end" className="w-full px-1 md:w-auto">
                    Amount
                  </TableColumn>
                </TableHeader>
                <TableBody
                  style={{
                    borderTop: '1px solid black',
                    borderBottom: '1px solid black'
                  }}
                >
                  <TableRow key="1">
                    <TableCell>Adult</TableCell>
                    <TableCell>
                      {booking.TourPackage?.price_per_person} USD
                    </TableCell>
                    <TableCell>{booking.number_of_adult}</TableCell>
                    <TableCell>
                      {booking.number_of_adult *
                        booking.TourPackage?.price_per_person}{' '}
                      USD
                    </TableCell>
                  </TableRow>
                  <TableRow key="2">
                    <TableCell>Child</TableCell>
                    <TableCell>{childUnitPrice} USD</TableCell>
                    <TableCell>{booking.number_of_child}</TableCell>
                    <TableCell>
                      {booking.number_of_child * childUnitPrice} USD
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="flex flex-row items-center justify-between w-full gap-2 mx-auto text-sm font-bold">
                <div />
                <div className="w-full md:w-[50%] pt-2">
                  <div className="flex flex-row items-center justify-between gap-2 p-1 bg-orange-300">
                    <div>Total</div>
                    <div>{booking.total_price} USD</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="w-full my-4">
              <div className="font-bold text-start">Tax Information</div>
              <ul className="pl-5 space-y-2 text-sm text-gray-700 list-disc">
                <li>
                  <div className="flex items-start">
                    <span className="pl-2 text-start">
                      <span className="font-bold">Tax Regulation: </span>
                      Based on Indonesian Government Regulation No. 23 of 2018.
                    </span>
                  </div>
                </li>
                <li>
                  <div className="flex items-start">
                    <span className="pl-2 text-start">
                      <span className="font-bold">Tax Category: </span>{' '}
                      Non-Taxable Entrepreneur (Non-PKP) due to annual turnover
                      below IDR 5 billion
                    </span>
                  </div>
                </li>
                <li>
                  <div className="flex items-start">
                    <span className="pl-2 text-start">
                      All prices are final and already include the applicable
                      taxes.
                    </span>
                  </div>
                </li>
              </ul>
            </div>
            <div className="w-full my-4">
              <div className="font-bold text-start">Cancellation Policy</div>
              <ul className="pl-5 space-y-2 text-sm text-gray-700 list-disc">
                <li>
                  <div className="flex items-start">
                    <span className="pl-2 text-start">
                      <span className="font-bold">No Cancellation Fee: </span>
                      Cancellations made at least 7 Days prior to the scheduled
                      reservation are eligible for a full refund with no
                      cancellation fee applied. Please note that a 10% deduction
                      will be applied to the refunded amount for all
                      cancellations to cover administrative and processing
                      costs.
                    </span>
                  </div>
                </li>
                <li>
                  <div className="flex items-start">
                    <span className="pl-2 text-start">
                      <span className="font-bold">50% Cancellation Fee:</span>{' '}
                      Cancellations made between 2 days and 7 Days before the
                      scheduled reservation will incur a 50% cancellation fee.
                      The remaining 50% will be refunded.
                    </span>
                  </div>
                </li>
                <li>
                  <div className="flex items-start">
                    <span className="pl-2 text-start">
                      Cancellations made less than 72 hours prior will forfeit
                      the deposit.
                    </span>
                  </div>
                </li>
                <li>
                  <div className="flex items-start">
                    <span className="pl-2 text-start">
                      Refund Processing Time: Refunds for cancellations will be
                      issued within 3-5 working days from the cancellation date.
                    </span>
                  </div>
                </li>
              </ul>
            </div>
            <div className="w-full my-4">
              <div className="font-bold text-start">Pickup Information</div>
              <ul className="pl-5 space-y-2 text-sm text-gray-700 list-disc">
                <li>
                  <div className="flex items-start">
                    <span className="pl-2 text-start">
                      <span className="font-bold" />
                      Within 48 hours before the tour, we will advise you about
                      the exact pick-up location time, Please check your email
                      or WhatsApp.
                    </span>
                  </div>
                </li>
              </ul>
              <div className="mt-4 font-bold text-start">
                Contact Information
              </div>
              <div className="text-sm text-start">
                For any inquiries or changes to your booking, please contact:
              </div>
              <div className="flex flex-row justify-start gap-2 text-sm">
                <div>
                  Email:{' '}
                  <a
                    className="text-blue-500 underline"
                    href={`mailto:${process.env.NEXT_PUBLIC_INFO_EMAIL}`}
                  >
                    {process.env.NEXT_PUBLIC_INFO_EMAIL}
                  </a>
                </div>
              </div>
              <div className="flex flex-row justify-start gap-2 text-sm">
                <div>
                  Phone/WA :{' '}
                  <a
                    className="text-blue-500 underline"
                    href={`tel:${process.env.NEXT_PUBLIC_PHONE_NUMBER}`}
                  >
                    {process.env.NEXT_PUBLIC_PHONE_NUMBER}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BookingPaid
