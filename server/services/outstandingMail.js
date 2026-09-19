// Builds the daily outstanding email: one mail, every client, latest month only.
// Each row links out to two statement pages - how the balance was built, and
// the complete record.

const { calOrder, longLabel, shortLabel, statementUrl } = require('./statementBuilder');
const { version: APP_VERSION } = require('../package.json');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(amount || 0);

const formatNumber = (amount) => new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(amount || 0);

/**
 * One row per client, carrying only that client's latest month.
 * Sorted highest outstanding first, down through zero, with overpaid last.
 */
function summariseLatest(entries, clients) {
  const byClient = new Map();
  for (const e of entries) {
    const prev = byClient.get(e.clientId);
    if (!prev || calOrder(e) > calOrder(prev)) byClient.set(e.clientId, e);
  }

  const master = new Map((clients || []).map((c) => [c.clientId, c]));

  return [...byClient.values()]
    .map((e) => {
      const c = master.get(e.clientId);
      return {
        clientId: e.clientId,
        clientName: (c && c.name) || e.clientName || e.clientId,
        clientType: (c && c.type) || '',
        month: shortLabel(e),
        monthLong: longLabel(e),
        outstanding: e.totalOutstanding || 0,
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);
}

/** Clients whose master record was created in the current calendar month. */
function newClientsThisMonth(clients, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  return (clients || [])
    .filter((c) => {
      if (!c.createdAt) return false;
      const d = new Date(c.createdAt);
      return d.getFullYear() === y && d.getMonth() === m;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function buildOutstandingMailHtml({ rows, totals, newClients, isTest, now = new Date() }) {
  const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const monthStr = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const receivable = rows.filter((r) => r.outstanding > 0);
  const settled = rows.filter((r) => Math.abs(r.outstanding) < 1);
  const overpaid = rows.filter((r) => r.outstanding <= -1);
  const totalReceivable = receivable.reduce((s, r) => s + r.outstanding, 0);
  const sum = totals || {};

  const testBanner = isTest ? `
    <tr><td style="background:#fef3c7;padding:10px 26px;color:#92400e;font-size:12px;font-weight:600;border-bottom:1px solid #fde68a;">
      TEST EMAIL &mdash; sent only to the test recipient
    </td></tr>` : '';

  const kpi = (label, value, color) => `
    <td style="padding:0 8px 8px 0;vertical-align:top;width:33.33%;">
      <div style="border:1px solid #e3e8f0;border-top:3px solid ${color};border-radius:8px;padding:11px 13px;background:#fff;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#8a93a3;margin-bottom:3px;">${label}</div>
        <div style="font-size:17px;font-weight:700;color:${color};">${value}</div>
      </div>
    </td>`;

  const newClientRows = newClients.map((c) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12.5px;font-weight:600;color:#1F3864;white-space:nowrap;">${esc(c.clientId)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12.5px;color:#374151;">${esc(c.name)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;color:#6b7280;">${esc(c.type || '')}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;color:#6b7280;text-align:right;white-space:nowrap;">${esc(c.commissionRate)}%</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;color:#6b7280;text-align:right;white-space:nowrap;">${new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
    </tr>`).join('');

  const newClientsBlock = newClients.length ? `
    <div style="padding:20px 26px 4px;">
      <div style="font-size:13px;font-weight:700;color:#1F3864;margin-bottom:2px;">New clients added in ${esc(monthStr)}</div>
      <div style="font-size:11.5px;color:#8a93a3;margin-bottom:10px;">${newClients.length} client${newClients.length === 1 ? '' : 's'} added to the master this month.</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e3e8f0;border-radius:8px;overflow:hidden;">
        <tr style="background:#f4f7fc;">
          <th style="padding:8px 10px;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#5a6474;border-bottom:1px solid #e3e8f0;">ID</th>
          <th style="padding:8px 10px;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#5a6474;border-bottom:1px solid #e3e8f0;">Client</th>
          <th style="padding:8px 10px;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#5a6474;border-bottom:1px solid #e3e8f0;">Type</th>
          <th style="padding:8px 10px;text-align:right;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#5a6474;border-bottom:1px solid #e3e8f0;">Rate</th>
          <th style="padding:8px 10px;text-align:right;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#5a6474;border-bottom:1px solid #e3e8f0;">Added</th>
        </tr>
        ${newClientRows}
      </table>
    </div>` : `
    <div style="padding:20px 26px 4px;">
      <div style="font-size:13px;font-weight:700;color:#1F3864;margin-bottom:2px;">New clients added in ${esc(monthStr)}</div>
      <div style="font-size:12px;color:#8a93a3;padding:11px 13px;border:1px dashed #dbe2ec;border-radius:8px;background:#fafbfd;">No new clients were added this month.</div>
    </div>`;

  const bodyRows = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafbfd'};">
      <td style="padding:10px;border-bottom:1px solid #eef1f6;font-size:11.5px;color:#a6adba;">${i + 1}</td>
      <td style="padding:10px;border-bottom:1px solid #eef1f6;font-size:12.5px;line-height:1.4;">
        <div style="font-weight:600;color:#1F3864;">${esc(r.clientName)}</div>
        <div style="font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#2E6DA4;margin-top:2px;">${esc(r.clientId)}</div>
      </td>
      <td style="padding:10px;border-bottom:1px solid #eef1f6;font-size:11.5px;color:#8a93a3;white-space:nowrap;">${esc(r.month)}</td>
      <td style="padding:10px;border-bottom:1px solid #eef1f6;text-align:right;font-size:13px;font-weight:700;white-space:nowrap;color:${r.outstanding > 0 ? '#1F3864' : r.outstanding <= -1 ? '#B01414' : '#1F6B24'};">${formatNumber(r.outstanding)}</td>
      <td style="padding:10px;border-bottom:1px solid #eef1f6;text-align:right;white-space:nowrap;">
        <a href="${esc(statementUrl(r.clientId, 'outstanding'))}" style="display:inline-block;text-decoration:none;font-size:11px;font-weight:600;color:#1F3864;border:1px solid #cfd8e6;border-radius:6px;padding:5px 9px;background:#f6f9fd;">Balance build-up</a>
        <a href="${esc(statementUrl(r.clientId, 'full'))}" style="display:inline-block;text-decoration:none;font-size:11px;font-weight:600;color:#1F3864;border:1px solid #cfd8e6;border-radius:6px;padding:5px 9px;background:#f6f9fd;margin-left:5px;">Full record</a>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1e2430;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#eef1f6;padding:24px 10px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:900px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.09),0 10px 32px rgba(16,24,40,.06);">
  ${testBanner}
  <tr><td style="padding:24px 26px 18px;border-bottom:1px solid #e6eaf0;">
    <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#8a93a3;font-weight:600;">Music Rights Management</div>
    <div style="font-size:22px;font-weight:700;color:#1F3864;margin-top:3px;letter-spacing:-.3px;">Outstanding Report</div>
    <div style="font-size:12.5px;color:#5a6474;margin-top:3px;">${esc(dateStr)} &mdash; every client, latest month only, highest first.</div>
  </td></tr>

  <tr><td style="padding:18px 26px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        ${kpi('Total receivable', formatCurrency(totalReceivable), '#1F3864')}
        ${kpi('Royalty', formatCurrency(sum.totalRoyalty), '#2E6DA4')}
        ${kpi('Commission', formatCurrency(sum.commission), '#1F6B24')}
      </tr>
      <tr>
        ${kpi('Clients owing', String(receivable.length), '#B0611A')}
        ${kpi('Settled', String(settled.length), '#1F6B24')}
        ${kpi('Overpaid', String(overpaid.length), '#B01414')}
      </tr>
    </table>
  </td></tr>

  <tr><td>${newClientsBlock}</td></tr>

  <tr><td style="padding:22px 26px 6px;">
    <div style="font-size:13px;font-weight:700;color:#1F3864;margin-bottom:2px;">All clients &mdash; latest month outstanding</div>
    <div style="font-size:11.5px;color:#8a93a3;">${rows.length} clients, highest first. Open a statement to see how a balance was built.</div>
  </td></tr>

  <tr><td style="padding:6px 26px 22px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e3e8f0;border-radius:8px;overflow:hidden;">
      <tr style="background:#1F3864;">
        <th style="padding:10px;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#fff;">#</th>
        <th style="padding:10px;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#fff;">Client</th>
        <th style="padding:10px;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#fff;">Months</th>
        <th style="padding:10px;text-align:right;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#fff;">Outstanding</th>
        <th style="padding:10px;text-align:right;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#fff;">Statement</th>
      </tr>
      ${bodyRows}
    </table>
  </td></tr>

  <tr><td style="padding:0 26px 22px;font-size:11.5px;color:#8a93a3;line-height:1.55;">
    Each client&rsquo;s most recent recorded month. Open a statement to see the royalty received, the commission charged and how the balance was built.
  </td></tr>

  <tr><td style="padding:14px 26px;background:#f6f8fc;border-top:1px solid #e6eaf0;text-align:center;font-size:11.5px;color:#98a1b0;">
    Developed and maintained by <strong style="color:#6b7484;">RDJ(MRM)</strong>
    <span style="font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:#a8b0bd;border:1px solid #dfe4ec;border-radius:5px;padding:1px 6px;margin-left:7px;">v${APP_VERSION}</span>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

module.exports = { summariseLatest, newClientsThisMonth, buildOutstandingMailHtml, formatCurrency, formatNumber };
