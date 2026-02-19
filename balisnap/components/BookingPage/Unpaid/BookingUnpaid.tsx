import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from '@heroui/react'
import { PayPalScriptProvider } from '@paypal/react-paypal-js'

import Checkout from '@/components/BookingModal/Forms/Checkout'
import { formatDate } from '@/lib/utils/formatDate'

const BookingUnpaid = ({ booking }: { booking: any }) => {
  const childUnitPrice =
    booking?.TourPackage?.price_per_child ??
    Number(booking?.TourPackage?.price_per_person || 0) / 2

  const options = {
    clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID as string,
    components: 'buttons,applepay,googlepay,funding-eligibility',
    enableFunding:
      'card,credit,paylater,venmo,sepa,ideal,eps,bancontact,mybank',
    locale: 'en_US'
  }

  return (
    <div className="w-[85%] mx-auto">
      <div className="my-4">
        <div className="flex flex-col justify-between gap-4 md:flex-row">
          <div className="w-full md:w-[65%] bg-gray-100 p-4">
            <div>
              <h2 className="mb-4 text-2xl font-bold text-gray-900 md:text-3xl">
                Booking Details
              </h2>
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
              <div className="flex flex-row items-center justify-start w-full gap-2 mx-auto">
                <div className="">Booking Status</div>
                <div className="">
                  <Chip color="danger" size="sm">
                    Wating Payment
                  </Chip>
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
                      <span className="font-bold">Tax Regulation: </span> :
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
                    <span className="pl-2 font-bold text-start">
                      All prices are final and already include the applicable
                      taxes.
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
          <div className="w-full md:w-[35%] bg-gray-100 p-4">
            <div className="">
              <div className="font-bold text-center">Payment Methods</div>
              <PayPalScriptProvider options={options}>
                {booking !== null &&
                  booking.Payments &&
                  booking.Payments?.length === 0 && (
                    <Checkout booking={booking} />
                  )}
              </PayPalScriptProvider>
              <div className="mb-6">
                <div className="flex flex-col justify-start gap-2">
                  <div className="font-bold text-start">Terms & Conditions</div>
                  <ol className="pl-5 space-y-2 text-sm text-gray-700 list-decimal">
                    <li>
                      <div className="flex items-start">
                        <span className="pl-2 text-start">
                          Any cancellations must be made 72 hours before the
                          tour start date for a full refund. Cancellations made
                          less than 72 hours prior will forfeit the deposit.
                        </span>
                      </div>
                    </li>
                    <li>
                      <div className="flex items-start">
                        <span className="pl-2 text-start">
                          Tour details and pickup times will be confirmed via
                          email or WhatsApp 24 hours prior to the start date.
                        </span>
                      </div>
                    </li>
                  </ol>
                  <div className="font-bold text-start">
                    Contact Information
                  </div>
                  <div className="text-sm text-start">
                    For any inquiries or changes to your booking, please
                    contact:
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
      </div>
    </div>
  )
}

export default BookingUnpaid
