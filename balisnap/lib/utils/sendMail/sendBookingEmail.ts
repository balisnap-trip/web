import { getHtmlTemplate } from './getHtmlTemplate'

import { emailTransporter } from '@/lib/emailTransporter'

export const sendBookingEmail = async (params: any) => {
  const adminHtml = getHtmlTemplate(params, true)
  const userHtml = getHtmlTemplate(params)

  try {
    // TODO: admin email
    // Admin
    await emailTransporter.sendMail({
      from: 'Info Balisnap <info@balisnaptrip.com>',
      replyTo: params.main_contact_email,
      to: 'Balisnap <info@balisnaptrip.com>',
      subject: `Booking #${params.booking_ref} Received From ${params.main_contact_name}<${params.main_contact_email}>`,
      html: adminHtml,
      text: 'textContent'
    })

    // User
    await emailTransporter.sendMail({
      from: 'Info Balisnap <info@balisnaptrip.com>',
      replyTo: 'Balisnap <info@balisnaptrip.com>',
      to: `${params.main_contact_name} <${params.main_contact_email}>`,
      subject: `Booking Confirmed #${params.booking_ref}`,
      html: userHtml,
      text: 'textContent'
    })

    return {
      status: 'ok',
      message: 'Email sent successfully'
    }
  } catch (error) {
    return {
      status: 'error',
      message: 'Error sending email: '
    }
  }
}
