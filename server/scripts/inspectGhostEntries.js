// READ-ONLY diagnostic. Finds entries that look like "ghost" blank entries
// auto-created by the /financial-year seeding loop on top of a client's
// existing partial FY data. Does NOT modify anything.
//
// Heuristic for a ghost entry:
//   - All royalty/receipt/GST input fields are 0
//   - totalOutstanding = 0
//   - The SAME client has OTHER non-blank entries in the same FY
//   - createdAt is very recent (last 48 hours)

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');

const monthOrder = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];

function isBlank(e) {
  return (
    (e.iprsAmount || 0) === 0 &&
    (e.prsAmount || 0) === 0 &&
    (e.soundExchangeAmount || 0) === 0 &&
    (e.isamraAmount || 0) === 0 &&
    (e.ascapAmount || 0) === 0 &&
    (e.pplAmount || 0) === 0 &&
    (e.mlcAmount || 0) === 0 &&
    (e.extraAmount || 0) === 0 &&
    (e.currentMonthGstBase || 0) === 0 &&
    (e.previousOutstandingGstBase || 0) === 0 &&
    (e.currentMonthReceipt || 0) === 0 &&
    (e.currentMonthTds || 0) === 0 &&
    (e.previousMonthReceipt || 0) === 0 &&
    (e.previousMonthTds || 0) === 0 &&
    (e.totalOutstanding || 0) === 0
  );
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    // Indraadip specifically (as a control)
    console.log('=== Indraadip Dasgupta (MRM-52) — all FY 2025-26 entries ===');
    const indraadipEntries = await RoyaltyAccounting.find({
      clientId: 'MRM-52',
      $or: [
        { year: 2025, month: { $in: ['apr','may','jun','jul','aug','sep','oct','nov','dec'] } },
        { year: 2026, month: { $in: ['jan','feb','mar'] } }
      ]
    }).lean();
    indraadipEntries.sort((a,b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));
    indraadipEntries.forEach(e => {
      console.log(
        `  ${e.month} ${e.year} | status=${e.status} | prevMO=${e.previousMonthOutstanding} | totalOS=${e.totalOutstanding} | blank=${isBlank(e)} | createdAt=${e.createdAt?.toISOString?.() || e.createdAt}`
      );
    });

    // Global: blank entries created in last 48h in FY 2025-26
    console.log('\n=== All blank FY 2025-26 entries created in the last 48 hours ===');
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const recent = await RoyaltyAccounting.find({
      createdAt: { $gte: cutoff },
      $or: [
        { year: 2025, month: { $in: ['apr','may','jun','jul','aug','sep','oct','nov','dec'] } },
        { year: 2026, month: { $in: ['jan','feb','mar'] } }
      ]
    }).lean();

    const ghosts = recent.filter(isBlank);
    console.log(`Recent FY 2025-26 entries total: ${recent.length}`);
    console.log(`Of those, blank (ghost candidates): ${ghosts.length}`);

    // For each ghost, confirm the same client has OTHER non-blank entries in FY 2025-26
    const clientIds = [...new Set(ghosts.map(g => g.clientId))];
    const allEntriesForClients = await RoyaltyAccounting.find({
      clientId: { $in: clientIds },
      $or: [
        { year: 2025, month: { $in: ['apr','may','jun','jul','aug','sep','oct','nov','dec'] } },
        { year: 2026, month: { $in: ['jan','feb','mar'] } }
      ]
    }).lean();
    const byClient = {};
    allEntriesForClients.forEach(e => {
      (byClient[e.clientId] = byClient[e.clientId] || []).push(e);
    });

    const confirmedGhosts = ghosts.filter(g => {
      const siblings = byClient[g.clientId] || [];
      return siblings.some(s => s._id.toString() !== g._id.toString() && !isBlank(s));
    });

    console.log(`Confirmed ghosts (client has other non-blank FY25-26 entries): ${confirmedGhosts.length}`);
    if (confirmedGhosts.length > 0) {
      console.log('\n--- Confirmed ghost entries ---');
      confirmedGhosts.forEach(g => {
        console.log(`  ${g.clientId} | ${g.clientName} | ${g.month} ${g.year} | createdAt=${g.createdAt?.toISOString?.()}`);
      });
    }

    console.log('\nNo data was modified.');
  } catch (err) {
    console.error('Error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
