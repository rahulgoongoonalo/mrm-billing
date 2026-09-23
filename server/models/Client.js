const mongoose = require('mongoose');
const {
  SOCIETIES,
  DEFAULT_CLIENT_TYPE,
  normalizeSocieties,
  parseTypeLabel,
  composeTypeLabel,
  normalizePhone,
  normalizeEmail,
  normalizeGstId,
  invalidPhones,
  invalidEmails,
  isValidGstId,
  COMMISSION_MODES,
  DEFAULT_COMMISSION_MODE,
  missingSocietyRates,
  normalizeSocietyCommissions,
} = require('../utils/clientProfile');

const clientSchema = new mongoose.Schema({
  clientId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  // Royalty label shown on entries, statements and emails ("Royalty – IPRS + PRS").
  // Built from clientType + societies on save - edit those, not this.
  type: {
    type: String,
    trim: true,
    default: 'Composer'
  },
  // Category of client: Royalty, Composer, In House, ...
  clientType: {
    type: String,
    trim: true,
    default: ''
  },
  societies: {
    type: [String],
    default: [],
    validate: {
      validator: (list) => list.every((s) => SOCIETIES.includes(s)),
      message: (props) => `Unknown society: ${props.value.filter((s) => !SOCIETIES.includes(s)).join(', ')}`
    }
  },
  phone: {
    type: String,
    trim: true,
    default: '',
    validate: {
      validator: (v) => invalidPhones(v).length === 0,
      message: (props) => `Invalid phone number: ${invalidPhones(props.value).join(', ')}`
    }
  },
  email: {
    type: String,
    trim: true,
    default: '',
    validate: {
      validator: (v) => invalidEmails(v).length === 0,
      message: (props) => `Invalid email: ${invalidEmails(props.value).join(', ')}`
    }
  },
  gstId: {
    type: String,
    trim: true,
    default: '',
    validate: {
      validator: isValidGstId,
      message: (props) => `Invalid GST ID "${props.value}" - expected 15 characters like 27AAPFU0939F1ZV`
    }
  },
  fee: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    default: 0.10
  },
  commissionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  // 'flat'        - commissionRate applies to every society (the default, and
  //                 how every client behaved before per-society rates existed)
  // 'per-society' - each selected society has its own rate in societyCommissions
  commissionMode: {
    type: String,
    enum: COMMISSION_MODES,
    default: DEFAULT_COMMISSION_MODE
  },
  societyCommissions: {
    type: [{
      _id: false,
      society: { type: String, enum: SOCIETIES, required: true },
      rate: { type: Number, required: true, min: 0, max: 100 }
    }],
    default: []
  },
  gstRate: {
    type: Number,
    default: 18,
    min: 0,
    max: 100
  },
  previousBalance: {
    type: Number,
    default: 0
  },
  iprs: {
    type: Boolean,
    default: false
  },
  prs: {
    type: Boolean,
    default: false
  },
  isamra: {
    type: Boolean,
    default: false
  },
  contracts: [{
    society: {
      type: String,
      enum: ['IPRS', 'PRS', 'ASCAP', 'ISAMRA', 'PPL', 'MLC', 'Sound Exchange'],
      required: true
    },
    startDate: {
      type: Date,
      default: null
    },
    endDate: {
      type: Date,
      default: null
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster searches
clientSchema.index({ name: 'text' });

// Keep the royalty label, the society list and the IPRS/PRS/ISAMRA flags in step.
// Runs before validation so the validators see the tidied values.
clientSchema.pre('validate', function(next) {
  if (this.isModified('phone')) this.phone = normalizePhone(this.phone);
  if (this.isModified('email')) this.email = normalizeEmail(this.email);
  if (this.isModified('gstId')) this.gstId = normalizeGstId(this.gstId);

  // A society name typed as the client type ("IPRS") belongs in the society list.
  if (this.isModified('clientType') && normalizeSocieties([this.clientType]).some((s) => SOCIETIES.includes(s))) {
    this.societies = [...this.societies, this.clientType];
    this.clientType = DEFAULT_CLIENT_TYPE;
  }

  const profileChanged = this.isModified('societies') || this.isModified('clientType');
  const hasProfile = this.societies.length > 0 || !!this.clientType;

  if (profileChanged && hasProfile) {
    this.societies = normalizeSocieties(this.societies);
    this.type = composeTypeLabel(this.clientType, this.societies);
  } else if (this.isModified('type') || (this.isNew && !hasProfile)) {
    // Callers that only send the free-text label (older screens, bulk import):
    // read the type and societies out of it. A label carrying extra notes is kept as typed.
    const parsed = parseTypeLabel(this.type);
    this.clientType = parsed.clientType;
    this.societies = parsed.societies;
    if (!parsed.residue.length) this.type = composeTypeLabel(parsed.clientType, parsed.societies);
  }

  if (this.isModified('societies')) {
    this.iprs = this.societies.includes('IPRS');
    this.prs = this.societies.includes('PRS');
    this.isamra = this.societies.includes('ISAMRA');
  }

  // Per-society rates. Rates for societies the client no longer holds are
  // dropped, but rates are kept when the mode is switched back to flat, so
  // toggling the switch does not throw away what was typed.
  this.societyCommissions = normalizeSocietyCommissions(this.societyCommissions, this.societies);
  if (this.commissionMode === 'per-society') {
    const missing = missingSocietyRates(this);
    if (missing.length) {
      return next(new Error(
        `Per-society commission needs a rate for every society. Missing: ${missing.join(', ')}`
      ));
    }
  }
  next();
});

// Pre-save middleware to update the updatedAt field
clientSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  // Sync commissionRate and fee bidirectionally
  if (this.isModified('commissionRate') && !this.isModified('fee')) {
    this.fee = this.commissionRate / 100;
  } else if (this.isModified('fee') && !this.isModified('commissionRate')) {
    this.commissionRate = this.fee * 100;
  }
  next();
});

// Virtual for display name with ID
clientSchema.virtual('displayName').get(function() {
  return `${this.name} (${this.clientId})`;
});

// Method to get fee as percentage
clientSchema.methods.getFeePercentage = function() {
  return (this.fee * 100).toFixed(0) + '%';
};

const Client = mongoose.model('Client', clientSchema);

module.exports = Client;
