// RESTORE FY 2025-2026 DATA
//
// Fixes damage caused by the settings route accidentally running against FY 2025-2026:
//   1. April entries' previousMonthOutstanding was zeroed (cascaded through all months)
//   2. 246 blank draft entries (May-March for inactive clients) were deleted
//
// This script:
//   1. Restores April previousMonthOutstanding from client.previousBalance
//   2. Recreates missing blank month entries for all 12 months
//   3. Cascades to recalculate all totalOutstanding values correctly
//
// SAFE: Only modifies previousMonthOutstanding and computed fields.
//       Never touches user-entered amounts (iprs, prs, receipts, etc.)

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const Client = require('../models/Client');

const monthOrder = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];

function getYearForMonth(month) {
  return ['jan', 'feb', 'mar'].includes(month) ? 2026 : 2025;
}

const r = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });
  console.log('Connected to MongoDB\n');

  const financialYear = { startYear: 2025, endYear: 2026 };
  const clients = await Client.find({});
  console.log(`Total clients: ${clients.length}`);

  // 1. Get all FY 2025-2026 entries
  const allEntries = await RoyaltyAccounting.find({
    $or: [
      { year: 2025, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
      { year: 2026, month: { $in: ['jan', 'feb', 'mar'] } }
    ]
  });

  console.log(`Existing FY 2025-2026 entries: ${allEntries.length}`);

  // Build map: clientId -> { month -> entry }
  const entryMap = {};
  allEntries.forEach(e => {
    if (!entryMap[e.clientId]) entryMap[e.clientId] = {};
    entryMap[e.clientId][e.month] = e;
  });

  // 2. Check which clients have entries
  const clientsWithEntries = Object.keys(entryMap);
  console.log(`Clients with FY 2025-2026 entries: ${clientsWithEntries.length}`);

  // 3. Sum of previousBalance to verify
  const prevBalanceSum = clients.reduce((sum, c) => sum + (c.previousBalance || 0), 0);
  console.log(`Sum of client.previousBalance: ₹${prevBalanceSum.toFixed(2)}`);
  console.log(`(Expected ~₹58,97,198.36 = previous year outstanding)\n`);

  // === STEP A: Fix April entries' previousMonthOutstanding ===
  let aprilFixed = 0;
  let aprilSkipped = 0;
  for (const client of clients) {
    const aprilEntry = entryMap[client.clientId]?.['apr'];
    if (!aprilEntry) continue;

    const correctPrevOutstanding = r(client.previousBalance || 0);
    if (aprilEntry.previousMonthOutstanding !== correctPrevOutstanding) {
      aprilEntry.previousMonthOutstanding = correctPrevOutstanding;
      await aprilEntry.save(); // pre-save hook recalculates all computed fields
      aprilFixed++;
    } else {
      aprilSkipped++;
    }
  }
  console.log(`April entries fixed: ${aprilFixed}, already correct: ${aprilSkipped}`);

  // === STEP B: Recreate missing blank month entries ===
  let created = 0;
  const docsToInsert = [];
  for (const client of clients) {
    const clientEntries = entryMap[client.clientId] || {};
    // Only recreate for clients that have at least an April entry
    if (!clientEntries['apr']) continue;

    for (let i = 0; i < monthOrder.length; i++) {
      const month = monthOrder[i];
      if (clientEntries[month]) continue; // already exists

      const year = getYearForMonth(month);
      docsToInsert.push({
        clientId: client.clientId,
        clientName: client.name,
        month,
        year,
        commissionRate: client.commissionRate || 0,
        gstRate: 18,
        previousMonthOutstanding: 0, // will be fixed by cascade
        status: 'draft',
      });
    }
  }

  if (docsToInsert.length > 0) {
    const inserted = await RoyaltyAccounting.insertMany(docsToInsert, { ordered: false });
    created = inserted.length;
  }
  console.log(`Blank entries recreated: ${created}`);

  // === STEP C: Cascade through ALL clients to fix previousMonthOutstanding chain ===
  console.log('\nCascading outstanding through all clients...');
  let cascaded = 0;
  for (const client of clients) {
    const aprilEntry = await RoyaltyAccounting.findOne({
      clientId: client.clientId, month: 'apr', year: 2025
    });
    if (!aprilEntry) continue;

    // Cascade from May onward (index 1)
    await RoyaltyAccounting.cascadeUpdate(client.clientId, 1, financialYear);
    cascaded++;
    if (cascaded % 50 === 0) {
      console.log(`  Cascaded ${cascaded} clients...`);
    }
  }
  console.log(`Cascaded: ${cascaded} clients`);

  // === VERIFY ===
  console.log('\n--- VERIFICATION ---');
  const verifyEntries = await RoyaltyAccounting.find({
    $or: [
      { year: 2025, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
      { year: 2026, month: { $in: ['jan', 'feb', 'mar'] } }
    ]
  });

  const totalEntries = verifyEntries.length;
  const draftCount = verifyEntries.filter(e => e.status === 'draft').length;
  const submittedCount = verifyEntries.filter(e => e.status === 'submitted').length;
  const prevYearOutstanding = verifyEntries
    .filter(e => e.month === 'apr')
    .reduce((sum, e) => sum + (e.previousMonthOutstanding || 0), 0);

  // Latest entry per client for total outstanding
  const latestByClient = {};
  const FY_ORDER = { apr: 0, may: 1, jun: 2, jul: 3, aug: 4, sep: 5, oct: 6, nov: 7, dec: 8, jan: 9, feb: 10, mar: 11 };
  verifyEntries.forEach(e => {
    const prev = latestByClient[e.clientId];
    if (!prev || FY_ORDER[e.month] > FY_ORDER[prev.month]) {
      latestByClient[e.clientId] = e;
    }
  });
  const totalOutstanding = Object.values(latestByClient).reduce((sum, e) => sum + (e.totalOutstanding || 0), 0);

  console.log(`Total entries: ${totalEntries} (expected ~2566)`);
  console.log(`Drafts: ${draftCount} (expected ~246)`);
  console.log(`Submitted: ${submittedCount} (expected 2320)`);
  console.log(`Previous Year Outstanding: ₹${prevYearOutstanding.toFixed(2)} (expected ~₹58,97,198.36)`);
  console.log(`Total Outstanding: ₹${totalOutstanding.toFixed(2)} (expected ~₹1,04,00,301.81)`);

  console.log('\nDone!');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('ERROR:', err);
  mongoose.disconnect();
  process.exit(1);
});
