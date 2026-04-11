// CLEANUP FY 2026-2027 ghost entries
//
// Removes all blank May-March entries from FY 2026-2027 that were auto-seeded.
// Keeps only April entries with correct carry-forward from FY 2025-2026 March.
// Does NOT touch FY 2025-2026 at all.

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const Client = require('../models/Client');

const r = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });
  console.log('Connected to MongoDB\n');

  // 1. Count current FY 2026-2027 entries
  const before = await RoyaltyAccounting.countDocuments({
    $or: [
      { year: 2026, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
      { year: 2027, month: { $in: ['jan', 'feb', 'mar'] } }
    ]
  });
  console.log(`FY 2026-2027 entries BEFORE cleanup: ${before}`);

  // 2. Delete ALL non-April blank entries in FY 2026-2027
  const deleted = await RoyaltyAccounting.deleteMany({
    $or: [
      { year: 2026, month: { $in: ['may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
      { year: 2027, month: { $in: ['jan', 'feb', 'mar'] } }
    ],
    status: 'draft',
    totalCommission: 0,
  });
  console.log(`Deleted ${deleted.deletedCount} blank non-April entries`);

  // 3. Fix April entries: carry-forward from FY 2025-2026 March
  const clients = await Client.find({ isActive: true });
  const clientIds = clients.map(c => c.clientId);

  // Get FY 2025-2026 March entries
  const marchEntries = await RoyaltyAccounting.find({
    clientId: { $in: clientIds },
    month: 'mar',
    year: 2026
  }).select('clientId totalOutstanding');
  const marchMap = {};
  marchEntries.forEach(e => { marchMap[e.clientId] = e.totalOutstanding || 0; });
  console.log(`\nFY 2025-2026 March entries found: ${marchEntries.length}`);

  // Get existing April 2026 entries
  const aprilEntries = await RoyaltyAccounting.find({
    year: 2026, month: 'apr',
    clientId: { $in: clientIds }
  });

  // Separate: FY 2025 April (year=2025) vs FY 2026 April (year=2026)
  // We need FY 2026-2027 April which is year=2026
  // But FY 2025-2026 also has April with year=2025
  // Let me check what month/year combos exist for April
  const fy2627Aprils = await RoyaltyAccounting.find({
    year: 2026, month: 'apr'
  });
  console.log(`FY 2026-2027 April entries: ${fy2627Aprils.length}`);

  let fixed = 0;
  const aprilMap = {};
  fy2627Aprils.forEach(e => { aprilMap[e.clientId] = e; });

  for (const [clientId, aprilEntry] of Object.entries(aprilMap)) {
    const marchOutstanding = r(marchMap[clientId] || 0);
    if (aprilEntry.previousMonthOutstanding !== marchOutstanding) {
      aprilEntry.previousMonthOutstanding = marchOutstanding;
      await aprilEntry.save();
      fixed++;
    } else if (aprilEntry.totalCommission === 0 && aprilEntry.totalOutstanding !== marchOutstanding) {
      // Blank entry with wrong totalOutstanding from insertMany
      await aprilEntry.save();
      fixed++;
    }
  }
  console.log(`April entries carry-forward fixed: ${fixed}`);

  // 4. Verify
  const after = await RoyaltyAccounting.countDocuments({
    $or: [
      { year: 2026, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
      { year: 2027, month: { $in: ['jan', 'feb', 'mar'] } }
    ]
  });

  // Get outstanding stats
  const fy2627Entries = await RoyaltyAccounting.find({
    $or: [
      { year: 2026, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
      { year: 2027, month: { $in: ['jan', 'feb', 'mar'] } }
    ]
  });
  const prevYearOut = fy2627Entries
    .filter(e => e.month === 'apr')
    .reduce((s, e) => s + (e.previousMonthOutstanding || 0), 0);
  const totalOut = fy2627Entries
    .filter(e => e.month === 'apr')
    .reduce((s, e) => s + (e.totalOutstanding || 0), 0);

  console.log(`\n--- FY 2026-2027 AFTER CLEANUP ---`);
  console.log(`Total entries: ${after} (should be ~217 = one April per client)`);
  console.log(`Previous Year Outstanding (carry-forward): ₹${prevYearOut.toFixed(2)}`);
  console.log(`Total Outstanding: ₹${totalOut.toFixed(2)}`);

  console.log('\nDone!');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('ERROR:', err);
  mongoose.disconnect();
  process.exit(1);
});
