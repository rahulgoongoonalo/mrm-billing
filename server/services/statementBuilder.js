// Shared logic for the per-client outstanding statement pages linked from the
// daily email. Builds the "how this balance was arrived at" line items for a
// client, either over a trimmed window or the complete record.

const crypto = require('crypto');
const { SOCIETIES, SOCIETY_FIELDS } = require('../utils/clientProfile');

const calMonthIdx = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const monthShort = {
  apr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', aug: 'Aug', sep: 'Sep',
  oct: 'Oct', nov: 'Nov', dec: 'Dec', jan: 'Jan', feb: 'Feb', mar: 'Mar',
};
const monthLong = {
  apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September',
  oct: 'October', nov: 'November', dec: 'December', jan: 'January', feb: 'February', mar: 'March',
};

// Absolute calendar ordering, so a client's history sorts correctly across fiscal years.
const calOrder = (e) => (e.year || 0) * 12 + (calMonthIdx[e.month] ?? -1);

const n = (e, k) => e[k] || 0;
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// A balance under one rupee is treated as settled; sub-rupee residues are
// rounding noise left behind when a client pays a whole-rupee amount.
const SETTLED = 1.0;

const shortLabel = (e) => `${monthShort[e.month]} ${String(e.year).slice(2)}`;
const longLabel = (e) => `${monthLong[e.month]} ${e.year}`;

/**
 * Choose how far back a statement should start.
 *
 *  - latest month already settled            -> the last 12 months
 *  - balance was cleared at some earlier point -> that month onwards
 *  - otherwise                                -> one month before the second-latest
 *                                                payment, walking back past any run
 *                                                of consecutive payment months
 */
function pickWindow(rows) {
  const last = rows.length - 1;
  const bal = (i) => n(rows[i], 'totalOutstanding');
  const isPaid = (i) => (n(rows[i], 'currentMonthReceipt') + n(rows[i], 'previousMonthReceipt')) > 0;

  const paid = [];
  for (let i = 0; i < rows.length; i++) if (isPaid(i)) paid.push(i);
  const paidSet = new Set(paid);

  if (Math.abs(bal(last)) < SETTLED) {
    return { start: Math.max(0, last - 11), why: 'the latest month is settled, so the last 12 months are shown' };
  }

  const cleared = [];
  for (let i = 0; i < last; i++) {
    if (Math.abs(bal(i)) >= SETTLED) continue;
    let hadActivity = false;
    for (let j = 0; j < i; j++) if (Math.abs(bal(j)) >= SETTLED) { hadActivity = true; break; }
    if (hadActivity) cleared.push(i);
  }
  if (cleared.length) {
    const z = cleared[cleared.length - 1];
    return { start: z, why: `the balance was cleared in ${shortLabel(rows[z])}, so only that month and everything after it is shown` };
  }

  if (paid.length) {
    const anchor = paid.length >= 2 ? paid[paid.length - 2] : paid[paid.length - 1];
    let k = anchor;
    while (k - 1 >= 0 && paidSet.has(k - 1)) k--;      // step back over consecutive payment months
    const which = paid.length >= 2 ? 'second-latest' : 'only';
    const extra = k !== anchor ? ' (stepped back past consecutive payment months)' : '';
    return {
      start: Math.max(0, k - 1),
      why: `anchored one month before the ${which} payment, ${shortLabel(rows[anchor])}${extra}`,
    };
  }

  return { start: Math.max(0, last - 11), why: 'no payment has ever been recorded, so the last 12 months are shown' };
}

// Royalty received. These never move the balance - only the commission on them
// does - so they are reported in their own column, never as an Account line.
//
// Both lists are derived from the shared society map rather than written out, so
// a society added there cannot be silently left out of a statement. Leaving one
// out of COMMISSION_SPLIT would drop its commission from the running balance and
// the month would stop reconciling.
const ROYALTY_SPLIT = SOCIETIES.map((s) => [SOCIETY_FIELDS[s].amount, s]);
const COMMISSION_SPLIT = SOCIETIES.map((s) => [SOCIETY_FIELDS[s].commission, s]);

/**
 * Build the statement. `mode` is 'window' (trimmed) or 'full' (every month).
 * Adjustment entries are never listed, but they are still applied to the
 * running balance so each month's total matches what the app stores.
 */
function buildStatement(client, allRows, opts = 'window') {
  const o = typeof opts === 'string' ? { mode: opts } : (opts || {});
  const mode = o.mode || 'window';
  const rows = [...allRows].sort((a, b) => calOrder(a) - calOrder(b));
  if (!rows.length) return null;

  let start;
  let end = rows.length - 1;
  let why;

  if (mode === 'full') {
    start = 0;
    why = 'complete record — every month held for this client';
  } else if (mode === 'period' || mode === 'year') {
    const yr = parseInt(o.year, 10);
    const bounds = mode === 'year'
      ? { from: yr * 12 + 3, to: (yr + 1) * 12 + 2 }
      : { from: orderFromDate(o.from), to: orderFromDate(o.to) };
    if (bounds.from == null || bounds.to == null || Number.isNaN(bounds.from) || Number.isNaN(bounds.to)) return null;
    const lo = Math.min(bounds.from, bounds.to);
    const hi = Math.max(bounds.from, bounds.to);
    start = rows.findIndex((e) => calOrder(e) >= lo);
    end = -1;
    for (let i = rows.length - 1; i >= 0; i--) { if (calOrder(rows[i]) <= hi) { end = i; break; } }
    if (start === -1 || end < start) {
      return { empty: true, mode, clientId: client.clientId, clientName: client.name, clientType: client.type || '' };
    }
    why = mode === 'year'
      ? `financial year ${yr}-${yr + 1}`
      : 'the period you selected';
  } else {
    ({ start, why } = pickWindow(rows));
  }

  const openedFrom = start > 0 ? longLabel(rows[start - 1]) : null;
  // Open where the ledger itself opened. Every stored figure downstream was
  // derived from this entry's own carried-forward value, so using the client
  // master's previousBalance instead would disagree with it and show up as a
  // phantom "carry-forward correction" on the first line.
  let bal = n(rows[start], 'previousMonthOutstanding');
  const openingBalance = bal;

  const window = rows.slice(start, end + 1);
  const lines = [];
  let hiddenAdjustments = 0;

  let prevEntry = start > 0 ? rows[start - 1] : null;

  for (const e of window) {
    // Four ledger columns. fees, GST and payments move the balance; an
    // invoice's base does not - it is the service fee already counted in fees.
    const fees = [];
    const invoices = [];
    const payments = [];

    // A balance cannot be carried across months that are not held. Where the
    // record skips a month, the entry's own opening figure is the only truth
    // available, so it is adopted rather than reported as a discrepancy.
    const followsOn = prevEntry && calOrder(e) === calOrder(prevEntry) + 1;
    if (prevEntry && !followsOn) bal = n(e, 'previousMonthOutstanding');

    // A stale carried-forward figure shows up as its own line so the column still adds up.
    const drift = r2(n(e, 'previousMonthOutstanding') - bal);
    const adjustment = Math.abs(drift) > 0.005 ? drift : 0;

    for (const [key, label] of COMMISSION_SPLIT) {
      if (n(e, key)) fees.push({ amount: n(e, key), label });
    }

    const gstRate = n(e, 'gstRate') || 18;
    for (const [label, baseKey, gstKey] of [
      ['Current month invoice', 'currentMonthGstBase', 'currentMonthGst'],
      ['Earlier invoices', 'previousOutstandingGstBase', 'previousOutstandingGst'],
    ]) {
      const base = n(e, baseKey);
      const gst = n(e, gstKey);
      if (base || gst) invoices.push({ label, base, gst, gstRate, total: r2(base + gst) });
    }

    const receipts = n(e, 'currentMonthReceipt') + n(e, 'previousMonthReceipt');
    const tds = n(e, 'currentMonthTds') + n(e, 'previousMonthTds');
    if (receipts) payments.push({ amount: -receipts, label: 'Received' });
    if (tds) payments.push({ amount: -tds, label: 'TDS' });

    const moves = [{ amount: adjustment }, ...fees, ...invoices.map((i) => ({ amount: i.gst })), ...payments];
    for (const it of moves) bal = r2(bal + it.amount);

    // Applied to the balance but deliberately not listed.
    const extra = n(e, 'extraAmount');
    if (extra) { bal = r2(bal - extra); hiddenAdjustments++; }

    const royalty = ROYALTY_SPLIT
      .filter(([field]) => n(e, field))
      .map(([field, label]) => ({ label, amount: n(e, field) }));

    lines.push({
      month: shortLabel(e),
      monthLong: longLabel(e),
      royalty,
      royaltyTotal: r2(royalty.reduce((t, x) => t + x.amount, 0)),
      commission: n(e, 'totalCommission'),
      fees,
      feeTotal: r2(fees.reduce((t, f) => t + f.amount, 0)),
      adjustment,
      invoices,
      payments,
      gstTotal: r2(invoices.reduce((t, i) => t + i.gst, 0)),
      paidTotal: r2(payments.reduce((t, p) => t - p.amount, 0)),
      total: bal,
      stored: n(e, 'totalOutstanding'),
      reconciles: Math.abs(bal - n(e, 'totalOutstanding')) < 0.005,
    });
    prevEntry = e;
  }

  const royaltyTotal = r2(lines.reduce((t, l) => t + l.royaltyTotal, 0));
  // Per-society royalty over the whole statement, in the societies' usual order.
  const royaltyBySociety = ROYALTY_SPLIT
    .map(([, label]) => ({ label, amount: r2(lines.reduce((t, l) => t + (l.royalty.find((x) => x.label === label)?.amount || 0), 0)) }))
    .filter((x) => x.amount);
  const commissionTotal = r2(lines.reduce((t, l) => t + l.commission, 0));
  const feeTotal = r2(lines.reduce((t, l) => t + l.feeTotal, 0));
  const gstTotal = r2(lines.reduce((t, l) => t + l.gstTotal, 0));
  const paidTotal = r2(lines.reduce((t, l) => t + l.paidTotal, 0));

  return {
    clientId: client.clientId,
    clientName: client.name,
    clientType: client.type || '',
    gstId: client.gstId || '',
    email: client.email || '',
    phone: client.phone || '',
    paymentAccount: client.paymentAccount || '',
    commissionRate: client.commissionRate,
    gstRate: n(window[0], 'gstRate') || 18,
    mode,
    why,
    openingBalance,
    openedFrom,
    periodFrom: longLabel(window[0]),
    periodTo: longLabel(window[window.length - 1]),
    lines,
    royaltyTotal,
    royaltyBySociety,
    commissionTotal,
    feeTotal,
    gstTotal,
    paidTotal,
    closing: bal,
    hiddenAdjustments,
    monthsShown: window.length,
    monthsHeld: rows.length,
  };
}

function orderFromDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() * 12 + d.getMonth();
}

// Short HMAC so statement links are not enumerable by client id alone.
function statementToken(clientId) {
  const secret = process.env.JWT_SECRET || 'mrm-statement-fallback';
  return crypto.createHmac('sha256', secret).update(String(clientId)).digest('hex').slice(0, 16);
}

function verifyStatementToken(clientId, token) {
  const expected = statementToken(clientId);
  const a = Buffer.from(String(token || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Where the statement links in the daily email should point. SERVER_URL wins;
// otherwise a deployed server falls back to the live API host so the links in
// that email are never left pointing at localhost.
const PRODUCTION_SERVER_URL = 'https://billing-b.musicrightsmanagement.in';

function serverUrl() {
  if (process.env.SERVER_URL) return process.env.SERVER_URL.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') return PRODUCTION_SERVER_URL;
  return `http://localhost:${process.env.PORT || 5001}`;
}

const statementUrl = (clientId, mode) =>
  `${serverUrl()}/statements/${encodeURIComponent(clientId)}/${mode}?t=${statementToken(clientId)}`;

module.exports = {
  calOrder, shortLabel, longLabel, monthShort, monthLong,
  pickWindow, buildStatement, statementToken, verifyStatementToken, statementUrl, serverUrl,
  SETTLED, r2,
};
