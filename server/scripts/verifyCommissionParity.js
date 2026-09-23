// Proves the per-society commission change did not alter any existing figure.
//
// Recomputes every stored entry with the current computeFields() and compares
// the result against what is in the database. Reads only - it never writes.
// Every entry should match, because entries saved before per-society rates
// existed have no commissionMode and so fall back to the single flat rate.
//
//   node scripts/verifyCommissionParity.js
//
// Exits non-zero if anything differs, so it can gate a deploy.

require('dotenv').config();
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const mongoose = require('mongoose');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const { computeFields } = require('../models/RoyaltyAccounting');

// Every field computeFields() derives.
const DERIVED = [
  'iprsCommission', 'prsCommission', 'soundExchangeCommission', 'isamraCommission',
  'ascapCommission', 'bmiCommission', 'socanCommission', 'pplCommission', 'mlcCommission',
  'totalCommission',
  'currentMonthGst', 'currentMonthInvoiceTotal',
  'previousOutstandingGst', 'previousOutstandingInvoiceTotal',
  'invoicePendingCurrentMonth', 'previousInvoicePending',
  'monthlyOutstanding', 'totalOutstanding',
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const entries = await RoyaltyAccounting.find({}).lean();
  console.log(`Recomputing ${entries.length} entries…\n`);

  const mismatches = [];
  let perSociety = 0;

  for (const stored of entries) {
    if (stored.commissionMode === 'per-society') perSociety++;

    const recomputed = computeFields({ ...stored });
    const diffs = DERIVED
      .map((field) => ({
        field,
        was: stored[field] ?? 0,
        now: recomputed[field] ?? 0,
      }))
      .filter((d) => d.was !== d.now);

    if (diffs.length) mismatches.push({ stored, diffs });
  }

  if (!mismatches.length) {
    console.log(`PASS - all ${entries.length} entries recompute to exactly their stored values.`);
    console.log(`       ${perSociety} entries use per-society rates, ${entries.length - perSociety} flat.`);
    await mongoose.disconnect();
    return;
  }

  console.log(`FAIL - ${mismatches.length} entries differ:\n`);
  for (const { stored, diffs } of mismatches.slice(0, 40)) {
    console.log(`  ${stored.clientId} ${stored.month} ${stored.year} (${stored.clientName})`);
    diffs.forEach((d) => console.log(`      ${d.field}: stored ${d.was} -> recomputed ${d.now}`));
  }
  if (mismatches.length > 40) console.log(`  …and ${mismatches.length - 40} more`);

  await mongoose.disconnect();
  process.exitCode = 1;
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
