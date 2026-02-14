require('dotenv').config();
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const mongoose = require('mongoose');
const Client = require('../models/Client');
const RA = require('../models/RoyaltyAccounting');

async function syncNames() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const clients = await Client.find({});
  let totalUpdated = 0;

  for (const c of clients) {
    const result = await RA.updateMany(
      { clientId: c.clientId, clientName: { $ne: c.name } },
      { $set: { clientName: c.name } }
    );
    if (result.modifiedCount > 0) {
      console.log(`${c.clientId}: updated ${result.modifiedCount} entries to "${c.name}"`);
      totalUpdated += result.modifiedCount;
    }
  }

  console.log(`Done. ${totalUpdated} entries updated.`);
  process.exit(0);
}

syncNames().catch(err => { console.error(err); process.exit(1); });
