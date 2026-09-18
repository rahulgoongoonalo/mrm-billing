// Backfills royaltyType on every royalty-accounting entry from its client
// record. The client master owns this field; entries only mirror it.
//
// Only the descriptive label is touched - no amount, commission, GST or
// outstanding figure is read or written by this script.
//
//   node scripts/syncRoyaltyTypes.js --dry    (report only, change nothing)
//   node scripts/syncRoyaltyTypes.js          (apply)

require('dotenv').config();
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const mongoose = require('mongoose');
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');

const DRY = process.argv.includes('--dry');

// "Royalty – IPRS + PRS" and "IPRS + PRS" describe the same contract; only a
// difference in the societies themselves is a real mismatch.
const norm = (s) => String(s || '')
  .replace(/^\s*Royalty\s*[–—-]\s*/i, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected.${DRY ? '  [DRY RUN - nothing will be written]' : ''}\n`);

  const clients = await Client.find({}).lean();
  const byId = new Map(clients.map((c) => [c.clientId, c]));

  let scanned = 0;
  let cosmetic = 0;
  let substantive = 0;
  let updated = 0;
  let orphaned = 0;
  const changedClients = new Set();

  for (const client of clients) {
    const target = client.type || '';
    const entries = await RoyaltyAccounting.find({ clientId: client.clientId })
      .select('_id royaltyType')
      .lean();

    const stale = entries.filter((e) => (e.royaltyType || '') !== target);
    scanned += entries.length;
    if (!stale.length) continue;

    if (norm(stale[0].royaltyType) === norm(target)) cosmetic += stale.length;
    else { substantive += stale.length; changedClients.add(client.clientId); }

    if (!DRY) {
      const res = await RoyaltyAccounting.updateMany(
        { clientId: client.clientId },
        { $set: { royaltyType: target } }
      );
      updated += res.modifiedCount;
    } else {
      updated += stale.length;
    }
  }

  // Entries whose client record no longer exists are left alone.
  const allEntries = await RoyaltyAccounting.find({}).select('clientId').lean();
  for (const e of allEntries) if (!byId.has(e.clientId)) orphaned++;

  console.log(`Entries scanned                      : ${scanned}`);
  console.log(`Label differed only by the prefix    : ${cosmetic}`);
  console.log(`Different societies (real mismatch)  : ${substantive}`);
  console.log(`Clients with a real mismatch         : ${changedClients.size}`);
  console.log(`Entries ${DRY ? 'that would be' : ''} updated${DRY ? '' : '                     '}: ${updated}`);
  if (orphaned) console.log(`Entries with no client record (skipped): ${orphaned}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch(async (err) => {
  console.error('Sync failed:', err);
  await mongoose.disconnect();
  process.exitCode = 1;
});
