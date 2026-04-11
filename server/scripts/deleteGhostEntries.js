// Deletes the 38 "ghost" blank FY 2025-26 entries that the /financial-year
// seeding loop accidentally created on top of existing partial client data.
//
// Strict safety rules — an entry is only deleted if ALL are true:
//   1. year/month falls within FY 2025-26
//   2. ALL input fields are 0 and totalOutstanding is 0 (truly blank)
//   3. createdAt is within the narrow 10:14–10:16 UTC window on 2026-04-08
//      (the exact window when the seeding loop ran)
//   4. The same client has OTHER non-blank entries in FY 2025-26
//
// Clients who had NO prior FY 2025-26 data are left alone — their blank
// entries aren't "corrupting" anything and the user asked us not to touch
// their 2025-26 data unnecessarily.

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');

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

    // Narrow time window — the seeding loop ran between 10:14:00 and 10:16:00 UTC
    const windowStart = new Date('2026-04-08T10:14:00.000Z');
    const windowEnd = new Date('2026-04-08T10:16:00.000Z');

    const candidates = await RoyaltyAccounting.find({
      createdAt: { $gte: windowStart, $lte: windowEnd },
      $or: [
        { year: 2025, month: { $in: ['apr','may','jun','jul','aug','sep','oct','nov','dec'] } },
        { year: 2026, month: { $in: ['jan','feb','mar'] } }
      ]
    }).lean();

    const blankCandidates = candidates.filter(isBlank);
    console.log(`Blank candidates in time window: ${blankCandidates.length}`);

    // Confirm each candidate's client has OTHER non-blank FY 2025-26 entries
    const clientIds = [...new Set(blankCandidates.map(g => g.clientId))];
    const siblingEntries = await RoyaltyAccounting.find({
      clientId: { $in: clientIds },
      $or: [
        { year: 2025, month: { $in: ['apr','may','jun','jul','aug','sep','oct','nov','dec'] } },
        { year: 2026, month: { $in: ['jan','feb','mar'] } }
      ]
    }).lean();
    const byClient = {};
    siblingEntries.forEach(e => {
      (byClient[e.clientId] = byClient[e.clientId] || []).push(e);
    });

    const ghostsToDelete = blankCandidates.filter(g => {
      const siblings = byClient[g.clientId] || [];
      return siblings.some(s => s._id.toString() !== g._id.toString() && !isBlank(s));
    });

    console.log(`Confirmed ghosts to delete: ${ghostsToDelete.length}\n`);

    if (ghostsToDelete.length === 0) {
      console.log('Nothing to delete.');
      return;
    }

    ghostsToDelete.forEach(g => {
      console.log(`  DELETE ${g.clientId} | ${g.clientName} | ${g.month} ${g.year}`);
    });

    const ids = ghostsToDelete.map(g => g._id);
    const result = await RoyaltyAccounting.deleteMany({ _id: { $in: ids } });
    console.log(`\nDeleted ${result.deletedCount} ghost entries.`);
  } catch (err) {
    console.error('Error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
