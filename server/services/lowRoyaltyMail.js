// Renders the Low Royalty Report email.

const { statementUrl } = require('./statementBuilder');
const { version: APP_VERSION } = require('../package.json');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(amount || 0);

const formatNumber = (amount) => new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(amount || 0);

const TH = (h, i, n) => `<th style="padding:10px;text-align:${i >= n - 2 ? 'right' : 'left'};font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#fff;white-space:nowrap;">${h}</th>`;

function table(rows) {
  if (!rows.length) {
    return '<div style="font-size:12.5px;color:#8a93a3;padding:13px 15px;border:1px dashed #dbe2ec;border-radius:8px;background:#fafbfd;">No clients fall under this threshold.</div>';
  }
  const heads = ['#', 'Client', 'Months', 'Royalty received', 'Statement'];
  const body = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafbfd'};">
      <td style="padding:10px;border-bottom:1px solid #eef1f6;font-size:11.5px;color:#a6adba;">${i + 1}</td>
      <td style="padding:10px;border-bottom:1px solid #eef1f6;font-size:12.5px;line-height:1.4;">
        <div style="font-weight:600;color:#1F3864;">${esc(r.clientName)}</div>
        <div style="font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#2E6DA4;margin-top:2px;">${esc(r.clientId)}${r.clientType ? ` &middot; <span style="font-family:inherit;color:#a6adba;">${esc(r.clientType)}</span>` : ''}</div>
      </td>
      <td style="padding:10px;border-bottom:1px solid #eef1f6;text-align:right;font-size:12px;color:#8a93a3;white-space:nowrap;">${r.hasEntries ? r.months : '<span style="color:#B0611A;">no entries</span>'}</td>
      <td style="padding:10px;border-bottom:1px solid #eef1f6;text-align:right;font-size:13px;font-weight:700;color:${r.totalRoyalty > 0 ? '#2E6DA4' : '#a6adba'};white-space:nowrap;">${formatNumber(r.totalRoyalty)}</td>
      <td style="padding:10px;border-bottom:1px solid #eef1f6;text-align:right;white-space:nowrap;">
        <a href="${esc(statementUrl(r.clientId, 'full'))}" style="display:inline-block;text-decoration:none;font-size:11px;font-weight:600;color:#1F3864;border:1px solid #cfd8e6;border-radius:6px;padding:5px 9px;background:#f6f9fd;">Full record</a>
      </td>
    </tr>`).join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e3e8f0;border-radius:8px;overflow:hidden;">
    <tr style="background:#1F3864;">${heads.map((h, i) => TH(h, i, heads.length)).join('')}</tr>
    ${body}
  </table>`;
}

function buildLowRoyaltyMailHtml({ report, isTest, now = new Date() }) {
  const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const limit = formatCurrency(report.threshold);
  const win = report.window.from && report.window.to
    ? `${report.window.from} to ${report.window.to}`
    : 'the last twelve months';

  const testBanner = isTest ? `
    <tr><td style="background:#fef3c7;padding:10px 26px;color:#92400e;font-size:12px;font-weight:600;border-bottom:1px solid #fde68a;">
      TEST EMAIL &mdash; sent only to the test recipient
    </td></tr>` : '';

  const kpi = (label, value, color) => `
    <td style="padding:0 8px 0 0;vertical-align:top;width:33.33%;">
      <div style="border:1px solid #e3e8f0;border-top:3px solid ${color};border-radius:8px;padding:11px 13px;background:#fff;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#8a93a3;margin-bottom:3px;">${label}</div>
        <div style="font-size:17px;font-weight:700;color:${color};">${value}</div>
      </div>
    </td>`;

  const section = (title, sub, rows) => `
  <tr><td style="padding:24px 26px 6px;">
    <div style="font-size:13px;font-weight:700;color:#1F3864;margin-bottom:2px;">${title}</div>
    <div style="font-size:11.5px;color:#8a93a3;">${sub}</div>
  </td></tr>
  <tr><td style="padding:6px 26px 4px;">${table(rows)}</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1e2430;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#eef1f6;padding:24px 10px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:900px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.09),0 10px 32px rgba(16,24,40,.06);">
  ${testBanner}
  <tr><td style="padding:24px 26px 18px;border-bottom:1px solid #e6eaf0;">
    <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#8a93a3;font-weight:600;">Music Rights Management</div>
    <div style="font-size:22px;font-weight:700;color:#1F3864;margin-top:3px;letter-spacing:-.3px;">Low Royalty Report</div>
    <div style="font-size:12.5px;color:#5a6474;margin-top:3px;">${esc(dateStr)} &mdash; clients whose royalty receipts add up to ${limit} or less.</div>
  </td></tr>

  <tr><td style="padding:18px 26px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        ${kpi('Low all time', String(report.allTime.length), '#B01414')}
        ${kpi('Low last 12 months', `${report.lastYear.length}`, '#B0611A')}
        ${kpi('Clients reviewed', String(report.reviewed), '#1F3864')}
      </tr>
    </table>
  </td></tr>

  ${section(
    `Never received more than ${limit} &mdash; all time`,
    `${report.allTime.length} clients. Everything the societies have ever paid in for them, added together, comes to ${limit} or less.`,
    report.allTime,
  )}

  ${section(
    `Also low in the last 12 months &mdash; not already listed above`,
    report.lastYearOnly.length
      ? `${report.lastYearOnly.length} further client${report.lastYearOnly.length === 1 ? '' : 's'} took ${limit} or less over ${esc(win)}, having earned more than that earlier.`
      : `No further clients. Everyone who took ${limit} or less over ${esc(win)} is already named above.`,
    report.lastYearOnly,
  )}

  <tr><td style="padding:18px 26px 22px;font-size:11.5px;color:#8a93a3;line-height:1.6;">
    <strong style="color:#5a6474;">Royalty received</strong> is what IPRS, PRS, ISAMRA, ASCAP, PPL, MLC and Sound Exchange actually paid in. It is not commission, and it is not the outstanding balance.
    ${report.noEntries ? `<br>${report.noEntries} of the clients listed have no monthly entries recorded at all, so their royalty reads as zero. They are marked <span style="color:#B0611A;font-weight:600;">no entries</span> in the Months column.` : ''}
    <br>Because the books only run from April 2025, &ldquo;all time&rdquo; and &ldquo;last 12 months&rdquo; overlap heavily, so the two lists look similar by design.
  </td></tr>

  <tr><td style="padding:14px 26px;background:#f6f8fc;border-top:1px solid #e6eaf0;text-align:center;font-size:11.5px;color:#98a1b0;">
    Developed and maintained by <strong style="color:#6b7484;">RDJ(MRM)</strong>
    <span style="font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:#a8b0bd;border:1px solid #dfe4ec;border-radius:5px;padding:1px 6px;margin-left:7px;">v${APP_VERSION}</span>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

module.exports = { buildLowRoyaltyMailHtml, formatCurrency };
