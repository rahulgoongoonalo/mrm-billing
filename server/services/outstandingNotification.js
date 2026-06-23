const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const Settings = require('../models/Settings');
const { getTransporter } = require('./emailService');
const { aggregateOutstanding, buildPerClientReportHtml, formatCurrency } = require('./outstandingReport');

const recipients = 'rahul.goongoonalo@gmail.com, sherley@musicrightsmanagementindia.com, devi@musicrightsmanagementindia.com, accounts@musicrightsmanagementindia.com';

async function sendOutstandingNotification() {
  try {
    const financialYear = await Settings.getSetting('financialYear');
    const fyStart = financialYear.startYear; // still used only for the email header label

    // Get ALL entries across all fiscal years — we want each client's full
    // monthly history regardless of which FY it lives in.
    const entries = await RoyaltyAccounting.find({}).lean();

    if (entries.length === 0) {
      console.log('Outstanding Notification: No entries found, skipping email.');
      return;
    }

    const {
      positiveClients, zeroNegativeClients,
      positiveTotal, zeroNegativeTotal,
      windowMonths, positiveMonthTotals, zeroNegativeMonthTotals,
    } = aggregateOutstanding(entries);

    const dateStr = new Date().toLocaleDateString('en-IN');

    // --- MAIL 1: Positive Outstanding (greater than 0) ---
    const positiveHtml = buildPerClientReportHtml({
      title: 'Outstanding Report - Receivables',
      subtitle: 'Clients with outstanding amount greater than zero, sorted from highest to lowest.',
      fyStart,
      clientRows: positiveClients,
      grandTotal: positiveTotal,
      accentColor: '#2563eb',
      badgeText: 'RECEIVABLES (> 0)',
      windowMonths,
      monthTotals: positiveMonthTotals,
      isTest: false,
    });

    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: recipients,
      subject: `MRM Receivables Report - ${dateStr} (${positiveClients.length} clients | ${formatCurrency(positiveTotal)})`,
      html: positiveHtml
    });
    console.log(`Mail 1 (Positive Outstanding) sent: ${positiveClients.length} clients, total ${formatCurrency(positiveTotal)}`);

    // --- MAIL 2: Zero & Negative Outstanding ---
    const zeroNegativeHtml = buildPerClientReportHtml({
      title: 'Outstanding Report - Cleared & Overpaid',
      subtitle: 'Clients with zero or negative outstanding balance (overpaid / advance).',
      fyStart,
      clientRows: zeroNegativeClients,
      grandTotal: zeroNegativeTotal,
      accentColor: '#059669',
      badgeText: 'CLEARED & OVERPAID (≤ 0)',
      windowMonths,
      monthTotals: zeroNegativeMonthTotals,
      isTest: false,
    });

    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: recipients,
      subject: `MRM Cleared/Overpaid Report - ${dateStr} (${zeroNegativeClients.length} clients | ${formatCurrency(zeroNegativeTotal)})`,
      html: zeroNegativeHtml
    });
    console.log(`Mail 2 (Zero/Negative Outstanding) sent: ${zeroNegativeClients.length} clients, total ${formatCurrency(zeroNegativeTotal)}`);

    console.log('Both outstanding notification emails sent successfully at', new Date().toLocaleString());
  } catch (error) {
    console.error('Failed to send outstanding notification:', error.message);
  }
}

module.exports = { sendOutstandingNotification };
