require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const entries = await RoyaltyAccounting.find({
      clientId: 'MRM-1000',
      $or: [
        { year: 2026, month: { $in: ['apr','may','jun','jul','aug','sep','oct','nov','dec'] } },
        { year: 2027, month: { $in: ['jan','feb','mar'] } }
      ]
    }).lean();
    const monthOrder = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar'];
    entries.sort((a,b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));
    entries.forEach(e => {
      console.log(`${e.month} ${e.year} | status=${e.status}
  iprs=${e.iprsAmount} prs=${e.prsAmount} sx=${e.soundExchangeAmount} isamra=${e.isamraAmount} ascap=${e.ascapAmount} ppl=${e.pplAmount} mlc=${e.mlcAmount} extra=${e.extraAmount}
  curGstBase=${e.currentMonthGstBase} prevOsGstBase=${e.previousOutstandingGstBase}
  curRcpt=${e.currentMonthReceipt} curTds=${e.currentMonthTds} prevRcpt=${e.previousMonthReceipt} prevTds=${e.previousMonthTds}
  prevMO=${e.previousMonthOutstanding} monthlyOS=${e.monthlyOutstanding} totalOS=${e.totalOutstanding}
  totalCommission=${e.totalCommission}
  createdAt=${e.createdAt?.toISOString?.()} updatedAt=${e.updatedAt?.toISOString?.()}`);
    });
  } finally {
    await mongoose.disconnect();
  }
}
run();
