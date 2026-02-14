/**
 * Seed Script: Import all clients and 9 months (Apr–Dec 2025) of royalty data
 * from the Excel file into MongoDB.
 * 
 * Usage: cd server && node scripts/seedFromExcel.js
 * 
 * What it does:
 * 1. Reads "Royalty Clients" sheet from the Excel file
 * 2. Creates/updates Client documents (216 clients)
 * 3. Creates RoyaltyAccounting entries for each client × each month
 * 4. All commissions, GST, invoices, outstanding are auto-calculated
 * 5. previousMonthOutstanding cascades month-to-month
 */

const mongoose = require('mongoose');
const dns = require('dns');
const XLSX = require('xlsx');
const path = require('path');
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
require('dotenv').config();

dns.setServers(['1.1.1.1', '8.8.8.8']);

// ── Column mapping ──────────────────────────────────────────────────────────
// Client info columns
const COL = {
  CLIENT_ID: 0,       // Sr No. → MRM-1, MRM-2, etc.
  CLIENT_NAME: 1,     // Client Name
  TYPE: 2,            // Type Of Client
  RATE: 3,            // Royalty %/ Service Fees (decimal, e.g. 0.25)
  PROFILE: 4,         // Clients Profile
  IPRS: 5,            // YES/NO
  PRS: 6,             // YES/NO
  ISAMRA: 7,          // ISAMRA/PPl/SoundExchange/SACEM (YES/NO)
  PREV_OUTSTANDING: 8 // Previous Month Outstanding (opening balance for April)
};

// Monthly data: each month block has 13 columns
// Offsets within each month block
const M = {
  IPRS_AMT: 0,
  PRS_GBP: 1,
  PRS_AMT: 2,
  SOUND_EX_AMT: 3,
  ISAMRA_AMT: 4,
  ASCAP_AMT: 5,
  PPL_AMT: 6,
  GST_BASE_CURRENT: 7,
  GST_BASE_PREV: 8,
  RECEIPT_CURRENT: 9,
  RECEIPT_PREV: 10,
  TDS_CURRENT: 11,
  TDS_PREV: 12
};

// Starting column index for each month
const MONTH_START = {
  apr: 9,
  may: 22,
  jun: 35,
  jul: 48,
  aug: 61,
  sep: 74,
  oct: 87,
  nov: 100,
  dec: 113
};

const MONTHS_ORDER = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const FINANCIAL_YEAR = { startYear: 2025, endYear: 2026 };

// ── Helpers ─────────────────────────────────────────────────────────────────

function r(val) {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function parseNum(val) {
  if (val === undefined || val === null || val === '' || val === '--' || val === '-') return 0;
  if (typeof val === 'number') return val;
  // Remove commas, £ signs, spaces
  const cleaned = val.toString().replace(/[,£\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseBool(val) {
  if (!val) return false;
  const s = val.toString().trim().toUpperCase();
  return s === 'YES' || s === 'Y';
}

function parseRate(val) {
  if (val === undefined || val === null || val === '' || val === '--') return 0;
  const str = val.toString().toLowerCase();
  // Retainer clients have values like "60000 yearly" — not a commission %
  if (str.includes('yearly') || str.includes('monthly') || str.includes('retainer')) {
    return 0; // Retainer clients don't have commission rate
  }
  const num = parseFloat(val);
  if (isNaN(num)) return 0;
  // If it's a decimal like 0.25, convert to percentage (25)
  // If it's already a percentage like 25, keep it
  if (num > 0 && num <= 1) return num * 100;
  return num;
}

function computeFields(doc) {
  const rate = (doc.commissionRate || 0) / 100;

  // 1. Commission Calculation
  doc.iprsCommission = r((doc.iprsAmount || 0) * rate);
  doc.prsCommission = r((doc.prsAmount || 0) * rate);
  doc.soundExchangeCommission = r((doc.soundExchangeAmount || 0) * rate);
  doc.isamraCommission = r((doc.isamraAmount || 0) * rate);
  doc.ascapCommission = r((doc.ascapAmount || 0) * rate);
  doc.pplCommission = r((doc.pplAmount || 0) * rate);

  doc.totalCommission = r(
    doc.iprsCommission +
    doc.prsCommission +
    doc.soundExchangeCommission +
    doc.isamraCommission +
    doc.ascapCommission +
    doc.pplCommission
  );

  // 2. GST Calculation
  const gstMultiplier = (doc.gstRate || 18) / 100;

  doc.currentMonthGst = r((doc.currentMonthGstBase || 0) * gstMultiplier);
  doc.currentMonthInvoiceTotal = r((doc.currentMonthGstBase || 0) + doc.currentMonthGst);

  doc.previousOutstandingGst = r((doc.previousOutstandingGstBase || 0) * gstMultiplier);
  doc.previousOutstandingInvoiceTotal = r((doc.previousOutstandingGstBase || 0) + doc.previousOutstandingGst);

  // 3. Pending Amounts
  doc.invoicePendingCurrentMonth = r(doc.totalCommission - (doc.currentMonthGstBase || 0));
  doc.previousInvoicePending = r((doc.previousMonthOutstanding || 0) - (doc.previousOutstandingGstBase || 0));

  // 4. Monthly Outstanding
  doc.monthlyOutstanding = r(
    doc.invoicePendingCurrentMonth +
    doc.currentMonthInvoiceTotal -
    (doc.currentMonthReceipt || 0) -
    (doc.currentMonthTds || 0)
  );

  // 5. Final Total Outstanding
  doc.totalOutstanding = r(
    doc.previousInvoicePending +
    doc.previousOutstandingInvoiceTotal -
    (doc.previousMonthReceipt || 0) -
    (doc.previousMonthTds || 0) +
    doc.monthlyOutstanding
  );

  return doc;
}

// ── Main Seed Function ──────────────────────────────────────────────────────

async function seedFromExcel() {
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // 2. Read Excel file
    const excelPath = path.join(__dirname, '../../MRM BIlling April 2025- dec 25.xlsx');
    const workbook = XLSX.readFile(excelPath);
    const sheet = workbook.Sheets['Royalty Clients'];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    console.log(`✓ Excel loaded: ${rows.length} rows`);

    // 3. Parse client rows (skip header row 0)
    const clientRows = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const clientId = row[COL.CLIENT_ID]?.toString().trim();
      if (clientId && clientId.startsWith('MRM')) {
        clientRows.push({ rowIndex: i, row });
      }
    }

    console.log(`✓ Found ${clientRows.length} clients with MRM IDs`);

    // 4. Clear existing data (optional - comment out if you want to keep existing data)
    const existingClients = await Client.countDocuments();
    const existingEntries = await RoyaltyAccounting.countDocuments();
    console.log(`  Existing data: ${existingClients} clients, ${existingEntries} royalty entries`);

    await Client.deleteMany({});
    await RoyaltyAccounting.deleteMany({});
    console.log('✓ Cleared existing data');

    // 5. Process each client
    let clientsCreated = 0;
    let entriesCreated = 0;
    let errors = [];

    for (const { rowIndex, row } of clientRows) {
      const clientId = row[COL.CLIENT_ID].toString().trim();
      const clientName = row[COL.CLIENT_NAME]?.toString().trim() || `Client ${clientId}`;
      const clientType = row[COL.TYPE]?.toString().trim() || 'Composer';
      const commissionRate = parseRate(row[COL.RATE]);
      const fee = commissionRate / 100;
      const hasIPRS = parseBool(row[COL.IPRS]);
      const hasPRS = parseBool(row[COL.PRS]);
      const hasISAMRA = parseBool(row[COL.ISAMRA]);
      const previousBalance = parseNum(row[COL.PREV_OUTSTANDING]);

      try {
        // Create Client document
        await Client.create({
          clientId,
          name: clientName,
          type: clientType,
          fee,
          commissionRate,
          previousBalance,
          iprs: hasIPRS,
          prs: hasPRS,
          isamra: hasISAMRA,
          isActive: true
        });
        clientsCreated++;

        // Process each month (Apr–Dec)
        let prevMonthTotalOutstanding = previousBalance;

        for (const month of MONTHS_ORDER) {
          const startCol = MONTH_START[month];

          // Extract raw values from the row
          const iprsAmount = parseNum(row[startCol + M.IPRS_AMT]);
          const prsGbp = parseNum(row[startCol + M.PRS_GBP]);
          const prsAmount = parseNum(row[startCol + M.PRS_AMT]);
          const soundExchangeAmount = parseNum(row[startCol + M.SOUND_EX_AMT]);
          const isamraAmount = parseNum(row[startCol + M.ISAMRA_AMT]);
          const ascapAmount = parseNum(row[startCol + M.ASCAP_AMT]);
          const pplAmount = parseNum(row[startCol + M.PPL_AMT]);
          const currentMonthGstBase = parseNum(row[startCol + M.GST_BASE_CURRENT]);
          const previousOutstandingGstBase = parseNum(row[startCol + M.GST_BASE_PREV]);
          const currentMonthReceipt = parseNum(row[startCol + M.RECEIPT_CURRENT]);
          const previousMonthReceipt = parseNum(row[startCol + M.RECEIPT_PREV]);
          const currentMonthTds = parseNum(row[startCol + M.TDS_CURRENT]);
          const previousMonthTds = parseNum(row[startCol + M.TDS_PREV]);

          // Calculate gbpToInrRate from prsGbp and prsAmount
          let gbpToInrRate = 0;
          if (prsGbp > 0 && prsAmount > 0) {
            gbpToInrRate = r(prsAmount / prsGbp);
          }

          // Determine royaltyType from client type
          let royaltyType = 'IPRS + PRS';
          if (clientType.includes('ISAMRA')) royaltyType = 'IPRS + PRS + ISAMRA';
          if (clientType.includes('Sound Exchange')) royaltyType = 'IPRS + PRS + ISAMRA + Sound Exchange';
          if (clientType.includes('MLC')) royaltyType = 'IPRS + PRS + MLC';

          // Build the entry object with calculations
          const entry = computeFields({
            clientId,
            clientName,
            month,
            year: 2025,  // Apr-Dec are all in 2025
            royaltyType,
            commissionRate,
            gstRate: 18,
            iprsAmount,
            prsGbp,
            gbpToInrRate,
            prsAmount,
            soundExchangeAmount,
            isamraAmount,
            ascapAmount,
            pplAmount,
            currentMonthGstBase,
            previousOutstandingGstBase,
            currentMonthReceipt,
            currentMonthTds,
            previousMonthReceipt,
            previousMonthTds,
            previousMonthOutstanding: r(prevMonthTotalOutstanding),
            status: 'draft'
          });

          await RoyaltyAccounting.create(entry);
          entriesCreated++;

          // Carry forward totalOutstanding to next month
          prevMonthTotalOutstanding = entry.totalOutstanding;
        }

        if (clientsCreated % 20 === 0) {
          console.log(`  ... processed ${clientsCreated}/${clientRows.length} clients`);
        }
      } catch (err) {
        errors.push({ clientId, error: err.message });
        console.error(`  ✗ Error for ${clientId}: ${err.message}`);
      }
    }

    // 6. Summary
    console.log('\n════════════════════════════════════════════');
    console.log('  SEED COMPLETE');
    console.log('════════════════════════════════════════════');
    console.log(`  Clients created:  ${clientsCreated}`);
    console.log(`  Entries created:  ${entriesCreated}`);
    console.log(`  Months per client: ${MONTHS_ORDER.length} (Apr–Dec 2025)`);
    console.log(`  Errors:           ${errors.length}`);

    if (errors.length > 0) {
      console.log('\n  ERRORS:');
      errors.forEach(e => console.log(`    ${e.clientId}: ${e.error}`));
    }

    // 7. Verify with sample
    console.log('\n── Sample Verification ──');
    const sampleClient = await Client.findOne({ clientId: 'MRM-1' });
    if (sampleClient) {
      console.log(`  Client: ${sampleClient.name} (${sampleClient.clientId})`);
      console.log(`  Commission: ${sampleClient.commissionRate}%`);
      console.log(`  IPRS: ${sampleClient.iprs}, PRS: ${sampleClient.prs}, ISAMRA: ${sampleClient.isamra}`);
    }

    const sampleEntries = await RoyaltyAccounting.find({ clientId: 'MRM-1' }).sort({ year: 1 });
    if (sampleEntries.length > 0) {
      console.log(`  Royalty entries: ${sampleEntries.length}`);
      for (const entry of sampleEntries) {
        console.log(`    ${entry.month.toUpperCase()} ${entry.year}: ` +
          `IPRS=₹${entry.iprsAmount} PRS=₹${entry.prsAmount} ` +
          `Commission=₹${entry.totalCommission} Outstanding=₹${entry.totalOutstanding}`);
      }
    }

    // 8. Also verify a client with lots of data
    const sampleClient2 = await RoyaltyAccounting.find({ clientId: 'MRM-3' }).sort({ year: 1 });
    if (sampleClient2.length > 0) {
      console.log(`\n  Client MRM-3 (${sampleClient2[0].clientName}):`);
      for (const entry of sampleClient2) {
        console.log(`    ${entry.month.toUpperCase()}: ` +
          `IPRS=₹${entry.iprsAmount} PRS=₹${entry.prsAmount} ` +
          `Comm=₹${entry.totalCommission} GST_Base=₹${entry.currentMonthGstBase} ` +
          `Outstanding=₹${entry.totalOutstanding}`);
      }
    }

    console.log('\n✓ Done!');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

seedFromExcel();
