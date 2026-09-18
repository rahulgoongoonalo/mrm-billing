// Shared logic for the per-client outstanding statement pages linked from the
// daily email. Builds the "how this balance was arrived at" line items for a
// client, either over a trimmed window or the complete record.

const crypto = require('crypto');

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

const COMMISSION_SPLIT = [
  ['iprsCommission', 'IPRS commission'],
  ['prsCommission', 'PRS commission'],
  ['soundExchangeCommission', 'Sound Exchange commission'],
  ['isamraCommission', 'ISAMRA commission'],
  ['ascapCommission', 'ASCAP commission'],
  ['pplCommission', 'PPL commission'],
  ['mlcCommission', 'MLC commission'],
];

/**
 * Build the statement. `mode` is 'window' (trimmed) or 'full' (every month).
 * Adjustment entries are never listed, but they are still applied to the
 * running balance so each month's total matches what the app stores.
 */
function buildStatement(client, allRows, mode = 'window') {
  const rows = [...allRows].sort((a, b) => calOrder(a) - calOrder(b));
  if (!rows.length) return null;

  const { start, why } = mode === 'full'
    ? { start: 0, why: 'complete record — every month held for this client' }
    : pickWindow(rows);

  const openedFrom = start > 0 ? longLabel(rows[start - 1]) : null;
  let bal = start > 0 ? n(rows[start], 'previousMonthOutstanding') : (client.previousBalance || 0);
  const openingBalance = bal;

  const window = rows.slice(start);
  const lines = [];
  let hiddenAdjustments = 0;

  for (const e of window) {
    const items = [];

    // A stale carried-forward figure shows up as its own line so the column still adds up.
    const drift = r2(n(e, 'previousMonthOutstanding') - bal);
    if (Math.abs(drift) > 0.005) items.push({ amount: drift, label: 'carry-forward correction' });

    for (const [key, label] of COMMISSION_SPLIT) {
      if (n(e, key)) items.push({ amount: n(e, key), label });
    }
    if (n(e, 'currentMonthGst')) items.push({ amount: n(e, 'currentMonthGst'), label: 'current GST bill' });
    if (n(e, 'previousOutstandingGst')) items.push({ amount: n(e, 'previousOutstandingGst'), label: 'previous GST bill' });

    const receipts = n(e, 'currentMonthReceipt') + n(e, 'previousMonthReceipt');
    const tds = n(e, 'currentMonthTds') + n(e, 'previousMonthTds');
    if (receipts) items.push({ amount: -receipts, label: 'invoice' });
    if (tds) items.push({ amount: -tds, label: 'TDS' });

    for (const it of items) bal = r2(bal + it.amount);

    // Applied to the balance but deliberately not listed.
    const extra = n(e, 'extraAmount');
    if (extra) { bal = r2(bal - extra); hiddenAdjustments++; }

    lines.push({
      month: shortLabel(e),
      monthLong: longLabel(e),
      items,
      total: bal,
      stored: n(e, 'totalOutstanding'),
      reconciles: Math.abs(bal - n(e, 'totalOutstanding')) < 0.005,
    });
  }

  return {
    clientId: client.clientId,
    clientName: client.name,
    clientType: client.type || '',
    commissionRate: client.commissionRate,
    gstRate: n(window[0], 'gstRate') || 18,
    mode,
    why,
    openingBalance,
    openedFrom,
    periodFrom: longLabel(window[0]),
    periodTo: longLabel(window[window.length - 1]),
    lines,
    closing: bal,
    hiddenAdjustments,
    monthsShown: window.length,
    monthsHeld: rows.length,
  };
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

function serverUrl() {
  return (process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/$/, '');
}

const statementUrl = (clientId, mode) =>
  `${serverUrl()}/statements/${encodeURIComponent(clientId)}/${mode}?t=${statementToken(clientId)}`;

module.exports = {
  calOrder, shortLabel, longLabel, monthShort, monthLong,
  pickWindow, buildStatement, statementToken, verifyStatementToken, statementUrl, serverUrl,
  SETTLED, r2,
};
