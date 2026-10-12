// Referral earned on client payments, and what each referrer is still owed.
//
// A payment is the money MRM received on a month's entry: this month's
// receipt plus any receipt against earlier dues. TDS is not money received,
// so it earns no referral. Each payment earns the rate of the deal covering
// that month; the figures are worked out from the entries every time, so an
// edited receipt is always reflected.

const ReferralDeal = require('../models/ReferralDeal');
const ReferralPayout = require('../models/ReferralPayout');
const Referrer = require('../models/Referrer');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const Client = require('../models/Client');

const CAL = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
const entryOrder = (e) => e.year * 12 + CAL.indexOf(e.month);
// 'YYYY-MM' -> the same scale; null for empty.
const monthOrder = (ym) => {
  if (!ym) return null;
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
};
const orderLabel = (order) => `${SHORT[order % 12]} ${Math.floor(order / 12)}`;
const orderYm = (order) => `${Math.floor(order / 12)}-${String((order % 12) + 1).padStart(2, '0')}`;
const currentOrder = () => {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
};
const referrerKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
const received = (e) => r2((Number(e.currentMonthReceipt) || 0) + (Number(e.previousMonthReceipt) || 0));

const ENTRY_FIELDS = 'clientId clientName month year currentMonthReceipt previousMonthReceipt';

async function entriesByClient(clientIds) {
  const entries = clientIds.length
    ? await RoyaltyAccounting.find({ clientId: { $in: clientIds } }).select(ENTRY_FIELDS).lean()
    : [];
  const byClient = new Map();
  for (const e of entries) {
    if (!byClient.has(e.clientId)) byClient.set(e.clientId, []);
    byClient.get(e.clientId).push(e);
  }
  return byClient;
}

// Deals on clients still in Client Master. A removed (inactive) or deleted
// client drops out of referrals; reactivating the client brings its deals back.
async function liveDeals() {
  const deals = await ReferralDeal.find({}).sort({ referrer: 1, clientName: 1, fromMonth: -1 }).lean();
  const ids = [...new Set(deals.map((d) => d.clientId))];
  const clients = ids.length
    ? await Client.find({ clientId: { $in: ids }, isActive: { $ne: false } }).select('clientId name').lean()
    : [];
  const names = new Map(clients.map((c) => [c.clientId, c.name]));
  return deals.filter((d) => names.has(d.clientId)).map((d) => ({ ...d, clientName: names.get(d.clientId) || d.clientName }));
}

const PROFILE_FIELDS = ['phone', 'email', 'pan', 'upi', 'bankName', 'accountName', 'accountNo', 'ifsc', 'tdsRate', 'note'];
const profileOf = (p) => Object.fromEntries(PROFILE_FIELDS.map((k) => [k, p?.[k] ?? (k === 'tdsRate' ? 0 : '')]));

/**
 * @param range { from: 'YYYY-MM', to: 'YYYY-MM' } or nothing for all time.
 *              Earned and paid are for the range; due and the ledger are all time.
 */
async function referralSummary(range = {}) {
  const lo = monthOrder(range.from);
  const hi = monthOrder(range.to);
  const inRange = (order) => (lo === null || order >= lo) && (hi === null || order <= hi);
  const now = currentOrder();

  const [deals, payouts, profiles] = await Promise.all([
    liveDeals(),
    ReferralPayout.find({}).sort({ date: 1, createdAt: 1 }).lean(),
    Referrer.find({}).lean(),
  ]);
  const byClient = await entriesByClient([...new Set(deals.map((d) => d.clientId))]);
  const profileByKey = new Map(profiles.map((p) => [p.key, p]));

  const referrers = new Map();
  const ref = (name) => {
    const key = referrerKey(name);
    if (!referrers.has(key)) {
      referrers.set(key, {
        key,
        name: String(name).trim(),
        earnedAll: 0, paidAll: 0, tdsAll: 0,
        received: 0, earned: 0, paid: 0, tds: 0,
        lines: [], byClient: new Map(), clients: new Set(), activeDeals: 0,
        ledger: [], lastPaidOn: '', payouts: 0,
      });
    }
    return referrers.get(key);
  };

  // Monthly trend across the range (or across all data for all time).
  const trend = new Map();
  const bump = (order, k, v) => {
    if (!trend.has(order)) trend.set(order, { received: 0, earned: 0, paid: 0 });
    const t = trend.get(order);
    t[k] = r2(t[k] + v);
  };

  const dealStats = {};
  for (const d of deals) {
    const r = ref(d.referrer);
    const from = monthOrder(d.fromMonth);
    const to = monthOrder(d.toMonth);
    const id = String(d._id);
    const stat = { earnedAll: 0, receivedAll: 0, payments: 0, lastPayment: '' };
    dealStats[id] = stat;
    if (from <= now && (to === null || to > now)) r.activeDeals += 1;
    r.clients.add(d.clientId);

    for (const e of byClient.get(d.clientId) || []) {
      const order = entryOrder(e);
      if (order < from || (to !== null && order > to)) continue;
      const amount = received(e);
      if (!amount) continue;
      const referral = r2(amount * d.rate / 100);
      const clientName = e.clientName || d.clientName || d.clientId;
      r.earnedAll = r2(r.earnedAll + referral);
      stat.earnedAll = r2(stat.earnedAll + referral);
      stat.receivedAll = r2(stat.receivedAll + amount);
      stat.payments += 1;
      if (!stat.lastPayment || order > monthOrder(stat.lastPayment)) stat.lastPayment = orderYm(order);
      r.ledger.push({
        kind: 'earned', order, sort: order * 2, label: orderLabel(order),
        clientId: d.clientId, clientName, received: amount, rate: d.rate, amount: referral,
      });
      if (!inRange(order)) continue;
      bump(order, 'received', amount);
      bump(order, 'earned', referral);
      r.received = r2(r.received + amount);
      r.earned = r2(r.earned + referral);
      r.lines.push({
        dealId: id, clientId: d.clientId, clientName,
        month: e.month, year: e.year, label: orderLabel(order), order,
        received: amount, rate: d.rate, referral,
      });
      if (!r.byClient.has(d.clientId)) {
        r.byClient.set(d.clientId, { clientId: d.clientId, clientName, received: 0, earned: 0, payments: 0, rates: new Set() });
      }
      const c = r.byClient.get(d.clientId);
      c.received = r2(c.received + amount);
      c.earned = r2(c.earned + referral);
      c.payments += 1;
      c.rates.add(d.rate);
    }
  }

  for (const p of payouts) {
    const r = ref(p.referrer);
    const order = monthOrder(p.date.slice(0, 7));
    const tds = r2(p.tds);
    r.paidAll = r2(r.paidAll + p.amount);
    r.tdsAll = r2(r.tdsAll + tds);
    r.payouts += 1;
    if (p.date > r.lastPaidOn) r.lastPaidOn = p.date;
    // Within a month, the month's earnings come before its payouts.
    r.ledger.push({
      kind: 'paid', order, sort: order * 2 + 1, date: p.date, payoutId: String(p._id),
      amount: r2(p.amount), tds, net: r2(p.amount - tds), mode: p.mode || 'bank', reference: p.reference || '', note: p.note || '',
    });
    if (inRange(order)) {
      r.paid = r2(r.paid + p.amount);
      r.tds = r2(r.tds + tds);
      bump(order, 'paid', p.amount);
    }
  }

  const list = [...referrers.values()].map((r) => {
    let balance = 0;
    const ledger = r.ledger
      .sort((a, b) => a.sort - b.sort || String(a.date || '').localeCompare(String(b.date || '')) || String(a.clientName || '').localeCompare(String(b.clientName || '')))
      .map(({ sort, ...row }) => {
        balance = r2(balance + (row.kind === 'earned' ? row.amount : -row.amount));
        return { ...row, balance };
      });
    return {
      key: r.key,
      name: r.name,
      profile: profileOf(profileByKey.get(r.key)),
      clients: r.clients.size,
      activeDeals: r.activeDeals,
      received: r.received,
      earned: r.earned,
      paid: r.paid,
      tds: r.tds,
      earnedAll: r.earnedAll,
      paidAll: r.paidAll,
      tdsAll: r.tdsAll,
      due: r2(r.earnedAll - r.paidAll),
      payouts: r.payouts,
      lastPaidOn: r.lastPaidOn,
      lines: r.lines.sort((a, b) => b.order - a.order || a.clientName.localeCompare(b.clientName)),
      byClient: [...r.byClient.values()]
        .map((c) => ({ ...c, rates: [...c.rates].sort((a, b) => a - b) }))
        .sort((a, b) => b.earned - a.earned),
      ledger,
    };
  }).sort((a, b) => b.due - a.due || a.name.localeCompare(b.name));

  // Trend months: the whole range, or from the first month with data to now.
  let start = lo;
  let end = hi;
  if (start === null) start = trend.size ? Math.min(...trend.keys()) : now - 11;
  if (end === null) end = Math.max(now, ...(trend.size ? trend.keys() : [now]));
  if (end - start > 35) start = end - 35;
  const months = [];
  for (let o = start; o <= end; o += 1) {
    months.push({ ym: orderYm(o), label: orderLabel(o), ...(trend.get(o) || { received: 0, earned: 0, paid: 0 }) });
  }

  const sum = (k) => r2(list.reduce((s, r) => s + r[k], 0));
  return {
    range: { from: range.from || '', to: range.to || '' },
    referrers: list,
    months,
    dealStats,
    totals: {
      received: sum('received'),
      earned: sum('earned'),
      paid: sum('paid'),
      tds: sum('tds'),
      due: sum('due'),
      earnedAll: sum('earnedAll'),
      paidAll: sum('paidAll'),
      referrers: list.length,
      owed: list.filter((r) => r.due > 0.005).length,
      activeDeals: list.reduce((s, r) => s + r.activeDeals, 0),
      clients: new Set(deals.map((d) => d.clientId)).size,
    },
  };
}

/**
 * What a deal would earn on a client's recorded payments: shown while the
 * deal is being filled in, before it is saved.
 */
async function dealPreview({ clientId, rate, fromMonth, toMonth }) {
  const from = monthOrder(fromMonth);
  const to = monthOrder(toMonth);
  const entries = (await entriesByClient([clientId])).get(clientId) || [];
  const months = entries
    .map((e) => ({ order: entryOrder(e), received: received(e) }))
    .filter((m) => m.received && (from === null || m.order >= from) && (to === null || m.order <= to))
    .sort((a, b) => b.order - a.order);
  const total = r2(months.reduce((s, m) => s + m.received, 0));
  const last12 = months.filter((m) => m.order > currentOrder() - 12);
  const recent = r2(last12.reduce((s, m) => s + m.received, 0));
  const rateN = Number(rate) || 0;
  return {
    payments: months.length,
    received: total,
    referral: r2(total * rateN / 100),
    last12Received: recent,
    last12Referral: r2(recent * rateN / 100),
    months: months.slice(0, 6).map((m) => ({ label: orderLabel(m.order), received: m.received, referral: r2(m.received * rateN / 100) })),
  };
}

module.exports = { referralSummary, dealPreview, liveDeals, referrerKey, monthOrder };
