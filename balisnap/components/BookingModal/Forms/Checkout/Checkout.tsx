import { PayPalButtons } from '@paypal/react-paypal-js'

const Checkout = ({ booking }: { booking: any }) => {
  return (
    booking && (
      <div className="mx-4 mt-4">
        <PayPalButtons
          createOrder={async () => {
            try {
              const response = await fetch('/api/orders', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  bookingId: booking.booking_id
                })
              })

              const orderData = await response.json()

              if (orderData.id) {
                return orderData.id
              } else {
                const errorDetail = orderData?.details?.[0]
                const errorMessage = errorDetail
                  ? `${errorDetail.issue} ${errorDetail.description} (${orderData.debug_id})`
                  : JSON.stringify(orderData)

                throw new Error(errorMessage)
              }
            } catch (error) {
              throw new Error('Error creating order')
            }
          }}
          style={{
            shape: 'rect',
            layout: 'vertical',
            color: 'gold',
            label: 'checkout'
          }}
          onApprove={async (data, actions) => {
            try {
              const response = await fetch(
                `/api/orders/${data.orderID}/capture`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    bookingId: booking.booking_id
                  })
                }
              )

              const orderData = await response.json()

              if (!response.ok) {
                throw new Error(orderData?.error || 'Error capturing order')
              }

              // Three cases to handle:
              //   (1) Recoverable INSTRUMENT_DECLINED -> call actions.restart()
              //   (2) Other non-recoverable errors -> Show a failure message
              //   (3) Successful transaction -> Show confirmation or thank you message
              const errorDetail = orderData?.details?.[0]

              if (errorDetail?.issue === 'INSTRUMENT_DECLINED') {
                // (1) Recoverable INSTRUMENT_DECLINED -> call actions.restart()
                // recoverable state, per https://developer.paypal.com/docs/checkout/standard/customize/handle-funding-failures/
                if (actions?.restart) {
                  return actions.restart()
                }

                throw new Error('Payment needs retry')
              } else if (errorDetail) {
                // (2) Other non-recoverable errors -> Show a failure message
                throw new Error(
                  `${errorDetail.description} (${orderData.debug_id})`
                )
              } else {
                // (3) Successful transaction -> Show confirmation or thank you message
                // Or go to another URL:  actions.redirect('thank_you.html');
                const orderSuccess = orderData.status === 'COMPLETED'

                if (orderSuccess) {
                  window.location.href = `/booking/${booking.booking_id}`
                }
              }
            } catch (error) {
              console.log(error)
            }
          }}
        />
      </div>
    )
  )
}

export default Checkout
