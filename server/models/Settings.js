const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Default settings
const defaultSettings = {
  financialYear: {
    key: 'financialYear',
    value: { startYear: 2025, endYear: 2026 },
    description: 'Current financial year settings'
  },
  gbpToInrRate: {
    key: 'gbpToInrRate',
    value: 110.50,
    description: 'GBP to INR exchange rate'
  },
  usdToInrRate: {
    key: 'usdToInrRate',
    value: 83.50,
    description: 'USD to INR exchange rate'
  },
  gstRate: {
    key: 'gstRate',
    value: 0.18,
    description: 'GST rate (18%)'
  }
};

// Static method to get a setting
settingsSchema.statics.getSetting = async function(key) {
  let setting = await this.findOne({ key });
  if (!setting && defaultSettings[key]) {
    setting = await this.create(defaultSettings[key]);
  }
  return setting ? setting.value : null;
};

// Static method to update a setting
settingsSchema.statics.updateSetting = async function(key, value) {
  return this.findOneAndUpdate(
    { key },
    { value, updatedAt: Date.now() },
    { upsert: true, new: true }
  );
};

// Static method to initialize default settings
settingsSchema.statics.initializeDefaults = async function() {
  for (const [key, setting] of Object.entries(defaultSettings)) {
    await this.findOneAndUpdate(
      { key },
      { $setOnInsert: setting },
      { upsert: true }
    );
  }
};

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
