// Public (HMAC-guarded) statement pages linked from the daily outstanding email
// and from the Whatsapp Report screen.
// Not behind JWT: an email client cannot carry an access token.

const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const { buildStatement, verifyStatementToken } = require('../services/statementBuilder');
const { PAYMENT_ACCOUNTS } = require('../utils/paymentAccounts');

// Logo inlined so the page renders without a static file route (and in email previews).
const LOGO_SRC = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '../assets/mrm-logo.png')).toString('base64')}`;

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
  --ink:#16202e; --muted:#5f6b7c; --faint:#98a2b3; --line:#e2e8f0; --hair:#edf1f6;
  --navy:#15803D; --blue:#16A34A; --gold:#4ADE80; --green:#1F6B24; --red:#B01414; --paper:#fff; --bg:#e8f1ec;
  --tint:#f3faf6;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:14px/1.5 "Segoe UI",system-ui,-apple-system,"Helvetica Neue",sans-serif;
  -webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{max-width:1160px;margin:0 auto;padding:30px 18px 60px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:4px;
  box-shadow:0 1px 2px rgba(16,24,40,.05),0 14px 36px rgba(16,24,40,.08);overflow:hidden}

/* the page wrapper is a one-cell table so that, in print, the letterhead
   (thead) and the footer spacer (tfoot) repeat on every page */
.sheet{display:block;width:100%;border-collapse:collapse}
.sheet>thead,.sheet>tbody,.sheet>tfoot,.sheet>*>tr,.sheet>*>tr>td{display:block;padding:0;border:none;background:none}
.sheet>tfoot{display:none}
.body{padding:0 34px}

/* letterhead */
.lh{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;
  padding:24px 34px 12px;border-bottom:2px solid var(--navy);position:relative;margin-bottom:3px}
.lh::after{content:"";position:absolute;left:0;right:0;bottom:-5px;border-bottom:1px solid var(--gold)}
.brand{display:flex;align-items:center;gap:11px;min-width:0}
.logo{display:block;height:46px;width:auto;flex-shrink:0}
.brand>div{padding-left:12px;border-left:1px solid var(--line)}
.brand b{display:block;font-size:17px;font-weight:700;color:var(--navy);letter-spacing:.2px;line-height:1.15}
.brand small{display:block;margin-top:2px;font-size:9.5px;letter-spacing:1.6px;text-transform:uppercase;color:var(--blue);font-weight:600}
.lh-r{text-align:right;flex-shrink:0}
.lh-r b{display:block;font-size:12px;letter-spacing:1.8px;text-transform:uppercase;color:var(--navy)}
.lh-r span{display:block;margin-top:2px;font-size:11.5px;color:var(--muted);white-space:nowrap}

/* addressee + closing balance */
.mast{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap;padding:20px 0 16px}
.to{font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase;color:var(--faint);font-weight:600;margin-bottom:3px}
h1{margin:0;font-size:21px;font-weight:700;color:var(--navy);letter-spacing:-.2px;line-height:1.2}
.ident{margin-top:4px;font-size:12.5px;color:var(--muted)}
.ident .id{font-weight:600;color:var(--ink)}
.terms{margin-top:2px;font-size:11.5px;color:var(--faint)}
.contact{display:flex;flex-wrap:wrap;gap:4px 20px;margin:8px 0 0;padding:0}
.contact div{display:flex;align-items:baseline;gap:6px;min-width:0}
.contact dt{font-size:9.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--faint);font-weight:600}
.contact dd{margin:0;font-size:12px;font-weight:600;color:var(--ink);overflow-wrap:anywhere}
.balance{text-align:right;min-width:220px;padding:12px 16px;border:1px solid var(--line);border-top:3px solid var(--navy);background:var(--tint)}
.balance .cap{font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--muted);font-weight:600}
.balance .amt{display:block;margin-top:3px;font-size:28px;font-weight:700;color:var(--navy);letter-spacing:-.6px;line-height:1.1}
.balance .amt.zero{color:var(--green)}
.balance .amt i,.ctot i{font-style:normal;font-size:.5em;font-weight:600;color:var(--faint);margin-right:3px;letter-spacing:.3px}
.balance .asat{margin-top:2px;font-size:11px;color:var(--muted)}

/* summary strip */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));border:1px solid var(--line);margin-bottom:10px}
.stat{padding:9px 14px;border-right:1px solid var(--line)}
.stat:last-child{border-right:none}
.stat span{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--faint);font-weight:600}
.stat b{display:block;margin-top:2px;font-size:15px;font-weight:700;color:var(--navy)}
.stat.g b{color:var(--green)}
.stat.b b{color:var(--blue)}
.split{list-style:none;margin:5px 0 0;padding:4px 0 0;border-top:1px dashed var(--line);display:grid;gap:1px}
.split li{display:flex;justify-content:space-between;gap:12px}
.stat .split li span{display:inline;font-size:11px;text-transform:none;letter-spacing:0;font-weight:600;color:var(--muted)}
.stat .split li b{display:inline;margin:0;font-size:11.5px;font-weight:600;color:var(--ink)}

.bar{margin:0 -34px;padding:10px 34px;background:var(--tint);border-top:1px solid var(--line);border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center}
.spacer{flex:1}
.print{font:inherit;font-size:12.5px;font-weight:600;padding:8px 14px;border:1px solid var(--green);
  border-radius:6px;background:var(--green);color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:7px}
.print:hover{filter:brightness(1.1)}
.why{margin:8px 0;font-size:11.5px;color:var(--muted)}
.why b{color:var(--navy)}

/* ledger: month | royalty | service fees | invoices & GST | payments | balance */
.led{width:100%;border-collapse:collapse;border:1px solid var(--line)}
.led thead th{position:sticky;top:0;z-index:2;background:var(--navy);color:#fff;font-size:10px;font-weight:600;
  letter-spacing:.5px;text-transform:uppercase;text-align:left;padding:9px 10px;vertical-align:middle;line-height:1.3}
.led thead th.r{text-align:right}
.led thead th small{display:block;font-size:9px;font-weight:500;letter-spacing:.2px;text-transform:none;opacity:.75}
.led tbody td{padding:7px 10px;border-bottom:1px solid var(--hair);vertical-align:top}
.led tbody tr:nth-child(even) td{background:#f8fcf9}
.led tbody tr:hover td{background:#eff9f2}
.led td+td{border-left:1px solid var(--hair)}
.led td.mo{width:70px;white-space:nowrap;font-weight:700;color:var(--navy);font-size:12.5px}
.led td.roy{width:160px}
.led td.fee,.led td.pay{width:170px}
.led td.tot{width:140px;text-align:right;font-weight:700;color:var(--navy);white-space:nowrap;font-size:13px}
.adj{display:block;margin-top:2px;font-size:10px;font-weight:500;color:var(--faint);white-space:normal}
.dash{display:block;text-align:right;color:#c3cad5}
.none{color:var(--faint);font-style:italic;font-size:12px}

/* royalty cell */
.rt{display:block;text-align:right;font-size:13px;font-weight:700;color:var(--blue)}
.rb{list-style:none;margin:3px 0 0;padding:0;display:grid;gap:1px}
.rb.one{display:none}
.rb li{display:flex;justify-content:space-between;gap:10px;font-size:10.5px;color:var(--faint)}
.rb li b{font-weight:600;color:var(--muted)}

/* label ....... amount lines, shared by fees / invoices / payments */
.ln{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.ln li{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:11.5px;color:var(--muted)}
.ln li b{font-weight:600;font-size:12.5px;white-space:nowrap;color:var(--ink)}
.ln li.info b{font-weight:500;color:var(--muted)}
.ln li.sum{padding-top:3px;border-top:1px dashed var(--line)}
.inv+.inv{margin-top:6px;padding-top:6px;border-top:1px solid var(--hair)}
.inv-h{font-size:9.5px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;color:var(--faint);margin-bottom:2px}
.up,.ln li b.up{color:var(--green)}
.dn,.ln li b.dn{color:var(--red)}

.led tfoot td{background:#e2f3e8;border-top:2px solid var(--navy);font-weight:700;color:var(--navy);padding:9px 10px;vertical-align:middle}
.led tfoot tr.sums td{text-align:right;font-size:13px}
.led tfoot tr.sums td.mo{text-align:left}
.led tfoot tr.sums td.roy{color:var(--blue)}
.led tfoot tr.close td{border-top:1px solid #c3e3cf;background:var(--navy);color:#fff}
.led tfoot .lead{font-size:12.5px;text-align:right}
.ctot{margin-left:16px;font-size:17px;white-space:nowrap}
.led tfoot tr.close .ctot i{color:rgba(255,255,255,.6)}

/* remittance details */
.bank{margin:16px 0 0;border:1px solid var(--line);page-break-inside:avoid;break-inside:avoid}
.bank-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;
  padding:7px 14px;background:var(--tint);border-bottom:1px solid var(--line)}
.bank-h b{font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:var(--navy)}
.bank-h span{font-size:11px;color:var(--muted)}
.bank dl{margin:0;padding:3px 14px 6px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px}
.bank dl div{display:flex;gap:12px;padding:4px 0;border-bottom:1px solid var(--hair);min-width:0}
.bank dt{flex:0 0 120px;font-size:11px;color:var(--muted)}
.bank dd{margin:0;font-size:12px;font-weight:600;color:var(--ink);overflow-wrap:anywhere}
.bank .wide{grid-column:1/-1}
.acc{margin:12px 0 0;padding:0 0 22px;font-size:12px;color:var(--muted)}
.acc b{color:var(--navy)}
.acc a{color:var(--blue);font-weight:600;text-decoration:none;white-space:nowrap}

/* running footer: sits at the foot of the card on screen, of every page in print */
.lf{display:flex;justify-content:space-between;gap:12px;margin:0 34px;padding:9px 0 14px;border-top:1px solid var(--line);
  font-size:10px;letter-spacing:.4px;color:var(--faint)}
.lf b{color:var(--navy);font-weight:600}
.frame{display:none}

.pick{padding:22px 0 28px}
.pick h2{margin:0 0 4px;font-size:17px;color:var(--navy)}
.pick>p{margin:0 0 18px;color:var(--muted);font-size:13px}
.pick-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.pick-card{display:block;padding:16px 18px;border:1px solid var(--line);border-radius:6px;text-decoration:none;color:inherit;
  background:#fafdfb;transition:border-color .15s,box-shadow .15s}
.pick-card:hover{border-color:var(--blue);box-shadow:0 4px 16px rgba(18,146,90,.14)}
.pick-card b{display:block;font-size:15px;color:var(--navy)}
.pick-card span{display:block;margin-top:4px;font-size:12.5px;color:var(--muted)}
.pick-card em{display:inline-block;margin-top:12px;font-style:normal;font-size:12.5px;font-weight:600;color:var(--blue)}
.empty{padding:40px 0;text-align:center;color:var(--muted)}

@media(max-width:820px){
  .wrap{padding:16px 12px 40px}
  .lh{padding:18px 18px 10px}
  .body{padding:0 18px}
  .bar{margin:0 -18px;padding:10px 18px}
  .lf{margin:0 18px}
  .balance{text-align:left;min-width:0}
}
/* narrow screens that still show the table: let it scroll sideways rather than squash */
@media screen and (min-width:1100px){
  .led thead th{white-space:nowrap}
}
@media screen and (min-width:641px) and (max-width:980px){
  .scroll{overflow-x:auto}
  .scroll .led{min-width:900px}
  .led thead th{position:static}
}
/* phones: each month becomes a compact card - month and balance on top,
   then the transactions as a receipt (label left, amount right), then royalty */
@media screen and (max-width:640px){
  body{font-size:13px}
  .wrap{padding:0 0 28px}
  .card{border-radius:0;border-left:none;border-right:none;box-shadow:none}
  .lh{padding:16px 16px 10px;align-items:center}
  .lh-r span,.brand small{display:none}
  .lh-r b{font-size:10px;letter-spacing:1px}
  .brand b{font-size:14px}
  .logo{height:34px}
  .body{padding:0 16px}
  .bar{margin:0 -16px;padding:10px 16px}.bar .spacer{display:none}.print{flex:1;justify-content:center;padding:10px 14px}
  .lf{margin:0 16px;flex-direction:column;gap:2px}
  h1{font-size:19px}
  .contact{flex-direction:column;gap:3px}
  .balance{width:100%}
  .balance .amt{font-size:25px}
  .stats{grid-template-columns:1fr 1fr}
  .stat{border-bottom:1px solid var(--line)}
  .stat:nth-child(2n){border-right:none}
  .stat b{font-size:14px}

  .led,.led tbody,.led tfoot,.led tr,.led td{display:block;width:auto}
  .led{border:none;margin:0 -16px}
  .led thead{display:none}
  .led tbody tr{display:grid;grid-template-columns:1fr auto;grid-template-areas:"mo tot" "fee fee" "inv inv" "pay pay" "roy roy" "quiet quiet";
    align-items:center;column-gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}
  .led tbody tr:nth-child(even){background:none}
  .led tbody td,.led tbody tr:nth-child(even) td,.led tbody tr:hover td,.led tfoot td{padding:0;border:none;background:none;width:auto}
  .led td.mo{grid-area:mo;font-size:14px}
  .led td.tot{grid-area:tot;font-size:15px;line-height:1.25}
  .led td.tot::before{content:attr(data-label);display:block;font-size:9.5px;font-weight:600;letter-spacing:.5px;
    text-transform:uppercase;color:var(--faint)}
  .led td.fee{grid-area:fee}.led td.inv{grid-area:inv}.led td.pay{grid-area:pay}.led td.quiet{grid-area:quiet;margin-top:6px}
  .led td.fee,.led td.inv,.led td.pay{margin-top:9px}
  .led td.fee::before,.led td.inv::before,.led td.pay::before{content:attr(data-label);display:block;margin-bottom:3px;font-size:9.5px;
    font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--faint)}
  .led td.nil{display:none}
  .ln li{font-size:12.5px}
  .led tr:nth-child(n) td.roy{grid-area:roy;margin-top:10px;padding:7px 10px;border:none;border-radius:6px;background:#ecf8f0}
  .led td.roy::before{content:attr(data-label);float:left;font-size:11.5px;color:var(--muted)}
  .rt{font-size:13px}
  .rb{margin-top:4px;clear:both}

  .led tfoot tr{display:block;padding:12px 16px;background:#e2f3e8;border-top:2px solid var(--navy)}
  .led tr:nth-child(n) td{width:auto}
  .led tfoot tr.sums{display:grid;grid-template-columns:1fr;grid-template-areas:none;gap:6px}
  .led tfoot tr.sums td,.led tfoot tr:nth-child(n) td.roy{grid-area:auto;display:flex;justify-content:space-between;align-items:baseline;
    gap:12px;margin:0;padding:0;border-radius:0;background:none;font-size:13px;text-align:right}
  .led tfoot tr.sums td.roy::before{float:none}
  .led tfoot tr.sums td::before{content:attr(data-label);font-weight:600;color:var(--muted);font-size:12px}
  .led tfoot tr.sums td.mo,.led tfoot tr.sums td.blank{display:none}
  .led tfoot tr.close{border-top:none;background:var(--navy)}
  .led tfoot td.lead{display:flex;justify-content:space-between;align-items:center;gap:12px;text-align:left;font-size:12.5px;line-height:1.35}
  .ctot{margin-left:0;flex:none;font-size:17px}
  .bank dl{grid-template-columns:1fr}
  .bank dt{flex-basis:110px}
}

/* Print: the page margin is zero so the browser adds no URL / date header or
   footer; the border, letterhead and footer are drawn by the page itself. */
@page{size:A4 portrait;margin:0}
@media print{
  body{background:#fff;font-size:11px}
  .wrap{max-width:none;padding:0}
  .card{box-shadow:none;border:none;border-radius:0;overflow:visible}
  .bar{display:none}

  .frame{display:block;position:fixed;top:6mm;left:6mm;right:6mm;bottom:6mm;border:3px double var(--navy);pointer-events:none}
  .sheet{display:table}
  .sheet>thead{display:table-header-group}
  .sheet>tbody{display:table-row-group}
  .sheet>tfoot{display:table-footer-group}
  .sheet>*>tr{display:table-row}
  .sheet>*>tr>td{display:table-cell}
  .sheet>tfoot td{height:16mm}
  .lh{margin:10mm 12mm 3px;padding:0 0 8px;gap:14px}
  .logo{height:36px}
  .brand b{font-size:14.5px}
  .brand small{font-size:8.5px;letter-spacing:1.1px}
  .lh-r b{font-size:10.5px;letter-spacing:1.4px}
  .lh-r span{font-size:10.5px}
  .body{padding:0 12mm}
  .lf{position:fixed;left:12mm;right:12mm;bottom:8.5mm;margin:0;padding:5px 0 0}

  .mast{padding:12px 0 10px}
  h1{font-size:18px}
  .balance{padding:8px 12px}
  .balance .amt{font-size:22px}
  .stat{padding:6px 10px}
  .stat b{font-size:13px}
  .why{margin:6px 0;font-size:10px}

  /* A4 is ~700px wide inside the border: let everything wrap and shrink */
  /* print: every column title breaks at the same planned point, never mid-phrase */
  .led thead th{position:static;padding:6px 6px;font-size:8px;letter-spacing:.3px;white-space:nowrap;line-height:1.35;vertical-align:top}
  .led thead th .l2{display:block}
  .led thead th small{font-size:7.5px;margin-top:1px}
  .led tbody td,.led tfoot td{padding:4px 6px}
  .led td.mo{width:44px;font-size:10.5px}
  .led td.roy{width:104px}
  .led td.fee,.led td.pay{width:112px}
  .led td.tot{width:92px;font-size:11px}
  .led tbody tr:hover td{background:inherit}
  .rt{font-size:11px}
  .rb li{font-size:8.5px}
  .ln{gap:1px}
  .ln li{font-size:9.5px;gap:6px;line-height:1.35}
  .ln li b{font-size:10.5px}
  .inv-h{font-size:8px;margin-bottom:0}
  .none{font-size:10px}
  .led tfoot tr.sums td{font-size:11px}
  .ctot{font-size:14px}
  .led thead{display:table-header-group}
  .led tr{page-break-inside:avoid;break-inside:avoid}
  /* the closing total must print once, after the last month - never repeated
     at the foot of every page, where it would read as the end of the statement */
  .led tfoot{display:table-row-group}
  .bank{margin-top:8px}
  .bank-h{padding:4px 10px}
  .bank-h b{font-size:9.5px}.bank-h span{font-size:9.5px}
  .bank dl{padding:1px 10px 3px}
  .bank dl div{padding:2px 0;gap:8px}
  .bank dt{flex-basis:92px;font-size:9.5px}
  .bank dd{font-size:10.5px}
  .acc{margin-top:6px;padding-bottom:0;font-size:10.5px}
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
const ACCOUNTS = { name: 'Pallavi', phone: '+91 90825 63873' };
const BAL = 'Month-End Balance Payable';
const FEE = 'MRM Service Fees';
const INV = 'Invoices &amp; GST';
const PAY = 'Payments Received by MRM';

// Letterhead, repeated at the top of every printed page.
function letterhead(name, id) {
  return `<header class="lh">
  <div class="brand"><img class="logo" src="${LOGO_SRC}" alt="MRM | Music Rights Management"><div><b>Samraj Music Rights Management</b><small>Royalty &amp; Service Fee Statement</small></div></div>
  <div class="lh-r"><b>Statement of Account</b><span>${esc(name)} &middot; ${esc(id)}</span></div>
</header>`;
}

// Wraps a page's content so the letterhead and footer carry over onto every
// printed page, inside a border drawn on each sheet.
function sheet(name, id, content, foot = '') {
  return `<div class="frame" aria-hidden="true"></div>
<table class="sheet" role="presentation">
<thead><tr><td>${letterhead(name, id)}</td></tr></thead>
<tfoot><tr><td></td></tr></tfoot>
<tbody><tr><td><div class="body">${content}</div></td></tr></tbody>
</table>
<footer class="lf"><span><b>Samraj Music Rights Management</b></span><span>${foot}</span></footer>`;
}

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
${sheet(client.name, client.clientId, `<div class="pick">
  <h2>Select the payment account</h2>
  <p>This client has no payment account on their profile yet. Choose which bank details the statement should carry.</p>
  <div class="pick-grid">${cards}</div>
</div>`)}
</div></div></body></html>`;
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
      ${info('Service Fees Before GST', i.base)}
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
${sheet(st.clientName, st.clientId, `
<section class="mast">
  <div>
    <div class="to">Statement for</div>
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
</section>

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

<div class="scroll"><table class="led">
  <thead><tr>
    <th>Month</th>
    <th class="r">Royalties Received <span class="l2">by You</span><small>for reference</small></th>
    <th>MRM Service <span class="l2">Fees</span><small>adds to balance</small></th>
    <th>Invoices <span class="l2">&amp; GST</span><small>only GST adds to balance</small></th>
    <th>Payments Received <span class="l2">by MRM</span><small>reduces balance</small></th>
    <th class="r">Month-End Balance <span class="l2">Payable</span></th>
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

${bankBlock(st.paymentAccount)}
<p class="acc">For account queries or payment confirmation: <b>${ACCOUNTS.name}</b> | <a href="tel:${ACCOUNTS.phone.replace(/\s/g, '')}">${ACCOUNTS.phone}</a></p>
`, `Statement period ${esc(st.periodFrom)} &ndash; ${esc(st.periodTo)}`)}
</div></div></body></html>`;
}

function emptyPage(info) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(info.clientId)} - ${esc(info.clientName)} - Royalty &amp; Service Fee Statement</title><style>${STYLE}</style></head>
<body><div class="wrap"><div class="card">
${sheet(info.clientName, info.clientId, `<div class="empty"><p>No entries for this client in the range you picked.</p>
<p class="terms">Go back to the report and choose a different period or year.</p></div>`)}
</div></div></body></html>`;
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
