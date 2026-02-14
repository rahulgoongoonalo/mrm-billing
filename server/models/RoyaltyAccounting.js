const mongoose = require('mongoose');

const royaltyAccountingSchema = new mongoose.Schema({
  // Client & Period
  clientId: { type: String, required: true, ref: 'Client' },
  clientName: { type: String, required: true },
  month: {
    type: String,
    required: true,
    enum: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar']
  },
  year: { type: Number, required: true },
  royaltyType: { type: String, default: 'IPRS + PRS' },

  // Configurable Rates (UI Editable)
  commissionRate: { type: Number, default: 0 },
  gstRate: { type: Number, default: 18 },

  // Royalty Amount Inputs (UI Editable)
  iprsAmount: { type: Number, default: 0 },
  prsGbp: { type: Number, default: 0 },
  gbpToInrRate: { type: Number, default: 0 },
  prsAmount: { type: Number, default: 0 },
  soundExchangeAmount: { type: Number, default: 0 },
  isamraAmount: { type: Number, default: 0 },
  ascapAmount: { type: Number, default: 0 },
  pplAmount: { type: Number, default: 0 },

  // Computed Commission Values
  iprsCommission: { type: Number, default: 0 },
  prsCommission: { type: Number, default: 0 },
  soundExchangeCommission: { type: Number, default: 0 },
  isamraCommission: { type: Number, default: 0 },
  ascapCommission: { type: Number, default: 0 },
  pplCommission: { type: Number, default: 0 },
  totalCommission: { type: Number, default: 0 },

  // GST & Invoice Inputs (UI Editable)
  currentMonthGstBase: { type: Number, default: 0 },
  previousOutstandingGstBase: { type: Number, default: 0 },

  // Computed GST & Invoices
  currentMonthGst: { type: Number, default: 0 },
  currentMonthInvoiceTotal: { type: Number, default: 0 },
  previousOutstandingGst: { type: Number, default: 0 },
  previousOutstandingInvoiceTotal: { type: Number, default: 0 },

  // Receipts & TDS (UI Editable)
  currentMonthReceipt: { type: Number, default: 0 },
  currentMonthTds: { type: Number, default: 0 },
  previousMonthReceipt: { type: Number, default: 0 },
  previousMonthTds: { type: Number, default: 0 },

  // Outstanding Tracking
  previousMonthOutstanding: { type: Number, default: 0 },
  invoicePendingCurrentMonth: { type: Number, default: 0 },
  previousInvoicePending: { type: Number, default: 0 },
  monthlyOutstanding: { type: Number, default: 0 },
  totalOutstanding: { type: Number, default: 0 },

  // Status
  status: {
    type: String,
    enum: ['draft', 'submitted'],
    default: 'draft'
  }
}, {
  timestamps: true
});

// Compound unique index: one document per client per month per year
royaltyAccountingSchema.index(
  { clientId: 1, month: 1, year: 1 },
  { unique: true }
);
royaltyAccountingSchema.index({ clientId: 1 });
royaltyAccountingSchema.index({ month: 1, year: 1 });

// Round to 2 decimal places
function r(val) {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

// Compute all derived fields from input fields
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

  // 5. Final Total Outstanding (rounded to 2 decimal places for accurate carry-forward)
  doc.totalOutstanding = r(
    doc.previousInvoicePending +
    doc.previousOutstandingInvoiceTotal -
    (doc.previousMonthReceipt || 0) -
    (doc.previousMonthTds || 0) +
    doc.monthlyOutstanding
  );

  return doc;
}

// Pre-save: compute all derived fields
royaltyAccountingSchema.pre('save', function (next) {
  computeFields(this);
  next();
});

// Also compute on findOneAndUpdate
royaltyAccountingSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (!update) return next();

  const doc = { ...update };
  computeFields(doc);
  this.setUpdate(doc);
  next();
});

// Static method for cascading recalculation
royaltyAccountingSchema.statics.cascadeUpdate = async function (clientId, startMonthIndex, financialYear) {
  const monthOrder = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];

  function getYearForMonth(month, fy) {
    return ['jan', 'feb', 'mar'].includes(month) ? fy.endYear : fy.startYear;
  }

  const updatedEntries = [];

  for (let i = startMonthIndex; i < monthOrder.length; i++) {
    const month = monthOrder[i];
    const year = getYearForMonth(month, financialYear);

    const entry = await this.findOne({ clientId, month, year });
    if (!entry) continue;

    // Get previous month's totalOutstanding
    let prevOutstanding = 0;
    if (i > 0) {
      const prevMonth = monthOrder[i - 1];
      const prevYear = getYearForMonth(prevMonth, financialYear);
      const prevEntry = await this.findOne({ clientId, month: prevMonth, year: prevYear });
      if (prevEntry) {
        prevOutstanding = prevEntry.totalOutstanding;
      }
    }

    // Only update if previousMonthOutstanding changed
    const newPrevOutstanding = r(prevOutstanding);
    if (entry.previousMonthOutstanding !== newPrevOutstanding) {
      entry.previousMonthOutstanding = newPrevOutstanding;
      await entry.save(); // pre-save hook will recompute all derived fields
      updatedEntries.push(entry);
    }
  }

  return updatedEntries;
};

const RoyaltyAccounting = mongoose.model('RoyaltyAccounting', royaltyAccountingSchema, 'royaltyAccounting');

module.exports = RoyaltyAccounting;
