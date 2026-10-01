// Daily work report: one mail per team member, built from what the app
// recorded about their day in activityEvents (see services/activity.js).
//
// Several saves of the same client-month in one day are one piece of work, so
// every count here is of client-months, and every amount is the net change
// over the day (the first "from" to the last "to"), not the sum of the saves.

const ActivityEvent = require('../models/ActivityEvent');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const User = require('../models/User');
const Client = require('../models/Client');
const { SOCIETIES, SOCIETY_FIELDS } = require('../utils/clientProfile');
const { monthShort, calOrder } = require('./statementBuilder');

const TZ = 'Asia/Kolkata';

// A gap longer than this with nothing saved or opened counts as time away.
const IDLE_GAP_MS = 30 * 60 * 1000;
// Credit for the work done before the first save of a stretch.
const LEAD_IN_MS = 5 * 60 * 1000;
// Receipt changes smaller than this are rounding fixes, not payments.
const ROUNDING_FIX = 5;

const SOCIETY_AMOUNT = new Map(SOCIETIES.map((s) => [SOCIETY_FIELDS[s].amount, s]));
const SOCIETY_LINES = { iprsEntries: 'IPRS', prsEntries: 'PRS' };
const RECEIPT_FIELDS = ['currentMonthReceipt', 'previousMonthReceipt'];
const TDS_FIELDS = ['currentMonthTds', 'previousMonthTds'];
const GST_FIELDS = ['currentMonthGstBase', 'previousOutstandingGstBase'];
const OTHER_ENTRY_FIELDS = {
  previousMonthOutstanding: 'Opening balance',
  extraAmount: 'Extra / adjustment',
  commissionRate: 'Commission rate',
  gstRate: 'GST rate',
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// 'YYYY-MM-DD' (an IST calendar day) -> [start, end) as Dates.
function istDay(dateStr) {
  const start = new Date(`${dateStr}T00:00:00+05:30`);
  return [start, new Date(start.getTime() + 24 * 60 * 60 * 1000)];
}

const todayIst = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: TZ });

const monthLabel = (month, year) => `${monthShort[month] || month} ${year}`;

// ---------------------------------------------------------------------------
// Collect
// ---------------------------------------------------------------------------

// Net change per field over the day for one client-month's events (oldest first).
function netChanges(events) {
  const net = new Map();
  for (const ev of events) {
    for (const c of ev.changes || []) {
      const prev = net.get(c.field);
      net.set(c.field, { ...c, from: prev ? prev.from : c.from });
    }
  }
  for (const [field, c] of net) {
    if (c.kind !== 'text' && round2(c.from) === round2(c.to)) net.delete(field);
    else if (c.kind === 'text' && String(c.from) === String(c.to)) net.delete(field);
  }
  return net;
}

const sumDelta = (net, fields) => round2(fields.reduce((s, f) => {
  const c = net.get(f);
  return s + (c ? (Number(c.to) || 0) - (Number(c.from) || 0) : 0);
}, 0));

// Stretches of activity, and the gaps between them.
function workingTime(times) {
  if (!times.length) return null;
  const sorted = [...times].sort((a, b) => a - b);
  const gaps = [];
  let active = LEAD_IN_MS;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > IDLE_GAP_MS) {
      gaps.push({ from: new Date(sorted[i - 1]), to: new Date(sorted[i]), ms: gap });
      active += LEAD_IN_MS;
    } else {
      active += gap;
    }
  }
  return {
    first: new Date(sorted[0]),
    last: new Date(sorted[sorted.length - 1]),
    spanMs: sorted[sorted.length - 1] - sorted[0],
    activeMs: active,
    gaps,
  };
}

/**
 * Everything one person did on one IST day. Every figure is present, at zero
 * when nothing was done, so the report never silently drops a line.
 */
async function collectPersonDay(user, dateStr) {
  const [start, end] = istDay(dateStr);
  const events = await ActivityEvent.find({ userEmail: user.email, at: { $gte: start, $lt: end } })
    .sort({ at: 1 }).lean();

  // Entry work, grouped by client-month.
  const months = new Map();
  for (const ev of events) {
    if (!ev.action.startsWith('entry.')) continue;
    const key = `${ev.clientId}|${ev.month}|${ev.year}`;
    if (!months.has(key)) {
      months.set(key, { clientId: ev.clientId, clientName: ev.clientName, month: ev.month, year: ev.year, events: [] });
    }
    months.get(key).events.push(ev);
  }

  const revenue = [];
  const money = [];
  const other = [];
  const verified = [];
  const deleted = [];
  let created = 0;

  for (const m of months.values()) {
    const net = netChanges(m.events);
    const last = m.events[m.events.length - 1];
    const label = monthLabel(m.month, m.year);
    const base = { clientId: m.clientId, clientName: m.clientName, month: m.month, year: m.year, label };
    if (m.events.some((e) => e.action === 'entry.created')) created += 1;

    if (last.action === 'entry.deleted') {
      deleted.push(base);
      continue;
    }

    // Revenue: any society amount or its receipt lines.
    const societies = new Map();
    for (const [field, c] of net) {
      const society = SOCIETY_AMOUNT.get(field) || SOCIETY_LINES[field];
      if (!society) continue;
      const amountField = SOCIETY_FIELDS[society].amount;
      const a = net.get(amountField);
      societies.set(society, {
        society,
        from: a ? round2(a.from) : null,
        to: a ? round2(a.to) : null,
        delta: a ? round2(a.to - a.from) : 0,
        receivedOn: (net.get(`${society}.receivedDate`) || {}).to || '',
      });
    }
    if (societies.size) {
      revenue.push({ ...base, societies: SOCIETIES.filter((s) => societies.has(s)).map((s) => societies.get(s)) });
    }

    const received = sumDelta(net, RECEIPT_FIELDS);
    const tds = sumDelta(net, TDS_FIELDS);
    const gst = sumDelta(net, GST_FIELDS);
    const hasReceipt = RECEIPT_FIELDS.some((f) => net.has(f));
    const hasTds = TDS_FIELDS.some((f) => net.has(f));
    const hasGst = GST_FIELDS.some((f) => net.has(f));
    if (hasReceipt || hasTds || hasGst) {
      money.push({ ...base, received, tds, gst, hasReceipt, hasTds, hasGst });
    }

    for (const [field, label2] of Object.entries(OTHER_ENTRY_FIELDS)) {
      const c = net.get(field);
      if (c) other.push({ ...base, what: label2, from: c.from, to: c.to, kind: c.kind });
    }

    // Submit Entry is the check: it locks the month and opens the mail wizard.
    const submits = m.events.filter((e) => e.meta && e.meta.status === 'submitted' && e.action !== 'entry.deleted');
    if (submits.length) verified.push({ ...base, at: submits[submits.length - 1].at });
  }

  // Mails sent to clients.
  const mails = events.filter((e) => e.action === 'mail.sent' || e.action === 'mail.failed');
  const sentByMonth = new Map();
  const testMails = [];
  const failedMails = [];
  for (const e of mails) {
    const meta = e.meta || {};
    const row = { clientId: e.clientId, clientName: e.clientName, month: e.month, year: e.year, label: monthLabel(e.month, e.year), at: e.at, to: meta.to || '', type: meta.mailType || '' };
    if (e.action === 'mail.failed') failedMails.push({ ...row, error: meta.error || '' });
    else if (meta.isTest) testMails.push(row);
    else sentByMonth.set(`${e.clientId}|${e.month}|${e.year}`, row);
  }
  const emailed = [...sentByMonth.values()];
  for (const v of verified) {
    const mail = sentByMonth.get(`${v.clientId}|${v.month}|${v.year}`);
    v.mailedAt = mail ? mail.at : null;
    v.mailedTo = mail ? mail.to : '';
  }

  // Client master changes.
  const clientEdits = new Map();
  for (const e of events) {
    if (!e.action.startsWith('client.') || e.action === 'client.viewed') continue;
    const row = clientEdits.get(e.clientId) || { clientId: e.clientId, clientName: e.clientName, fields: new Set(), actions: new Set() };
    row.actions.add(e.action.split('.')[1]);
    for (const c of e.changes || []) row.fields.add(c.label);
    clientEdits.set(e.clientId, row);
  }

  // The months as they stand now, for every month saved today and not deleted.
  const savedKeys = [...months.values()].filter((m) => m.events[m.events.length - 1].action !== 'entry.deleted');
  const savedEntries = savedKeys.length
    ? await RoyaltyAccounting.find({ $or: savedKeys.map((m) => ({ clientId: m.clientId, month: m.month, year: m.year })) }).lean()
    : [];
  const stillDraft = savedEntries.filter((e) => e.status === 'draft');

  const clientsTouched = new Set([
    ...[...months.values()].map((m) => m.clientId),
    ...clientEdits.keys(),
    ...emailed.map((e) => e.clientId),
  ]);

  // Society by society, every month saved today: entered with revenue, or
  // entered as 0. A month counts for a society the client is signed to, or
  // one it has an amount for.
  const signed = new Map((await Client.find({ clientId: { $in: [...new Set(savedEntries.map((e) => e.clientId))] } })
    .select('clientId societies').lean()).map((c) => [c.clientId, new Set(c.societies || [])]));
  const bySociety = SOCIETIES.map((society) => {
    const field = SOCIETY_FIELDS[society].amount;
    const rows = savedEntries.filter((e) => (signed.get(e.clientId) || new Set()).has(society) || round2(e[field]) !== 0);
    const zero = rows.filter((e) => round2(e[field]) === 0);
    return {
      society,
      entries: rows.length,
      withRevenue: rows.length - zero.length,
      zero: zero.length,
      clients: new Set(rows.map((e) => e.clientId)).size,
    };
  });

  const sortRows = (rows) => rows.sort((a, b) => (a.clientName || '').localeCompare(b.clientName || '') || calOrder(a) - calOrder(b));

  return {
    user: { name: user.name, email: user.email },
    date: dateStr,
    events: events.length,
    time: workingTime(events.map((e) => new Date(e.at).getTime())),
    clientsTouched: clientsTouched.size,
    created,
    revenue: sortRows(revenue),
    savedMonths: savedEntries.length,
    revenueMonths: [...new Set([...revenue].sort((a, b) => calOrder(b) - calOrder(a)).map((r) => r.label))],
    bySociety,
    money: sortRows(money),
    // A receipt taken off (moved or reversed) is a correction, not a payment;
    // a change of a rupee or two is a rounding fix, neither.
    payments: money.filter((m) => m.hasReceipt && m.received >= ROUNDING_FIX),
    reversals: money.filter((m) => m.hasReceipt && m.received <= -ROUNDING_FIX),
    tdsRows: money.filter((m) => m.hasTds),
    gstRows: money.filter((m) => m.hasGst),
    verified: sortRows(verified),
    emailed: sortRows(emailed),
    testMails,
    failedMails,
    other: sortRows(other),
    clientEdits: [...clientEdits.values()].map((c) => ({ ...c, fields: [...c.fields], actions: [...c.actions] })),
    stillDraft: sortRows(stillDraft.map((e) => ({ ...e, label: monthLabel(e.month, e.year) }))),
    deleted,
  };
}

// The people whose day is reported: everyone who is not an admin, or the
// names / emails given.
async function teamMembers(only) {
  const users = await User.find({}).select('name email role').lean();
  if (only && only.length) {
    const want = only.map((s) => s.toLowerCase());
    return users.filter((u) => want.includes((u.name || '').toLowerCase()) || want.includes((u.email || '').toLowerCase()));
  }
  return users.filter((u) => u.role !== 'admin');
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const inr = (n) => `&#8377;${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Math.abs(n || 0))}`;
const signedInr = (n) => (n < 0 ? `&minus;${inr(n)}` : inr(n));
const value = (v, kind) => (kind === 'percent' ? `${round2(v)}%` : kind === 'money' ? signedInr(Number(v) || 0) : esc(v));

const clock = (d) => new Date(d).toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?(am|pm)/i, (m) => ` ${m.trim().toLowerCase()}`);
const hm = (ms) => {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const C = {
  ink: '#1e2430', navy: '#1F3864', blue: '#2E6DA4', green: '#1F6B24', amber: '#B0611A', red: '#B01414',
  muted: '#8a93a3', soft: '#5a6474', line: '#e3e8f0', row: '#eef1f6', zebra: '#fafbfd', head: '#f4f7fc',
};

const th = (label, align = 'left') => `<th style="padding:8px 10px;text-align:${align};font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:${C.soft};background:${C.head};border-bottom:1px solid ${C.line};white-space:nowrap;">${label}</th>`;
const td = (html, extra = '') => `<td style="padding:8px 10px;border-bottom:1px solid ${C.row};font-size:12.5px;color:#374151;vertical-align:top;${extra}">${html}</td>`;
const clientCell = (r) => td(`<div style="font-weight:600;color:${C.navy};">${esc(r.clientName || r.clientId)}</div><div style="font-family:ui-monospace,Consolas,monospace;font-size:11px;color:${C.blue};margin-top:1px;">${esc(r.clientId)}</div>`);
const table = (head, rows) => `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid ${C.line};border-radius:8px;overflow:hidden;">${head}${rows}</table>`;
const empty = (text) => `<div style="font-size:12px;color:${C.muted};padding:11px 13px;border:1px dashed #dbe2ec;border-radius:8px;background:${C.zebra};">${text}</div>`;

function section(num, title, sub, body) {
  return `
  <tr><td style="padding:22px 26px 0;">
    <div style="font-size:13.5px;font-weight:700;color:${C.navy};"><span style="display:inline-block;min-width:20px;color:${C.muted};font-weight:600;">${num}</span>${title}</div>
    ${sub ? `<div style="font-size:11.5px;color:${C.muted};margin:2px 0 0 20px;">${sub}</div>` : ''}
    <div style="margin-top:10px;">${body}</div>
  </td></tr>`;
}

// One scorecard row: label, count, and a short note. Zero shows as a grey 0.
function scoreRow(n, label, count, note, i) {
  const isNull = count === null;
  const color = isNull ? C.amber : count > 0 ? C.navy : '#b4bcc8';
  return `<tr style="background:${i % 2 ? C.zebra : '#fff'};">
    ${td(`<span style="color:${C.muted};">${n}</span>`, 'width:22px;')}
    ${td(esc(label), 'font-weight:600;color:#374151;')}
    ${td(isNull ? 'Not recorded' : String(count), `text-align:right;font-size:16px;font-weight:700;color:${color};white-space:nowrap;${isNull ? 'font-size:12px;' : ''}`)}
    ${td(note || '', `font-size:11.5px;color:${C.muted};`)}
  </tr>`;
}

function buildTeamReportHtml(d, { isTest = false } = {}) {
  const dayLong = new Date(`${d.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const noWork = d.events === 0;
  const t = d.time;

  const testBanner = isTest ? `
    <tr><td style="background:#fef3c7;padding:10px 26px;color:#92400e;font-size:12px;font-weight:600;border-bottom:1px solid #fde68a;">
      TEST EMAIL &mdash; sent only to the test recipient
    </td></tr>` : '';

  const notMailed = d.verified.filter((v) => !v.mailedAt).length;
  const mailNote = [
    d.testMails.length ? `+ ${plural(d.testMails.length, 'test mail')} not counted` : '',
    d.failedMails.length ? `<span style="color:${C.red};">${plural(d.failedMails.length, 'mail')} failed</span>` : '',
  ].filter(Boolean).join(' &middot; ');

  // ---- At a glance ------------------------------------------------------
  const revenueRows = [
    ['Revenue entries updated', d.revenue.length, d.revenue.length ? `across ${plural(new Set(d.revenue.map((r) => r.clientId)).size, 'client')}` : ''],
    ['Societies worked on', d.bySociety.filter((s) => s.entries).length, d.bySociety.filter((s) => s.entries).map((s) => `${s.society} ${s.entries}`).join(' &middot; ')],
    ['Revenue months', d.revenueMonths.length, esc(d.revenueMonths.join(', '))],
  ];
  const accountsRows = [
    ['Client payments received & updated', d.payments.length, d.reversals.length ? `<span style="color:${C.red};">+ ${plural(d.reversals.length, 'receipt')} reversed</span>` : ''],
    ['TDS entries updated', d.tdsRows.length, ''],
    ['GST entries updated', d.gstRows.length, ''],
    ['Bills checked & verified', d.verified.length, d.verified.length ? 'Submit Entry pressed' : ''],
    ['Verified bills emailed to clients', d.emailed.length, [notMailed ? `${notMailed} verified, not yet mailed` : '', mailNote].filter(Boolean).join(' &middot; ')],
  ];
  const glanceHead = (title) => `<tr><td colspan="4" style="padding:9px 10px;background:${C.navy};color:#fff;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;font-weight:700;">${title}</td></tr>`;
  const glance = table(
    glanceHead('Revenue')
      + revenueRows.map((r, i) => scoreRow(i + 1, r[0], r[1], r[2], i)).join('')
      + glanceHead('Accounts')
      + accountsRows.map((r, i) => scoreRow(i + 1, r[0], r[1], r[2], i)).join(''),
    '',
  );

  // ---- Society-wise -----------------------------------------------------
  const societyTable = table(
    `<tr>${th('Society')}${th('Entries', 'right')}${th('With revenue', 'right')}${th('Entered as 0', 'right')}${th('Clients', 'right')}</tr>`,
    d.bySociety.map((s, i) => {
      const dim = s.entries ? '' : 'color:#b4bcc8;';
      return `<tr style="background:${i % 2 ? C.zebra : '#fff'};">
        ${td(esc(s.society), `font-weight:600;${dim || `color:${C.navy};`}`)}
        ${td(String(s.entries), `text-align:right;font-weight:600;${dim}`)}
        ${td(String(s.withRevenue), `text-align:right;${dim || (s.withRevenue ? `color:${C.green};font-weight:600;` : 'color:#b4bcc8;')}`)}
        ${td(String(s.zero), `text-align:right;${dim || (s.zero ? `color:${C.amber};font-weight:600;` : 'color:#b4bcc8;')}`)}
        ${td(String(s.clients), `text-align:right;${dim}`)}
      </tr>`;
    }).join(''),
  );

  // ---- Revenue client by client ----------------------------------------
  const revenueTable = d.revenue.length ? table(
    `<tr>${th('Client / artist')}${th('Revenue month')}${th('Society')}${th('Before', 'right')}${th('Now', 'right')}</tr>`,
    d.revenue.map((r, i) => r.societies.map((s, j) => `<tr style="background:${i % 2 ? C.zebra : '#fff'};">
        ${j === 0 ? clientCell(r).replace('<td ', `<td rowspan="${r.societies.length}" `) : ''}
        ${j === 0 ? td(esc(r.label), `white-space:nowrap;font-weight:600;`).replace('<td ', `<td rowspan="${r.societies.length}" `) : ''}
        ${td(`${esc(s.society)}${s.receivedOn ? `<div style="font-size:10.5px;color:${C.muted};">received ${esc(s.receivedOn)}</div>` : ''}`)}
        ${td(s.from === null ? '<span style="color:#b4bcc8;">lines only</span>' : signedInr(s.from), `text-align:right;white-space:nowrap;color:${C.muted};`)}
        ${td(s.to === null ? '' : signedInr(s.to), `text-align:right;white-space:nowrap;font-weight:600;color:${C.navy};`)}
      </tr>`).join('')).join(''),
  ) : empty('No revenue entered on this day.');

  // ---- Payments, TDS, GST ----------------------------------------------
  const cellAmt = (has, n) => (has ? signedInr(n) : '<span style="color:#cfd5de;">&ndash;</span>');
  const moneyTable = d.money.length ? table(
    `<tr>${th('Client / artist')}${th('Month')}${th('Received', 'right')}${th('TDS', 'right')}${th('GST invoiced', 'right')}</tr>`,
    d.money.map((r, i) => `<tr style="background:${i % 2 ? C.zebra : '#fff'};">
      ${clientCell(r)}${td(esc(r.label), 'white-space:nowrap;')}
      ${td(cellAmt(r.hasReceipt, r.received) + (r.received < 0 ? `<div style="font-size:10.5px;color:${C.red};">reversed</div>` : ''), `text-align:right;white-space:nowrap;font-weight:600;color:${r.received < 0 ? C.red : C.green};`)}
      ${td(cellAmt(r.hasTds, r.tds), 'text-align:right;white-space:nowrap;')}
      ${td(cellAmt(r.hasGst, r.gst), 'text-align:right;white-space:nowrap;')}
    </tr>`).join(''),
  ) : empty('No payments, TDS or GST entered on this day.');

  // ---- Bills verified & mailed -----------------------------------------
  const mailedOnly = d.emailed.filter((m) => !d.verified.some((v) => v.clientId === m.clientId && v.month === m.month && v.year === m.year));
  const billRows = [
    ...d.verified.map((v) => ({ ...v, verifiedAt: v.at })),
    ...mailedOnly.map((m) => ({ ...m, verifiedAt: null, mailedAt: m.at, mailedTo: m.to })),
  ];
  const billsTable = billRows.length ? table(
    `<tr>${th('Client / artist')}${th('Bill month')}${th('Verified')}${th('Emailed')}</tr>`,
    billRows.map((b, i) => `<tr style="background:${i % 2 ? C.zebra : '#fff'};">
      ${clientCell(b)}${td(esc(b.label), 'white-space:nowrap;')}
      ${td(b.verifiedAt ? `<span style="color:${C.green};font-weight:600;">&#10003;</span> ${clock(b.verifiedAt)}` : '<span style="color:#b4bcc8;">earlier</span>', 'white-space:nowrap;')}
      ${td(b.mailedAt ? `<span style="color:${C.green};font-weight:600;">&#10003;</span> ${clock(b.mailedAt)}<div style="font-size:10.5px;color:${C.muted};">${esc(b.mailedTo)}</div>` : `<span style="color:${C.amber};font-weight:600;">Not mailed</span>`)}
    </tr>`).join(''),
  ) : empty('No bills were verified or emailed on this day.');

  // ---- Other changes ----------------------------------------------------
  const otherRows = [
    ...d.other.map((o) => ({ client: o, what: `${esc(o.what)} &middot; ${esc(o.label)}`, detail: `${value(o.from, o.kind)} &rarr; <strong>${value(o.to, o.kind)}</strong>` })),
    ...d.clientEdits.map((c) => ({ client: c, what: c.actions.includes('created') ? 'New client added' : 'Client details', detail: esc(c.fields.join(', ') || c.actions.join(', ')) })),
    ...d.deleted.map((x) => ({ client: x, what: `Month deleted &middot; ${esc(x.label)}`, detail: '' })),
  ];
  const otherBlock = otherRows.length ? table(
    `<tr>${th('Client / artist')}${th('What')}${th('Change')}</tr>`,
    otherRows.map((o, i) => `<tr style="background:${i % 2 ? C.zebra : '#fff'};">${clientCell(o.client)}${td(o.what)}${td(o.detail, 'font-size:12px;')}</tr>`).join(''),
  ) : empty('No other changes.');

  const draftBlock = d.stillDraft.length ? `
    <div style="margin-top:10px;padding:10px 13px;border:1px solid #f3d9b5;background:#fff8ef;border-radius:8px;font-size:12px;color:${C.amber};">
      <strong>Left in draft (${d.stillDraft.length}):</strong> ${d.stillDraft.map((x) => `${esc(x.clientName)} ${esc(x.label)}`).join(', ')}
    </div>` : '';

  // ---- Time -------------------------------------------------------------
  const timeBlock = t ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        ${[['First activity', clock(t.first), C.navy], ['Last activity', clock(t.last), C.navy], ['Working time', hm(t.activeMs), C.green], ['No activity', hm(Math.max(0, t.spanMs + LEAD_IN_MS - t.activeMs)), t.gaps.length ? C.amber : C.muted]]
    .map(([l, v, col]) => `<td style="padding:0 6px 0 0;width:25%;vertical-align:top;"><div style="border:1px solid ${C.line};border-top:3px solid ${col};border-radius:8px;padding:9px 11px;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${C.muted};">${l}</div><div style="font-size:15px;font-weight:700;color:${col};margin-top:2px;white-space:nowrap;">${v}</div></div></td>`).join('')}
      </tr>
    </table>
    ${t.gaps.length ? `<div style="margin-top:10px;font-size:12px;color:${C.soft};line-height:1.7;">
      Gaps of over 30 minutes with nothing saved or opened:<br>
      ${t.gaps.map((g) => `<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;border-radius:5px;background:#fff8ef;border:1px solid #f3d9b5;color:${C.amber};white-space:nowrap;">${clock(g.from)} &ndash; ${clock(g.to)} &middot; ${hm(g.ms)}</span>`).join('')}
    </div>` : `<div style="margin-top:10px;font-size:12px;color:${C.green};">No gap longer than 30 minutes.</div>`}`
    : empty('Nothing was saved, opened or sent on this day.');

  const zeroBanner = noWork ? `
  <tr><td style="padding:18px 26px 0;">
    <div style="padding:12px 14px;border-radius:8px;background:#fdecec;border:1px solid #f5c2c2;color:${C.red};font-size:13px;font-weight:600;">
      No work recorded on this day. Every figure below is zero.
    </div>
  </td></tr>` : '';

  const headline = noWork ? 'No work recorded' : [
    plural(d.clientsTouched, 'client'),
    plural(d.revenue.length, 'revenue entry', 'revenue entries'),
    plural(d.payments.length, 'payment'),
    `${d.verified.length} verified`,
    `${d.emailed.length} mailed`,
  ].join(' &middot; ');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:${C.ink};">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#eef1f6;padding:24px 10px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.09),0 10px 32px rgba(16,24,40,.06);">
  ${testBanner}
  <tr><td style="padding:24px 26px 18px;border-bottom:1px solid #e6eaf0;">
    <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${C.muted};font-weight:600;">Music Rights Management &middot; Daily work report</div>
    <div style="font-size:22px;font-weight:700;color:${C.navy};margin-top:3px;letter-spacing:-.3px;">${esc(d.user.name)}</div>
    <div style="font-size:12.5px;color:${C.soft};margin-top:3px;">${esc(dayLong)} &middot; ${esc(d.user.email)}</div>
    <div style="font-size:13px;color:${noWork ? C.red : C.navy};margin-top:10px;font-weight:600;">${headline}</div>
  </td></tr>
  ${zeroBanner}

  ${section('', 'At a glance', 'Each count is client-months: several saves of one client’s month on the same day count once.', glance)}
  ${section('', 'Entries by society', `IPRS, PRS and every other society, over the ${plural(d.savedMonths, 'client-month')} saved today. Entered as 0 = saved with no revenue for that society.`, societyTable)}
  <tr><td style="padding:22px 26px 22px;font-size:11px;color:${C.muted};line-height:1.6;">
    Built from the app&rsquo;s activity log for ${esc(d.date)} (IST).
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function teamReportSubject(d, { isTest = false } = {}) {
  const day = new Date(`${d.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
  const sum = d.events === 0
    ? 'no work recorded'
    : `${d.revenue.length} revenue, ${d.payments.length} payments, ${d.verified.length} verified, ${d.emailed.length} mailed`;
  return `${isTest ? '[TEST] ' : ''}Daily work report - ${d.user.name} - ${day} (${sum})`;
}

// ---------------------------------------------------------------------------
// Weekly tracker: the whole team, Monday to Sunday
// ---------------------------------------------------------------------------
//
// Every weekly figure is the sum of the daily reports, so a manager can add
// the daily mails up and land on the same number. Days before the activity
// log existed are "not tracked", never zero.

const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Monday of the week holding dateStr.
const weekStartOf = (dateStr) => addDays(dateStr, -((new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7));
const isSunday = (dateStr) => new Date(`${dateStr}T12:00:00Z`).getUTCDay() === 0;

async function trackingStart() {
  const first = await ActivityEvent.findOne({}).sort({ at: 1 }).select('at').lean();
  return first ? new Date(first.at) : null;
}

const sumOver = (get) => (days) => days.reduce((s, d) => s + get(d), 0);
const WEEK_METRICS = [
  { group: 'Revenue', label: 'Revenue entries updated', week: sumOver((d) => d.revenue.length) },
  { group: 'Revenue', label: 'Societies worked on', week: (days) => new Set(days.flatMap((d) => d.bySociety.filter((x) => x.entries).map((x) => x.society))).size },
  { group: 'Revenue', label: 'Revenue months', week: (days) => new Set(days.flatMap((d) => d.revenueMonths)).size },
  { group: 'Accounts', label: 'Client payments received & updated', week: sumOver((d) => d.payments.length) },
  { group: 'Accounts', label: 'TDS entries updated', week: sumOver((d) => d.tdsRows.length) },
  { group: 'Accounts', label: 'GST entries updated', week: sumOver((d) => d.gstRows.length) },
  { group: 'Accounts', label: 'Bills checked & verified', week: sumOver((d) => d.verified.length) },
  { group: 'Accounts', label: 'Verified bills emailed to clients', week: sumOver((d) => d.emailed.length) },
  { group: 'Attendance', label: 'Days with work recorded', week: (days) => new Set(days.filter((d) => d.events > 0).map((d) => d.date)).size },
];

/**
 * One Monday-to-Sunday week for the given people. Each day is 'tracked'
 * (with the daily figures), 'untracked' (before the activity log began) or
 * 'future' (not over yet: today counts as tracked, so far).
 */
async function collectWeek(users, weekStart, now = new Date()) {
  const start = await trackingStart();
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = todayIst(now);
  const people = [];
  for (const user of users) {
    const days = [];
    for (const date of dates) {
      const [dayStart] = istDay(date);
      if (date > today) days.push({ date, status: 'future' });
      else if (!start || dayStart < start) days.push({ date, status: 'untracked' });
      else days.push({ date, status: 'tracked', d: await collectPersonDay(user, date) });
    }
    people.push({ user: { name: user.name, email: user.email }, days });
  }
  const tracked = (p) => p.days.filter((x) => x.status === 'tracked').map((x) => x.d);
  const values = (days) => WEEK_METRICS.map((m) => m.week(days));
  // Working days the log could have seen so far: tracked, not Sunday.
  const workingDays = dates.filter((date) => !isSunday(date) && people.every((p) => p.days.find((x) => x.date === date).status === 'tracked')).length;
  return {
    weekStart,
    weekEnd: dates[6],
    workingDays,
    dates,
    trackingFrom: start,
    complete: dates[6] < today,
    untracked: dates.filter((date) => people.some((p) => p.days.find((x) => x.date === date).status === 'untracked')),
    people: people.map((p) => ({ ...p, values: values(tracked(p)) })),
    team: values(people.flatMap(tracked)),
    societies: SOCIETIES.map((society) => ({
      society,
      people: people.map((p) => tracked(p).reduce((acc, d) => {
        const x = d.bySociety.find((b) => b.society === society);
        return { entries: acc.entries + x.entries, zero: acc.zero + x.zero };
      }, { entries: 0, zero: 0 })),
    })),
  };
}

const shortDay = (date, opts) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: TZ, ...opts });
const weekRange = (w) => `${shortDay(w.weekStart, { day: 'numeric', month: 'short' })} &ndash; ${shortDay(w.weekEnd, { day: 'numeric', month: 'short', year: 'numeric' })}`;

function buildWeeklyReportHtml(w, prev, { isTest = false, now = new Date() } = {}) {
  const testBanner = isTest ? `
    <tr><td style="background:#fef3c7;padding:10px 26px;color:#92400e;font-size:12px;font-weight:600;border-bottom:1px solid #fde68a;">
      TEST EMAIL &mdash; sent only to the test recipient
    </td></tr>` : '';
  const names = w.people.map((p) => p.user.name);
  const num = (n, strong) => `<span style="font-size:${strong ? 15 : 14}px;font-weight:700;color:${n > 0 ? C.navy : '#b4bcc8'};">${n}</span>`;

  // vs last week, team column only, and only when last week was fully tracked.
  const delta = (i) => {
    if (!prev || prev.untracked.length) return `<span style="color:#b4bcc8;">&ndash;</span>`;
    const diff = w.team[i] - prev.team[i];
    if (!diff) return `<span style="color:${C.muted};">same</span>`;
    return `<span style="color:${diff > 0 ? C.green : C.red};font-weight:600;">${diff > 0 ? '&#9650;' : '&#9660;'} ${Math.abs(diff)}</span>`;
  };

  // ---- Week at a glance -------------------------------------------------
  let lastGroup = '';
  const glanceRows = WEEK_METRICS.map((m, i) => {
    const head = m.group !== lastGroup
      ? `<tr><td colspan="${names.length + 3}" style="padding:9px 10px;background:${C.navy};color:#fff;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;font-weight:700;">${m.group}</td></tr>`
      : '';
    lastGroup = m.group;
    const isDays = m.group === 'Attendance';
    const cell = (n) => (isDays ? `${num(n)}<span style="font-size:11px;color:${C.muted};"> / ${w.workingDays}</span>` : num(n));
    return `${head}<tr style="background:${i % 2 ? C.zebra : '#fff'};">
      ${td(esc(m.label), 'font-weight:600;')}
      ${w.people.map((p) => td(cell(p.values[i]), 'text-align:right;white-space:nowrap;')).join('')}
      ${td(isDays ? '' : num(w.team[i], true), `text-align:right;background:${C.head};`)}
      ${td(isDays ? '' : delta(i), 'text-align:right;white-space:nowrap;font-size:11.5px;')}
    </tr>`;
  }).join('');
  const glance = table(
    `<tr>${th('')}${names.map((n) => th(esc(n), 'right')).join('')}${th('Team', 'right')}${th('vs last week', 'right')}</tr>`,
    glanceRows,
  );

  // ---- Day by day -------------------------------------------------------
  const DAY_COLS = [
    ['Revenue', (d) => d.revenue.length],
    ['Payments', (d) => d.payments.length],
    ['TDS', (d) => d.tdsRows.length],
    ['GST', (d) => d.gstRows.length],
    ['Verified', (d) => d.verified.length],
    ['Emailed', (d) => d.emailed.length],
  ];
  const span = DAY_COLS.length;
  const today = todayIst(now);
  const dayBlocks = w.people.map((p) => {
    const rows = p.days.filter((x) => x.status !== 'future').map((x, i) => {
      const label = `${shortDay(x.date, { weekday: 'short' })} ${shortDay(x.date, { day: 'numeric', month: 'short' })}${x.date === today ? ' <span style="font-size:10.5px;color:' + C.muted + ';">(so far)</span>' : ''}`;
      const bg = i % 2 ? C.zebra : '#fff';
      if (x.status === 'untracked') {
        return `<tr style="background:${bg};">${td(label, 'white-space:nowrap;color:#b4bcc8;')}<td colspan="${span}" style="padding:8px 10px;border-bottom:1px solid ${C.row};font-size:11.5px;color:#b4bcc8;font-style:italic;">Not tracked &ndash; the activity log started on ${esc(shortDay(todayIst(w.trackingFrom), { day: 'numeric', month: 'short' }))}</td></tr>`;
      }
      if (x.d.events === 0) {
        const off = isSunday(x.date);
        return `<tr style="background:${off ? bg : '#fdf2f2'};">${td(label, `white-space:nowrap;${off ? 'color:#b4bcc8;' : `color:${C.red};font-weight:600;`}`)}<td colspan="${span}" style="padding:8px 10px;border-bottom:1px solid ${C.row};font-size:12px;${off ? 'color:#b4bcc8;' : `color:${C.red};font-weight:600;`}">${off ? 'Sunday &ndash; no work' : 'No work recorded &ndash; every figure 0'}</td></tr>`;
      }
      return `<tr style="background:${bg};">${td(label, 'white-space:nowrap;font-weight:600;')}${DAY_COLS.map(([, get]) => td(num(get(x.d)), 'text-align:right;')).join('')}</tr>`;
    }).join('');
    return `<div style="margin:0 0 6px;font-size:12.5px;font-weight:700;color:${C.navy};">${esc(p.user.name)}</div>
      ${table(`<tr>${th('Day')}${DAY_COLS.map(([l]) => th(l, 'right')).join('')}</tr>`, rows)}<div style="height:16px;"></div>`;
  }).join('');

  // ---- Society ----------------------------------------------------------
  const socCell = (x) => (x.entries
    ? `${num(x.entries)}${x.zero ? `<div style="font-size:10.5px;color:${C.amber};">${x.zero} at 0</div>` : ''}`
    : '<span style="color:#cfd5de;">0</span>');
  const societyTable = table(
    `<tr>${th('Society')}${names.map((n) => th(esc(n), 'right')).join('')}${th('Team', 'right')}</tr>`,
    w.societies.map((s, i) => {
      const team = s.people.reduce((a, x) => ({ entries: a.entries + x.entries, zero: a.zero + x.zero }), { entries: 0, zero: 0 });
      const dim = team.entries ? `color:${C.navy};` : 'color:#b4bcc8;';
      return `<tr style="background:${i % 2 ? C.zebra : '#fff'};">
        ${td(esc(s.society), `font-weight:600;${dim}`)}
        ${s.people.map((x) => td(socCell(x), 'text-align:right;')).join('')}
        ${td(socCell(team), `text-align:right;background:${C.head};`)}
      </tr>`;
    }).join(''),
  );

  const noteUntracked = w.untracked.length
    ? `<tr><td style="padding:16px 26px 0;"><div style="padding:10px 13px;border-radius:8px;background:${C.zebra};border:1px dashed #dbe2ec;font-size:12px;color:${C.soft};">
        ${plural(w.untracked.length, 'day')} of this week ${w.untracked.length === 1 ? 'is' : 'are'} before the activity log started, so ${w.untracked.length === 1 ? 'it is' : 'they are'} shown as not tracked rather than zero.
      </div></td></tr>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:${C.ink};">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#eef1f6;padding:24px 10px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.09),0 10px 32px rgba(16,24,40,.06);">
  ${testBanner}
  <tr><td style="padding:24px 26px 18px;border-bottom:1px solid #e6eaf0;">
    <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${C.muted};font-weight:600;">Music Rights Management &middot; Weekly work tracker</div>
    <div style="font-size:22px;font-weight:700;color:${C.navy};margin-top:3px;letter-spacing:-.3px;">Team week ${weekRange(w)}</div>
    <div style="font-size:12.5px;color:${C.soft};margin-top:3px;">${w.complete ? 'Monday to Sunday' : `Week so far, up to ${esc(shortDay(today, { weekday: 'long', day: 'numeric', month: 'short' }))}`} &middot; ${esc(names.join(', '))}</div>
  </td></tr>
  ${noteUntracked}
  ${section('', 'Week at a glance', 'Each figure is the sum of that person&rsquo;s daily reports for the week.', glance)}
  ${section('', 'Day by day', 'A red row is a working day with nothing saved, opened or sent.', dayBlocks)}
  ${section('', 'Entries by society', 'Client-months saved during the week; &ldquo;at 0&rdquo; = saved with no revenue for that society.', societyTable)}
  <tr><td style="padding:22px 26px 22px;font-size:11px;color:${C.muted};line-height:1.6;">
    Built from the app&rsquo;s activity log (IST).
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function weeklyReportSubject(w, { isTest = false } = {}) {
  const range = weekRange(w).replace('&ndash;', '-');
  const per = w.people.map((p) => `${p.user.name} ${p.values[0]} revenue / ${p.values[6]} verified`).join(', ');
  return `${isTest ? '[TEST] ' : ''}Weekly work tracker - ${range}${w.complete ? '' : ' (so far)'} (${per})`;
}

module.exports = {
  collectPersonDay,
  teamMembers,
  buildTeamReportHtml,
  teamReportSubject,
  collectWeek,
  buildWeeklyReportHtml,
  weeklyReportSubject,
  weekStartOf,
  addDays,
  isSunday,
  todayIst,
};
