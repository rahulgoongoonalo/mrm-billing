// Repairs broken carry-forward links in the royalty ledger.
//
// Each month's previousMonthOutstanding should equal the previous month's
// totalOutstanding. Where it does not, the chain is broken: the statement shows
// a "carry-forward correction" line to keep the column adding up, and every
// month after the break carries the error forward.
//
// The script walks each client in calendar order, sets each month's opening
// figure to the previous month's closing figure, and re-saves so the compute
// hook recalculates that month - which changes the next month's opening, and so
// on down the chain. Only consecutive months are linked; a gap in the record
// leaves the following month's opening balance alone.
//
// Amounts entered by hand - royalty, receipts, TDS, GST bases, adjustments -
// are never touched. Only the carried-forward figure and the values derived
// from it change.
//
//   node scripts/repairCarryForward.js --dry     (report only, writes nothing)
//   node scripts/repairCarryForward.js           (apply)
//   node scripts/repairCarryForward.js --client MRM-104 --dry
//
// Take a backup first: node scripts/backupRoyaltyEntries.js

require('dotenv').config();
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const mongoose = require('mongoose');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ONLY = args.includes('--client') ? args[args.indexOf('--client') + 1] : null;
// A re-chain that drives a client's closing balance below zero is claiming we
// owe them money. That is almost never what a broken link means - far more often
// the opening figure was a real balance entered late, or a receipt was recorded
// twice - so those clients are held back for a human to look at.
const FORCE = args.includes('--force-negative');
const NEGATIVE_LIMIT = -1;

const CAL = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const order = (e) => e.year * 12 + CAL[e.month];
const label = (e) => `${e.month} ${String(e.year).slice(2)}`;
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(DRY ? '[DRY RUN - nothing will be written]\n' : 'Applying repairs…\n');

  const query = ONLY ? { clientId: ONLY } : {};
  const all = await RoyaltyAccounting.find(query);
  const byClient = {};
  for (const e of all) (byClient[e.clientId] = byClient[e.clientId] || []).push(e);

  let brokenLinks = 0;
  let monthsRewritten = 0;
  const clientsTouched = new Set();
  const held = [];
  const dips = [];
  let biggestSwing = { amount: 0 };

  for (const [clientId, rows] of Object.entries(byClient)) {
    rows.sort((a, b) => order(a) - order(b));

    // Simulate the whole client first, on copies, and see where it lands.
    if (!FORCE) {
      const sim = rows.map((e) => ({ ...e.toObject() }));
      let changed = false;
      for (let i = 1; i < sim.length; i++) {
        if (order(sim[i]) !== order(sim[i - 1]) + 1) continue;
        const should = r2(sim[i - 1].totalOutstanding);
        if (Math.abs(sim[i].previousMonthOutstanding - should) < 0.005) continue;
        sim[i].previousMonthOutstanding = should;
        RoyaltyAccounting.computeFields(sim[i]);
        changed = true;
      }
      if (changed) {
        // Only the closing balance decides. A month dipping below zero part-way
        // through is ordinary - a client overpays, then accrues again - and is
        // reported rather than treated as a reason to stop.
        const worst = Math.min(...sim.map((e) => e.totalOutstanding));
        const closing = sim[sim.length - 1].totalOutstanding;
        if (closing < NEGATIVE_LIMIT) {
          held.push({ clientId, closing: r2(closing), worst: r2(worst) });
          continue;
        }
        if (worst < NEGATIVE_LIMIT) dips.push({ clientId, worst: r2(worst), closing: r2(closing) });
      }
    }

    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      if (order(cur) !== order(prev) + 1) continue;   // not consecutive months

      const shouldBe = r2(prev.totalOutstanding);
      if (Math.abs(cur.previousMonthOutstanding - shouldBe) < 0.005) continue;

      brokenLinks++;
      clientsTouched.add(clientId);
      const beforeClosing = cur.totalOutstanding;
      const gap = r2(shouldBe - cur.previousMonthOutstanding);

      cur.previousMonthOutstanding = shouldBe;
      // Recompute this month so the corrected opening flows into its closing;
      // the next loop iteration then sees the new closing figure.
      if (DRY) {
        RoyaltyAccounting.computeFields(cur);
      } else {
        await cur.save();
      }
      monthsRewritten++;

      const swing = r2(cur.totalOutstanding - beforeClosing);
      if (Math.abs(swing) > Math.abs(biggestSwing.amount)) {
        biggestSwing = { amount: swing, clientId, month: label(cur) };
      }

      console.log(
        `${clientId.padEnd(9)} ${label(cur).padEnd(8)} ` +
        `opening ${String(r2(shouldBe - gap)).padStart(12)} → ${String(shouldBe).padStart(12)}  ` +
        `(gap ${String(gap).padStart(11)})   ` +
        `closing ${String(r2(beforeClosing)).padStart(12)} → ${String(r2(cur.totalOutstanding)).padStart(12)}`
      );
    }
  }

  console.log(`\n${DRY ? 'Would repair' : 'Repaired'}: ${brokenLinks} broken links across ${clientsTouched.size} clients ` +
              `(${monthsRewritten} months rewritten)`);
  if (held.length) {
    console.log(`\nHELD BACK - re-chaining would put these below zero, which needs a human decision:`);
    held.forEach((h) => console.log(`   ${h.clientId.padEnd(9)} would close at ${String(h.closing).padStart(12)}` +
                                    `   (lowest month ${h.worst})`));
    console.log('   Run with --force-negative to repair these too.');
  }
  if (dips.length) {
    console.log('\nRepaired, but a month part-way through goes below zero (client overpaid then accrued again):');
    dips.forEach((d) => console.log(`   ${d.clientId.padEnd(9)} lowest month ${String(d.worst).padStart(12)}   closes at ${d.closing}`));
  }
  if (biggestSwing.amount) {
    console.log(`Largest change to a closing balance: ${biggestSwing.amount} ` +
                `(${biggestSwing.clientId} ${biggestSwing.month})`);
  }
  if (DRY) console.log('\nNothing was written. Re-run without --dry to apply.');

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
