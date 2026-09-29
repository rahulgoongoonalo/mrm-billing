const mongoose = require('mongoose');

// One thing a person did in the app: saved, submitted or deleted a month,
// changed the client master, opened a client, sent a mail, signed in.
// Written by services/activity.js and read by the All Entries > Activity tab.
const ACTIONS = [
  'entry.created',
  'entry.updated',
  'entry.submitted',
  'entry.deleted',
  'client.created',
  'client.updated',
  'client.deactivated',
  'client.reactivated',
  'client.deleted',
  'client.imported',
  'client.viewed',
  'mail.sent',
  'mail.failed',
  'auth.login',
];

const activityEventSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  userEmail: { type: String, default: '' },
  userId: { type: String, default: '' },
  action: { type: String, enum: ACTIONS, required: true },

  clientId: { type: String, default: '' },
  clientName: { type: String, default: '' },
  month: { type: String, default: '' },
  year: { type: Number },

  // Field-by-field before and after, for edits.
  changes: {
    type: [{
      _id: false,
      field: String,
      label: String,
      from: mongoose.Schema.Types.Mixed,
      to: mongoose.Schema.Types.Mixed,
      kind: { type: String, default: 'text' }, // money | percent | text
    }],
    default: [],
  },

  // Anything else worth showing: where a client was viewed, the figures of a
  // deleted month, a mail's subject, how many later months were recalculated.
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { versionKey: false });

activityEventSchema.index({ at: -1 });
activityEventSchema.index({ userEmail: 1, at: -1 });
activityEventSchema.index({ clientId: 1, at: -1 });

module.exports = mongoose.model('ActivityEvent', activityEventSchema, 'activityEvents');
module.exports.ACTIONS = ACTIONS;
