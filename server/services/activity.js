// Records who did what, for the All Entries > Activity tab.
//
// Recording must never break the request it describes, so every write here
// swallows its own errors. Callers await it (the app also runs serverless,
// where a promise left running after the response can be cut off).
const ActivityEvent = require('../models/ActivityEvent');
const { SOCIETIES, SOCIETY_FIELDS } = require('../utils/clientProfile');
const { PAYMENT_ACCOUNTS } = require('../utils/paymentAccounts');

// Opening a client again within this window is the same visit, not a new one.
const VIEW_WINDOW_MS = 10 * 60 * 1000;

const VIEW_PLACES = ['data-entry', 'client-report', 'client-master', 'mail-wizard'];

async function record(req, event) {
  try {
    await ActivityEvent.create({
      userEmail: req?.user?.email || '',
      userId: req?.user?.userId ? String(req.user.userId) : '',
      ...event,
    });
  } catch (err) {
    console.error('Could not record activity:', err.message);
  }
}

async function recordView(req, { clientId, clientName, where }) {
  try {
    const email = req?.user?.email || '';
    const place = VIEW_PLACES.includes(where) ? where : 'data-entry';
    const recent = await ActivityEvent.exists({
      action: 'client.viewed',
      userEmail: email,
      clientId,
      'meta.where': place,
      at: { $gte: new Date(Date.now() - VIEW_WINDOW_MS) },
    });
    if (recent) return false;
    await record(req, { action: 'client.viewed', clientId, clientName, meta: { where: place } });
    return true;
  } catch (err) {
    console.error('Could not record client view:', err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Monthly entry: what changed between two saves
// ---------------------------------------------------------------------------

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sumOf = (rows, key) => round2((rows || []).reduce((s, r) => s + (Number(r?.[key]) || 0), 0));

const ENTRY_FIELDS = [
  ...SOCIETIES.map((s) => ({ field: SOCIETY_FIELDS[s].amount, label: `${s} royalty`, kind: 'money' })),
  { field: 'extraAmount', label: 'Extra / adjustment', kind: 'money' },
  { field: 'currentMonthGstBase', label: 'GST invoiced (this month)', kind: 'money' },
  { field: 'previousOutstandingGstBase', label: 'GST invoiced (previous O/S)', kind: 'money' },
  { field: 'currentMonthReceipt', label: 'Received (this month)', kind: 'money' },
  { field: 'currentMonthTds', label: 'TDS (this month)', kind: 'money' },
  { field: 'previousMonthReceipt', label: 'Received (previous O/S)', kind: 'money' },
  { field: 'previousMonthTds', label: 'TDS (previous O/S)', kind: 'money' },
  { field: 'previousMonthOutstanding', label: 'Opening balance', kind: 'money' },
  { field: 'commissionRate', label: 'Commission rate', kind: 'percent' },
  { field: 'gstRate', label: 'GST rate', kind: 'percent' },
];

// Results, shown so an edit reads as "O/S went from X to Y".
const ENTRY_RESULTS = [
  { field: 'totalCommission', label: 'Total commission', kind: 'money' },
  { field: 'totalOutstanding', label: 'Total outstanding', kind: 'money' },
];

function diffEntry(before, after) {
  const changes = [];
  const b = before || {};
  for (const f of [...ENTRY_FIELDS, ...ENTRY_RESULTS]) {
    // A new month always "changes" its rates from nothing; that is not news.
    if (!before && f.kind === 'percent') continue;
    const from = round2(b[f.field]);
    const to = round2(after[f.field]);
    if (from !== to) changes.push({ ...f, from, to });
  }
  // The receipt lines behind the IPRS and PRS totals.
  const lines = [
    ['iprsEntries', 'IPRS receipt lines', 'receivedAmount'],
    ['prsEntries', 'PRS receipt lines', 'receivedInr'],
  ];
  for (const [field, label, key] of lines) {
    const fromN = (b[field] || []).length;
    const toN = (after[field] || []).length;
    if (fromN !== toN) changes.push({ field, label, kind: 'text', from: `${fromN} (${sumOf(b[field], key)})`, to: `${toN} (${sumOf(after[field], key)})` });
  }
  // Received / email dates on the single-amount societies.
  const datesOf = (e) => new Map((e.societyDates || []).map((d) => [d.society, d]));
  const fromDates = datesOf(b);
  const toDates = datesOf(after);
  for (const society of SOCIETIES) {
    const f = fromDates.get(society) || {};
    const t = toDates.get(society) || {};
    for (const [key, label] of [['receivedDate', 'received on'], ['emailDate', 'email received']]) {
      if ((f[key] || '') !== (t[key] || '')) {
        changes.push({ field: `${society}.${key}`, label: `${society} ${label}`, kind: 'text', from: f[key] || '', to: t[key] || '' });
      }
    }
  }
  const fromStatus = b.status || '';
  const toStatus = after.status || 'draft';
  if (before && fromStatus !== toStatus) changes.push({ field: 'status', label: 'Status', kind: 'text', from: fromStatus, to: toStatus });
  return changes;
}

const royaltyOf = (e) => round2(SOCIETIES.reduce((s, name) => s + (Number(e?.[SOCIETY_FIELDS[name].amount]) || 0), 0));

// The figures of a month, kept on the event so a deleted month can still be read.
const entrySnapshot = (e) => ({
  status: e.status || 'draft',
  royalty: royaltyOf(e),
  totalCommission: round2(e.totalCommission),
  received: round2((e.currentMonthReceipt || 0) + (e.previousMonthReceipt || 0)),
  tds: round2((e.currentMonthTds || 0) + (e.previousMonthTds || 0)),
  totalOutstanding: round2(e.totalOutstanding),
});

function entryAction(before, after) {
  if (!before) return 'entry.created';
  if ((before.status || 'draft') !== 'submitted' && after.status === 'submitted') return 'entry.submitted';
  return 'entry.updated';
}

// ---------------------------------------------------------------------------
// Client master: what changed
// ---------------------------------------------------------------------------

const rateList = (c) => (c.commissionMode === 'per-society'
  ? (c.societyCommissions || []).map((r) => `${r.society} ${r.rate}%`).join(', ') || 'none'
  : 'Flat');
const accountLabel = (key) => PAYMENT_ACCOUNTS[key]?.label || (key ? key : 'Not chosen');
const contractsKey = (c) => JSON.stringify((c.contracts || []).map((k) => [k.society, k.startDate, k.endDate]));

const CLIENT_FIELDS = [
  { field: 'name', label: 'Name' },
  { field: 'clientType', label: 'Client type' },
  { field: 'type', label: 'Royalty label' },
  { field: 'societies', label: 'Societies', get: (c) => (c.societies || []).join(', ') },
  { field: 'commissionRate', label: 'Commission rate', kind: 'percent', get: (c) => round2(c.commissionRate) },
  { field: 'commissionMode', label: 'Commission rates', get: rateList },
  { field: 'gstRate', label: 'GST rate', kind: 'percent', get: (c) => round2(c.gstRate) },
  { field: 'phone', label: 'Phone' },
  { field: 'email', label: 'Email' },
  { field: 'gstId', label: 'GST ID' },
  { field: 'paymentAccount', label: 'Payment account', get: (c) => accountLabel(c.paymentAccount) },
  { field: 'isActive', label: 'Active', get: (c) => (c.isActive === false ? 'No' : 'Yes') },
  { field: 'contracts', label: 'Society contracts', get: contractsKey, hide: true },
];

// Plain copy of the fields compared, taken before the document is changed.
const clientSnapshot = (c) => {
  const o = typeof c.toObject === 'function' ? c.toObject() : c;
  return JSON.parse(JSON.stringify(o));
};

function diffClient(before, after) {
  const changes = [];
  for (const f of CLIENT_FIELDS) {
    const get = f.get || ((c) => (c[f.field] ?? ''));
    const from = get(before);
    const to = get(after);
    if (String(from) === String(to)) continue;
    changes.push(f.hide
      ? { field: f.field, label: f.label, kind: 'text', from: 'changed', to: 'updated' }
      : { field: f.field, label: f.label, kind: f.kind || 'text', from, to });
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Which part of the record a change belongs to
// ---------------------------------------------------------------------------

// Several recorded fields are one thing to the person reading the page: the
// IPRS amount, its receipt lines and its dates are all "IPRS"; this month's
// and the previous receipts are both "Receipt". The All Entries page counts
// and filters by these groups. Results (total commission, total outstanding)
// move whenever anything else does, so they belong to no group.
const LINE_FIELDS = { IPRS: 'iprsEntries', PRS: 'prsEntries' };

const FIELD_GROUPS = [
  ...SOCIETIES.map((s) => ({
    key: `entry:${s}`,
    scope: 'entry',
    label: s,
    fields: [SOCIETY_FIELDS[s].amount, `${s}.receivedDate`, `${s}.emailDate`, ...(LINE_FIELDS[s] ? [LINE_FIELDS[s]] : [])],
  })),
  { key: 'entry:adjustment', scope: 'entry', label: 'Extra / adjustment', fields: ['extraAmount'] },
  { key: 'entry:gst', scope: 'entry', label: 'GST invoice', fields: ['currentMonthGstBase', 'previousOutstandingGstBase'] },
  { key: 'entry:receipt', scope: 'entry', label: 'Receipt', fields: ['currentMonthReceipt', 'previousMonthReceipt'] },
  { key: 'entry:tds', scope: 'entry', label: 'TDS', fields: ['currentMonthTds', 'previousMonthTds'] },
  { key: 'entry:opening', scope: 'entry', label: 'Opening balance', fields: ['previousMonthOutstanding'] },
  { key: 'entry:commissionRate', scope: 'entry', label: 'Commission rate', fields: ['commissionRate'] },
  { key: 'entry:gstRate', scope: 'entry', label: 'GST rate', fields: ['gstRate'] },
  { key: 'entry:status', scope: 'entry', label: 'Status', fields: ['status'] },
  ...CLIENT_FIELDS.map((f) => ({ key: `client:${f.field}`, scope: 'client', label: f.label, fields: [f.field] })),
];

const fieldGroup = (key) => FIELD_GROUPS.find((g) => g.key === key);

// Aggregation expression: the group key of change `$$c` on the current event,
// or null. An event's scope is the first half of its action ('entry.updated').
const groupKeyExpr = () => {
  const scope = { $arrayElemAt: [{ $split: ['$action', '.'] }, 0] };
  return {
    $switch: {
      branches: FIELD_GROUPS.map((g) => ({
        case: { $and: [{ $eq: [scope, g.scope] }, { $in: ['$$c.field', g.fields] }] },
        then: g.key,
      })),
      default: null,
    },
  };
};

module.exports = {
  record,
  recordView,
  FIELD_GROUPS,
  fieldGroup,
  groupKeyExpr,
  diffEntry,
  entryAction,
  entrySnapshot,
  diffClient,
  clientSnapshot,
  VIEW_PLACES,
};
