const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const Client = require('../models/Client');
const { getTransporter } = require('./emailService');
const {
  summariseLatest, newClientsThisMonth, buildOutstandingMailHtml, formatCurrency,
} = require('./outstandingMail');

const recipients = 'rahul.goongoonalo@gmail.com, sherley@musicrightsmanagementindia.com, devi@musicrightsmanagementindia.com, accounts@musicrightsmanagementindia.com';

/**
 * Gather every client's latest-month outstanding plus this month's new clients.
 * Shared by the scheduled send and the test script so both render identically.
 */
async function collectOutstanding() {
  // Every entry across all financial years - each client's latest month wins.
  const entries = await RoyaltyAccounting.find({}).lean();
  const clients = await Client.find({}).lean();

  const rows = summariseLatest(entries, clients);
  const newClients = newClientsThisMonth(clients);
  const totalReceivable = rows.reduce((s, r) => s + (r.outstanding > 0 ? r.outstanding : 0), 0);
  const owing = rows.filter((r) => r.outstanding > 0).length;

  return { entries, clients, rows, newClients, totalReceivable, owing };
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
