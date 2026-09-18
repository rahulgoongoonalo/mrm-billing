// Sends the outstanding report to a single test recipient instead of the full
// list. Uses the exact same renderer as production, so what arrives is what the
// 7pm job will send.
//
//   node scripts/testOutstandingMail.js
//   node scripts/testOutstandingMail.js someone@example.com

require('dotenv').config();
// The local resolver refuses SRV lookups on this machine; force Google DNS.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
const { getTransporter } = require('../services/emailService');
const { collectOutstanding } = require('../services/outstandingNotification');
const { buildOutstandingMailHtml, formatCurrency } = require('../services/outstandingMail');
const { serverUrl } = require('../services/statementBuilder');

const TEST_RECIPIENT = process.argv[2] || 'rahul.goongoonalo@gmail.com';

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const { entries, rows, newClients, totalReceivable, owing } = await collectOutstanding();
    console.log(`Entries: ${entries.length} | clients with a balance row: ${rows.length}`);
    console.log(`Owing: ${owing} | total receivable: ${formatCurrency(totalReceivable)}`);
    console.log(`New clients this month: ${newClients.length}`);
    console.log(`Statement links point at: ${serverUrl()}`);
    if (rows.length) {
      console.log(`Top 3: ${rows.slice(0, 3).map((r) => `${r.clientId} ${formatCurrency(r.outstanding)}`).join(' | ')}`);
    }

    const html = buildOutstandingMailHtml({ rows, newClients, isTest: true });
    const dateStr = new Date().toLocaleDateString('en-IN');

    console.log(`Sending to ${TEST_RECIPIENT}...`);
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: TEST_RECIPIENT,
      subject: `[TEST] MRM Outstanding Report - ${dateStr} (${owing} of ${rows.length} clients owing | ${formatCurrency(totalReceivable)})`,
      html,
    });
    console.log('Test email sent.');
  } catch (err) {
    console.error('Error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

run();
