// One-off test script: sends the outstanding notification emails to a single
// test recipient (rahul.goongoonalo@gmail.com) instead of the full recipient list.
// Uses the exact same renderer as production (services/outstandingReport.js).
// Run from the server directory with:   node scripts/testOutstandingMail.js
// Optional FY label override:           node scripts/testOutstandingMail.js 2026

require('dotenv').config();
// Force Node to use Google DNS (the local resolver refuses SRV lookups on this machine)
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const Settings = require('../models/Settings');
const { getTransporter } = require('../services/emailService');
const { aggregateOutstanding, buildReportHtml, buildPerClientReportHtml, buildMovementReportHtml, buildStatementReportHtml, formatCurrency } = require('../services/outstandingReport');

const TEST_RECIPIENT = 'rahul.goongoonalo@gmail.com, accounts@musicrightsmanagementindia.com';

// Format selector (default = matrix, the existing fixed-6-month table):
//   node scripts/testOutstandingMail.js             -> matrix
//   node scripts/testOutstandingMail.js cards        -> per-client dynamic table
//   node scripts/testOutstandingMail.js movement     -> how-it-came-about summary
//   node scripts/testOutstandingMail.js movement 2026 -> movement, FY label 2026
const args = process.argv.slice(2);
const format = (args.find(a => ['cards', 'perclient', 'matrix', 'movement', 'statement'].includes(a.toLowerCase())) || 'matrix').toLowerCase();
const renderReport = format === 'statement' ? buildStatementReportHtml
  : format === 'movement' ? buildMovementReportHtml
  : (format === 'cards' || format === 'perclient') ? buildPerClientReportHtml
  : buildReportHtml;
const formatTag = format.toUpperCase();

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    console.log(`Format: ${formatTag}`);
    // Optional FY label override: any 4-digit arg, e.g. `... cards 2026`
    const cliFy = parseInt(args.find(a => /^\d{4}$/.test(a)), 10);
    let fyStart;
    if (!isNaN(cliFy)) {
      fyStart = cliFy;
      console.log(`FY override from CLI: ${fyStart}-${fyStart + 1}`);
    } else {
      const financialYear = await Settings.getSetting('financialYear');
      fyStart = financialYear.startYear;
      console.log(`Current FY (from settings): ${fyStart}-${fyStart + 1}`);
    }

    // Query ALL entries across all fiscal years — we want each client's full
    // monthly history regardless of the FY they sit in.
    const entries = await RoyaltyAccounting.find({}).lean();
    console.log(`Found ${entries.length} entries across all FYs.`);
    if (entries.length === 0) {
      console.log('No entries found, sending empty report anyway for testing.');
    }

    const {
      positiveClients, zeroNegativeClients,
      positiveTotal, zeroNegativeTotal,
      windowMonths, positiveMonthTotals, zeroNegativeMonthTotals,
    } = aggregateOutstanding(entries);

    const dateStr = new Date().toLocaleDateString('en-IN');
    const range = windowMonths.length
      ? `${windowMonths[0].longLabel} - ${windowMonths[windowMonths.length - 1].longLabel}`
      : '';
    console.log(`6-month window: ${range}`);
    console.log(`Positive: ${positiveClients.length} clients, ${formatCurrency(positiveTotal)}`);
    console.log(`Zero/Negative: ${zeroNegativeClients.length} clients, ${formatCurrency(zeroNegativeTotal)}`);

    // --- MAIL 1: Positive Outstanding ---
    const positiveHtml = renderReport({
      title: 'Outstanding Report - Receivables',
      subtitle: 'Clients with outstanding amount greater than zero, sorted from highest to lowest.',
      fyStart,
      clientRows: positiveClients,
      grandTotal: positiveTotal,
      accentColor: '#2563eb',
      badgeText: 'RECEIVABLES (> 0)',
      windowMonths,
      monthTotals: positiveMonthTotals,
      isTest: true,
    });

    console.log(`Sending Mail 1 to ${TEST_RECIPIENT}...`);
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: TEST_RECIPIENT,
      subject: `[TEST ${formatTag}] MRM Receivables Report - ${dateStr} (${positiveClients.length} clients | ${formatCurrency(positiveTotal)})`,
      html: positiveHtml
    });
    console.log('Mail 1 sent.');

    // --- MAIL 2: Zero & Negative Outstanding ---
    const zeroNegativeHtml = renderReport({
      title: 'Outstanding Report - Cleared & Overpaid',
      subtitle: 'Clients with zero or negative outstanding balance (overpaid / advance).',
      fyStart,
      clientRows: zeroNegativeClients,
      grandTotal: zeroNegativeTotal,
      accentColor: '#059669',
      badgeText: 'CLEARED & OVERPAID (≤ 0)',
      windowMonths,
      monthTotals: zeroNegativeMonthTotals,
      isTest: true,
    });

    console.log(`Sending Mail 2 to ${TEST_RECIPIENT}...`);
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: TEST_RECIPIENT,
      subject: `[TEST ${formatTag}] MRM Cleared/Overpaid Report - ${dateStr} (${zeroNegativeClients.length} clients | ${formatCurrency(zeroNegativeTotal)})`,
      html: zeroNegativeHtml
    });
    console.log('Mail 2 sent.');

    console.log('\nBoth test emails sent successfully.');
  } catch (err) {
    console.error('Error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

run();
