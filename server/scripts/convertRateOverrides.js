// One-off: the short-lived "different rate for this month" option (2.8.0) was
// replaced by "unlock commission for this month". Any month saved with a month
// rate becomes a typed commission equal to the commission it already stores,
// so no figure moves.
//
//   node scripts/convertRateOverrides.js          # dry run - prints only
//   node scripts/convertRateOverrides.js --apply  # writes

require('dotenv').config();
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const mongoose = require('mongoose');
const { SOCIETY_FIELDS } = require('../utils/clientProfile');

const apply = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.db.collection('royaltyAccounting');
  const rows = await col.find({ rateOverrides: { $exists: true } }).toArray();

  let converted = 0;
  for (const e of rows) {
    const typed = [...(e.commissionOverrides || [])];
    for (const o of e.rateOverrides || []) {
      const field = SOCIETY_FIELDS[o.society]?.commission;
      if (!field || typed.some((t) => t.society === o.society)) continue;
      typed.push({ society: o.society, amount: Number(e[field]) || 0 });
    }
    if ((e.rateOverrides || []).length) {
      converted++;
      console.log(`${e.clientId} ${e.clientName} ${e.month}-${e.year}: ${JSON.stringify(e.rateOverrides)} -> ${JSON.stringify(typed)}`);
    }
    if (apply) {
      await col.updateOne({ _id: e._id }, { $set: { commissionOverrides: typed }, $unset: { rateOverrides: '' } });
    }
  }

  console.log(`\n${converted} month(s) with a month rate, ${rows.length} with the field.${apply ? ' Written.' : ' Dry run - nothing written.'}`);
  await mongoose.disconnect();
})();
