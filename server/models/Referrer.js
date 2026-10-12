const mongoose = require('mongoose');

// A referrer's profile: how to reach and pay them. Deals and payouts name the
// referrer as text; `key` is that name tidied and lower-cased, so a profile
// matches every deal and payout spelled the same way.
const referrerSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  pan: { type: String, default: '', trim: true, uppercase: true },
  upi: { type: String, default: '', trim: true },
  bankName: { type: String, default: '', trim: true },
  accountName: { type: String, default: '', trim: true },
  accountNo: { type: String, default: '', trim: true },
  ifsc: { type: String, default: '', trim: true, uppercase: true },
  // TDS deducted on payouts by default (section 194H commission), in %.
  tdsRate: { type: Number, default: 0, min: 0, max: 100 },
  note: { type: String, default: '', trim: true },
  updatedByEmail: { type: String, default: '' },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('Referrer', referrerSchema, 'referrers');
