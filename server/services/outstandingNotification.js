const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const Client = require('../models/Client');
const { getTransporter } = require('./emailService');
const { newClientsThisMonth, buildOutstandingMailHtml, formatCurrency } = require('./outstandingMail');
const { summarise } = require('./outstandingSummary');
const { statementUrl } = require('./statementBuilder');
const { eachCompany } = require('../config/tenant');
const { REPORT_SUBJECT_BRANDS, companyName } = require('./companyReport');

// Every evening to these; once a month (the 1st) to the managers.
const dailyRecipients = 'rahul.goongoonalo@gmail.com, accounts@musicrightsmanagementindia.com';
const monthlyRecipients = 'sherley@musicrightsmanagementindia.com, devi@musicrightsmanagementindia.com';

/**
 * Gather every client's latest-month outstanding plus this month's new clients.
 * Shared by the scheduled send and the test script so both render identically.
 */
async function collectOutstanding() {
  // Every entry across all financial years - each client's latest month wins.
  const clients = await Client.find({ isActive: { $ne: false } }).lean();
  const active = new Set(clients.map((c) => c.clientId));
  const entries = (await RoyaltyAccounting.find({}).lean()).filter((e) => active.has(e.clientId));

  const summary = summarise(entries, clients, { mode: 'latest' });
  const newClients = newClientsThisMonth(clients);

  return {
    entries,
    clients,
    rows: summary.rows,
    totals: summary.totals,
    newClients,
    totalReceivable: summary.totals.receivable,
    owing: summary.owing,
  };
}

/**
 * collectOutstanding for every company, as one report. Each row and new client
 * carries its company, and each row its statement links (signed for that
 * company), so the mail can be built outside any one company.
 */
async function collectOutstandingAll() {
  const parts = await eachCompany(async (company) => {
    const r = await collectOutstanding();
    for (const row of r.rows) {
      row.company = company;
      row.links = { outstanding: statementUrl(row.clientId, 'outstanding'), full: statementUrl(row.clientId, 'full') };
    }
    for (const c of r.newClients) c.company = company;
    return { company, ...r };
  });
  const rows = parts.flatMap((p) => p.rows).sort((a, b) => b.outstanding - a.outstanding);
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    entries: parts.flatMap((p) => p.entries),
    clients: parts.flatMap((p) => p.clients),
    rows,
    newClients: parts.flatMap((p) => p.newClients).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    totalReceivable: round2(parts.reduce((s, p) => s + p.totalReceivable, 0)),
    owing: parts.reduce((s, p) => s + p.owing, 0),
    // One line per company for the mail's summary.
    companies: parts.map((p) => ({
      key: p.company,
      name: companyName(p.company),
      clients: p.rows.length,
      owing: p.owing,
      receivable: p.totalReceivable,
    })),
  };
}

async function sendOutstandingNotification({ to = dailyRecipients } = {}) {
  try {
    const { entries, rows, newClients, totalReceivable, owing, companies } = await collectOutstandingAll();

    if (entries.length === 0) {
      console.log('Outstanding Notification: No entries found, skipping email.');
      return;
    }

    const html = buildOutstandingMailHtml({ rows, newClients, companies, isTest: false });
    const dateStr = new Date().toLocaleDateString('en-IN');

    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: `${REPORT_SUBJECT_BRANDS} Outstanding Report - ${dateStr} (${owing} of ${rows.length} clients owing | ${formatCurrency(totalReceivable)})`,
      html,
    });

    console.log(`Outstanding report sent: ${rows.length} clients, ${owing} owing, total ${formatCurrency(totalReceivable)}, ${newClients.length} new this month.`);
  } catch (error) {
    console.error('Failed to send outstanding notification:', error.message);
  }
}

module.exports = { sendOutstandingNotification, collectOutstanding, collectOutstandingAll, dailyRecipients, monthlyRecipients };
