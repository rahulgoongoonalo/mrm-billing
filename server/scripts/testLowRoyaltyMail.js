// Sends the Low Royalty Report to a single test recipient.
//
//   node scripts/testLowRoyaltyMail.js
//   node scripts/testLowRoyaltyMail.js someone@example.com
//   node scripts/testLowRoyaltyMail.js someone@example.com 10000     (custom threshold)

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
const { getTransporter } = require('../services/emailService');
const { collectLowRoyalty, DEFAULT_THRESHOLD } = require('../services/lowRoyaltyReport');
const { buildLowRoyaltyMailHtml, formatCurrency } = require('../services/lowRoyaltyMail');
const { serverUrl } = require('../services/statementBuilder');

const args = process.argv.slice(2);
const TEST_RECIPIENT = args.find((a) => a.includes('@')) || 'rahul.goongoonalo@gmail.com';
const threshold = parseInt(args.find((a) => /^\d+$/.test(a)), 10) || DEFAULT_THRESHOLD;

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const report = await collectLowRoyalty(threshold);
    console.log(`Threshold          : ${formatCurrency(report.threshold)}`);
    console.log(`Clients reviewed   : ${report.reviewed}`);
    console.log(`Low all time       : ${report.allTime.length}`);
    console.log(`Low last 12 months : ${report.lastYear.length}  (${report.window.from} to ${report.window.to})`);
    console.log(`  of those, new     : ${report.lastYearOnly.length} not already in the all-time list`);
    console.log(`No entries at all  : ${report.noEntries}`);
    console.log(`Statement links    : ${serverUrl()}`);

    const html = buildLowRoyaltyMailHtml({ report, isTest: true });
    const dateStr = new Date().toLocaleDateString('en-IN');

    console.log(`Sending to ${TEST_RECIPIENT}...`);
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: TEST_RECIPIENT,
      subject: `[TEST] MRM Low Royalty Report - ${dateStr} (${report.allTime.length} all time + ${report.lastYearOnly.length} more in the last 12 months, under ${formatCurrency(report.threshold)})`,
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
