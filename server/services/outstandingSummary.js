// One place that turns raw royalty-accounting entries into the per-client
// summary used by both the daily email and the Whatsapp Report screen.
//
// Three windows are supported:
//   latest  - each client's most recent month (what the daily email shows)
//   period  - every month between two dates
//   year    - a financial year, April to March

const { calOrder, shortLabel, longLabel } = require('./statementBuilder');

const SOCIETIES = [
  ['iprsAmount', 'iprs'],
  ['prsAmount', 'prs'],
  ['soundExchangeAmount', 'soundExchange'],
  ['isamraAmount', 'isamra'],
  ['ascapAmount', 'ascap'],
  ['pplAmount', 'ppl'],
  ['mlcAmount', 'mlc'],
];

const n = (e, k) => e[k] || 0;
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

/** A calendar date -> the same ordering scale entries use. */
function orderFromDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() * 12 + d.getMonth();
}

/** Resolve the requested window into inclusive [from, to] order bounds. */
function resolveWindow({ mode, from, to, year }) {
  if (mode === 'period') {
    const f = orderFromDate(from);
    const t = orderFromDate(to);
    if (f === null || t === null) return null;
    return { from: Math.min(f, t), to: Math.max(f, t) };
  }
  if (mode === 'year') {
    const y = parseInt(year, 10);
    if (Number.isNaN(y)) return null;
    return { from: y * 12 + 3, to: (y + 1) * 12 + 2 };   // Apr Y .. Mar Y+1
  }
  return null;                                           // 'latest' needs no bounds
}

function blankTotals() {
  const t = { months: 0, totalRoyalty: 0, commission: 0, receipts: 0, tds: 0 };
  for (const [, key] of SOCIETIES) t[key] = 0;
  return t;
}

/**
 * @param entries royalty-accounting documents (already limited to active clients)
 * @param clients client master documents
 * @param opts    { mode, from, to, year }
 */
function summarise(entries, clients, opts = {}) {
  const mode = opts.mode === 'period' || opts.mode === 'year' ? opts.mode : 'latest';
  const bounds = resolveWindow({ ...opts, mode });
  const master = new Map((clients || []).map((c) => [c.clientId, c]));

  const byClient = new Map();
  for (const e of entries) {
    if (!master.has(e.clientId)) continue;
    const order = calOrder(e);
    if (bounds && (order < bounds.from || order > bounds.to)) continue;
    if (!byClient.has(e.clientId)) byClient.set(e.clientId, []);
    byClient.get(e.clientId).push(e);
  }

  const rows = [];
  for (const [clientId, list] of byClient) {
    list.sort((a, b) => calOrder(a) - calOrder(b));
    const window = mode === 'latest' ? [list[list.length - 1]] : list;
    const last = window[window.length - 1];
    const c = master.get(clientId);

    const agg = blankTotals();
    for (const e of window) {
      agg.months++;
      for (const [field, key] of SOCIETIES) agg[key] = r2(agg[key] + n(e, field));
      agg.commission = r2(agg.commission + n(e, 'totalCommission'));
      agg.receipts = r2(agg.receipts + n(e, 'currentMonthReceipt') + n(e, 'previousMonthReceipt'));
      agg.tds = r2(agg.tds + n(e, 'currentMonthTds') + n(e, 'previousMonthTds'));
    }
    agg.totalRoyalty = r2(SOCIETIES.reduce((s, [, key]) => s + agg[key], 0));

    rows.push({
      clientId,
      clientName: (c && c.name) || last.clientName || clientId,
      clientType: (c && c.type) || '',
      commissionRate: (c && c.commissionRate) ?? null,
      month: shortLabel(last),
      monthLong: longLabel(last),
      from: shortLabel(window[0]),
      ...agg,
      // The balance is a running position, so it is the last month's, never a sum.
      outstanding: n(last, 'totalOutstanding'),
    });
  }

  rows.sort((a, b) => b.outstanding - a.outstanding);

  const totals = blankTotals();
  totals.outstanding = 0;
  totals.receivable = 0;
  for (const row of rows) {
    totals.months += row.months;
    for (const [, key] of SOCIETIES) totals[key] = r2(totals[key] + row[key]);
    totals.totalRoyalty = r2(totals.totalRoyalty + row.totalRoyalty);
    totals.commission = r2(totals.commission + row.commission);
    totals.receipts = r2(totals.receipts + row.receipts);
    totals.tds = r2(totals.tds + row.tds);
    totals.outstanding = r2(totals.outstanding + row.outstanding);
    if (row.outstanding > 0) totals.receivable = r2(totals.receivable + row.outstanding);
  }

  return {
    mode,
    rows,
    totals,
    clientCount: rows.length,
    owing: rows.filter((r) => r.outstanding > 0).length,
    settled: rows.filter((r) => Math.abs(r.outstanding) < 1).length,
    overpaid: rows.filter((r) => r.outstanding <= -1).length,
  };
}

module.exports = { summarise, SOCIETIES, orderFromDate, resolveWindow };
