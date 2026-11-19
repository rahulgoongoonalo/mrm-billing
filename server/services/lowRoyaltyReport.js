// Low Royalty Report: clients whose royalty receipts add up to no more than a
// threshold (default 5,000) — once over their whole history, and again over the
// last twelve months.
//
// "Royalty" here is what the societies actually paid in, across all seven of
// them. It is not commission, and it is not the outstanding balance.

const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const { calOrder, shortLabel, longLabel, statementUrl } = require('./statementBuilder');
const { eachCompany } = require('../config/tenant');
const { COMPANY_KEYS } = require('../config/companies');
const { SOCIETIES, SOCIETY_FIELDS } = require('../utils/clientProfile');

// Derived from the shared society map so a new society is counted here too.
const ROYALTY_FIELDS = SOCIETIES.map((s) => SOCIETY_FIELDS[s].amount);

const royaltyOf = (e) => ROYALTY_FIELDS.reduce((sum, f) => sum + (e[f] || 0), 0);
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

const DEFAULT_THRESHOLD = 5000;
const WINDOW_MONTHS = 12;

/**
 * @param threshold rupees; a client is "low" when their total is at or below it
 * @returns { threshold, window, allTime, lastYear, reviewed, noEntries }
 */
async function collectLowRoyalty(threshold = DEFAULT_THRESHOLD) {
  const { clients, entries } = await loadCompany();
  return lowRoyaltyOf(clients, entries, threshold);
}

// The active clients of the current company and their entries.
async function loadCompany(company) {
  const clients = await Client.find({ isActive: { $ne: false } })
    .select('clientId name type commissionRate').lean();
  const activeIds = new Set(clients.map((c) => c.clientId));
  const entries = (await RoyaltyAccounting.find({}).lean()).filter((e) => activeIds.has(e.clientId));
  if (company) {
    for (const c of clients) c.company = company;
    for (const e of entries) e.company = company;
  }
  return { clients, entries };
}

/**
 * Every company in one report: each row names its company and carries its
 * statement link. The 12-month window runs to the newest month in any company.
 */
async function collectLowRoyaltyAll(threshold = DEFAULT_THRESHOLD) {
  const parts = await eachCompany(async (company) => {
    const { clients, entries } = await loadCompany(company);
    const link = new Map(clients.map((c) => [c.clientId, statementUrl(c.clientId, 'full')]));
    return { clients, entries, link };
  });
  const report = lowRoyaltyOf(parts.flatMap((p) => p.clients), parts.flatMap((p) => p.entries), threshold);
  const linkOf = (r) => parts[COMPANY_KEYS.indexOf(r.company)].link.get(r.clientId);
  for (const r of [...report.allTime, ...report.lastYear]) r.link = linkOf(r);
  return report;
}

// Clients (and entries) may come from several companies, told apart by .company.
function lowRoyaltyOf(clients, entries, threshold) {
  const keyOf = (x) => `${x.company || ''}|${x.clientId}`;

  // The window is anchored to the newest month anyone has, not today's date, so
  // the report stays stable if data entry runs behind.
  const latestOrder = entries.length ? Math.max(...entries.map(calOrder)) : null;
  const windowFrom = latestOrder === null ? null : latestOrder - (WINDOW_MONTHS - 1);
  const latestEntry = latestOrder === null
    ? null
    : entries.find((e) => calOrder(e) === latestOrder);
  const earliestInWindow = windowFrom === null
    ? null
    : entries.filter((e) => calOrder(e) >= windowFrom)
      .sort((a, b) => calOrder(a) - calOrder(b))[0];

  const byClient = new Map();
  for (const e of entries) {
    if (!byClient.has(keyOf(e))) byClient.set(keyOf(e), []);
    byClient.get(keyOf(e)).push(e);
  }

  const allTime = [];
  const lastYear = [];
  let noEntries = 0;

  for (const c of clients) {
    const list = (byClient.get(keyOf(c)) || []).sort((a, b) => calOrder(a) - calOrder(b));
    const inWindow = windowFrom === null ? [] : list.filter((e) => calOrder(e) >= windowFrom);

    const totalAll = r2(list.reduce((s, e) => s + royaltyOf(e), 0));
    const totalWindow = r2(inWindow.reduce((s, e) => s + royaltyOf(e), 0));
    const last = list[list.length - 1];

    if (!list.length) noEntries++;

    const base = {
      ...(c.company ? { company: c.company } : {}),
      clientId: c.clientId,
      clientName: c.name,
      clientType: c.type || '',
      hasEntries: list.length > 0,
      latestMonth: last ? shortLabel(last) : null,
      outstanding: last ? (last.totalOutstanding || 0) : 0,
    };

    if (totalAll <= threshold) {
      allTime.push({ ...base, months: list.length, totalRoyalty: totalAll });
    }
    if (totalWindow <= threshold) {
      lastYear.push({ ...base, months: inWindow.length, totalRoyalty: totalWindow });
    }
  }

  // Lowest first — the most dormant accounts lead.
  const order = (a, b) => a.totalRoyalty - b.totalRoyalty
    || (parseInt(a.clientId.match(/(\d+)/)?.[1], 10) || 0) - (parseInt(b.clientId.match(/(\d+)/)?.[1], 10) || 0);
  allTime.sort(order);
  lastYear.sort(order);

  // A client low all time is necessarily low over the last year too, so the
  // second list carries only the ones the first has not already named.
  const alreadyListed = new Set(allTime.map(keyOf));
  const lastYearOnly = lastYear.filter((r) => !alreadyListed.has(keyOf(r)));

  return {
    threshold,
    reviewed: clients.length,
    noEntries,
    window: {
      from: earliestInWindow ? longLabel(earliestInWindow) : null,
      to: latestEntry ? longLabel(latestEntry) : null,
      months: WINDOW_MONTHS,
    },
    allTime,
    lastYear,
    lastYearOnly,
  };
}

module.exports = { collectLowRoyalty, collectLowRoyaltyAll, royaltyOf, ROYALTY_FIELDS, DEFAULT_THRESHOLD };
