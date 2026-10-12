import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dateName, modeLabel, monthName, today } from './shared';

// The PDF fonts have no ₹ sign, so amounts there are plain Indian numbers.
const num = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safe = (s) => String(s).replace(/[^a-zA-Z0-9]+/g, '_');

/** Everything on the page as one workbook: referrers, payments, deals, payouts. */
export function exportWorkbook({ summary, deals, payouts, periodLabel }) {
  const wb = XLSX.utils.book_new();
  const sheet = (rows, widths) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map((wch) => ({ wch }));
    return ws;
  };

  XLSX.utils.book_append_sheet(wb, sheet([
    [`Referrals — ${periodLabel}`],
    [],
    ['Referrer', 'Clients', 'Active deals', 'Payments received', 'Referral earned', 'Paid', 'TDS', 'Earned (all time)', 'Paid (all time)', 'Still to pay', 'Last paid', 'Phone', 'PAN'],
    ...summary.referrers.map((r) => [
      r.name, r.clients, r.activeDeals, r.received, r.earned, r.paid, r.tds, r.earnedAll, r.paidAll, r.due,
      r.lastPaidOn ? dateName(r.lastPaidOn) : '', r.profile.phone, r.profile.pan,
    ]),
    ['Total', '', '', summary.totals.received, summary.totals.earned, summary.totals.paid, summary.totals.tds, summary.totals.earnedAll, summary.totals.paidAll, summary.totals.due],
  ], [22, 8, 12, 18, 16, 12, 10, 18, 16, 14, 14, 16, 12]), 'Referrers');

  XLSX.utils.book_append_sheet(wb, sheet([
    ['Referrer', 'Client', 'Client ID', 'Entry month', 'Payment received', 'Rate %', 'Referral'],
    ...summary.referrers.flatMap((r) => r.lines.map((l) => [r.name, l.clientName, l.clientId, l.label, l.received, l.rate, l.referral])),
  ], [22, 28, 12, 12, 18, 8, 12]), 'Payments');

  XLSX.utils.book_append_sheet(wb, sheet([
    ['Client', 'Client ID', 'Referred by', 'Rate %', 'From', 'Until', 'Earned (all time)', 'Note'],
    ...deals.map((d) => [d.clientName, d.clientId, d.referrer, d.rate, monthName(d.fromMonth), d.toMonth ? monthName(d.toMonth) : 'Open',
      summary.dealStats?.[d._id]?.earnedAll || 0, d.note]),
  ], [28, 12, 22, 8, 12, 12, 18, 30]), 'Deals');

  XLSX.utils.book_append_sheet(wb, sheet([
    ['Paid on', 'Referrer', 'Amount settled', 'TDS', 'Net paid', 'Mode', 'Reference', 'Note', 'Recorded by'],
    ...payouts.map((p) => [dateName(p.date), p.referrer, p.amount, p.tds || 0, (p.amount || 0) - (p.tds || 0), modeLabel(p.mode), p.reference, p.note, p.createdByEmail]),
  ], [14, 22, 16, 10, 14, 14, 20, 30, 28]), 'Payouts');

  XLSX.writeFile(wb, `MRM_Referrals_${safe(periodLabel)}_${today()}.xlsx`);
}

/** A referrer's statement: every referral earned and every payout, with the balance. */
export function exportStatement(referrer) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const p = referrer.profile || {};

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Referral Statement', 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Music Rights Management', 14, 25);
  doc.text(`Issued ${dateName(today())}`, 196, 18, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(referrer.name, 14, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const contact = [p.phone, p.email, p.pan && `PAN ${p.pan}`].filter(Boolean).join('  ·  ');
  if (contact) doc.text(contact, 14, 42);

  autoTable(doc, {
    startY: 48,
    head: [['Earned (all time)', 'Paid (all time)', 'TDS deducted', 'Balance to pay']],
    body: [[num(referrer.earnedAll), num(referrer.paidAll), num(referrer.tdsAll), num(referrer.due)]],
    theme: 'grid',
    styles: { fontSize: 10, halign: 'center', cellPadding: 3 },
    headStyles: { fillColor: [55, 65, 81], textColor: 255, fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  if (referrer.byClient.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Client', 'Rate', 'Payments', 'Received', 'Referral']],
      body: referrer.byClient.map((c) => [`${c.clientName} (${c.clientId})`, c.rates.map((x) => `${x}%`).join(', '), c.payments, num(c.received), num(c.earned)]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.5, halign: 'right' },
      headStyles: { fillColor: [55, 65, 81], textColor: 255, halign: 'center' },
      columnStyles: { 0: { halign: 'left' }, 1: { halign: 'center' } },
      margin: { left: 14, right: 14 },
    });
  }

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Month / date', 'Particulars', 'Earned', 'Paid', 'Balance']],
    body: referrer.ledger.map((l) => (l.kind === 'earned'
      ? [l.label, `${l.clientName}: ${l.rate}% of ${num(l.received)}`, num(l.amount), '', num(l.balance)]
      : [dateName(l.date), `Payout, ${modeLabel(l.mode)}${l.reference ? ` ${l.reference}` : ''}${l.tds ? ` (TDS ${num(l.tds)}, net ${num(l.net)})` : ''}`, '', num(l.amount), num(l.balance)])),
    foot: [['', 'Total', num(referrer.earnedAll), num(referrer.paidAll), num(referrer.due)]],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5, halign: 'right' },
    headStyles: { fillColor: [55, 65, 81], textColor: 255, halign: 'center' },
    footStyles: { fillColor: [229, 231, 235], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'left', cellWidth: 26 }, 1: { halign: 'left' } },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`Referral_Statement_${safe(referrer.name)}_${today()}.pdf`);
}
