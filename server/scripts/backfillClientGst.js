// One-off backfill of gstId on the client master, from the GST sheet in
// docs/GST.jpeg. Clients are addressed by clientId - no name matching at
// runtime - so a rename cannot retarget a write.
//
// Every GSTIN below was verified against the GSTIN check-digit algorithm
// before being entered here.
//
// Only gstId is touched; no amount, commission, fee or outstanding figure
// is read or written by this script.
//
//   node scripts/backfillClientGst.js --dry    (report only, change nothing)
//   node scripts/backfillClientGst.js          (apply)

require('dotenv').config();
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const mongoose = require('mongoose');
const Client = require('../models/Client');

const DRY = process.argv.includes('--dry');

// clientId -> [GSTIN, name as it appears on the sheet]
const GST_BY_CLIENT = {
  'MRM-170': ['27AAACJ1258Q1Z6', 'ULTRA MEDIA & ENTERTAINMENT P LTD'],
  'MRM-18':  ['27BWVPD7399K1ZG', 'Anuj Danait'],
  'MRM-105': ['27AAIPS1482Q1ZW', 'Pyarelal Sharma'],
  'MRM-79':  ['27BHTPS1471G2ZT', 'Milind Chitragupta Shrivastava'],
  'MRM-13':  ['27BHSPS5956H2ZE', 'Anand Chitragupta Shrivastava'],
  'MRM-36':  ['36AHUPB8499B1ZW', 'BHASKARABHATLA RAVI KUMAR'],
  'MRM-161': ['19AADCV7250P1ZM', 'SVF ENTERTAINMENT MEDIA PRIVATE LIMITED'],
  'MRM-8':   ['36AACCA7302A1ZE', 'ADITYA MUSIC (India) Pvt. Ltd.'],
  'MRM-93':  ['27AEXPU1259E1ZX', 'NITIN PANDURANG UGALMUGALE'],
  'MRM-138': ['27AACPP0203C1ZH', 'SHARANGDEV PANDIT'],
  'MRM-82':  ['27BATPS4765A2Z8', 'MITHUN NARESH SHARMA'],
  'MRM-9':   ['27AFPPG2591C1ZG', 'Ajay Gogavale'],
  'MRM-32':  ['27ADVPG1897M1ZM', 'ATUL ASHOK GOGAVALE'],
  'MRM-108': ['27BIIPP2475B2Z8', 'Raja Pandey'],
  'MRM-56':  ['27AABPA0224H1ZI', 'JAVED AKHTAR'],
  'MRM-209': ['27AAACE5273A1Z1', 'EXCEL ENTERTAINMENT PVT. LTD'],
  'MRM-115': ['27ASNPS0346L1Z7', 'RIPUL SHARMA'],
  'MRM-51':  ['32AHVPG5900F3ZG', 'CHAKKAMADATHIL SURESH BABU GOPI SUNDAR'],
};

// 15th character of a GSTIN is a check digit over the first 14.
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const checkDigit = (gst) => {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = ALPHABET.indexOf(gst[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return ALPHABET[(36 - (sum % 36)) % 36];
};

async function run() {
  // Refuse to write anything if a typo crept into the table above.
  const bad = Object.entries(GST_BY_CLIENT)
    .filter(([, [gst]]) => checkDigit(gst) !== gst[14]);
  if (bad.length) {
    bad.forEach(([id, [gst]]) => console.error(`Bad check digit: ${id} ${gst}`));
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected.${DRY ? '  [DRY RUN - nothing will be written]' : ''}\n`);

  let updated = 0;
  let unchanged = 0;
  let missing = 0;
  const conflicts = [];

  for (const [clientId, [gst, sheetName]] of Object.entries(GST_BY_CLIENT)) {
    const client = await Client.findOne({ clientId });
    if (!client) {
      console.log(`MISSING   ${clientId.padEnd(8)} not in database (sheet: ${sheetName})`);
      missing++;
      continue;
    }

    if (client.gstId === gst) {
      console.log(`SAME      ${clientId.padEnd(8)} ${client.name} -> ${gst}`);
      unchanged++;
      continue;
    }

    // An existing, different GST number is a data question, not a typo to
    // overwrite silently - leave it and report it.
    if (client.gstId) {
      console.log(`CONFLICT  ${clientId.padEnd(8)} ${client.name} has ${client.gstId}, sheet says ${gst} - left alone`);
      conflicts.push(clientId);
      continue;
    }

    console.log(`${DRY ? 'WOULD SET' : 'SET      '} ${clientId.padEnd(8)} ${client.name} -> ${gst}`);
    if (!DRY) {
      client.gstId = gst;
      // Validate only gstId: unrelated legacy phone/email values on the
      // record must not block this write.
      await client.save({ validateModifiedOnly: true });
    }
    updated++;
  }

  console.log(`\n${DRY ? 'Would update' : 'Updated'}: ${updated}   already correct: ${unchanged}   missing: ${missing}   conflicts: ${conflicts.length}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
