const mongoose = require('mongoose');

// A referral deal: someone brought a client to MRM and earns a share of the
// payments that client makes. Kept apart from the client and the monthly
// entries, so it never changes what a client owes or what MRM bills.
//
// Months are calendar months, 'YYYY-MM'. A payment counts when it is recorded
// on an entry for a month from `fromMonth` to `toMonth` (open-ended if empty).
// A rate change is a new deal: end the old one, start the next, so the
// referral already earned never changes.
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const referralDealSchema = new mongoose.Schema({
  clientId: { type: String, required: true, trim: true },
  clientName: { type: String, default: '', trim: true },
  referrer: { type: String, required: true, trim: true },
  rate: { type: Number, required: true, min: 0.01, max: 100 },
  fromMonth: { type: String, required: true, match: [MONTH_RE, 'From month must be YYYY-MM'] },
  toMonth: { type: String, default: '', validate: { validator: (v) => !v || MONTH_RE.test(v), message: 'To month must be YYYY-MM' } },
  note: { type: String, default: '', trim: true },
  createdByEmail: { type: String, default: '' },
  updatedByEmail: { type: String, default: '' },
}, { timestamps: true, versionKey: false });

referralDealSchema.index({ clientId: 1 });
referralDealSchema.index({ referrer: 1 });

module.exports = mongoose.model('ReferralDeal', referralDealSchema, 'referralDeals');
module.exports.MONTH_RE = MONTH_RE;
