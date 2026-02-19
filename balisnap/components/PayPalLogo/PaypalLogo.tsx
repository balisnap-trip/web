import { Image } from '@heroui/react'
import React from 'react'

const PayPalLogo = () => {
  const handleClick = (e: any) => {
    e.preventDefault()
    window.open(
      'https://www.paypal.com/webapps/mpp/paypal-popup',
      'WIPaypal',
      'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=yes, resizable=yes, width=1060, height=700'
    )
  }

  return (
    <table align="left" border={0} cellPadding="5" cellSpacing="0">
      <tbody>
        <tr>
          <td>Secured Payment</td>
        </tr>
        <tr>
          <td align="center">
            <a
              href="https://www.paypal.com/webapps/mpp/paypal-popup"
              title="How PayPal Works"
              onClick={handleClick}
            >
              <Image
                alt="PayPal Acceptance Mark"
                height={79}
                src="/paypal.png"
                width={230}
              />
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export default PayPalLogo
