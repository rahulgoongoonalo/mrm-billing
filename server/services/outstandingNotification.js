const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const Settings = require('../models/Settings');
const { getTransporter } = require('./emailService');

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

async function sendOutstandingNotification() {
  try {
    const financialYear = await Settings.getSetting('financialYear');
    const fyStart = financialYear.startYear;

    // Get all entries for current FY
    const entries = await RoyaltyAccounting.find({
      $or: [
        { year: fyStart, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
        { year: fyStart + 1, month: { $in: ['jan', 'feb', 'mar'] } }
      ]
    }).lean();

    if (entries.length === 0) {
      console.log('Outstanding Notification: No entries found for current FY, skipping email.');
      return;
    }

    // Find each client's latest month entry
    const latestByClient = {};
    entries.forEach(e => {
      const prev = latestByClient[e.clientId];
      if (!prev ||
          monthOrder.indexOf(e.month) > monthOrder.indexOf(prev.month) ||
          e.year > prev.year) {
        latestByClient[e.clientId] = e;
      }
    });

    const clientRows = Object.values(latestByClient)
      .sort((a, b) =>
        (parseInt(a.clientId?.match(/(\d+)/)?.[1], 10) || 0) -
        (parseInt(b.clientId?.match(/(\d+)/)?.[1], 10) || 0)
      );

    const grandTotal = clientRows.reduce((sum, e) => sum + (e.totalOutstanding || 0), 0);

    // Build HTML email
    const tableRows = clientRows.map(e => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${e.clientId}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${e.clientName}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${monthLabels[e.month]} ${e.year}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: 500;">${formatCurrency(e.totalOutstanding)}</td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
          Daily Outstanding Report
        </h2>
        <p style="color: #666; font-size: 14px;">
          FY ${fyStart}-${fyStart + 1} | Generated on ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="background: #f8f9fa;">
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #dee2e6;">Client ID</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #dee2e6;">Client Name</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #dee2e6;">Latest Month</th>
              <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #dee2e6;">Total Outstanding</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
          <tfoot>
            <tr style="background: #f8f9fa; font-weight: bold;">
              <td colspan="3" style="padding: 10px 12px; border-top: 2px solid #dee2e6;">Grand Total (${clientRows.length} clients)</td>
              <td style="padding: 10px 12px; border-top: 2px solid #dee2e6; text-align: right; color: #007bff;">${formatCurrency(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">
          This is an automated email from MRM Billing App.
        </p>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: 'rahul.goongoonalo@gmail.com',
      subject: `MRM Outstanding Report - ${new Date().toLocaleDateString('en-IN')}`,
      html
    };

    await getTransporter().sendMail(mailOptions);
    console.log('Outstanding notification email sent successfully at', new Date().toLocaleString());
  } catch (error) {
    console.error('Failed to send outstanding notification:', error.message);
  }
}

module.exports = { sendOutstandingNotification };
