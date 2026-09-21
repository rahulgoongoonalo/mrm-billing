// Upgrades every client record to the structured client master:
//   - reads Client Type + Societies out of the free-text royalty label
//     ("Royalty – IPRS + PRS +ASCAP" -> Royalty + [IPRS, PRS, ASCAP]) and rewrites
//     the label in its tidy form, mirroring it onto the client's monthly entries
//   - sets the IPRS / PRS / ISAMRA flags from the society list
//   - optionally fills phone numbers and emails from a CSV (only where the client has none)
//
// No amount, commission, GST or outstanding figure is read or written, and entry
// timestamps are left alone. Nothing is written without --apply, and every
// --apply run first saves a backup that --restore can put back.
//
//   node scripts/migrateClientMaster.js --contacts contacts.csv            (dry run: report only)
//   node scripts/migrateClientMaster.js --contacts contacts.csv --apply    (write, after a backup)
//   node scripts/migrateClientMaster.js --restore backups/<file>.json        (dry run of a restore)
//   node scripts/migrateClientMaster.js --restore backups/<file>.json --apply
//
// The contacts CSV needs a client ID column (MRM ID / Client ID) and a phone
// and/or email column. Rows are matched on the exact client ID.

require('dotenv').config();
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const {
  SOCIETIES,
  parseTypeLabel,
  composeTypeLabel,
  normalizeSocieties,
  normalizePhone,
  normalizeEmail,
  invalidPhones,
  invalidEmails,
} = require('../utils/clientProfile');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const argValue = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const CONTACTS_FILE = argValue('--contacts');
const RESTORE_FILE = argValue('--restore');

const PROFILE_FIELDS = ['type', 'clientType', 'societies', 'iprs', 'prs', 'isamra', 'phone', 'email', 'gstId'];
const AMOUNT_FIELDS = {
  IPRS: 'iprsAmount', PRS: 'prsAmount', ASCAP: 'ascapAmount', MLC: 'mlcAmount',
  ISAMRA: 'isamraAmount', 'Sound Exchange': 'soundExchangeAmount', PPL: 'pplAmount',
};

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const idNum = (id) => parseInt(String(id).match(/(\d+)/)?.[1], 10) || 0;
const byId = (a, b) => idNum(a.clientId) - idNum(b.clientId) || String(a.clientId).localeCompare(String(b.clientId));

// ---- CSV --------------------------------------------------------------------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function readContacts(file) {
  const [header, ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
  const find = (...names) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
  const idCol = find('mrm id', 'client id', 'clientid', 'mrm hub id');
  const phoneCol = find('phone number', 'phone', 'phone no', 'mobile');
  const emailCol = find('email', 'email id');
  if (idCol < 0 || (phoneCol < 0 && emailCol < 0)) {
    throw new Error(`${file}: needs a client ID column and a phone and/or email column (found: ${header.join(', ')})`);
  }
  const contacts = new Map();
  for (const r of rows) {
    const id = (r[idCol] || '').trim();
    if (!id) continue;
    contacts.set(id, {
      phone: phoneCol >= 0 ? (r[phoneCol] || '').trim() : '',
      email: emailCol >= 0 ? (r[emailCol] || '').trim() : '',
    });
  }
  return contacts;
}

// ---- Plan -------------------------------------------------------------------

function planClient(client, contact, report) {
  const parsed = parseTypeLabel(client.type);
  // An old client-type value that is really a society ("IPRS") joins the list.
  const typeAsSociety = normalizeSocieties([client.clientType]).filter((s) => SOCIETIES.includes(s));
  const societies = normalizeSocieties([...parsed.societies, ...typeAsSociety]);
  const clientType = parsed.clientType;
  const type = parsed.residue.length ? client.type : composeTypeLabel(clientType, societies);

  const next = {
    type,
    clientType,
    societies,
    iprs: societies.includes('IPRS'),
    prs: societies.includes('PRS'),
    isamra: societies.includes('ISAMRA'),
  };

  if (parsed.residue.length) {
    report.keptLabel.push({ clientId: client.clientId, name: client.name, label: client.type, societies, note: parsed.residue.join(' ') });
  }
  const oldFlags = ['IPRS', 'PRS', 'ISAMRA'].filter((s) => client[s.toLowerCase()]);
  const droppedFlags = oldFlags.filter((s) => !societies.includes(s));
  if (droppedFlags.length) {
    report.flagDisagreements.push({ clientId: client.clientId, name: client.name, label: client.type, ticked: oldFlags, notInLabel: droppedFlags });
  }

  if (contact) {
    for (const field of ['phone', 'email']) {
      const raw = contact[field];
      if (!raw) continue;
      const value = field === 'phone' ? normalizePhone(raw) : normalizeEmail(raw);
      const bad = field === 'phone' ? invalidPhones(value) : invalidEmails(value);
      if (bad.length) { report.contactSkipped.push({ clientId: client.clientId, field, value: raw }); continue; }
      const current = client[field] || '';
      if (!current) next[field] = value;
      else if (current !== value) report.contactConflicts.push({ clientId: client.clientId, field, current, file: value });
    }
  }

  const changes = {};
  for (const [field, value] of Object.entries(next)) {
    if (!same(client[field], value)) changes[field] = value;
  }
  return changes;
}

// ---- Run --------------------------------------------------------------------

async function migrate(db) {
  const clientsCol = db.collection('clients');
  const entriesCol = db.collection('royaltyAccounting');
  const clients = (await clientsCol.find({}).toArray()).sort(byId);
  const contacts = CONTACTS_FILE ? readContacts(CONTACTS_FILE) : new Map();

  const report = { keptLabel: [], flagDisagreements: [], contactSkipped: [], contactConflicts: [] };
  const plans = [];
  for (const client of clients) {
    const changes = planClient(client, contacts.get(client.clientId), report);
    if (Object.keys(changes).length) plans.push({ client, changes });
  }
  const knownIds = new Set(clients.map((c) => c.clientId));
  const unmatchedContacts = [...contacts.keys()].filter((id) => !knownIds.has(id));

  // Entries whose mirrored label will differ from the client's final label.
  const finalType = new Map(clients.map((c) => [c.clientId, c.type]));
  plans.forEach(({ client, changes }) => { if ('type' in changes) finalType.set(client.clientId, changes.type); });
  const entryLabels = await entriesCol.find({}, { projection: { clientId: 1, royaltyType: 1 } }).toArray();
  const staleEntries = entryLabels.filter((e) => finalType.has(e.clientId) && (e.royaltyType || '') !== finalType.get(e.clientId));

  // Societies with money on record, for clients that have no society yet.
  const amounts = await entriesCol.aggregate([
    { $group: { _id: '$clientId', ...Object.fromEntries(Object.entries(AMOUNT_FIELDS).map(([s, f]) => [s.replace(/\s/g, '_'), { $sum: `$${f}` }])) } },
  ]).toArray();
  const paidSocieties = new Map(amounts.map((a) => [a._id, Object.keys(AMOUNT_FIELDS).filter((s) => (a[s.replace(/\s/g, '_')] || 0) > 0)]));

  // ---- Report ----
  const labelChanges = plans.filter((p) => 'type' in p.changes);
  const count = (field) => plans.filter((p) => field in p.changes).length;
  console.log(`Clients scanned                         : ${clients.length}`);
  console.log(`Clients that will change                : ${plans.length}`);
  console.log(`  client type set                       : ${count('clientType')}`);
  console.log(`  society list set                      : ${count('societies')}`);
  console.log(`  royalty label tidied                  : ${labelChanges.length}`);
  console.log(`  IPRS/PRS/ISAMRA ticks brought in line : ${plans.filter((p) => ['iprs', 'prs', 'isamra'].some((f) => f in p.changes)).length}`);
  console.log(`  phone filled                          : ${count('phone')}`);
  console.log(`  email filled                          : ${count('email')}`);
  console.log(`Entries whose label will be updated     : ${staleEntries.length}  (label only; updatedAt untouched)`);

  const societyCounts = {};
  clients.forEach((c) => {
    const final = plans.find((p) => p.client === c)?.changes.societies || c.societies || [];
    final.forEach((s) => { societyCounts[s] = (societyCounts[s] || 0) + 1; });
  });
  console.log(`\nClients per society after migration     : ${SOCIETIES.map((s) => `${s} ${societyCounts[s] || 0}`).join(' | ')}`);

  if (labelChanges.length) {
    console.log('\n-- Label changes --');
    const grouped = {};
    labelChanges.forEach(({ client, changes }) => {
      const k = `${JSON.stringify(client.type)} -> ${JSON.stringify(changes.type)}`;
      (grouped[k] = grouped[k] || []).push(client.clientId);
    });
    Object.entries(grouped).forEach(([k, ids]) => console.log(`   ${k}   [${ids.join(', ')}]`));
  }
  if (report.keptLabel.length) {
    console.log('\n-- Labels kept as typed (they carry a note) --');
    report.keptLabel.forEach((r) => console.log(`   ${r.clientId} ${r.name}: ${JSON.stringify(r.label)} -> societies [${r.societies.join(', ')}], note ${JSON.stringify(r.note)}`));
  }
  if (report.flagDisagreements.length) {
    console.log('\n-- Ticked societies missing from the label (label wins; ticks are in the backup) --');
    report.flagDisagreements.forEach((r) => console.log(`   ${r.clientId} ${r.name}: label ${JSON.stringify(r.label)}, ticked [${r.ticked.join(', ')}], not in label [${r.notInLabel.join(', ')}]`));
  }
  const noSociety = clients.filter((c) => {
    const final = plans.find((p) => p.client === c)?.changes.societies ?? c.societies ?? [];
    return c.isActive !== false && final.length === 0;
  });
  if (noSociety.length) {
    console.log('\n-- Active clients with no society (set them in Client Master) --');
    noSociety.forEach((c) => {
      const paid = paidSocieties.get(c.clientId) || [];
      console.log(`   ${c.clientId} ${c.name} [${c.type}]${paid.length ? `  - entries show money from: ${paid.join(', ')}` : ''}`);
    });
  }
  if (CONTACTS_FILE) {
    const noContact = clients.filter((c) => c.isActive !== false
      && !(c.phone || plans.find((p) => p.client === c)?.changes.phone)
      && !(c.email || plans.find((p) => p.client === c)?.changes.email));
    console.log(`\n-- Contacts from ${path.basename(CONTACTS_FILE)}: ${contacts.size} rows --`);
    if (unmatchedContacts.length) console.log(`   rows with no matching client ID: ${unmatchedContacts.join(', ')}`);
    report.contactSkipped.forEach((r) => console.log(`   skipped ${r.clientId} ${r.field}: ${JSON.stringify(r.value)} is not a valid ${r.field}`));
    report.contactConflicts.forEach((r) => console.log(`   kept ${r.clientId} ${r.field} ${JSON.stringify(r.current)} (file has ${JSON.stringify(r.file)})`));
    if (noContact.length) console.log(`   active clients still without phone or email: ${noContact.map((c) => `${c.clientId} ${c.name}`).join(' | ')}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN - nothing was written. Re-run with --apply to make these changes.');
    return;
  }
  if (!plans.length && !staleEntries.length) {
    console.log('\nNothing to change.');
    return;
  }

  // ---- Backup, then write ----
  const backupDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `client-master-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({
    createdAt: new Date().toISOString(),
    clients: plans.map(({ client }) => ({
      _id: String(client._id),
      clientId: client.clientId,
      fields: Object.fromEntries(PROFILE_FIELDS.map((f) => [f, f in client ? client[f] : null])),
      missing: PROFILE_FIELDS.filter((f) => !(f in client)),
    })),
    entryLabels: staleEntries.map((e) => ({ _id: String(e._id), clientId: e.clientId, royaltyType: e.royaltyType ?? null })),
  }, null, 1));
  console.log(`\nBackup written: ${backupFile}`);

  let clientWrites = 0;
  for (const { client, changes } of plans) {
    const res = await clientsCol.updateOne({ _id: client._id }, { $set: changes });
    clientWrites += res.modifiedCount;
  }
  let entryWrites = 0;
  const staleClients = [...new Set(staleEntries.map((e) => e.clientId))];
  for (const clientId of staleClients) {
    const label = finalType.get(clientId);
    const res = await entriesCol.updateMany({ clientId, royaltyType: { $ne: label } }, { $set: { royaltyType: label } });
    entryWrites += res.modifiedCount;
  }
  console.log(`Clients updated: ${clientWrites} | entry labels updated: ${entryWrites}`);
}

async function restore(db) {
  const backup = JSON.parse(fs.readFileSync(RESTORE_FILE, 'utf8'));
  const { ObjectId } = mongoose.Types;
  console.log(`Backup from ${backup.createdAt}: ${backup.clients.length} clients, ${backup.entryLabels.length} entry labels`);
  if (!APPLY) {
    console.log('DRY RUN - re-run with --apply to restore.');
    return;
  }
  let clientWrites = 0;
  for (const c of backup.clients) {
    const set = Object.fromEntries(Object.entries(c.fields).filter(([f]) => !c.missing.includes(f)));
    const unset = Object.fromEntries(c.missing.map((f) => [f, '']));
    const res = await db.collection('clients').updateOne(
      { _id: new ObjectId(c._id) },
      { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }) }
    );
    clientWrites += res.modifiedCount;
  }
  let entryWrites = 0;
  for (const e of backup.entryLabels) {
    const res = await db.collection('royaltyAccounting').updateOne({ _id: new ObjectId(e._id) }, { $set: { royaltyType: e.royaltyType } });
    entryWrites += res.modifiedCount;
  }
  console.log(`Restored clients: ${clientWrites} | entry labels: ${entryWrites}`);
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`Connected.${APPLY ? '' : '  [DRY RUN - nothing will be written]'}\n`);
  if (RESTORE_FILE) await restore(mongoose.connection.db);
  else await migrate(mongoose.connection.db);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect();
  process.exitCode = 1;
});
