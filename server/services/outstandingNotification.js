const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const Client = require('../models/Client');
const { getTransporter } = require('./emailService');
const { newClientsThisMonth, buildOutstandingMailHtml, formatCurrency } = require('./outstandingMail');
const { summarise } = require('./outstandingSummary');

const recipients = 'rahul.goongoonalo@gmail.com, sherley@musicrightsmanagementindia.com, devi@musicrightsmanagementindia.com, accounts@musicrightsmanagementindia.com';

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

async function sendOutstandingNotification() {
  try {
    const { entries, rows, newClients, totalReceivable, owing } = await collectOutstanding();

    if (entries.length === 0) {
      console.log('Outstanding Notification: No entries found, skipping email.');
      return;
    }

    const html = buildOutstandingMailHtml({ rows, newClients, isTest: false });
    const dateStr = new Date().toLocaleDateString('en-IN');

    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: recipients,
      subject: `MRM Outstanding Report - ${dateStr} (${owing} of ${rows.length} clients owing | ${formatCurrency(totalReceivable)})`,
      html,
    });

    console.log(`Outstanding report sent: ${rows.length} clients, ${owing} owing, total ${formatCurrency(totalReceivable)}, ${newClients.length} new this month.`);
  } catch (error) {
    console.error('Failed to send outstanding notification:', error.message);
  }
}

module.exports = { sendOutstandingNotification, collectOutstanding };
