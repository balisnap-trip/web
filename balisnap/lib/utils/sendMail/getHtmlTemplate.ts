import { formatDate } from '../formatDate'

export const getHtmlTemplate = (params: any, toAdmin: boolean = false) => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
  let html = ''

  if (!toAdmin) {
    html = `<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office">

<head>
  <title>Booking Confirmation - Bali Snap Trip</title><!--[if !mso]><!-->
  <meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]-->
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style type="text/css">
    #outlook a {
      padding: 0;
    }

    body {
      margin: 0;
      padding: 0;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }

    table,
    td {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }

    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }

    p {
      display: block;
      margin: 13px 0;
    }
  </style><!--[if mso]>
        <noscript>
        <xml>
        <o:OfficeDocumentSettings>
          <o:AllowPNG/>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
        </xml>
        </noscript>
        <![endif]--><!--[if lte mso 11]>
        <style type="text/css">
          .mj-outlook-group-fix { width:100% !important; }
        </style>
        <![endif]--><!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&display=swap" rel="stylesheet"
    type="text/css">
  <style type="text/css">
    @import url(https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&display=swap);
  </style><!--<![endif]-->
  <style type="text/css">
    @media only screen and (min-width:480px) {
      .mj-column-per-100 {
        width: 100% !important;
        max-width: 100%;
      }
    }
  </style>
  <style media="screen and (min-width:480px)">
    .moz-text-html .mj-column-per-100 {
      width: 100% !important;
      max-width: 100%;
    }
  </style>
  <style type="text/css">
    @media only screen and (max-width:480px) {
      table.mj-full-width-mobile {
        width: 100% !important;
      }

      td.mj-full-width-mobile {
        width: auto !important;
      }
    }
  </style>
</head>

<body style="word-spacing:normal;">
  <div>
    <!-- Refined Header Section with Google Font Inter --><!--[if mso | IE]><table align="center" border="0" cellpadding="0" cellspacing="0" class="" role="presentation" style="width:600px;" width="600" bgcolor="#ffffff" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]-->
    <div style="background:#ffffff;background-color:#ffffff;margin:0px auto;max-width:600px;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#ffffff;background-color:#ffffff;width:100%;">
        <tbody>
          <tr>
            <td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;">
              <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]-->
              <div class="mj-column-per-100 mj-outlook-group-fix"
                style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;"
                  width="100%">
                  <tbody>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation"
                          style="border-collapse:collapse;border-spacing:0px;">
                          <tbody>
                            <tr>
                              <td style="width:120px;"><img alt="Bali Snap Trip Logo" height="auto"
                                  src="${baseUrl}/logo.png"
                                  style="border:0;display:block;outline:none;text-decoration:none;height:auto;width:100%;font-size:13px;"
                                  width="120"></td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:18px;font-weight:500;line-height:1;text-align:center;color:#333333;">
                          PT. Bali Snap Trip</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;line-height:1;text-align:center;color:#555555;">
                          Jln. Pantai Saba, Blahbatuh, Gianyar, Bali 80581</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;line-height:1;text-align:center;color:#555555;">
                          Phone: ${process.env.NEXT_PUBLIC_PHONE_NUMBER} | Email: ${process.env.NEXT_PUBLIC_INFO_EMAIL}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div><!--[if mso | IE]></td></tr></table><![endif]-->
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!--[if mso | IE]></td></tr></table><![endif]--><!-- Booking Confirmation Section --><!--[if mso | IE]><table align="center" border="0" cellpadding="0" cellspacing="0" class="" role="presentation" style="width:600px;" width="600" bgcolor="#f0f0f0" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]-->
    <div style="background:#f0f0f0;background-color:#f0f0f0;margin:0px auto;max-width:600px;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#f0f0f0;background-color:#f0f0f0;width:100%;">
        <tbody>
          <tr>
            <td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;">
              <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]-->
              <div class="mj-column-per-100 mj-outlook-group-fix"
                style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;"
                  width="100%">
                  <tbody>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:22px;font-weight:700;line-height:1;text-align:center;color:#333333;">
                          Booking Confirmation</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <p style="border-top:solid 4px #cccccc;font-size:1px;margin:0px auto;width:100%;"></p><!--[if mso | IE]><table align="center" border="0" cellpadding="0" cellspacing="0" style="border-top:solid 4px #cccccc;font-size:1px;margin:0px auto;width:550px;" role="presentation" width="550px" ><tr><td style="height:0;line-height:0;"> &nbsp;
</td></tr></table><![endif]-->
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          Dear ${params.main_contact_name},</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;font-weight:300;line-height:1.5;text-align:left;color:#555555;">
                          Thank you for choosing Bali Snap Trip! We are thrilled to have the opportunity to host you for
                          an unforgettable experience in Bali. Below are the details of your confirmed booking:</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div><!--[if mso | IE]></td></tr></table><![endif]-->
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!--[if mso | IE]></td></tr></table><![endif]--><!-- Booking Details Section --><!--[if mso | IE]><table align="center" border="0" cellpadding="0" cellspacing="0" class="" role="presentation" style="width:600px;" width="600" bgcolor="#f9f9f9" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]-->
    <div style="background:#f9f9f9;background-color:#f9f9f9;margin:0px auto;max-width:600px;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#f9f9f9;background-color:#f9f9f9;width:100%;">
        <tbody>
          <tr>
            <td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;">
              <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]-->
              <div class="mj-column-per-100 mj-outlook-group-fix"
                style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;"
                  width="100%">
                  <tbody>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          <b>Booking Number:</b> ${params.booking_ref}</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          <b>Tour Package:</b> ${params.TourPackage.package_name}</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          <b>Date:</b> ${formatDate(params.booking_date)}</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          <b>Number of Adults:</b> ${params.number_of_adult}</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          <b>Number of Children:</b> ${params.number_of_child}</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          <b>Total Price:</b> ${params.total_price} USD</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;font-weight:300;line-height:1.5;text-align:left;color:#555555;">
                          To finalize your booking, please click the link below to complete your payment:</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" vertical-align="middle"
                        style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation"
                          style="border-collapse:separate;line-height:100%;">
                          <tbody>
                            <tr>
                              <td align="center" bgcolor="#007BFF" role="presentation"
                                style="border:none;border-radius:5px;cursor:auto;mso-padding-alt:10px 25px;background:#007BFF;"
                                valign="middle"><a href="${baseUrl}/booking/${params.booking_id}"
                                  style="display:inline-block;background:#007BFF;color:#ffffff;font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:120%;margin:0;text-decoration:none;text-transform:none;padding:10px 25px;mso-padding-alt:0px;border-radius:5px;"
                                  target="_blank">Pay Now</a></td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;font-weight:300;line-height:1.5;text-align:left;color:#555555;">
                          Should you have any questions or need assistance, feel free to reach out to us.</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div><!--[if mso | IE]></td></tr></table><![endif]-->
            </td>
          </tr>
        </tbody>
      </table>
    </div><!--[if mso | IE]></td></tr></table><![endif]-->
    <!-- Admin Info Section --><!-- Footer Section --><!--[if mso | IE]><table align="center" border="0" cellpadding="0" cellspacing="0" class="" role="presentation" style="width:600px;" width="600" bgcolor="#f0f0f0" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]-->
    <div style="background:#f0f0f0;background-color:#f0f0f0;margin:0px auto;max-width:600px;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#f0f0f0;background-color:#f0f0f0;width:100%;">
        <tbody>
          <tr>
            <td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;">
              <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]-->
              <div class="mj-column-per-100 mj-outlook-group-fix"
                style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;"
                  width="100%">
                  <tbody>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;font-weight:300;line-height:1;text-align:center;color:#555555;">
                          We are excited to welcome you on this adventure!</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;font-weight:300;line-height:1.5;text-align:center;color:#555555;">
                          Best regards,<br>Bali Snap Trip Team</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div><!--[if mso | IE]></td></tr></table><![endif]-->
            </td>
          </tr>
        </tbody>
      </table>
    </div><!--[if mso | IE]></td></tr></table><![endif]-->
  </div>
</body>

</html>`
  } else {
    html = `<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office">

<head>
  <title>Admin Booking Confirmation - Bali Snap Trip</title><!--[if !mso]><!-->
  <meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]-->
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style type="text/css">
    #outlook a {
      padding: 0;
    }

    body {
      margin: 0;
      padding: 0;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }

    table,
    td {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }

    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }

    p {
      display: block;
      margin: 13px 0;
    }
  </style><!--[if mso]>
        <noscript>
        <xml>
        <o:OfficeDocumentSettings>
          <o:AllowPNG/>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
        </xml>
        </noscript>
        <![endif]--><!--[if lte mso 11]>
        <style type="text/css">
          .mj-outlook-group-fix { width:100% !important; }
        </style>
        <![endif]--><!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&display=swap" rel="stylesheet"
    type="text/css">
  <style type="text/css">
    @import url(https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&display=swap);
  </style><!--<![endif]-->
  <style type="text/css">
    @media only screen and (min-width:480px) {
      .mj-column-per-100 {
        width: 100% !important;
        max-width: 100%;
      }
    }
  </style>
  <style media="screen and (min-width:480px)">
    .moz-text-html .mj-column-per-100 {
      width: 100% !important;
      max-width: 100%;
    }
  </style>
  <style type="text/css">
    @media only screen and (max-width:480px) {
      table.mj-full-width-mobile {
        width: 100% !important;
      }

      td.mj-full-width-mobile {
        width: auto !important;
      }
    }
  </style>
</head>

<body style="word-spacing:normal;">
  <div>
    <!--[if mso | IE]><table align="center" border="0" cellpadding="0" cellspacing="0" class="" role="presentation" style="width:600px;" width="600" bgcolor="#ffffff" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]-->
    <div style="background:#ffffff;background-color:#ffffff;margin:0px auto;max-width:600px;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#ffffff;background-color:#ffffff;width:100%;">
        <tbody>
          <tr>
            <td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;">
              <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]-->
              <div class="mj-column-per-100 mj-outlook-group-fix"
                style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;"
                  width="100%">
                  <tbody>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation"
                          style="border-collapse:collapse;border-spacing:0px;">
                          <tbody>
                            <tr>
                              <td style="width:120px;"><img alt="Bali Snap Trip Logo" height="auto"
                                  src="${baseUrl}/logo.png"
                                  style="border:0;display:block;outline:none;text-decoration:none;height:auto;width:100%;font-size:13px;"
                                  width="120"></td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:18px;font-weight:500;line-height:1;text-align:center;color:#333333;">
                          PT. Bali Snap Trip</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;line-height:1;text-align:center;color:#555555;">
                          Jln. Pantai Saba, Blahbatuh, Gianyar, Bali 80581</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;line-height:1;text-align:center;color:#555555;">
                          Phone: ${process.env.NEXT_PUBLIC_PHONE_NUMBER} | Email: ${process.env.NEXT_PUBLIC_INFO_EMAIL}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div><!--[if mso | IE]></td></tr></table><![endif]-->
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!--[if mso | IE]></td></tr></table><table align="center" border="0" cellpadding="0" cellspacing="0" class="" role="presentation" style="width:600px;" width="600" bgcolor="#f0f0f0" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]-->
    <div style="background:#f0f0f0;background-color:#f0f0f0;margin:0px auto;max-width:600px;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#f0f0f0;background-color:#f0f0f0;width:100%;">
        <tbody>
          <tr>
            <td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;">
              <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]-->
              <div class="mj-column-per-100 mj-outlook-group-fix"
                style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;"
                  width="100%">
                  <tbody>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:22px;font-weight:700;line-height:1;text-align:center;color:#333333;">
                          Admin Booking Confirmation</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <p style="border-top:solid 4px #cccccc;font-size:1px;margin:0px auto;width:100%;"></p><!--[if mso | IE]><table align="center" border="0" cellpadding="0" cellspacing="0" style="border-top:solid 4px #cccccc;font-size:1px;margin:0px auto;width:550px;" role="presentation" width="550px" ><tr><td style="height:0;line-height:0;"> &nbsp;
</td></tr></table><![endif]-->
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          Dear Admin,</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;font-weight:300;line-height:1.5;text-align:left;color:#555555;">
                          A new booking has been made! Below are the details:</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div><!--[if mso | IE]></td></tr></table><![endif]-->
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!--[if mso | IE]></td></tr></table><table align="center" border="0" cellpadding="0" cellspacing="0" class="" role="presentation" style="width:600px;" width="600" bgcolor="#f9f9f9" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]-->
    <div style="background:#f9f9f9;background-color:#f9f9f9;margin:0px auto;max-width:600px;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#f9f9f9;background-color:#f9f9f9;width:100%;">
        <tbody>
          <tr>
            <td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;">
              <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]-->
              <div class="mj-column-per-100 mj-outlook-group-fix"
                style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;"
                  width="100%">
                  <tbody>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          <b>Booking Number:</b> ${params.booking_ref}</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          <b>Tour Package:</b> ${params.TourPackage.package_name}</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          <b>Date:</b> ${formatDate(params.booking_date)}</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          <b>Number of Adults:</b> ${params.number_of_adult}</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          <b>Number of Children:</b> ${params.number_of_child}</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;line-height:1;text-align:left;color:#333333;">
                          <b>Total Price:</b> ${params.total_price} USD</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;font-weight:300;line-height:1.5;text-align:left;color:#555555;">
                          Please review the booking details above.</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div><!--[if mso | IE]></td></tr></table><![endif]-->
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!--[if mso | IE]></td></tr></table><table align="center" border="0" cellpadding="0" cellspacing="0" class="" role="presentation" style="width:600px;" width="600" bgcolor="#f0f0f0" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]-->
    <div style="background:#f0f0f0;background-color:#f0f0f0;margin:0px auto;max-width:600px;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#f0f0f0;background-color:#f0f0f0;width:100%;">
        <tbody>
          <tr>
            <td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;">
              <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]-->
              <div class="mj-column-per-100 mj-outlook-group-fix"
                style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;"
                  width="100%">
                  <tbody>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;font-weight:300;line-height:1;text-align:center;color:#555555;">
                          Thank you for your attention to this new booking!</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                        <div
                          style="font-family:Inter, Arial, sans-serif;font-size:14px;font-weight:300;line-height:1;text-align:center;color:#555555;">
                          Bali Snap Trip Team</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div><!--[if mso | IE]></td></tr></table><![endif]-->
            </td>
          </tr>
        </tbody>
      </table>
    </div><!--[if mso | IE]></td></tr></table><![endif]-->
  </div>
</body>

</html>`
  }

  return html
}
