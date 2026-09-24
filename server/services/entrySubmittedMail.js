// The mail a client gets when their month is submitted: what came in, what was
// charged, what is still owed, and links to the two statement pages.
//
// Recipients are controlled by two environment variables:
//
//   ENTRY_MAIL_TEST_TO   every mail goes here instead of the client. While this
//                        is set the feature is in test mode, the subject is
//                        prefixed and the mail carries a TEST banner naming the
//                        address it would really have gone to.
//   ENTRY_MAIL_ENABLED   'false' switches sending off entirely.
//
// Test mode is the default: with no ENTRY_MAIL_TEST_TO set and no explicit
// ENTRY_MAIL_LIVE=true, nothing is sent to a real client address.

const { getTransporter } = require('./emailService');
const { statementUrl, longLabel } = require('./statementBuilder');
const { SOCIETIES, SOCIETY_FIELDS } = require('../utils/clientProfile');
const { version: APP_VERSION } = require('../package.json');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const money = (amount) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(amount || 0);

const n = (e, k) => e[k] || 0;

/** Who this mail actually goes to, and whether that makes it a test. */
function resolveRecipient(client) {
  const testTo = (process.env.ENTRY_MAIL_TEST_TO || '').trim();
  const live = process.env.ENTRY_MAIL_LIVE === 'true';
  const clientEmail = (client && client.email ? String(client.email) : '')
    .split(/\s*,\s*/).filter(Boolean)[0] || '';

  if (testTo) return { to: testTo, intendedTo: clientEmail, isTest: true };
  if (live && clientEmail) return { to: clientEmail, intendedTo: clientEmail, isTest: false };
  // No test address and not explicitly live: refuse rather than guess.
  return { to: '', intendedTo: clientEmail, isTest: true, blocked: true };
}

function buildHtml({ client, entry, isTest, intendedTo }) {
  const month = longLabel(entry);
  const fullUrl = statementUrl(entry.clientId, 'full');
  const balanceUrl = statementUrl(entry.clientId, 'outstanding');

  const royaltyRows = SOCIETIES
    .filter((s) => n(entry, SOCIETY_FIELDS[s].amount))
    .map((s) => `
      <tr>
        <td style="padding:7px 0;font-size:13px;color:#4a5464;">${esc(s)}</td>
        <td style="padding:7px 0;font-size:13px;text-align:right;font-weight:600;">${money(n(entry, SOCIETY_FIELDS[s].amount))}</td>
        <td style="padding:7px 0 7px 18px;font-size:13px;text-align:right;color:#1F6B24;">${money(n(entry, SOCIETY_FIELDS[s].commission))}</td>
      </tr>`).join('');

  const royaltyTotal = SOCIETIES.reduce((t, s) => t + n(entry, SOCIETY_FIELDS[s].amount), 0);
  const receipts = n(entry, 'currentMonthReceipt') + n(entry, 'previousMonthReceipt');
  const tds = n(entry, 'currentMonthTds') + n(entry, 'previousMonthTds');

  const testBanner = isTest ? `
    <tr><td style="background:#fef3c7;padding:11px 26px;color:#92400e;font-size:12px;font-weight:600;border-bottom:1px solid #fde68a;">
      TEST EMAIL &mdash; this is a test and has not been sent to the client.
      ${intendedTo ? `In live mode it would go to ${esc(intendedTo)}.` : 'No email address is recorded for this client.'}
    </td></tr>` : '';

  const button = (href, label, primary) => `
    <a href="${esc(href)}" style="display:inline-block;text-decoration:none;font-size:13px;font-weight:600;
       padding:11px 18px;border-radius:8px;margin-right:8px;
       ${primary
    ? 'background:#1F3864;color:#ffffff;'
    : 'background:#f6f9fd;color:#1F3864;border:1px solid #cfd8e6;'}">${esc(label)}</a>`;

  const line = (label, value, strong) => `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#4a5464;">${esc(label)}</td>
      <td style="padding:8px 0;font-size:${strong ? '15px' : '13px'};text-align:right;font-weight:${strong ? '700' : '600'};color:${strong ? '#1F3864' : '#1e2430'};">${value}</td>
    </tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1e2430;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#eef1f6;padding:24px 10px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.09),0 10px 32px rgba(16,24,40,.06);">
  ${testBanner}

  <tr><td style="padding:24px 26px 18px;border-bottom:1px solid #e6eaf0;">
    <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#8a93a3;font-weight:600;">Music Rights Management</div>
    <div style="font-size:22px;font-weight:700;color:#1F3864;margin-top:3px;letter-spacing:-.3px;">Statement for ${esc(month)}</div>
    <div style="font-size:12.5px;color:#5a6474;margin-top:3px;">
      ${esc(client.name)} <span style="font-family:ui-monospace,Consolas,monospace;color:#2E6DA4;">${esc(entry.clientId)}</span>
    </div>
  </td></tr>

  <tr><td style="padding:20px 26px 6px;">
    <div style="font-size:13.5px;color:#4a5464;line-height:1.6;">
      Dear ${esc(client.name)},<br>
      Your royalty account for <strong>${esc(month)}</strong> has been finalised. A summary is below,
      and the full record is available through the buttons at the end.
    </div>
  </td></tr>

  ${royaltyRows ? `
  <tr><td style="padding:18px 26px 0;">
    <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#8a93a3;font-weight:600;margin-bottom:6px;">Royalty received</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:0 0 6px;font-size:11px;color:#8a93a3;">Society</td>
        <td style="padding:0 0 6px;font-size:11px;color:#8a93a3;text-align:right;">Amount</td>
        <td style="padding:0 0 6px 18px;font-size:11px;color:#8a93a3;text-align:right;">Commission</td>
      </tr>
      ${royaltyRows}
      <tr><td colspan="3" style="border-top:1px solid #e6eaf0;padding-top:8px;"></td></tr>
      <tr>
        <td style="font-size:13px;font-weight:700;color:#1F3864;">Total</td>
        <td style="font-size:13px;font-weight:700;text-align:right;color:#1F3864;">${money(royaltyTotal)}</td>
        <td style="font-size:13px;font-weight:700;text-align:right;padding-left:18px;color:#1F6B24;">${money(n(entry, 'totalCommission'))}</td>
      </tr>
    </table>
  </td></tr>` : ''}

  <tr><td style="padding:18px 26px 0;">
    <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#8a93a3;font-weight:600;margin-bottom:2px;">This month</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${line('Opening balance', money(n(entry, 'previousMonthOutstanding')))}
      ${line('Commission charged', money(n(entry, 'totalCommission')))}
      ${n(entry, 'currentMonthGst') ? line(`GST (${n(entry, 'gstRate')}%)`, money(n(entry, 'currentMonthGst'))) : ''}
      ${receipts ? line('Payments received', `&minus;${money(receipts)}`) : ''}
      ${tds ? line('TDS withheld', `&minus;${money(tds)}`) : ''}
      <tr><td colspan="2" style="border-top:1px solid #e6eaf0;padding-top:6px;"></td></tr>
      ${line('Closing balance', money(n(entry, 'totalOutstanding')), true)}
    </table>
  </td></tr>

  <tr><td style="padding:22px 26px 6px;">
    ${button(fullUrl, 'View full record', true)}
    ${button(balanceUrl, 'How this balance was built', false)}
  </td></tr>

  <tr><td style="padding:4px 26px 22px;font-size:11.5px;color:#8a93a3;line-height:1.55;">
    The full record lists every month held for you, with the royalty received and the commission
    charged on it. If anything looks wrong, reply to this email and we will check it.
  </td></tr>

  <tr><td style="padding:14px 26px;background:#f6f8fc;border-top:1px solid #e6eaf0;text-align:center;font-size:11.5px;color:#98a1b0;">
    Developed and maintained by <strong style="color:#6b7484;">RDJ(MRM)</strong>
    <span style="font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:#a8b0bd;border:1px solid #dfe4ec;border-radius:5px;padding:1px 6px;margin-left:7px;">v${APP_VERSION}</span>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Send the submitted-month mail. Never throws: a mail problem must not fail the
 * save that triggered it, so the outcome is returned for the caller to record.
 */
async function sendEntrySubmittedMail(client, entry) {
  if (process.env.ENTRY_MAIL_ENABLED === 'false') {
    return { ok: false, skipped: true, error: 'Entry mail is switched off' };
  }

  const { to, intendedTo, isTest, blocked } = resolveRecipient(client);
  if (blocked || !to) {
    return {
      ok: false,
      skipped: true,
      isTest,
      intendedTo,
      error: 'No recipient: set ENTRY_MAIL_TEST_TO, or ENTRY_MAIL_LIVE=true with an email on the client',
    };
  }

  const month = longLabel(entry);
  const subject = `${isTest ? '[TEST] ' : ''}${client.name} — statement for ${month}`;

  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html: buildHtml({ client, entry, isTest, intendedTo }),
    });
    return { ok: true, to, intendedTo, isTest, subject };
  } catch (error) {
    return { ok: false, to, intendedTo, isTest, error: error.message };
  }
}

module.exports = { sendEntrySubmittedMail, buildHtml, resolveRecipient };
