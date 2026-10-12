const mongoose = require('mongoose');

// Money MRM paid a referrer against the referral they have earned.
// `amount` is the gross settled against what they earned; `tds` is the part
// of it withheld as TDS, so the referrer received amount - tds.
const MODES = ['bank', 'upi', 'cash', 'cheque', 'other'];

const referralPayoutSchema = new mongoose.Schema({
  referrer: { type: String, required: true, trim: true },
  date: { type: String, required: true, match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'] },
  amount: { type: Number, required: true, min: 0.01 },
  tds: { type: Number, default: 0, min: 0 },
  mode: { type: String, enum: MODES, default: 'bank' },
  reference: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  createdByEmail: { type: String, default: '' },
  updatedByEmail: { type: String, default: '' },
}, { timestamps: true, versionKey: false });

referralPayoutSchema.index({ referrer: 1, date: -1 });

module.exports = mongoose.model('ReferralPayout', referralPayoutSchema, 'referralPayouts');
module.exports.MODES = MODES;
