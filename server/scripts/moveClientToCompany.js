// Move clients from one company's database to another's (e.g. MRM's non-GST
// clients to Kangabeats), keeping every record exactly as it is.
//
//   node scripts/moveClientToCompany.js MRM-212 --to kangabeats            (dry run)
//   node scripts/moveClientToCompany.js MRM-212 MRM-103 --to kangabeats --apply
//   node scripts/moveClientToCompany.js --restore <backup file>            (dry run)
//   node scripts/moveClientToCompany.js --restore <backup file> --apply    (undo a move)
//
// For each client, a move:
//   1. reads the client, all its royalty entries and its activity from the
//      source company, and refuses if it has referral records or if the target
//      already holds that client ID or any of those records;
//   2. writes a full backup (backups/client-moves/...json) before changing anything;
//   3. copies every record into the target unchanged (same _id, same fields,
//      same client ID), marking the client with movedFrom so old statement links
//      redirect, and setting the target company's fixed bank account if it has one;
//   4. checks the copies field by field, and that the statement (every month and
//      the closing balance) comes out the same in the target;
//   5. checks the source records were not edited meanwhile, then deletes them
//      from the source. On any failure before this step, the copies are removed
//      and the source is left as it was.
//
// --restore puts a moved client back exactly as the backup holds it and
// removes it from the target.

require('dotenv').config();
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const fs = require('fs');
const path = require('path');
const util = require('util');
const mongoose = require('mongoose');
const { EJSON } = mongoose.mongo.BSON;
const { COMPANIES, DEFAULT_COMPANY, isCompanyKey } = require('../config/companies');
const { runWithCompany } = require('../config/tenant');
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const { buildStatement } = require('../services/statementBuilder');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const APPLY = args.includes('--apply');
const RESTORE = flag('--restore');
const FROM = flag('--from') || DEFAULT_COMPANY;
const TO = flag('--to');
const CLIENT_IDS = args.filter((a, i) => !a.startsWith('--') && !['--to', '--from', '--restore'].includes(args[i - 1]));

const BACKUP_DIR = path.join(__dirname, '..', 'backups', 'client-moves');

const dbFor = (key) => {
  const name = COMPANIES[key].dbName;
  return name ? mongoose.connection.useDb(name, { useCache: true }).db : mongoose.connection.db;
};
const cols = (db) => ({
  clients: db.collection('clients'),
  entries: db.collection('royaltyAccounting'),
  activity: db.collection('activityEvents'),
  deals: db.collection('referralDeals'),
});

// Same document? Compared as canonical extended JSON (types included).
const same = (a, b) => util.isDeepStrictEqual(EJSON.serialize(a), EJSON.serialize(b));
const ids = (docs) => docs.map((d) => d._id);

// Statement exactly as the statement page builds it, in the given company.
async function statementIn(company, clientId) {
  return runWithCompany(company, async () => {
    const client = await Client.findOne({ clientId });
    const rows = await RoyaltyAccounting.find({ clientId }).lean();
    const st = client && rows.length ? buildStatement(client, rows, { mode: 'full' }) : null;
    if (!st) return null;
    // Which bank account it shows is set by the company, not the ledger.
    const { paymentAccount, ...rest } = st;
    return rest;
  });
}

async function readClient(company, clientId) {
  const c = cols(dbFor(company));
  const clients = await c.clients.find({ clientId }).toArray();
  return {
    clients,
    entries: await c.entries.find({ clientId }).toArray(),
    activity: await c.activity.find({ clientId }).toArray(),
    deals: await c.deals.find({ clientId }).toArray(),
  };
}

async function moveOne(clientId) {
  console.log(`\n=== ${clientId}: ${FROM} -> ${TO} ${APPLY ? '' : '(dry run)'}`);
  const src = cols(dbFor(FROM));
  const dst = cols(dbFor(TO));

  const data = await readClient(FROM, clientId);
  if (data.clients.length !== 1) throw new Error(`${clientId}: expected 1 client in ${FROM}, found ${data.clients.length}`);
  if (data.deals.length) throw new Error(`${clientId}: has ${data.deals.length} referral deal(s) - not moved automatically`);
  const client = data.clients[0];
  console.log(`  ${client.name} | ${data.entries.length} entries | ${data.activity.length} activity | payment account ${client.paymentAccount || '-'}`);

  // Nothing of this client may already be in the target.
  const clash = await dst.clients.countDocuments({ $or: [{ clientId }, { _id: client._id }] })
    + await dst.entries.countDocuments({ $or: [{ clientId }, { _id: { $in: ids(data.entries) } }] })
    + await dst.activity.countDocuments({ _id: { $in: ids(data.activity) } });
  if (clash) throw new Error(`${clientId}: ${TO} already holds ${clash} record(s) of this client`);

  const before = await statementIn(FROM, clientId);
  console.log(`  statement in ${FROM}: ${before ? `${before.lines.length} months, closing ${before.closing}` : 'none'}`);
  if (!APPLY) return { clientId, dryRun: true, closing: before && before.closing };

  // 2. Backup first.
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `${stamp}_${clientId.replace(/[^\w-]/g, '_')}_${FROM}-to-${TO}.json`);
  fs.writeFileSync(file, EJSON.stringify({ createdAt: new Date(), clientId, from: FROM, to: TO, ...data }, null, 1, { relaxed: false }));
  console.log(`  backup: ${file}`);

  // 3. Copy.
  const fixedAccount = COMPANIES[TO].paymentAccount;
  const movedClient = {
    ...client,
    ...(fixedAccount ? { paymentAccount: fixedAccount } : {}),
    movedFrom: { company: FROM, at: new Date() },
  };
  const undoCopy = async () => {
    await dst.clients.deleteOne({ _id: client._id });
    if (data.entries.length) await dst.entries.deleteMany({ _id: { $in: ids(data.entries) } });
    if (data.activity.length) await dst.activity.deleteMany({ _id: { $in: ids(data.activity) } });
  };

  try {
    await dst.clients.insertOne(movedClient);
    if (data.entries.length) await dst.entries.insertMany(data.entries, { ordered: true });
    if (data.activity.length) await dst.activity.insertMany(data.activity, { ordered: true });

    // 4. Check the copies.
    const copied = await readClient(TO, clientId);
    const { movedFrom, paymentAccount, ...copiedClient } = copied.clients[0] || {};
    const { paymentAccount: srcAccount, ...srcClient } = client;
    if (copied.clients.length !== 1 || !same(copiedClient, srcClient)) throw new Error('client record differs after copy');
    const byId = (docs) => new Map(docs.map((d) => [String(d._id), d]));
    for (const [name, list] of [['entries', data.entries], ['activity', data.activity]]) {
      const got = byId(copied[name]);
      if (got.size !== list.length || list.some((d) => !same(got.get(String(d._id)), d))) {
        throw new Error(`${name} differ after copy`);
      }
    }
    const after = await statementIn(TO, clientId);
    if (!same(after, before)) throw new Error('statement differs after copy');
    console.log(`  copied and checked: client, ${data.entries.length} entries, ${data.activity.length} activity; statement identical (closing ${after && after.closing})`);

    // 5. Source unchanged since it was read?
    const now = await readClient(FROM, clientId);
    for (const name of ['clients', 'entries', 'activity', 'deals']) {
      const was = byId(data[name]);
      if (now[name].length !== data[name].length || now[name].some((d) => !same(was.get(String(d._id)), d))) {
        throw new Error(`${clientId} was edited in ${FROM} during the move (${name}) - try again`);
      }
    }
  } catch (err) {
    await undoCopy();
    throw new Error(`${err.message}. Copies removed from ${TO}; ${FROM} untouched.`);
  }

  const del = {
    entries: data.entries.length ? (await src.entries.deleteMany({ _id: { $in: ids(data.entries) } })).deletedCount : 0,
    activity: data.activity.length ? (await src.activity.deleteMany({ _id: { $in: ids(data.activity) } })).deletedCount : 0,
    clients: (await src.clients.deleteOne({ _id: client._id })).deletedCount,
  };
  const left = await readClient(FROM, clientId);
  console.log(`  removed from ${FROM}: client ${del.clients}, entries ${del.entries}, activity ${del.activity}; left there: ${left.clients.length + left.entries.length + left.activity.length}`);
  return { clientId, closing: before && before.closing, backup: file };
}

async function restore(file) {
  const b = EJSON.parse(fs.readFileSync(file, 'utf8'), { relaxed: false });
  console.log(`Restore ${b.clientId}: back to ${b.from}, out of ${b.to} ${APPLY ? '' : '(dry run)'}`);
  const src = cols(dbFor(b.from));
  const dst = cols(dbFor(b.to));
  const inSrc = await src.clients.countDocuments({ clientId: b.clientId })
    + await src.entries.countDocuments({ clientId: b.clientId });
  if (inSrc) throw new Error(`${b.from} already holds records of ${b.clientId}; not restoring over them`);
  const inDst = await readClient(b.to, b.clientId);
  console.log(`  in ${b.to} now: ${inDst.clients.length} client, ${inDst.entries.length} entries, ${inDst.activity.length} activity`);
  const newer = inDst.entries.filter((e) => !b.entries.some((x) => String(x._id) === String(e._id)));
  if (newer.length) console.log(`  NOTE: ${newer.length} entr(ies) were added in ${b.to} after the move; they are kept in the restore.`);
  if (!APPLY) return;
  // Current versions (including edits made after the move) go back.
  const client = { ...inDst.clients[0] || b.clients[0] };
  delete client.movedFrom;
  if (b.clients[0] && 'paymentAccount' in b.clients[0]) client.paymentAccount = b.clients[0].paymentAccount;
  await src.clients.insertOne(client);
  if (inDst.entries.length) await src.entries.insertMany(inDst.entries);
  const activity = inDst.activity.length ? inDst.activity : b.activity;
  if (activity.length) await src.activity.insertMany(activity);
  await dst.clients.deleteMany({ clientId: b.clientId });
  await dst.entries.deleteMany({ clientId: b.clientId });
  await dst.activity.deleteMany({ clientId: b.clientId });
  console.log(`  restored to ${b.from}`);
}

(async () => {
  if (!RESTORE && (!TO || !isCompanyKey(TO) || !isCompanyKey(FROM) || TO === FROM || !CLIENT_IDS.length)) {
    console.log('Usage: node scripts/moveClientToCompany.js <clientId...> --to <company> [--from mrm] [--apply]');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    if (RESTORE) await restore(RESTORE);
    else for (const id of CLIENT_IDS) await moveOne(id);
  } catch (err) {
    console.error(`\nSTOPPED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
