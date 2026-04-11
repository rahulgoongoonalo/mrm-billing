// READ-ONLY: finds any client with "rahul" or "test" in the name and shows
// their FY 2026-27 entries, plus any non-zero FY 2026-27 entries.

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    const matches = await Client.find({
      $or: [
        { name: { $regex: 'rahul', $options: 'i' } },
        { name: { $regex: 'test', $options: 'i' } }
      ]
    }).lean();

    console.log(`=== Matching clients ===`);
    matches.forEach(c => {
      console.log(`  ${c.clientId} | ${c.name} | active=${c.isActive} | commission=${c.commissionRate}`);
    });

    if (matches.length === 0) {
      console.log('  (none)');
    }

    for (const c of matches) {
      const entries = await RoyaltyAccounting.find({
        clientId: c.clientId,
        $or: [
          { year: 2026, month: { $in: ['apr','may','jun','jul','aug','sep','oct','nov','dec'] } },
          { year: 2027, month: { $in: ['jan','feb','mar'] } }
        ]
      }).lean();
      console.log(`\n--- ${c.clientId} (${c.name}) FY 2026-27 entries ---`);
      entries.forEach(e => {
        console.log(`  ${e.month} ${e.year} | status=${e.status} | iprs=${e.iprsAmount} prs=${e.prsAmount} totalCommission=${e.totalCommission} totalOS=${e.totalOutstanding} | createdAt=${e.createdAt?.toISOString?.()}`);
      });
    }

    console.log(`\n=== Any FY 2026-27 entries with non-zero commission ===`);
    const nonZero = await RoyaltyAccounting.find({
      totalCommission: { $ne: 0 },
      $or: [
        { year: 2026, month: { $in: ['apr','may','jun','jul','aug','sep','oct','nov','dec'] } },
        { year: 2027, month: { $in: ['jan','feb','mar'] } }
      ]
    }).lean();
    console.log(`Count: ${nonZero.length}`);
    nonZero.slice(0, 20).forEach(e => {
      console.log(`  ${e.clientId} | ${e.clientName} | ${e.month} ${e.year} | totalCommission=${e.totalCommission} totalOS=${e.totalOutstanding}`);
    });
  } catch (err) {
    console.error('Error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
