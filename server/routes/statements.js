// Public (HMAC-guarded) statement pages linked from the daily outstanding email
// and from the Whatsapp Report screen.
// Not behind JWT: an email client cannot carry an access token.

const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const { buildStatement, verifyStatementToken } = require('../services/statementBuilder');
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

const STYLE = `
:root{
  --ink:#16202e; --muted:#6b7686; --faint:#98a2b3; --line:#e5eaf1; --hair:#eef2f7;
  --navy:#1F3864; --blue:#2E6DA4; --green:#1F6B24; --red:#B01414; --paper:#fff; --bg:#eceff4;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:14px/1.55 "Segoe UI",system-ui,-apple-system,"Helvetica Neue",sans-serif;
  -webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.wrap{max-width:1160px;margin:0 auto;padding:30px 18px 60px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px;
  box-shadow:0 1px 2px rgba(16,24,40,.05),0 12px 34px rgba(16,24,40,.07);overflow:hidden}

/* masthead */
.mast{display:flex;justify-content:space-between;gap:28px;flex-wrap:wrap;padding:26px 30px 22px}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.mark{width:34px;height:34px;border-radius:9px;background:var(--navy);color:#fff;
  display:grid;place-items:center;font-size:11px;font-weight:700;letter-spacing:.5px}
.brand span{font-size:10.5px;letter-spacing:1.5px;text-transform:uppercase;color:var(--faint);font-weight:600}
h1{margin:0;font-size:22px;font-weight:700;color:var(--navy);letter-spacing:-.3px}
.ident{margin-top:5px;font-size:13px;color:var(--muted)}
.ident .id{font-weight:600;color:var(--ink)}
.terms{margin-top:3px;font-size:12px;color:var(--faint)}
.balance{text-align:right;min-width:210px}
.balance .cap{font-size:10.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--faint);font-weight:600}
.balance .amt{display:block;margin-top:4px;font-size:32px;font-weight:700;color:var(--navy);letter-spacing:-.8px;line-height:1.1}
.balance .amt.zero{color:var(--green)}
.balance .amt i,tfoot .tot i{font-style:normal;font-size:.55em;font-weight:600;color:var(--faint);margin-right:3px;letter-spacing:.3px}
.balance .asat{margin-top:3px;font-size:11.5px;color:var(--muted)}

/* stat strip */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
  border-top:1px solid var(--hair);border-bottom:1px solid var(--line)}
.stat{padding:14px 30px;border-right:1px solid var(--hair)}
.stat:last-child{border-right:none}
.stat span{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--faint);font-weight:600}
.stat b{display:block;margin-top:4px;font-size:16px;font-weight:700;color:var(--navy)}
.stat.g b{color:var(--green)}
.stat.b b{color:var(--blue)}

.bar{padding:12px 30px;background:#f7f9fc;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center}
.spacer{flex:1}
.print{font:inherit;font-size:12.5px;font-weight:600;padding:8px 14px;border:1px solid var(--green);
  border-radius:8px;background:var(--green);color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:7px}
.print:hover{filter:brightness(1.1)}
.why{margin:0;padding:12px 30px;font-size:12.5px;color:var(--muted);border-bottom:1px solid var(--line);background:#fcfdfe}
.why b{color:var(--navy)}

/* ledger */
table{width:100%;border-collapse:collapse}
thead th{position:sticky;top:0;z-index:2;background:var(--navy);color:#fff;font-size:10.5px;font-weight:600;
  letter-spacing:.7px;text-transform:uppercase;text-align:left;padding:11px 16px;white-space:nowrap}
thead th.r{text-align:right}
tbody td{padding:13px 16px;border-bottom:1px solid var(--hair);vertical-align:top}
tbody tr:nth-child(even) td{background:#fbfcfe}
tbody tr:hover td{background:#f4f8fd}
td.mo{width:92px;white-space:nowrap;font-weight:700;color:var(--navy);font-size:13px}
td.roy{width:232px;border-left:1px solid var(--hair);border-right:1px solid var(--hair)}
td.tot{width:140px;text-align:right;font-weight:700;color:var(--navy);white-space:nowrap;font-size:14px}

/* royalty cell */
.rt{display:block;text-align:right;font-size:14px;font-weight:700;color:var(--blue)}
.rb{list-style:none;margin:7px 0 0;padding:0;display:grid;gap:3px}
.rb li{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:var(--faint)}
.rb li b{font-weight:600;color:var(--muted)}

/* account cell */
.mv{list-style:none;margin:0;padding:0;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:5px 22px}
.mv li{display:flex;align-items:baseline;gap:9px;min-width:0}
.mv .amt{flex:0 0 106px;text-align:right;font-weight:600;font-size:13px}
.mv .tag{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.up{color:var(--green)}
.dn{color:var(--red)}
.none{color:var(--faint);font-style:italic;font-size:12.5px}

tfoot td{background:#dfe6f1;border-top:2px solid var(--navy);font-weight:700;color:var(--navy);padding:14px 16px}
tfoot td.roy{color:var(--blue);text-align:right;font-size:14px}
tfoot td.tot{font-size:16px}
tfoot .lead{font-size:13px}

.note{padding:16px 30px;border-top:1px solid var(--line);font-size:11.5px;color:var(--faint);line-height:1.65}
.note b{color:var(--muted)}
.ft{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:20px;font-size:11.5px;color:var(--faint)}
.ft b{color:var(--muted)}
.ft .v{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;border:1px solid var(--line);border-radius:5px;padding:1px 6px}
.empty{padding:48px 30px;text-align:center;color:var(--muted)}

@media(max-width:820px){
  .mast{padding:22px 18px}.stat{padding:12px 18px}.bar,.why,.note{padding-left:18px;padding-right:18px}
  .balance{text-align:left}
  td.roy,td.tot{width:auto}
  .mv{grid-template-columns:1fr}
}
@media print{
  body{background:#fff}
  .wrap{max-width:none;padding:0}
  .card{box-shadow:none;border:none;border-radius:0}
  .bar{display:none}
  thead th{position:static}
  tbody tr:nth-child(even) td{background:#fbfcfe}
  tr{page-break-inside:avoid}
  thead{display:table-header-group}
  /* the closing total must print once, after the last month - never repeated
     at the foot of every page, where it would read as the end of the statement */
  tfoot{display:table-row-group}
  .ft{margin-top:14px}
}
`;

// The report screen already asks which view to open, so this bar carries only
// the PDF action. It is hidden when printing.
function controls() {
  return `<div class="bar">
  <span class="spacer"></span>
  <button class="print" onclick="window.print()" type="button">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
    Download as PDF
  </button>
</div>`;
}

function page(st) {
  const money = (items) => items.map((it) => `<li><span class="amt ${it.amount >= 0 ? 'up' : 'dn'}">${it.amount >= 0 ? '+' : '−'}${inr(Math.abs(it.amount))}</span><span class="tag">${esc(it.label)}</span></li>`).join('');

  const rows = st.lines.map((l) => {
    const acct = l.items.length
      ? `<ul class="mv">${money(l.items)}</ul>`
      : '<span class="none">No movement</span>';
    const roy = l.royaltyTotal
      ? `<span class="rt">${inr(l.royaltyTotal)}</span><ul class="rb">${l.royalty.map((r) => `<li><span>${esc(r.label)}</span><b>${inr(r.amount)}</b></li>`).join('')}</ul>`
      : '<span class="none" style="display:block;text-align:right">&mdash;</span>';
    return `<tr><td class="mo">${esc(l.month)}</td><td class="roy">${roy}</td><td>${acct}</td><td class="tot">${inr(l.total)}</td></tr>`;
  }).join('');

  const opening = st.openedFrom ? `Brought forward from ${esc(st.openedFrom)}` : 'Opening balance';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(st.clientId)} &middot; Statement of Outstanding</title>
<style>${STYLE}</style></head><body><div class="wrap"><div class="card">

<header class="mast">
  <div>
    <div class="brand"><div class="mark">MRM</div><span>Music Rights Management</span></div>
    <h1>${esc(st.clientName)}</h1>
    <div class="ident"><span class="id">${esc(st.clientId)}</span> &middot; ${esc(st.clientType)}</div>
    <div class="terms">Commission ${esc(st.commissionRate)}% &middot; GST ${esc(st.gstRate)}% &middot; all figures in Rupees</div>
  </div>
  <div class="balance">
    <div class="cap">Outstanding</div>
    <span class="amt${Math.abs(st.closing) < 1 ? ' zero' : ''}"><i>Rs.</i> ${inr(st.closing)}</span>
    <div class="asat">as at ${esc(st.periodTo)}</div>
  </div>
</header>

<div class="stats">
  <div class="stat b"><span>Royalty received</span><b>${inr(st.royaltyTotal)}</b></div>
  <div class="stat g"><span>Commission earned</span><b>${inr(st.commissionTotal)}</b></div>
  <div class="stat"><span>Period</span><b>${esc(st.periodFrom)} &ndash; ${esc(st.periodTo)}</b></div>
  <div class="stat"><span>Months shown</span><b>${st.monthsShown} of ${st.monthsHeld}</b></div>
</div>

${controls()}
<p class="why"><b>${esc(st.mode === 'full' ? 'Full record' : 'How this balance was built')}:</b> ${esc(st.why)}.</p>

<table>
  <thead><tr><th>Month</th><th class="r">Royalty received</th><th>Account</th><th class="r">Month total</th></tr></thead>
  <tbody>
    <tr>
      <td class="mo">Opening</td>
      <td class="roy"><span class="none" style="display:block;text-align:right">&mdash;</span></td>
      <td><ul class="mv"><li><span class="amt up">${inr(st.openingBalance)}</span><span class="tag">${opening}</span></li></ul></td>
      <td class="tot">${inr(st.openingBalance)}</td>
    </tr>
    ${rows}
  </tbody>
  <tfoot>
    <tr>
      <td class="mo">Total</td>
      <td class="roy">${inr(st.royaltyTotal)}</td>
      <td class="lead">Closing outstanding as at ${esc(st.periodTo)}</td>
      <td class="tot"><i>Rs.</i> ${inr(st.closing)}</td>
    </tr>
  </tfoot>
</table>

<div class="note">
  <b>Royalty received</b> is what the societies paid in that month. It is shown for reference and is not part of the running balance &mdash; only the commission charged on it is.
  Green figures increase what the client owes; red figures reduce it.
  <b>Invoice</b> is the payment received against invoices raised, and <b>TDS</b> is the tax the client withheld on those invoices.
</div>
</div>
<p class="ft">Developed and maintained by <b>RDJ(MRM)</b><span class="v">v${APP_VERSION}</span></p>
</div></body></html>`;
}

function emptyPage(info) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(info.clientId)} &middot; Outstanding</title><style>${STYLE}</style></head>
<body><div class="wrap"><div class="card">
<header class="mast">
  <div>
    <div class="brand"><div class="mark">MRM</div><span>Music Rights Management</span></div>
    <h1>${esc(info.clientName)}</h1>
    <div class="ident"><span class="id">${esc(info.clientId)}</span></div>
  </div>
</header>
<div class="empty"><p>No entries for this client in the range you picked.</p>
<p class="terms">Go back to the report and choose a different period or year.</p></div>
</div><p class="ft">Developed and maintained by <b>RDJ(MRM)</b><span class="v">v${APP_VERSION}</span></p></div></body></html>`;
}

async function render(req, res, defaultMode) {
  try {
    const { clientId } = req.params;
    if (!verifyStatementToken(clientId, req.query.t)) {
      return res.status(403).send('<h1>403</h1><p>This statement link is not valid.</p>');
    }
    const client = await Client.findOne({ clientId });
    if (!client) return res.status(404).send('<h1>404</h1><p>Client not found.</p>');

    const rows = await RoyaltyAccounting.find({ clientId }).lean();
    if (!rows.length) return res.status(404).send('<h1>404</h1><p>No entries recorded for this client yet.</p>');

    const { mode, from, to, year } = req.query;
    const wanted = mode === 'period' || mode === 'year' ? mode : defaultMode;
    const st = buildStatement(client, rows, { mode: wanted, from, to, year });

    if (!st) return res.status(400).send('<h1>400</h1><p>That period is not a valid date range.</p>');
    if (st.empty) return res.set('Content-Type', 'text/html; charset=utf-8').send(emptyPage(st));

    res.set('Content-Type', 'text/html; charset=utf-8').send(page(st));
  } catch (err) {
    console.error('Statement render failed:', err);
    res.status(500).send('<h1>500</h1><p>Could not build this statement.</p>');
  }
}

router.get('/:clientId/outstanding', (req, res) => render(req, res, 'window'));
router.get('/:clientId/full', (req, res) => render(req, res, 'full'));

module.exports = router;
