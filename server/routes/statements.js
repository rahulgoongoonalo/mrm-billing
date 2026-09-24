// Public (HMAC-guarded) statement pages linked from the daily outstanding email
// and from the Whatsapp Report screen.
// Not behind JWT: an email client cannot carry an access token.

const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const { buildStatement, verifyStatementToken } = require('../services/statementBuilder');
const { PAYMENT_ACCOUNTS } = require('../utils/paymentAccounts');
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
  --green-bg:#eef7ef; --green-line:#cfe5d2;
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
.balance .cap{max-width:260px;margin-left:auto}

/* stat strip */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
  border-top:1px solid var(--hair);border-bottom:1px solid var(--line)}
.stat{padding:14px 30px;border-right:1px solid var(--hair)}
.stat:last-child{border-right:none}
.stat span{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--faint);font-weight:600}
.stat b{display:block;margin-top:4px;font-size:16px;font-weight:700;color:var(--navy)}
.stat.g b{color:var(--green)}
.stat.b b{color:var(--blue)}
.split{list-style:none;margin:8px 0 0;padding:6px 0 0;border-top:1px dashed var(--line);display:grid;gap:2px}
.split li{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--muted)}
.split li span{display:inline;font-size:12px;text-transform:none;letter-spacing:0;font-weight:600;color:var(--muted)}
.stat .split li b{display:inline;margin:0;font-size:12.5px;font-weight:600;color:var(--ink)}

.bar{padding:12px 30px;background:#f7f9fc;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center}
.spacer{flex:1}
.print{font:inherit;font-size:12.5px;font-weight:600;padding:8px 14px;border:1px solid var(--green);
  border-radius:8px;background:var(--green);color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:7px}
.print:hover{filter:brightness(1.1)}
.why{margin:0;padding:12px 30px;font-size:12.5px;color:var(--muted);border-bottom:1px solid var(--line);background:#fcfdfe}
.why b{color:var(--navy)}

/* ledger: month | royalty | service fees | invoices & GST | payments | balance */
table{width:100%;border-collapse:collapse}
thead th{position:sticky;top:0;z-index:2;background:var(--navy);color:#fff;font-size:10.5px;font-weight:600;
  letter-spacing:.6px;text-transform:uppercase;text-align:left;padding:11px 14px;vertical-align:bottom;line-height:1.35}
thead th.r{text-align:right}
thead th small{display:block;font-size:9.5px;font-weight:500;letter-spacing:.3px;text-transform:none;opacity:.75}
tbody td{padding:12px 14px;border-bottom:1px solid var(--hair);vertical-align:top}
tbody tr:nth-child(even) td{background:#fbfcfe}
tbody tr:hover td{background:#f4f8fd}
td+td{border-left:1px solid var(--hair)}
td.mo{width:78px;white-space:nowrap;font-weight:700;color:var(--navy);font-size:13px}
td.roy{width:170px}
td.fee,td.pay{width:175px}
td.tot{width:150px;text-align:right;font-weight:700;color:var(--navy);white-space:nowrap;font-size:14px}
.adj{display:block;margin-top:3px;font-size:10.5px;font-weight:500;color:var(--faint);white-space:normal}
.dash{display:block;text-align:right;color:var(--faint)}
.none{color:var(--faint);font-style:italic;font-size:12.5px}

/* royalty cell */
.rt{display:block;text-align:right;font-size:14px;font-weight:700;color:var(--blue)}
.rb{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:3px}
.rb li{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:var(--faint)}
.rb li b{font-weight:600;color:var(--muted)}

/* label ....... amount lines, shared by fees / invoices / payments */
.ln{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.ln li{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:12px;color:var(--muted)}
.ln li b{font-weight:600;font-size:13px;white-space:nowrap;color:var(--ink)}
.ln li.info b{font-weight:500;color:var(--muted)}
.ln li.sum{padding-top:4px;border-top:1px dashed var(--line)}
.inv+.inv{margin-top:10px;padding-top:10px;border-top:1px solid var(--hair)}
.inv-h{font-size:10.5px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;color:var(--faint);margin-bottom:4px}
.up,.ln li b.up{color:var(--green)}
.dn,.ln li b.dn{color:var(--red)}

tfoot td{background:#dfe6f1;border-top:2px solid var(--navy);font-weight:700;color:var(--navy);padding:12px 14px;vertical-align:middle}
tfoot tr.sums td{text-align:right;font-size:13.5px}
tfoot tr.sums td.mo{text-align:left}
tfoot tr.sums td.roy{color:var(--blue)}
tfoot tr.close td{border-top:1px solid #c9d4e5;background:#d3dcea}
tfoot .lead{font-size:13px;text-align:right}
tfoot .ctot{margin-left:16px;font-size:17px;white-space:nowrap}
tfoot .ctot i{font-style:normal;font-size:.55em;font-weight:600;color:var(--faint);margin-right:3px;letter-spacing:.3px}

.note{margin:20px 30px 24px;padding:16px 20px;background:var(--green-bg);border:1px solid var(--green-line);
  border-radius:10px;font-size:12.5px;color:#2c4a30;line-height:1.65}
.note b{color:var(--green)}
.note p{margin:0}
.note-h{font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--green);margin-bottom:6px}
.note ul{margin:0;padding-left:18px;display:grid;gap:4px}
.note li::marker{color:var(--green)}
.note b.up{color:var(--green)}.note b.dn{color:var(--red)}
.bank{margin:0 30px 20px;border:1px solid var(--line);border-radius:10px;overflow:hidden;page-break-inside:avoid}
.bank-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;
  padding:11px 18px;background:var(--navy);color:#fff}
.bank-h b{font-size:12px;letter-spacing:.8px;text-transform:uppercase}
.bank-h span{font-size:11.5px;opacity:.8}
.bank dl{margin:0;padding:6px 18px 10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px}
.bank dl div{display:flex;gap:12px;padding:7px 0;border-bottom:1px solid var(--hair);min-width:0}
.bank dt{flex:0 0 132px;font-size:11.5px;color:var(--muted)}
.bank dd{margin:0;font-size:13px;font-weight:600;color:var(--ink);overflow-wrap:anywhere}
.bank .wide{grid-column:1/-1}
.pick{padding:26px 30px 30px}
.pick h2{margin:0 0 4px;font-size:17px;color:var(--navy)}
.pick>p{margin:0 0 18px;color:var(--muted);font-size:13px}
.pick-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.pick-card{display:block;padding:16px 18px;border:1px solid var(--line);border-radius:12px;text-decoration:none;color:inherit;
  background:#fbfcfe;transition:border-color .15s,box-shadow .15s}
.pick-card:hover{border-color:var(--blue);box-shadow:0 4px 16px rgba(46,109,164,.12)}
.pick-card b{display:block;font-size:15px;color:var(--navy)}
.pick-card span{display:block;margin-top:4px;font-size:12.5px;color:var(--muted)}
.pick-card em{display:inline-block;margin-top:12px;font-style:normal;font-size:12.5px;font-weight:600;color:var(--blue)}
.acc{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 20px;
  margin:0 30px 24px;padding:13px 20px;border:1px solid var(--line);border-left:3px solid var(--navy);border-radius:10px;background:#f7f9fc}
.acc-cap{font-size:12px;color:var(--muted)}
.acc-who{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px;font-size:13.5px}
.acc-who b{color:var(--navy)}
.acc-who a{color:var(--blue);font-weight:600;text-decoration:none;white-space:nowrap}
.contact{display:flex;flex-wrap:wrap;gap:6px 24px;margin:12px 0 0;padding:0}
.contact div{display:flex;align-items:baseline;gap:7px;min-width:0}
.contact dt{font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--faint);font-weight:600}
.contact dd{margin:0;font-size:12.5px;font-weight:600;color:var(--ink);overflow-wrap:anywhere}
.ft{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:20px;font-size:11.5px;color:var(--faint)}
.ft b{color:var(--muted)}
.ft .v{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;border:1px solid var(--line);border-radius:5px;padding:1px 6px}
.empty{padding:48px 30px;text-align:center;color:var(--muted)}

@media(max-width:820px){
  .wrap{padding:16px 12px 40px}
  .mast{padding:22px 18px;gap:18px}.stat{padding:12px 18px}.bar,.why{padding-left:18px;padding-right:18px}
  .note{margin:16px 18px 20px}
  .acc{margin:0 18px 20px}
  .bank{margin:0 18px 20px}
  .pick{padding:22px 18px 26px}
  .balance{text-align:left;min-width:0}
  .balance .cap{margin-left:0}
}
/* narrow screens that still show the table: let it scroll sideways rather than squash */
@media screen and (min-width:641px) and (max-width:980px){
  .scroll{overflow-x:auto}
  .scroll table{min-width:900px}
  thead th{position:static}
}
/* phones: each month becomes a compact card - month and balance on top,
   then the transactions as a receipt (label left, amount right), then royalty */
@media screen and (max-width:640px){
  body{font-size:13px}
  .wrap{padding:0 0 28px}
  .card{border-radius:0;border-left:none;border-right:none;box-shadow:none}
  .mast{padding:18px 16px 16px}
  .brand{margin-bottom:12px}
  h1{font-size:19px}
  .contact{flex-direction:column;gap:3px;margin-top:10px}
  .balance{width:100%;padding:12px 14px;background:#f3f6fb;border:1px solid var(--line);border-radius:10px}
  .balance .amt{font-size:26px}
  .stats{grid-template-columns:1fr 1fr}
  .stat{padding:10px 16px;border-bottom:1px solid var(--hair)}
  .stat:nth-child(2n){border-right:none}
  .stat b{font-size:14.5px}
  .bar{padding:10px 16px}.bar .spacer{display:none}.print{flex:1;justify-content:center;padding:10px 14px}
  .why{padding:10px 16px;font-size:12px}

  table,tbody,tfoot,tr,td{display:block;width:auto}
  thead{display:none}
  tbody tr{display:grid;grid-template-columns:1fr auto;grid-template-areas:"mo tot" "fee fee" "inv inv" "pay pay" "roy roy" "quiet quiet";
    align-items:center;column-gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}
  tbody tr:nth-child(even){background:none}
  tbody td,tbody tr:nth-child(even) td,tbody tr:hover td,tfoot td{padding:0;border:none;background:none;width:auto}
  td.mo{grid-area:mo;font-size:14px}
  td.tot{grid-area:tot;font-size:15px;line-height:1.25}
  td.tot::before{content:attr(data-label);display:block;font-size:9.5px;font-weight:600;letter-spacing:.5px;
    text-transform:uppercase;color:var(--faint)}
  td.fee{grid-area:fee}td.inv{grid-area:inv}td.pay{grid-area:pay}td.quiet{grid-area:quiet;margin-top:6px}
  td.fee,td.inv,td.pay{margin-top:9px}
  td.fee::before,td.inv::before,td.pay::before{content:attr(data-label);display:block;margin-bottom:3px;font-size:9.5px;
    font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--faint)}
  td.nil{display:none}
  .ln li{font-size:12.5px}
  tr:nth-child(n) td.roy{grid-area:roy;margin-top:10px;padding:7px 10px;border:none;border-radius:7px;background:#f1f6fc}
  td.roy::before{content:attr(data-label);float:left;font-size:11.5px;color:var(--muted)}
  .rt{font-size:13px}
  .rb{margin-top:4px;clear:both}
  .rb.one{display:none}

  tfoot tr{display:block;padding:12px 16px;background:#dfe6f1;border-top:2px solid var(--navy)}
  tr:nth-child(n) td{width:auto}
  tfoot tr.sums{display:grid;grid-template-columns:1fr;grid-template-areas:none;gap:6px}
  tfoot tr.sums td,tfoot tr:nth-child(n) td.roy{grid-area:auto;display:flex;justify-content:space-between;align-items:baseline;
    gap:12px;margin:0;padding:0;border-radius:0;background:none;font-size:13px;text-align:right}
  tfoot tr.sums td.roy::before{float:none}
  tfoot tr.sums td::before{content:attr(data-label);font-weight:600;color:var(--muted);font-size:12px}
  tfoot tr.sums td.mo,tfoot tr.sums td.blank{display:none}
  tfoot tr.close{border-top:1px solid #c9d4e5;background:#d3dcea}
  tfoot td.lead{display:flex;justify-content:space-between;align-items:center;gap:12px;text-align:left;font-size:12.5px;line-height:1.35}
  tfoot .ctot{margin-left:0;flex:none;font-size:17px}
  .note{margin:14px 12px 18px;padding:13px 14px;font-size:12px}
  .acc{margin:0 12px 18px;padding:12px 14px;flex-direction:column;align-items:flex-start}
  .bank{margin:0 12px 16px}
  .bank-h{padding:10px 14px}
  .bank dl{grid-template-columns:1fr;padding:4px 14px 8px}
  .bank dt{flex-basis:118px}
}
@page{size:A4 portrait;margin:12mm 10mm}
@media print{
  body{background:#fff;font-size:12px}
  /* A4 is ~720px wide: let everything wrap and shrink so nothing spills past the right edge */
  thead th{padding:8px 8px;font-size:8.5px;letter-spacing:.4px}
  thead th small{font-size:8px}
  tbody td,tfoot td{padding:8px}
  td.mo{width:48px;font-size:11.5px}
  td.roy{width:106px}
  td.fee,td.pay{width:112px}
  td.tot{width:96px;font-size:12px}
  .rt{font-size:12px}
  .rb li{font-size:9.5px}
  .ln{gap:2px}
  .ln li{font-size:10px;gap:6px}
  .ln li b{font-size:11px}
  .inv-h{font-size:9px}
  .none{font-size:11px}
  tfoot tr.sums td{font-size:11.5px}
  tfoot .ctot{font-size:15px}
  .mast,.stat,.why{padding-left:16px;padding-right:16px}
  .note{margin:16px}
  .acc{margin:0 16px 16px;page-break-inside:avoid}
  .bank{margin:0 16px 14px}
  .bank-h{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .balance .amt{font-size:26px}
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

const ROY = 'Royalties Received by You';
const ACCOUNTS = { name: 'Pallavi Shailesh Ninave', phone: '+91 90825 63873' };
const BAL = 'Month-End Balance Payable';
const FEE = 'MRM Service Fees';
const INV = 'Invoices &amp; GST';
const PAY = 'Payments Received by MRM';

function bankBlock(key) {
  const acct = PAYMENT_ACCOUNTS[key];
  if (!acct) return '';
  const rows = acct.rows.map(([k, v]) => `<div${k === 'Address' || k === 'Branch' ? ' class="wide"' : ''}><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  return `<section class="bank">
  <div class="bank-h"><b>Bank Account Details</b><span>Please make payments to this account</span></div>
  <dl>${rows}</dl>
</section>`;
}

// Shown when the client has no payment account on their profile: pick one for
// this statement. The choice rides on the link (&pay=) and is not saved - set it
// on the client's profile to make it stick.
function choosePage(client, url) {
  const join = url.includes('?') ? '&' : '?';
  const cards = Object.entries(PAYMENT_ACCOUNTS).map(([key, a]) => {
    const get = (k) => (a.rows.find(([label]) => label === k) || [])[1] || '';
    return `<a class="pick-card" href="${esc(`${url}${join}pay=${key}`)}">
      <b>${esc(a.label)}</b>
      <span>${esc(get('Account name'))}</span>
      <span>${esc(get('Bank name'))} &middot; A/c ${esc(get('Current account no.'))}</span>
      <em>Generate statement &rarr;</em>
    </a>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(client.clientId)} - ${esc(client.name)} - Royalty &amp; Service Fee Statement</title><style>${STYLE}</style></head>
<body><div class="wrap"><div class="card">
<header class="mast">
  <div>
    <div class="brand"><div class="mark">MRM</div><span>Music Rights Management</span></div>
    <h1>${esc(client.name)}</h1>
    <div class="ident"><span class="id">${esc(client.clientId)}</span></div>
  </div>
</header>
<div class="pick">
  <h2>Select the payment account</h2>
  <p>This client has no payment account on their profile yet. Choose which bank details the statement should carry.</p>
  <div class="pick-grid">${cards}</div>
</div>
</div><p class="ft">Developed and maintained by <b>RDJ(MRM)</b><span class="v">v${APP_VERSION}</span></p></div></body></html>`;
}

function page(st) {
  const sign = (v) => `${v >= 0 ? '+' : '−'}${inr(Math.abs(v))}`;
  const line = (label, amount, cls = '') => `<li${cls ? ` class="${cls}"` : ''}><span>${esc(label)}</span><b class="${amount >= 0 ? 'up' : 'dn'}">${sign(amount)}</b></li>`;
  const info = (label, amount, cls = 'info') => `<li class="${cls}"><span>${esc(label)}</span><b>${inr(amount)}</b></li>`;
  const cell = (cls, label, body) => (body
    ? `<td class="${cls}" data-label="${label}">${body}</td>`
    : `<td class="${cls} nil"><span class="dash">&mdash;</span></td>`);

  const rows = st.lines.map((l) => {
    const roy = l.royaltyTotal
      ? `<td class="roy" data-label="${ROY}${l.royalty.length === 1 ? ` · ${esc(l.royalty[0].label)}` : ''}"><span class="rt">${inr(l.royaltyTotal)}</span><ul class="rb${l.royalty.length === 1 ? ' one' : ''}">${l.royalty.map((r) => `<li><span>${esc(r.label)}</span><b>${inr(r.amount)}</b></li>`).join('')}</ul></td>`
      : '<td class="roy nil"><span class="dash">&mdash;</span></td>';

    const fees = l.fees.length ? `<ul class="ln">${l.fees.map((f) => line(f.label, f.amount)).join('')}</ul>` : '';
    // The base is the service fee already counted, so it is shown without a
    // sign; only the GST on it moves the balance.
    const invs = l.invoices.map((i) => `<div class="inv"><div class="inv-h">${esc(i.label)}</div><ul class="ln">
      ${info('Invoice base', i.base)}
      ${line(`GST ${i.gstRate}%`, i.gst)}
      ${info('Invoice total', i.total, 'info sum')}
    </ul></div>`).join('');
    const pays = l.payments.length ? `<ul class="ln">${l.payments.map((p) => line(p.label, p.amount)).join('')}</ul>` : '';

    const adj = l.adjustment
      ? `<small class="adj">incl. carry-forward adj. ${sign(l.adjustment)}</small>`
      : '';
    const middle = fees || invs || pays
      ? cell('fee', FEE, fees) + cell('inv', INV, invs) + cell('pay', PAY, pays)
      : '<td class="quiet" colspan="3"><span class="none">No transactions recorded</span></td>';
    return `<tr><td class="mo">${esc(l.month)}</td>${roy}${middle}<td class="tot" data-label="${BAL}">${inr(l.total)}${adj}</td></tr>`;
  }).join('');

  const opening = st.openedFrom ? `Brought forward from ${esc(st.openedFrom)}` : 'Opening balance';

  const contact = [['GST ID', st.gstId], ['Email', st.email], ['Phone', st.phone]]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(st.clientId)} - ${esc(st.clientName)} - Royalty &amp; Service Fee Statement</title>
<style>${STYLE}</style></head><body><div class="wrap"><div class="card">

<header class="mast">
  <div>
    <div class="brand"><div class="mark">MRM</div><span>Music Rights Management</span></div>
    <h1>${esc(st.clientName)}</h1>
    <div class="ident"><span class="id">${esc(st.clientId)}</span> &middot; ${esc(st.clientType.replace(/\s+[–-]\s+/, ' : '))}</div>
    <div class="terms">MRM Service Fee Rate: ${esc(st.commissionRate)}% &middot; GST ${esc(st.gstRate)}% &middot; all figures in Rupees</div>
    ${contact ? `<dl class="contact">${contact}</dl>` : ''}
  </div>
  <div class="balance">
    <div class="cap">Closing Balance Payable to MRM</div>
    <span class="amt${Math.abs(st.closing) < 1 ? ' zero' : ''}"><i>Rs.</i> ${inr(st.closing)}</span>
    <div class="asat">as at ${esc(st.periodTo)}</div>
  </div>
</header>

<div class="stats">
  <div class="stat b"><span>${ROY}${st.royaltyBySociety.length === 1 ? ` &middot; ${esc(st.royaltyBySociety[0].label)}` : ''}</span><b>${inr(st.royaltyTotal)}</b>${
    st.royaltyBySociety.length > 1
      ? `<ul class="split">${st.royaltyBySociety.map((x) => `<li><span>${esc(x.label)}</span><b>${inr(x.amount)}</b></li>`).join('')}</ul>`
      : ''}</div>
  <div class="stat g"><span>Total MRM Service Fees</span><b>${inr(st.feeTotal)}</b></div>
  <div class="stat"><span>Period</span><b>${esc(st.periodFrom)} &ndash; ${esc(st.periodTo)}</b></div>
  <div class="stat"><span>Months shown</span><b>${st.monthsShown} of ${st.monthsHeld}</b></div>
</div>

${controls()}
<p class="why"><b>${esc(st.mode === 'full' ? 'Full record' : 'How this balance was built')}:</b> ${esc(st.why)}.</p>

<div class="scroll"><table>
  <thead><tr>
    <th>Month</th>
    <th class="r">${ROY}<small>for reference</small></th>
    <th>${FEE}<small>adds to balance</small></th>
    <th>${INV}<small>only GST adds to balance</small></th>
    <th>${PAY}<small>reduces balance</small></th>
    <th class="r">${BAL}</th>
  </tr></thead>
  <tbody>
    <tr>
      <td class="mo">Opening</td>
      <td class="quiet" colspan="4"><span class="none">${opening}</span></td>
      <td class="tot" data-label="${BAL}">${inr(st.openingBalance)}</td>
    </tr>
    ${rows}
  </tbody>
  <tfoot>
    <tr class="sums">
      <td class="mo">Total</td>
      <td class="roy" data-label="${ROY}">${inr(st.royaltyTotal)}</td>
      <td class="up" data-label="${FEE}">+${inr(st.feeTotal)}</td>
      <td class="up" data-label="GST charged">+${inr(st.gstTotal)}</td>
      <td class="dn" data-label="${PAY}">−${inr(st.paidTotal)}</td>
      <td class="blank"></td>
    </tr>
    <tr class="close">
      <td class="lead" colspan="6"><span>Closing Balance Payable to MRM as at ${esc(st.periodTo)}</span><span class="ctot"><i>Rs.</i> ${inr(st.closing)}</span></td>
    </tr>
  </tfoot>
</table></div>

<div class="note">
  <div class="note-h">How to read this statement</div>
  <ul>
    <li><b>${ROY}</b> &mdash; what the societies paid in that month. Shown for reference only; it is not part of the running balance.</li>
    <li><b>MRM Service Fees</b> &mdash; charged on those royalties; they add to the balance.</li>
    <li><b>Invoice base</b> &mdash; the service fee already counted above, so it is shown for reference without a sign.</li>
    <li><b>GST</b> &mdash; charged on the invoice base; it adds to the balance.</li>
    <li><b>Payments Received by MRM</b> and <b>TDS</b> (tax the client withheld on those invoices) &mdash; reduce the balance.</li>
    <li><b class="up">Green</b> figures increase the balance payable to MRM; <b class="dn">red</b> figures reduce it.</li>
  </ul>
</div>
${bankBlock(st.paymentAccount)}
<div class="acc">
  <span class="acc-cap">For any questions about this statement, or to confirm a payment, please contact our Accounts Team.</span>
  <span class="acc-who"><b>${ACCOUNTS.name}</b><a href="tel:${ACCOUNTS.phone.replace(/\s/g, '')}">${ACCOUNTS.phone}</a></span>
</div>
</div>
<p class="ft">Developed and maintained by <b>RDJ(MRM)</b><span class="v">v${APP_VERSION}</span></p>
</div></body></html>`;
}

function emptyPage(info) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(info.clientId)} - ${esc(info.clientName)} - Royalty &amp; Service Fee Statement</title><style>${STYLE}</style></head>
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

    const { mode, from, to, year, pay } = req.query;
    const payTo = PAYMENT_ACCOUNTS[pay] ? pay : client.paymentAccount;
    if (!PAYMENT_ACCOUNTS[payTo]) {
      return res.set('Content-Type', 'text/html; charset=utf-8').send(choosePage(client, req.originalUrl));
    }

    const wanted = mode === 'period' || mode === 'year' ? mode : defaultMode;
    const st = buildStatement(client, rows, { mode: wanted, from, to, year });
    if (st) st.paymentAccount = payTo;

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
