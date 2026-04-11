const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const { authenticateToken } = require('../middleware/auth');

const monthOrder = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];

// All settings routes require authentication
router.use(authenticateToken);

// @route   GET /api/settings
// @desc    Get all settings
// @access  Public
router.get('/', async (req, res) => {
  try {
    const settings = await Settings.find();

    // Convert array to object for easier frontend use
    const settingsObj = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});

    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ===========================================================================
// IMPORTANT: All specific PUT/POST routes MUST be declared BEFORE the generic
// `/:key` routes below. Express matches routes in the order they are defined,
// so a generic `/:key` route declared first would swallow requests like
// `/financial-year` and break the dedicated handler.
// ===========================================================================

// @route   POST /api/settings/initialize
// @desc    Initialize default settings
// @access  Authenticated
router.post('/initialize', async (req, res) => {
  try {
    await Settings.initializeDefaults();
    const settings = await Settings.find();
    res.json({ message: 'Settings initialized', settings });
  } catch (error) {
    console.error('Error initializing settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/settings/financial-year
// @desc    Update financial year
// @access  Authenticated
router.put('/financial-year', async (req, res) => {
  try {
    const { startYear } = req.body;

    if (!startYear || isNaN(startYear)) {
      return res.status(400).json({ message: 'Valid start year is required' });
    }

    const financialYear = {
      startYear: parseInt(startYear),
      endYear: parseInt(startYear) + 1
    };

    await Settings.updateSetting('financialYear', financialYear);

    // No auto-seeding. All entries are created on-demand when the user saves data.
    // The POST route handles carry-forward from previous FY March automatically.

    res.json({
      message: `Financial year switched to FY ${financialYear.startYear}-${financialYear.endYear}.`,
      financialYear,
      entriesCreated: 0
    });
  } catch (error) {
    console.error('Error updating financial year:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/settings/exchange-rate
// @desc    Update GBP to INR exchange rate
// @access  Authenticated
router.put('/exchange-rate', async (req, res) => {
  try {
    const { rate } = req.body;

    if (!rate || isNaN(rate) || rate <= 0) {
      return res.status(400).json({ message: 'Valid exchange rate is required' });
    }

    await Settings.updateSetting('gbpToInrRate', parseFloat(rate));

    res.json({
      message: `Exchange rate updated: £1 = ₹${parseFloat(rate).toFixed(2)}`,
      rate: parseFloat(rate)
    });
  } catch (error) {
    console.error('Error updating exchange rate:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/settings/usd-exchange-rate
// @desc    Update USD to INR exchange rate
// @access  Authenticated
router.put('/usd-exchange-rate', async (req, res) => {
  try {
    const { rate } = req.body;

    if (!rate || isNaN(rate) || rate <= 0) {
      return res.status(400).json({ message: 'Valid exchange rate is required' });
    }

    await Settings.updateSetting('usdToInrRate', parseFloat(rate));

    res.json({
      message: `USD exchange rate updated: $1 = ₹${parseFloat(rate).toFixed(2)}`,
      rate: parseFloat(rate)
    });
  } catch (error) {
    console.error('Error updating USD exchange rate:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ===========================================================================
// Generic key-based routes — MUST be declared AFTER all specific routes above.
// ===========================================================================

// @route   GET /api/settings/:key
// @desc    Get a specific setting
// @access  Public
router.get('/:key', async (req, res) => {
  try {
    const value = await Settings.getSetting(req.params.key);

    if (value === null) {
      return res.status(404).json({ message: 'Setting not found' });
    }

    res.json({ key: req.params.key, value });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/settings/:key
// @desc    Update a setting
// @access  Authenticated
router.put('/:key', async (req, res) => {
  try {
    const { value, description } = req.body;

    const setting = await Settings.findOneAndUpdate(
      { key: req.params.key },
      { value, description, updatedAt: Date.now() },
      { upsert: true, new: true }
    );

    res.json(setting);
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
