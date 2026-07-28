// Template-mode fixture: both layoutHtml and standardHtml bound, own html
// left empty so the preview starts on the fallback path (standardHtml
// wrapped in layoutHtml). Type into the HTML field to see it take over.
//
// To simulate the other two placements while developing, comment out:
//   - layoutHtml AND standardHtml  -> Layout placement (raw preview)
//   - standardHtml only            -> Standard placement (own html wrapped, no fallback)

window.FIXTURES = window.FIXTURES || {};
window.FIXTURES['email-html-editor'] = {
  id: 'contract-signed',
  html: '',
  text: 'Hei {{receiverName}},\n\n{{body}}\n\n{{buttonText}}: {{buttonUrl}}',
  subject: 'Kontrakt signert',
  layoutHtml: `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5efe7;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;background-color:#fff7ee;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-family:sans-serif;">
          <tr><td style="background-color:#0d3d56;padding:24px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;">BUILDeR</span>
          </td></tr>
          <tr><td style="padding:32px;color:#111827;font-size:16px;line-height:1.5;">{{content}}</td></tr>
          <tr><td style="background-color:#0d3d56;padding:20px 32px;color:#d4e0ca;font-size:12px;">
            BUILDeR — Plattformen for ressursdeling i bygg og anlegg
          </td></tr>
        </table>
      </td></tr>
    </table>
  `,
  standardHtml: `
    <p style="margin:0 0 16px;">Hei {{receiverName}},</p>
    <p style="margin:0 0 24px;">{{body}}</p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr><td style="border-radius:6px;background-color:#f59a17;">
        <a href="{{buttonUrl}}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:600;text-decoration:none;border-radius:6px;">{{buttonText}}</a>
      </td></tr>
    </table>
  `,
};
