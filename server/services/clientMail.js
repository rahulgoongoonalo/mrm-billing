// Client mail: the three letters MRM sends a client by hand from the entry
// screen, the readiness check that must pass before any of them is sent, and
// who they actually go to.
//
// Every letter is written as data (paragraphs and lists with {placeholders}),
// so the wizard can list the fields each one needs, preview the result and
// send exactly what was previewed.
//
// Recipients are controlled by the same environment variables as before:
//
//   ENTRY_MAIL_TEST_TO   every mail goes here instead of the client, marked TEST.
//   (neither set)        mail goes to the client. Every send is still a
//                        deliberate click at the end of the wizard.
//   ENTRY_MAIL_ENABLED   'false' switches sending off entirely.

const fs = require('fs');
const path = require('path');
const { SOCIETIES, invalidPhones, invalidEmails, isValidGstId, missingSocietyRates } = require('../utils/clientProfile');
const { PAYMENT_ACCOUNTS } = require('../utils/paymentAccounts');
const { statementUrl, shortLabel } = require('./statementBuilder');

const LOGO_FILE = path.join(__dirname, '../assets/mrm-mail-logo.png');
// Mail clients strip data: images, so the sent mail must point at a public
// copy. The live web app already serves the logo, and unlike this server's own
// address it is reachable even when mail is sent from a local machine (a
// localhost link shows as a broken image in Gmail). MAIL_LOGO_URL overrides it.
// The in-app preview inlines the logo so it always shows.
const LOGO_DATA_URI = `data:image/png;base64,${fs.readFileSync(LOGO_FILE).toString('base64')}`;
const PUBLIC_LOGO_URL = 'https://billing.musicrightsmanagement.in/Original%20on%20transparent.png';
const logoUrl = () => process.env.MAIL_LOGO_URL || PUBLIC_LOGO_URL;

const WEBSITE = 'https://www.musicrightsmanagementindia.com';
const ACCOUNTS_EMAIL = 'accounts@musicrightsmanagementindia.com';

const SIGNERS = {
  sherley: {
    name: 'Sherley Singh',
    title: 'Founder & Managing Director',
    phone: '+91 98210 35469',
    email: process.env.MAIL_SHERLEY_EMAIL || '',
  },
  pallavi: {
    name: 'Pallavi Nivave',
    title: 'Accounts & Client Servicing',
    phone: '+91 90825 63873',
    email: ACCOUNTS_EMAIL,
  },
};

const COMPANY_ADDRESS = [
  'Samraj Music Rights Management Pvt. Ltd,',
  'Hotel Samraj Building,',
  'Near Chevrolet Showroom,',
  'Chakala Road, Andheri (E)',
  'Mumbai- 400099',
];

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** 'YYYY-MM-DD' -> '28 September 2026'. Anything else is returned as typed. */
function formatDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!m) return String(value || '').trim();
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

const isoDate = (d) => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const p = (v) => String(v).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};

const inr = (v) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  .format(Number(v) || 0);

// ---------------------------------------------------------------------------
// The three letters
// ---------------------------------------------------------------------------

// Field kinds: 'date' (picked as YYYY-MM-DD, printed long-form), 'amount'
// (printed as ₹1,23,456.00), 'text'. `default(ctx)` fills the wizard's form.
const MAIL_TYPES = {
  historical: {
    key: 'historical',
    label: 'Historical outstanding',
    summary: 'Full reconciliation for a long-pending balance. Asks for a call to agree a payment schedule.',
    signer: 'sherley',
    subject: (c) => `Statement of account and outstanding summary – ${c.name} (${c.clientId})`,
    attach: { full: true, outstanding: true },
    fields: [
      { key: 'startDate', label: 'Reconciliation from', kind: 'date', default: (ctx) => ctx.firstEntryDate },
      { key: 'currentDate', label: 'As of (current date)', kind: 'date', default: () => isoDate(new Date()) },
      { key: 'amount', label: 'Total amount outstanding (₹)', kind: 'amount', default: (ctx) => ctx.closing },
    ],
    body: [
      'We have completed a detailed reconciliation of your account with Music Rights Management from {startDate} until {currentDate}.',
      'Please find attached:',
      ['Your detailed statement of account', 'Your historical outstanding-payment summary'],
      'As of {currentDate}, the total amount outstanding is {amount}. This balance has remained pending for an extended period and now requires immediate closure through a mutually agreed payment schedule.',
      'I request you to please review the attached statements and share a convenient time for a call at the earliest. During the call, we would like to agree upon the amounts and specific dates on which the pending payments will be released.',
      'If you require any clarification before the call, Pallavi will be available to assist you on {pallaviPhone}.',
      'I look forward to resolving this promptly.',
    ],
  },

  regular: {
    key: 'regular',
    label: 'Regular payer',
    summary: 'Updated account and royalty statement, and what the client will receive every time royalty comes in.',
    signer: 'sherley',
    subject: (c) => `Your updated account and royalty statement – ${c.name} (${c.clientId})`,
    attach: { full: false, outstanding: true },
    fields: [
      { key: 'asOfDate', label: 'Statement as of', kind: 'date', default: () => isoDate(new Date()) },
    ],
    body: [
      'Thank you for giving Music Rights Management the opportunity to represent and serve you.',
      'Please find attached your updated account and royalty statement as of {asOfDate}.',
      'Going forward, whenever any royalty is received on your behalf from a society, CMO or any other source, you will receive a detailed report showing:',
      [
        'Source of the royalty',
        'Amount received and date of receipt',
        'Applicable professional fees, taxes or deductions',
        'Net amount payable to you',
        'Payment date and mode',
        'TDS deducted and certificate status',
        'Closing balance, if any',
      ],
      'These regular statements will ensure that you, your accountant and MRM always have the same updated information and that there are no delays in accounting, tax compliance or documentation.',
      'Please review the attached statement and confirm that it agrees with your records. For any clarification, please contact Pallavi on {pallaviPhone}.',
      'We sincerely appreciate your continued trust and look forward to serving you.',
    ],
  },

  catalogue: {
    key: 'catalogue',
    label: 'Membership & catalogue update',
    summary: 'For clients whose royalty is still below ₹500: membership, catalogue and registration status.',
    signer: 'sherley',
    subject: (c) => `Membership, catalogue and registration-status update – ${c.name} (${c.clientId})`,
    attach: { full: false, outstanding: false },
    fields: [
      { key: 'society', label: 'Membership society', kind: 'text', default: (ctx) => ctx.societies },
    ],
    body: [
      'Thank you for becoming a part of the Music Rights Management family.',
      'We are pleased to share an updated summary of the work completed for your account:',
      [
        'Your membership with {society} has been completed.',
        'Your catalogue of works was consolidated by MRM.',
        'The final list of works was reviewed and approved by you.',
        'Registrations were submitted to {society}.',
        'MRM continues to track the registrations, follow up with the concerned societies and monitor future royalty distributions.',
      ],
      'Please find attached:',
      ['Your approved catalogue of works', 'Membership and registration-status report'],
      'We look forward to receiving and administering royalties arising from these works. Whenever a royalty is received, we will send you a complete statement detailing the source, amount, deductions and payment status.',
      'Please review the attached information and confirm that it is complete and correct. For any questions or additions, please contact Pallavi on {pallaviPhone}.',
      'Thank you for giving us the opportunity to represent and support your work.',
    ],
  },
};

/** The type list the wizard needs, with each field's default filled in. */
function describeTypes(client, ctx) {
  return Object.values(MAIL_TYPES).map((t) => ({
    key: t.key,
    label: t.label,
    summary: t.summary,
    signer: SIGNERS[t.signer].name,
    subject: t.subject(client),
    attach: t.attach,
    fields: t.fields.map((f) => ({
      key: f.key, label: f.label, kind: f.kind, value: f.default(ctx) ?? '',
    })),
  }));
}

/** Fields of this type that are still blank. */
function missingFields(type, values) {
  const t = MAIL_TYPES[type];
  if (!t) return [];
  return t.fields.filter((f) => String(values?.[f.key] ?? '').trim() === '').map((f) => f.label);
}

// ---------------------------------------------------------------------------
// Readiness: nothing is mailed until the client master is complete
// ---------------------------------------------------------------------------

function checkClient(client, entryCount) {
  const checks = [];
  const add = (key, label, value, ok, hint = '') => checks.push({ key, label, value: value || '', ok, hint });

  add('clientId', 'MRM ID', client.clientId, !!client.clientId);
  add('name', 'Client name', client.name, !!client.name);

  const email = String(client.email || '').trim();
  add('email', 'Email', email, !!email && invalidEmails(email).length === 0,
    !email ? 'No email address - the mail has nowhere to go' : 'Email address is not valid');

  const phone = String(client.phone || '').trim();
  add('phone', 'Phone number', phone, !!phone && invalidPhones(phone).length === 0,
    !phone ? 'No phone number recorded' : 'Phone number is not valid');

  const gst = String(client.gstId || '').trim();
  if (client.paymentAccount === 'non-gst' && !gst) {
    add('gstId', 'GST ID', 'Not needed - pays into the non-GST account', true);
  } else {
    add('gstId', 'GST ID', gst, !!gst && isValidGstId(gst),
      !gst ? 'No GST ID (set the payment account to "Without GST" if this client has none)' : 'GST ID is not a valid 15-character GSTIN');
  }

  const societies = (client.societies || []).filter((s) => SOCIETIES.includes(s));
  add('societies', 'Society / type', client.type || '', !!client.clientType && societies.length > 0,
    !societies.length ? 'No society is selected for this client' : 'Client type is not set');

  if (client.commissionMode === 'per-society') {
    const missing = missingSocietyRates(client);
    const text = (client.societyCommissions || []).map((s) => `${s.society} ${s.rate}%`).join(', ');
    add('commission', 'Commission rate', text, missing.length === 0, `No rate for ${missing.join(', ')}`);
  } else {
    const rate = Number(client.commissionRate) || 0;
    add('commission', 'Commission rate', rate ? `${rate}%` : '', rate > 0, 'Commission rate is 0%');
  }

  const acct = PAYMENT_ACCOUNTS[client.paymentAccount];
  add('paymentAccount', 'Payment account', acct ? acct.label : '', !!acct,
    'Choose which bank account the statement should print (With GST / Without GST)');

  add('entries', 'Statement entries', entryCount ? `${entryCount} month${entryCount === 1 ? '' : 's'} recorded` : '',
    entryCount > 0, 'No months are recorded, so there is no statement to attach');

  return { checks, ready: checks.every((c) => c.ok) };
}

// ---------------------------------------------------------------------------
// Which letter fits this client
// ---------------------------------------------------------------------------

/**
 * Facts the wizard shows and the defaults it fills in, from the client's
 * statement (as built by buildStatement in 'full' mode).
 */
function mailContext(client, fullStatement, rows) {
  const st = fullStatement;
  const closing = st ? Math.round(st.closing * 100) / 100 : 0;
  const royaltyTotal = st ? st.royaltyTotal : 0;

  // Months since money last came in, counted to the latest month held.
  let monthsSincePayment = null;
  let lastPayment = '';
  if (st) {
    for (let i = st.lines.length - 1; i >= 0; i--) {
      if (st.lines[i].paidTotal > 0) {
        monthsSincePayment = st.lines.length - 1 - i;
        lastPayment = st.lines[i].monthLong;
        break;
      }
    }
  }

  const first = rows && rows.length ? rows[0] : null;
  const calIdx = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const firstEntryDate = first ? isoDate(new Date(first.year, calIdx[first.month], 1)) : '';

  let suggested = 'regular';
  let reason = 'the account is being paid regularly';
  if (royaltyTotal < 500) {
    suggested = 'catalogue';
    reason = `total royalty received so far is only ₹${inr(royaltyTotal)} (below ₹500)`;
  } else if (closing >= 1 && (monthsSincePayment === null || monthsSincePayment >= 6)) {
    suggested = 'historical';
    reason = monthsSincePayment === null
      ? `₹${inr(closing)} is outstanding and no payment has ever been recorded`
      : `₹${inr(closing)} is outstanding and the last payment was in ${lastPayment} (${monthsSincePayment} months ago)`;
  }

  return {
    closing,
    royaltyTotal,
    lastPayment,
    monthsSincePayment,
    periodFrom: st ? st.periodFrom : '',
    periodTo: st ? st.periodTo : '',
    firstEntryDate,
    associationDate: isoDate(client.createdAt) || '',
    societies: (client.societies || []).join(' / '),
    suggested,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------

const splitEmails = (v) => String(v || '').split(/\s*[,;]\s*/).map((s) => s.trim()).filter(Boolean);

/** Where the mail will really go. `cc` is what the wizard asked for. */
function resolveRecipients(client, cc) {
  const clientEmails = splitEmails(client.email);
  const ccList = splitEmails(cc);
  const enabled = process.env.ENTRY_MAIL_ENABLED !== 'false';
  const testTo = (process.env.ENTRY_MAIL_TEST_TO || '').trim();

  const base = { intendedTo: clientEmails, intendedCc: ccList };
  if (!enabled) return { ...base, to: [], cc: [], isTest: false, blocked: 'Client mail is switched off on the server (ENTRY_MAIL_ENABLED=false).' };
  // In test mode nothing reaches the client or the CC list.
  if (testTo) return { ...base, to: splitEmails(testTo), cc: [], isTest: true };
  if (!clientEmails.length) return { ...base, to: [], cc: [], isTest: false, blocked: 'This client has no email address.' };
  return { ...base, to: clientEmails, cc: ccList, isTest: false };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function fillValues(type, values) {
  const t = MAIL_TYPES[type];
  const out = { pallaviPhone: SIGNERS.pallavi.phone };
  for (const f of t.fields) {
    const raw = values?.[f.key];
    if (f.kind === 'date') out[f.key] = formatDate(raw);
    else if (f.kind === 'amount') out[f.key] = `₹${inr(raw)}`;
    else out[f.key] = String(raw ?? '').trim();
  }
  return out;
}

// Filled-in values are bolded so the client sees the facts at a glance; a
// blank one shows as a highlighted [placeholder] so it can't be missed in the preview.
function fillHtml(text, vals) {
  return esc(text).replace(/\{(\w+)\}/g, (_, k) => (vals[k]
    ? `<strong>${esc(vals[k])}</strong>`
    : `<span style="background:#fef3c7;color:#92400e;padding:0 3px;">[${esc(k)}]</span>`));
}
const fillText = (text, vals) => text.replace(/\{(\w+)\}/g, (_, k) => vals[k] || `[${k}]`);

const P = 'margin:0 0 14px;font-size:14px;line-height:1.65;color:#222;';

function signatureHtml(signer, logoSrc) {
  const s = SIGNERS[signer];
  const contact = [
    ['Mobile', s.phone, `tel:${s.phone.replace(/\s/g, '')}`],
    ['Email', s.email, s.email ? `mailto:${s.email}` : ''],
  ].filter(([, v]) => v)
    .map(([k, v, href]) => `${k}: <a href="${esc(href)}" style="color:#1a5fb4;text-decoration:none;">${esc(v)}</a>`)
    .join('<br>');

  return `
<p style="${P}margin-top:22px;">Warm regards,</p>
<p style="margin:0 0 4px;font-size:17px;font-weight:700;color:#111;">${esc(s.name)}</p>
<p style="margin:0 0 2px;font-size:13px;font-weight:600;color:#333;">${esc(s.title)}</p>
<p style="margin:0 0 12px;font-size:13px;color:#333;">Music Rights Management &ndash; MRM India</p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.7;color:#333;">${contact}</p>
<img src="${esc(logoSrc)}" width="260" height="91" alt="MRM | Music Rights Management" style="display:block;width:260px;max-width:100%;height:auto;border:0;margin:0 0 16px;">
<p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#333;">${COMPANY_ADDRESS.map(esc).join('<br>')}</p>
<p style="margin:0;font-size:13px;"><a href="${WEBSITE}" style="color:#7b3f99;">${WEBSITE}</a></p>`;
}

const TH = 'padding:10px;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#fff;font-family:Arial,Helvetica,sans-serif;';
const BTN = 'display:inline-block;text-decoration:none;font-size:11px;font-weight:600;color:#1F3864;border:1px solid #cfd8e6;border-radius:6px;padding:5px 9px;background:#f6f9fd;';

/**
 * The client's own row of the daily outstanding report: latest month held,
 * what is outstanding at its end, and links to both statement pages.
 * `latest` is the client's most recent entry.
 */
function accountTableHtml(client, latest) {
  if (!latest) return '';
  const amount = Number(latest.totalOutstanding) || 0;
  const color = amount > 0 ? '#1F3864' : amount <= -1 ? '#B01414' : '#1F6B24';
  return `
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e3e8f0;margin:6px 0 18px;font-family:Arial,Helvetica,sans-serif;">
  <tr style="background:#1F3864;">
    <th style="${TH}text-align:left;">Client</th>
    <th style="${TH}text-align:left;">Month</th>
    <th style="${TH}text-align:right;">Outstanding</th>
    <th style="${TH}text-align:right;">Statement</th>
  </tr>
  <tr>
    <td style="padding:10px;font-size:12.5px;line-height:1.4;">
      <div style="font-weight:600;color:#1F3864;">${esc(client.name)}</div>
      <div style="font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#2E6DA4;margin-top:2px;">${esc(client.clientId)}</div>
    </td>
    <td style="padding:10px;font-size:11.5px;color:#8a93a3;white-space:nowrap;">${esc(shortLabel(latest))}</td>
    <td style="padding:10px;text-align:right;font-size:13px;font-weight:700;white-space:nowrap;color:${color};">&#8377;${inr(amount)}</td>
    <td style="padding:10px;text-align:right;">
      <a href="${esc(statementUrl(client.clientId, 'outstanding'))}" style="${BTN}margin:2px 0;">Balance build-up</a>
      <a href="${esc(statementUrl(client.clientId, 'full'))}" style="${BTN}margin:2px 0 2px 5px;">Full record</a>
    </td>
  </tr>
</table>`;
}

/**
 * Build the mail. `preview` inlines the logo and, in test mode, adds a banner
 * saying where the mail will really go. `latest` is the client's most recent
 * entry, shown as a one-row account table above the signature.
 */
function renderMail({ type, client, values, subject, recipients, latest = null, attachmentNames = [], preview = false }) {
  const t = MAIL_TYPES[type];
  if (!t) throw new Error(`Unknown mail type "${type}"`);
  const vals = fillValues(type, values);

  const blocks = t.body.map((b) => (Array.isArray(b)
    ? `<ul style="margin:0 0 14px;padding-left:22px;">${b.map((li) => `<li style="font-size:14px;line-height:1.65;color:#222;margin:0 0 4px;">${fillHtml(li, vals)}</li>`).join('')}</ul>`
    : `<p style="${P}">${fillHtml(b, vals)}</p>`)).join('\n');

  const banner = recipients && recipients.isTest ? `
<div style="background:#fef3c7;border:1px solid #fde68a;color:#92400e;padding:10px 14px;font-size:12px;font-weight:600;margin:0 0 20px;border-radius:6px;">
  TEST EMAIL &mdash; sent to ${esc(recipients.to.join(', '))} instead of the client.
  ${recipients.intendedTo.length ? `In live mode it would go to ${esc(recipients.intendedTo.join(', '))}.` : 'No client email is recorded.'}
</div>` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:640px;padding:24px 20px;font-family:Arial,Helvetica,sans-serif;color:#222;">
${banner}
<p style="${P}">Dear ${esc(client.name)},</p>
${blocks}
${accountTableHtml(client, latest)}
${signatureHtml(t.signer, preview ? LOGO_DATA_URI : logoUrl())}
</div></body></html>`;

  const signer = SIGNERS[t.signer];
  const text = [
    `Dear ${client.name},`, '',
    ...t.body.flatMap((b) => (Array.isArray(b) ? [...b.map((li) => `  - ${fillText(li, vals)}`), ''] : [fillText(b, vals), ''])),
    ...(latest ? [
      `${client.name} (${client.clientId}) · ${shortLabel(latest)} · Outstanding ₹${inr(latest.totalOutstanding)}`,
      `Balance build-up: ${statementUrl(client.clientId, 'outstanding')}`,
      `Full record: ${statementUrl(client.clientId, 'full')}`, '',
    ] : []),
    'Warm regards,', '', signer.name, signer.title, 'Music Rights Management – MRM India', '',
    `Mobile: ${signer.phone}`, ...(signer.email ? [`Email: ${signer.email}`] : []), '',
    ...COMPANY_ADDRESS, '', WEBSITE,
  ].join('\n');

  const finalSubject = `${recipients && recipients.isTest ? '[TEST] ' : ''}${(subject || '').trim() || t.subject(client)}`;
  return { subject: finalSubject, html, text, attachmentNames };
}

module.exports = {
  MAIL_TYPES,
  SIGNERS,
  ACCOUNTS_EMAIL,
  LOGO_FILE,
  describeTypes,
  missingFields,
  checkClient,
  mailContext,
  resolveRecipients,
  renderMail,
  formatDate,
};
