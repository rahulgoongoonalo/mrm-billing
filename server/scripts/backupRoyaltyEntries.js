// Full snapshot of every royalty-accounting entry, written to backups/.
// Run this before any change that recalculates commission across the ledger.
//
//   node scripts/backupRoyaltyEntries.js                      (write a backup)
//   node scripts/backupRoyaltyEntries.js --restore <file>     (dry run of a restore)
//   node scripts/backupRoyaltyEntries.js --restore <file> --apply
//
// A restore rewrites only the stored fields captured in the backup; it does not
// delete entries created after the snapshot was taken.

require('dotenv').config();
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');

const args = process.argv.slice(2);
const restoreIdx = args.indexOf('--restore');
const RESTORE_FILE = restoreIdx === -1 ? null : args[restoreIdx + 1];
const APPLY = args.includes('--apply');

async function writeBackup() {
  const entries = await RoyaltyAccounting.find({}).lean();
  const backupDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(
    backupDir,
    `royalty-entries-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(file, JSON.stringify({
    createdAt: new Date().toISOString(),
    count: entries.length,
    entries,
  }, null, 1));

  const withCommission = entries.filter((e) => (e.totalCommission || 0) > 0).length;
  console.log(`Backed up ${entries.length} entries (${withCommission} with commission > 0)`);
  console.log(`Written to: ${file}`);
}

async function restore(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Backup from ${raw.createdAt}: ${raw.entries.length} entries`);
  console.log(APPLY ? 'Applying…\n' : '[DRY RUN - nothing will be written]\n');

  let restored = 0;
  let identical = 0;
  let missing = 0;

  for (const saved of raw.entries) {
    const current = await RoyaltyAccounting.findById(saved._id);
    if (!current) {
      console.log(`MISSING   ${saved.clientId} ${saved.month} ${saved.year} - no longer exists`);
      missing++;
      continue;
    }
    if (current.totalCommission === saved.totalCommission &&
        current.totalOutstanding === saved.totalOutstanding) {
      identical++;
      continue;
    }
    console.log(
      `RESTORE   ${saved.clientId} ${saved.month} ${saved.year}  ` +
      `commission ${current.totalCommission} -> ${saved.totalCommission}  ` +
      `outstanding ${current.totalOutstanding} -> ${saved.totalOutstanding}`
    );
    if (APPLY) {
      // Overwrite stored values directly: re-running the compute hook would
      // just reproduce the figures we are trying to roll back.
      await RoyaltyAccounting.collection.replaceOne({ _id: current._id }, saved);
    }
    restored++;
  }

  console.log(`\n${APPLY ? 'Restored' : 'Would restore'}: ${restored}   unchanged: ${identical}   missing: ${missing}`);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  if (RESTORE_FILE) await restore(RESTORE_FILE);
  else await writeBackup();
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
