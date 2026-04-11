// Delete ALL FY 2026-2027 entries for a completely fresh start.
// Does NOT touch FY 2025-2026 (year=2025 Apr-Dec, year=2026 Jan-Mar).
//
// FY 2026-2027 = year=2026 Apr-Dec + year=2027 Jan-Mar
// FY 2025-2026 = year=2025 Apr-Dec + year=2026 Jan-Mar  (UNTOUCHED)

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });
  console.log('Connected to MongoDB\n');

  // Safety check: count FY 2025-2026 entries BEFORE
  const fy2526Before = await RoyaltyAccounting.countDocuments({
    $or: [
      { year: 2025, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
      { year: 2026, month: { $in: ['jan', 'feb', 'mar'] } }
    ]
  });
  console.log(`FY 2025-2026 entries BEFORE: ${fy2526Before}`);

  // Count FY 2026-2027 entries to delete
  const fy2627Before = await RoyaltyAccounting.countDocuments({
    $or: [
      { year: 2026, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
      { year: 2027, month: { $in: ['jan', 'feb', 'mar'] } }
    ]
  });
  console.log(`FY 2026-2027 entries BEFORE: ${fy2627Before}`);

  // Delete ONLY FY 2026-2027 entries
  const result = await RoyaltyAccounting.deleteMany({
    $or: [
      { year: 2026, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
      { year: 2027, month: { $in: ['jan', 'feb', 'mar'] } }
    ]
  });
  console.log(`\nDeleted: ${result.deletedCount} FY 2026-2027 entries`);

  // Safety check: count FY 2025-2026 entries AFTER
  const fy2526After = await RoyaltyAccounting.countDocuments({
    $or: [
      { year: 2025, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
      { year: 2026, month: { $in: ['jan', 'feb', 'mar'] } }
    ]
  });
  console.log(`\nFY 2025-2026 entries AFTER: ${fy2526After} (should be same as before: ${fy2526Before})`);

  const fy2627After = await RoyaltyAccounting.countDocuments({
    $or: [
      { year: 2026, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
      { year: 2027, month: { $in: ['jan', 'feb', 'mar'] } }
    ]
  });
  console.log(`FY 2026-2027 entries AFTER: ${fy2627After} (should be 0)`);

  if (fy2526Before === fy2526After) {
    console.log('\n✓ FY 2025-2026 is UNTOUCHED.');
  } else {
    console.log('\n✗ WARNING: FY 2025-2026 count changed!');
  }

  await mongoose.disconnect();
  console.log('Done!');
}

run().catch(err => {
  console.error('ERROR:', err);
  mongoose.disconnect();
  process.exit(1);
});
