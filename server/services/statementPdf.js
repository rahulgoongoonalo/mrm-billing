// The statement as a PDF, for attaching to client mail. Drawn from the same
// buildStatement() result as the online statement page, so the two always
// agree; this is the printable summary (one line per month), the page linked
// in the mail has the full breakdown.

const PDFDocument = require('pdfkit');
const { LOGO_FILE } = require('./clientMail');
const { PAYMENT_ACCOUNTS } = require('../utils/paymentAccounts');

const C = {
  ink: '#16202e', muted: '#5f6b7c', faint: '#98a2b3', line: '#e2e8f0',
  accent: '#84B179', navy: '#3F6B35', tint: '#f7fbf0', zebra: '#f8fbf3', green: '#1F6B24', red: '#B01414',
};

const inr = (v) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  .format(Number(v) || 0);
// Helvetica has no rupee sign, so amounts carry "Rs." like the printed page.
const rs = (v) => `Rs. ${inr(v)}`;
const dash = (v) => (v ? inr(v) : '-');

const TITLES = {
  full: 'Statement of Account',
  window: 'Outstanding Payment Summary',
};

/** Build the PDF. Resolves to a Buffer. */
function statementPdf(st, { generatedOn = new Date() } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: {
      Title: `${TITLES[st.mode] || TITLES.full} - ${st.clientName} (${st.clientId})`,
      Author: 'Samraj Music Rights Management Pvt. Ltd',
    } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = doc.page.margins.left;
    const W = doc.page.width - L - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 24;
    const title = TITLES[st.mode] || TITLES.full;

    // ---- letterhead (every page) --------------------------------------
    const letterhead = () => {
      const top = 34;
      doc.image(LOGO_FILE, L, top, { height: 34 });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.navy)
        .text(title.toUpperCase(), L, top + 4, { width: W, align: 'right', characterSpacing: 1.2 });
      doc.font('Helvetica').fontSize(9).fillColor(C.muted)
        .text(`${st.clientName}  ·  ${st.clientId}`, L, top + 20, { width: W, align: 'right' });
      doc.moveTo(L, top + 44).lineTo(L + W, top + 44).lineWidth(2).strokeColor(C.accent).stroke();
      doc.y = top + 56;
    };
    letterhead();

    // ---- addressee + closing balance -----------------------------------
    const mastTop = doc.y;
    doc.font('Helvetica').fontSize(8).fillColor(C.faint).text('STATEMENT FOR', L, mastTop, { characterSpacing: 1 });
    doc.font('Helvetica-Bold').fontSize(16).fillColor(C.navy).text(st.clientName, L, mastTop + 11, { width: W - 200 });
    const details = [
      st.clientType,
      `MRM ID: ${st.clientId}`,
      st.gstId && `GST ID: ${st.gstId}`,
      st.email && `Email: ${st.email}`,
      st.phone && `Phone: ${st.phone}`,
      `Service fee rate: ${st.commissionRate}%  ·  GST ${st.gstRate}%  ·  all figures in Rupees`,
    ].filter(Boolean);
    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted);
    let dy = doc.y + 3;
    for (const d of details) { doc.text(d, L, dy, { width: W - 200 }); dy = doc.y + 1; }

    const bx = L + W - 185;
    doc.rect(bx, mastTop, 185, 62).fillColor(C.tint).fill();
    doc.rect(bx, mastTop, 185, 3).fillColor(C.accent).fill();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.muted)
      .text('CLOSING BALANCE PAYABLE TO MRM', bx + 10, mastTop + 11, { width: 165, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(17).fillColor(Math.abs(st.closing) < 1 ? C.green : C.navy)
      .text(rs(st.closing), bx + 10, mastTop + 24, { width: 165, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
      .text(`as at ${st.periodTo}`, bx + 10, mastTop + 46, { width: 165, align: 'right' });

    doc.y = Math.max(dy, mastTop + 62) + 12;

    // ---- summary strip -------------------------------------------------
    const stats = [
      ['Royalties received', inr(st.royaltyTotal)],
      ['MRM service fees', inr(st.feeTotal)],
      ['GST charged', inr(st.gstTotal)],
      ['Payments to MRM', inr(st.paidTotal)],
      ['Period', `${st.periodFrom} - ${st.periodTo}`],
    ];
    const sw = W / stats.length;
    const sy = doc.y;
    doc.rect(L, sy, W, 36).lineWidth(0.7).strokeColor(C.line).stroke();
    stats.forEach(([k, v], i) => {
      const x = L + i * sw;
      if (i) doc.moveTo(x, sy).lineTo(x, sy + 36).strokeColor(C.line).stroke();
      doc.font('Helvetica').fontSize(6.8).fillColor(C.faint).text(k.toUpperCase(), x + 6, sy + 6, { width: sw - 12 });
      doc.font('Helvetica-Bold').fontSize(i === 4 ? 7.8 : 9.5).fillColor(C.navy).text(v, x + 6, sy + 20, { width: sw - 12 });
    });
    doc.y = sy + 44;

    if (st.mode !== 'full' && st.why) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.muted)
        .text(`How this balance was built: ${st.why}.`, L, doc.y, { width: W });
      doc.moveDown(0.5);
    }

    // ---- ledger ----------------------------------------------------------
    const cols = [
      { h: 'Month', w: 62, align: 'left' },
      { h: 'Royalties received by you', w: 88 },
      { h: 'MRM service fees', w: 80 },
      { h: 'GST', w: 66 },
      { h: 'Payments received by MRM', w: 90 },
      { h: 'Month-end balance payable', w: W - 62 - 88 - 80 - 66 - 90 },
    ];
    const cellX = (i) => L + cols.slice(0, i).reduce((t, c) => t + c.w, 0);

    const header = () => {
      const y = doc.y;
      doc.rect(L, y, W, 24).fillColor(C.accent).fill();
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.ink);
      cols.forEach((c, i) => doc.text(c.h.toUpperCase(), cellX(i) + 5, y + 5, { width: c.w - 10, align: c.align || 'right' }));
      doc.y = y + 24;
    };

    const row = (cells, { fill, bold, color, note } = {}) => {
      const h = note ? 24 : 17;
      if (doc.y + h > bottom()) { doc.addPage(); letterhead(); header(); }
      const y = doc.y;
      if (fill) doc.rect(L, y, W, h).fillColor(fill).fill();
      doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.3);
      cells.forEach((v, i) => {
        const c = cols[i];
        doc.fillColor(i === 0 || i === 5 ? (color || C.navy) : C.ink)
          .font(i === 0 || i === 5 || bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(v, cellX(i) + 5, y + 5, { width: c.w - 10, align: c.align || 'right', lineBreak: false });
      });
      if (note) {
        doc.font('Helvetica').fontSize(6.5).fillColor(C.faint)
          .text(note, cellX(1) + 5, y + 15, { width: W - cols[0].w - 10, align: 'right', lineBreak: false });
      }
      doc.y = y + h;
    };

    header();
    row(['Opening', '', '', '', st.openedFrom ? `b/f ${st.openedFrom}` : '', inr(st.openingBalance)], { fill: C.tint });
    st.lines.forEach((l, i) => {
      const notes = [];
      if (l.adjustment) notes.push(`incl. carry-forward adj. ${inr(l.adjustment)}`);
      if (l.royalty.length > 1) notes.push(l.royalty.map((r) => `${r.label} ${inr(r.amount)}`).join('  ·  '));
      row([
        l.month,
        dash(l.royaltyTotal),
        dash(l.feeTotal),
        dash(l.gstTotal),
        l.paidTotal ? `-${inr(l.paidTotal)}` : '-',
        inr(l.total),
      ], { fill: i % 2 ? C.zebra : null, note: notes.join('   ') });
    });
    row(['Total', inr(st.royaltyTotal), `+${inr(st.feeTotal)}`, `+${inr(st.gstTotal)}`, `-${inr(st.paidTotal)}`, ''], { fill: '#E8F5BD', bold: true });

    if (doc.y + 26 > bottom()) { doc.addPage(); letterhead(); }
    const cy = doc.y;
    doc.rect(L, cy, W, 24).fillColor(C.accent).fill();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink)
      .text(`Closing balance payable to MRM as at ${st.periodTo}`, L + 8, cy + 8, { width: W - 160 });
    doc.fontSize(11.5).text(rs(st.closing), L + W - 160, cy + 6.5, { width: 152, align: 'right' });
    doc.y = cy + 34;

    // ---- bank details ----------------------------------------------------
    const acct = PAYMENT_ACCOUNTS[st.paymentAccount];
    if (acct) {
      const rows = acct.rows;
      const need = 22 + rows.length * 13 + 30;
      if (doc.y + need > bottom()) { doc.addPage(); letterhead(); }
      const by = doc.y;
      doc.rect(L, by, W, 18).fillColor(C.tint).fill();
      doc.rect(L, by, W, 18 + rows.length * 13 + 6).lineWidth(0.7).strokeColor(C.line).stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.navy).text('BANK ACCOUNT DETAILS', L + 8, by + 5.5, { characterSpacing: 0.8 });
      doc.font('Helvetica').fontSize(8).fillColor(C.muted).text('Please make payments to this account', L, by + 5.5, { width: W - 8, align: 'right' });
      rows.forEach(([k, v], i) => {
        const y = by + 22 + i * 13;
        doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(k, L + 8, y, { width: 110 });
        doc.font('Helvetica-Bold').fontSize(8.3).fillColor(C.ink).text(v, L + 120, y, { width: W - 130, lineBreak: false });
      });
      doc.y = by + 18 + rows.length * 13 + 16;
    }

    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
      .text('For account queries or payment confirmation: ', L, doc.y, { continued: true })
      .font('Helvetica-Bold').fillColor(C.navy).text('Pallavi Nivave  |  +91 90825 63873  |  accounts@musicrightsmanagementindia.com');

    // ---- running footer ---------------------------------------------------
    const range = doc.bufferedPageRange();
    const stamp = generatedOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      // Writing inside the bottom margin would otherwise start a new page.
      doc.page.margins.bottom = 0;
      const fy = doc.page.height - 36;
      doc.moveTo(L, fy - 6).lineTo(L + W, fy - 6).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.navy)
        .text('Samraj Music Rights Management Pvt. Ltd', L, fy, { lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor(C.faint)
        .text(`Generated ${stamp}  ·  Page ${i + 1} of ${range.count}`, L, fy, { width: W, align: 'right', lineBreak: false });
    }

    doc.end();
  });
}

module.exports = { statementPdf, TITLES };
