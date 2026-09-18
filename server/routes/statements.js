// Public (HMAC-guarded) statement pages linked from the daily outstanding email.
// Not behind JWT: an email client cannot carry an access token.

const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const { buildStatement, verifyStatementToken, statementUrl } = require('../services/statementBuilder');
const { version: APP_VERSION } = require('../package.json');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const inr = (v) => {
  const neg = v < 0;
  const [i, d] = Math.abs(v).toFixed(2).split('.');
  let out = i;
  if (i.length > 3) {
    const last3 = i.slice(-3);
    let rest = i.slice(0, -3);
    const g = [];
    while (rest.length > 2) { g.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
    if (rest) g.unshift(rest);
    out = `${g.join(',')},${last3}`;
  }
  return `${neg ? '-' : ''}${out}.${d}`;
};

function page(st) {
  const other = st.mode === 'full' ? 'outstanding' : 'full';
  const otherLabel = st.mode === 'full' ? 'Current outstanding' : 'Full record';
  const otherHint = st.mode === 'full'
    ? 'Just the months that explain the balance today'
    : `All ${st.monthsHeld} months held for this client`;

  const rows = st.lines.map((l) => {
    const acct = l.items.length
      ? l.items.map((it) => `<span class="it"><b class="${it.amount >= 0 ? 'up' : 'dn'}">${it.amount >= 0 ? '+' : '-'}${inr(Math.abs(it.amount))}</b> <span class="lbl">(${esc(it.label)})</span></span>`).join('')
      : '<span class="none">no movement</span>';
    return `<tr><td class="mo">${esc(l.month)}</td><td class="acct">${acct}</td><td class="tot">${inr(l.total)}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(st.clientId)} &middot; Outstanding</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#eef1f6;color:#1e2430;font:14px/1.55 "Segoe UI",system-ui,-apple-system,sans-serif}
.wrap{max-width:1120px;margin:0 auto;padding:28px 18px 56px}
.card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(16,24,40,.09),0 10px 32px rgba(16,24,40,.06);overflow:hidden}
.hd{padding:22px 26px;border-bottom:1px solid #e6eaf0}
h1{margin:0 0 3px;font-size:21px;color:#1F3864;letter-spacing:-.2px}
.sub{font-size:13px;color:#5a6474}
.meta{font-size:12px;color:#8a93a3;margin-top:5px}
.big{margin-top:16px;display:flex;align-items:baseline;gap:11px;flex-wrap:wrap}
.big .amt{font-size:30px;font-weight:700;color:#1F3864;letter-spacing:-.6px}
.big .amt.zero{color:#1F6B24}
.big .cap{font-size:11.5px;text-transform:uppercase;letter-spacing:.7px;color:#8a93a3}
.why{margin:0;padding:11px 26px;background:#f6f8fc;border-bottom:1px solid #e6eaf0;font-size:12.5px;color:#5a6474}
.why b{color:#1F3864}
table{width:100%;border-collapse:collapse}
th{background:#1F3864;color:#fff;font-size:11.5px;font-weight:600;text-align:left;padding:9px 12px;letter-spacing:.2px}
th.r{text-align:right}
td{padding:9px 12px;border-bottom:1px solid #edf0f5;vertical-align:top}
tr:last-child td{border-bottom:none}
td.mo{font-weight:600;color:#1F3864;white-space:nowrap;width:86px}
td.tot{text-align:right;font-weight:700;color:#1F3864;white-space:nowrap;width:130px;font-variant-numeric:tabular-nums}
.it{display:inline-block;margin:0 16px 2px 0;white-space:nowrap}
.it b{font-variant-numeric:tabular-nums}
.up{color:#1F6B24}.dn{color:#B01414}
.lbl{color:#77808f;font-size:12px}
.none{color:#98a1b0;font-style:italic;font-size:13px}
tr.sum td{background:#dce3ef;border-top:2px solid #1F3864;font-weight:700;color:#1F3864;font-size:15px}
.acts{padding:16px 26px;border-top:1px solid #e6eaf0;display:flex;gap:12px;flex-wrap:wrap}
.btn{display:block;text-decoration:none;border:1px solid #cfd8e6;border-radius:9px;padding:10px 15px;background:#f8fafd;transition:.15s}
.btn:hover{border-color:#1F3864;background:#fff}
.btn .t{display:block;font-size:13px;font-weight:600;color:#1F3864}
.btn .h{display:block;font-size:11.5px;color:#8a93a3;margin-top:2px}
.note{padding:13px 26px;border-top:1px solid #e6eaf0;font-size:11.5px;color:#8a93a3;line-height:1.5}
.ft{text-align:center;font-size:11.5px;color:#98a1b0;margin-top:22px}
.ft b{color:#6b7484}
.ft .v{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:#a8b0bd;border:1px solid #dfe4ec;border-radius:5px;padding:1px 6px;margin-left:7px}
@media(max-width:640px){.it{display:block;margin-right:0}td.tot{width:auto}.wrap{padding:14px 10px 36px}}
</style></head><body><div class="wrap"><div class="card">
<div class="hd">
  <h1>${esc(st.clientName)}</h1>
  <div class="sub">${esc(st.clientId)} &middot; ${esc(st.clientType)}</div>
  <div class="meta">Commission ${esc(st.commissionRate)}% &middot; GST ${esc(st.gstRate)}% &middot; all figures in Rupees</div>
  <div class="big"><span class="amt${Math.abs(st.closing) < 1 ? ' zero' : ''}">Rs. ${inr(st.closing)}</span>
    <span class="cap">outstanding as at ${esc(st.periodTo)}</span></div>
</div>
<p class="why"><b>${esc(st.mode === 'full' ? 'Full record' : 'How this balance was built')}:</b> ${esc(st.periodFrom)} to ${esc(st.periodTo)} &mdash; ${esc(st.why)}.</p>
<table>
  <tr><th>Month</th><th>Account</th><th class="r">Month Total</th></tr>
  <tr><td class="mo">Opening</td><td class="acct"><span class="it"><b class="up">${inr(st.openingBalance)}</b> <span class="lbl">(${st.openedFrom ? `brought forward from ${esc(st.openedFrom)}` : 'opening balance'})</span></span></td><td class="tot">${inr(st.openingBalance)}</td></tr>
  ${rows}
  <tr class="sum"><td class="mo">TOTAL</td><td>Closing outstanding as at ${esc(st.periodTo)}</td><td class="tot">Rs. ${inr(st.closing)}</td></tr>
</table>
<div class="acts">
  <a class="btn" href="${esc(statementUrl(st.clientId, other))}"><span class="t">${otherLabel}</span><span class="h">${otherHint}</span></a>
</div>
<div class="note">Green figures increase what the client owes; red figures reduce it. Month Total is the balance after that month. &ldquo;Invoice&rdquo; is the payment received against invoices raised; TDS is the tax the client withheld on those invoices.</div>
</div>
<p class="ft">Developed and maintained by <b>RDJ</b><span class="v">v${APP_VERSION}</span></p>
</div></body></html>`;
}

async function render(req, res, mode) {
  try {
    const { clientId } = req.params;
    if (!verifyStatementToken(clientId, req.query.t)) {
      return res.status(403).send('<h1>403</h1><p>This statement link is not valid.</p>');
    }
    const client = await Client.findOne({ clientId });
    if (!client) return res.status(404).send('<h1>404</h1><p>Client not found.</p>');

    const rows = await RoyaltyAccounting.find({ clientId }).lean();
    const st = buildStatement(client, rows, mode);
    if (!st) return res.status(404).send('<h1>404</h1><p>No entries recorded for this client yet.</p>');

    res.set('Content-Type', 'text/html; charset=utf-8').send(page(st));
  } catch (err) {
    console.error('Statement render failed:', err);
    res.status(500).send('<h1>500</h1><p>Could not build this statement.</p>');
  }
}

router.get('/:clientId/outstanding', (req, res) => render(req, res, 'window'));
router.get('/:clientId/full', (req, res) => render(req, res, 'full'));

module.exports = router;
