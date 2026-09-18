// Monthly Low Royalty Report — sent on the 19th of each month at 9:00 AM IST.
// Scheduled in index.js; this module owns the recipients and the send itself.

const { getTransporter } = require('./emailService');
const { collectLowRoyalty, DEFAULT_THRESHOLD } = require('./lowRoyaltyReport');
const { buildLowRoyaltyMailHtml, formatCurrency } = require('./lowRoyaltyMail');

const recipients = [
  'devi@musicrightsmanagementindia.com',
  'durgasingh.jr@gmail.com',
  'aarti@joshuainc.in',
  'accounts@musicrightsmanagementindia.com',
  'accounts@joshuainc.in',
  'rahul.goongoonalo@gmail.com',
  'ranjanivelayudham.jr@gmail.com',
].join(', ');

async function sendLowRoyaltyReport(threshold = DEFAULT_THRESHOLD) {
  try {
    const report = await collectLowRoyalty(threshold);

    if (!report.reviewed) {
      console.log('Low Royalty Report: no active clients, skipping email.');
      return;
    }

    const html = buildLowRoyaltyMailHtml({ report, isTest: false });
    const dateStr = new Date().toLocaleDateString('en-IN');

    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: recipients,
      subject: `MRM Low Royalty Report - ${dateStr} (${report.allTime.length} all time + ${report.lastYearOnly.length} more in the last 12 months, under ${formatCurrency(report.threshold)})`,
      html,
    });

    console.log(`Low Royalty Report sent: ${report.allTime.length} all time, ${report.lastYearOnly.length} additional over the last 12 months, ${report.reviewed} clients reviewed.`);
  } catch (error) {
    console.error('Failed to send Low Royalty Report:', error.message);
  }
}

module.exports = { sendLowRoyaltyReport, recipients };
