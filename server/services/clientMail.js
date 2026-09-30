// Client mail: the statement letter MRM sends a client by hand from the entry
// screen, the readiness check that must pass before it is sent, and who it
// actually goes to.
//
// The letter is written as data (paragraphs and lists with {placeholders}),
// so the wizard can list the fields it needs, preview the result and send
// exactly what was previewed.
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
  pallavi: {
    name: 'Pallavi Shailesh Ninave',
    title: 'Accounts Team',
    phone: '+91 90825 63873',
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
// The letter
// ---------------------------------------------------------------------------

// Field kinds: 'date' (picked as YYYY-MM-DD, printed long-form), 'amount'
// (printed as ₹1,23,456.00), 'text'. `default(ctx)` fills the wizard's form.
// There is one letter, so the wizard never asks which; older mails in the log
// still carry the keys of the letters it replaced.
const DEFAULT_TYPE = 'statement';
const MAIL_TYPES = {
  statement: {
    key: 'statement',
    label: 'Statement',
    summary: 'Royalty and service fee statement for the period, with the closing balance payable.',
    signer: 'pallavi',
    subject: (c) => `Your MRM royalty and service fee statement – ${c.name} (${c.clientId})`,
    fields: [
      { key: 'period', label: 'Statement period', kind: 'text', default: (ctx) => [ctx.periodFrom, ctx.periodTo].filter(Boolean).join(' – ') },
      { key: 'royalty', label: 'Royalty received in this period (₹)', kind: 'amount', default: (ctx) => ctx.royaltyTotal },
      { key: 'asAtDate', label: 'Closing balance as at', kind: 'date', default: () => isoDate(new Date()) },
      { key: 'closing', label: 'Closing balance payable to MRM (₹)', kind: 'amount', default: (ctx) => ctx.closing },
    ],
    body: [
      'Please find attached your MRM royalty and service fee statement for {period}.',
      [
        'Royalty received by you during this period: {royalty}',
        'Closing balance payable to MRM as at {asAtDate}: {closing}',
      ],
      'The statement details the royalties recorded, service fees, GST, payments received and any opening balance carried forward.',
      'Payment details are included in the statement. For any clarification or payment not reflected, please reply to this email.',
    ],
  },
};

/** The letter(s) the wizard offers, with each field's default filled in. */
function describeTypes(client, ctx) {
  return Object.values(MAIL_TYPES).map((t) => ({
    key: t.key,
    label: t.label,
    summary: t.summary,
    signer: SIGNERS[t.signer].name,
    subject: t.subject(client),
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

  // GST ID is optional; only a malformed one blocks the mail.
  const gst = String(client.gstId || '').trim();
  if (!gst) {
    add('gstId', 'GST ID', 'Not recorded (optional)', true);
  } else {
    add('gstId', 'GST ID', gst, isValidGstId(gst), 'GST ID is not a valid 15-character GSTIN');
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
// What the letter is filled in from
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
  const out = {};
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
  const contact = `Mobile: <a href="tel:${esc(s.phone.replace(/\s/g, ''))}" style="color:#1a5fb4;text-decoration:none;">${esc(s.phone)}</a>`;

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

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"></head>
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
    `Mobile: ${signer.phone}`, '',
    ...COMPANY_ADDRESS, '', WEBSITE,
  ].join('\n');

  const finalSubject = `${recipients && recipients.isTest ? '[TEST] ' : ''}${(subject || '').trim() || t.subject(client)}`;
  return { subject: finalSubject, html, text, attachmentNames };
}

module.exports = {
  MAIL_TYPES,
  DEFAULT_TYPE,
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
