// One-off test script: sends the outstanding notification emails to a single
// test recipient (rahul.goongoonalo@gmail.com) instead of the full recipient list.
// Run from the server directory with:   node scripts/testOutstandingMail.js

require('dotenv').config();
// Force Node to use Google DNS (the local resolver refuses SRV lookups on this machine)
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const Settings = require('../models/Settings');
const { getTransporter } = require('../services/emailService');

const TEST_RECIPIENT = 'rahul.goongoonalo@gmail.com';

const monthOrder = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];
const monthLabels = {
  apr: 'April', may: 'May', jun: 'June', jul: 'July',
  aug: 'August', sep: 'September', oct: 'October', nov: 'November',
  dec: 'December', jan: 'January', feb: 'February', mar: 'March',
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount || 0);
};

function buildEmailHtml({ title, subtitle, fyStart, clientRows, grandTotal, accentColor, badgeText }) {
  const tableRows = clientRows.map((e, idx) => `
    <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding: 10px 14px; border-bottom: 1px solid #eef0f2; color: #555; font-size: 13px;">${idx + 1}</td>
      <td style="padding: 10px 14px; border-bottom: 1px solid #eef0f2; font-weight: 500;">${e.clientId}</td>
      <td style="padding: 10px 14px; border-bottom: 1px solid #eef0f2;">${e.clientName}</td>
      <td style="padding: 10px 14px; border-bottom: 1px solid #eef0f2;">${monthLabels[e.month]} ${e.year}</td>
      <td style="padding: 10px 14px; border-bottom: 1px solid #eef0f2; text-align: right; font-weight: 600; color: ${e.totalOutstanding > 0 ? '#2563eb' : e.totalOutstanding < 0 ? '#dc2626' : '#6b7280'};">
        ${formatCurrency(e.totalOutstanding)}
      </td>
    </tr>
  `).join('');

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 750px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
      <div style="background: #fef3c7; padding: 10px 32px; color: #92400e; font-size: 12px; font-weight: 600; border-bottom: 1px solid #fde68a;">
        TEST EMAIL - Sent only to ${TEST_RECIPIENT}
      </div>
      <div style="background: linear-gradient(135deg, ${accentColor}, ${accentColor}dd); padding: 28px 32px; color: white;">
        <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 700;">${title}</h1>
        <p style="margin: 0; opacity: 0.9; font-size: 14px;">
          FY ${fyStart}-${fyStart + 1} | ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>
      <div style="display: flex; padding: 18px 32px; background: #f8fafc; border-bottom: 1px solid #eef0f2;">
        <div style="flex: 1;">
          <span style="display: inline-block; background: ${accentColor}18; color: ${accentColor}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid ${accentColor}30;">
            ${badgeText}
          </span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 13px; color: #888;">Total Clients: </span>
          <span style="font-size: 15px; font-weight: 700; color: #333;">${clientRows.length}</span>
          <span style="margin: 0 10px; color: #ddd;">|</span>
          <span style="font-size: 13px; color: #888;">Grand Total: </span>
          <span style="font-size: 15px; font-weight: 700; color: ${accentColor};">${formatCurrency(grandTotal)}</span>
        </div>
      </div>
      ${subtitle ? `<p style="padding: 12px 32px 0; margin: 0; color: #666; font-size: 13px;">${subtitle}</p>` : ''}
      <div style="padding: 16px 24px 24px;">
        ${clientRows.length === 0 ? `
          <div style="text-align: center; padding: 40px 20px; color: #999;">
            <p style="font-size: 16px; margin: 0;">No clients in this category</p>
          </div>
        ` : `
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="padding: 12px 14px; text-align: left; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">#</th>
                <th style="padding: 12px 14px; text-align: left; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Client ID</th>
                <th style="padding: 12px 14px; text-align: left; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Client Name</th>
                <th style="padding: 12px 14px; text-align: left; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Latest Month</th>
                <th style="padding: 12px 14px; text-align: right; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4" style="padding: 14px; border-top: 2px solid ${accentColor}40; font-weight: 700; font-size: 14px; color: #333;">
                  Grand Total (${clientRows.length} clients)
                </td>
                <td style="padding: 14px; border-top: 2px solid ${accentColor}40; text-align: right; font-weight: 700; font-size: 16px; color: ${accentColor};">
                  ${formatCurrency(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        `}
      </div>
      <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid #eef0f2; text-align: center;">
        <p style="margin: 0; color: #aaa; font-size: 11px;">
          TEST email from MRM Billing App | Generated at ${new Date().toLocaleTimeString('en-IN')}
        </p>
      </div>
    </div>
  `;
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    // Optional CLI override: `node scripts/testOutstandingMail.js 2026`
    const cliFy = parseInt(process.argv[2], 10);
    let fyStart;
    if (!isNaN(cliFy)) {
      fyStart = cliFy;
      console.log(`FY override from CLI: ${fyStart}-${fyStart + 1}`);
    } else {
      const financialYear = await Settings.getSetting('financialYear');
      fyStart = financialYear.startYear;
      console.log(`Current FY (from settings): ${fyStart}-${fyStart + 1}`);
    }

    const entries = await RoyaltyAccounting.find({
      $or: [
        { year: fyStart, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
        { year: fyStart + 1, month: { $in: ['jan', 'feb', 'mar'] } }
      ]
    }).lean();

    console.log(`Found ${entries.length} entries for current FY.`);

    if (entries.length === 0) {
      console.log('No entries found, sending empty report anyway for testing.');
    }

    // An entry "has activity" if it was submitted OR has any non-zero value that
    // would affect outstanding. Pure blank seeded drafts are ignored when picking
    // the "latest" month, so a client with only April data doesn't get classified
    // by their empty March draft.
    const hasActivity = (e) => {
      if (e.status === 'submitted') return true;
      return (
        (e.iprsAmount || 0) !== 0 ||
        (e.prsAmount || 0) !== 0 ||
        (e.soundExchangeAmount || 0) !== 0 ||
        (e.isamraAmount || 0) !== 0 ||
        (e.ascapAmount || 0) !== 0 ||
        (e.pplAmount || 0) !== 0 ||
        (e.mlcAmount || 0) !== 0 ||
        (e.extraAmount || 0) !== 0 ||
        (e.currentMonthGstBase || 0) !== 0 ||
        (e.previousOutstandingGstBase || 0) !== 0 ||
        (e.currentMonthReceipt || 0) !== 0 ||
        (e.currentMonthTds || 0) !== 0 ||
        (e.previousMonthReceipt || 0) !== 0 ||
        (e.previousMonthTds || 0) !== 0 ||
        (e.previousMonthOutstanding || 0) !== 0 ||
        (e.totalOutstanding || 0) !== 0
      );
    };

    const fyOrder = (e) =>
      (e.year - fyStart) * 12 + monthOrder.indexOf(e.month);

    const latestByClient = {};
    entries.forEach(e => {
      // Prefer the latest month with activity; only fall back to a blank draft
      // if the client has no active entries at all.
      const prev = latestByClient[e.clientId];
      const eActive = hasActivity(e);
      if (!prev) {
        latestByClient[e.clientId] = e;
        return;
      }
      const prevActive = hasActivity(prev);
      if (eActive && !prevActive) {
        latestByClient[e.clientId] = e;
      } else if (eActive === prevActive && fyOrder(e) > fyOrder(prev)) {
        latestByClient[e.clientId] = e;
      }
    });

    const allClients = Object.values(latestByClient);
    const positiveClients = allClients
      .filter(e => (e.totalOutstanding || 0) > 0)
      .sort((a, b) => (b.totalOutstanding || 0) - (a.totalOutstanding || 0));
    const zeroNegativeClients = allClients
      .filter(e => (e.totalOutstanding || 0) <= 0)
      .sort((a, b) => (a.totalOutstanding || 0) - (b.totalOutstanding || 0));

    const positiveTotal = positiveClients.reduce((sum, e) => sum + (e.totalOutstanding || 0), 0);
    const zeroNegativeTotal = zeroNegativeClients.reduce((sum, e) => sum + (e.totalOutstanding || 0), 0);

    const dateStr = new Date().toLocaleDateString('en-IN');

    console.log(`Positive: ${positiveClients.length} clients, ${formatCurrency(positiveTotal)}`);
    console.log(`Zero/Negative: ${zeroNegativeClients.length} clients, ${formatCurrency(zeroNegativeTotal)}`);

    // --- MAIL 1: Positive Outstanding ---
    const positiveHtml = buildEmailHtml({
      title: 'Outstanding Report - Receivables',
      subtitle: 'Clients with outstanding amount greater than zero, sorted from highest to lowest.',
      fyStart,
      clientRows: positiveClients,
      grandTotal: positiveTotal,
      accentColor: '#2563eb',
      badgeText: 'RECEIVABLES (> 0)'
    });

    console.log(`Sending Mail 1 to ${TEST_RECIPIENT}...`);
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: TEST_RECIPIENT,
      subject: `[TEST] MRM Receivables Report - ${dateStr} (${positiveClients.length} clients | ${formatCurrency(positiveTotal)})`,
      html: positiveHtml
    });
    console.log('Mail 1 sent.');

    // --- MAIL 2: Zero & Negative Outstanding ---
    const zeroNegativeHtml = buildEmailHtml({
      title: 'Outstanding Report - Cleared & Overpaid',
      subtitle: 'Clients with zero or negative outstanding balance (overpaid / advance).',
      fyStart,
      clientRows: zeroNegativeClients,
      grandTotal: zeroNegativeTotal,
      accentColor: '#059669',
      badgeText: 'CLEARED & OVERPAID (\u2264 0)'
    });

    console.log(`Sending Mail 2 to ${TEST_RECIPIENT}...`);
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: TEST_RECIPIENT,
      subject: `[TEST] MRM Cleared/Overpaid Report - ${dateStr} (${zeroNegativeClients.length} clients | ${formatCurrency(zeroNegativeTotal)})`,
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
