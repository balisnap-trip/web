import { emailTransporter } from '@/lib/emailTransporter'

export const sendContactMail = async (params: any) => {
  const { name, email, message } = params

  const htmlContent = `<body style="background: #f4f4f4; padding: 20px; font-family: Arial, sans-serif;">
    <table width="100%" border="0" cellspacing="20" cellpadding="0"
      style="background: #ffffff; max-width: 600px; margin: auto; border-radius: 10px;">
      <tr>
        <td align="center"
          style="padding: 10px 0; font-size: 22px; color: #333333;">
          An Inquiry has been Received
        </td>
      </tr>
      <tr>
        <td style="padding: 20px; font-size: 16px; color: #333333;">
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Message:</strong></p>
          <p>${message}</p>
        </td>
      </tr>
      <tr>
        <td align="center"
          style="padding: 10px 0; font-size: 16px; color: #333333;">
          Please respond the inquiry as soon as possible.
        </td>
      </tr>
    </table>
  </body>
`
  const textContent = `
    An Inquiry has been Received

    Name: ${name}
    Email: ${email}
    Message: ${message}

    Please respond the inquiry as soon as possible.
  `

  try {
    await emailTransporter.sendMail({
      from: 'Info Balisnap <info@balisnaptrip.com>',
      replyTo: email,
      to: 'Balisnap <info@balisnaptrip.com>',
      subject: `Inquiry Received From ${name}<${email}>`,
      html: htmlContent,
      text: textContent
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
