const mongoose = require('mongoose');

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
  type: {
    type: String,
    trim: true,
    default: 'Composer'
  },
  clientType: {
    type: String,
    trim: true,
    default: ''
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
