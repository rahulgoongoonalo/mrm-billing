const express = require('express');
const router = express.Router();
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const Client = require('../models/Client');
const Settings = require('../models/Settings');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Month order for financial year (Apr to Mar)
const monthOrder = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];

// Helper: get the year for a given month in a financial year
function getYearForMonth(month, financialYear) {
  return ['jan', 'feb', 'mar'].includes(month)
    ? financialYear.endYear
    : financialYear.startYear;
}

// @route   GET /api/royalty-accounting
// @desc    Get all entries with optional filters
router.get('/', async (req, res) => {
  try {
    const { month, clientId, year, financialYear } = req.query;
    let query = {};

    if (month) query.month = month;
    if (clientId) query.clientId = clientId;
    if (year) query.year = parseInt(year);

    // If financialYear provided, get entries for all months in that FY
    if (financialYear) {
      const fyStart = parseInt(financialYear);
      query.$or = [
        { year: fyStart, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
        { year: fyStart + 1, month: { $in: ['jan', 'feb', 'mar'] } }
      ];
      // Remove individual year filter if FY is set
      delete query.year;
    }

    const entries = await RoyaltyAccounting.find(query);
    entries.sort((a, b) => {
      const idDiff = (parseInt(a.clientId?.match(/(\d+)/)?.[1], 10) || 0) - (parseInt(b.clientId?.match(/(\d+)/)?.[1], 10) || 0);
      return idDiff !== 0 ? idDiff : monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
    });

    res.json(entries);
  } catch (error) {
    console.error('Error fetching royalty accounting entries:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/royalty-accounting/previous-outstanding/:clientId/:month
// @desc    Get previous month's total outstanding (carry-forward)
router.get('/previous-outstanding/:clientId/:month', async (req, res) => {
  try {
    const { clientId, month } = req.params;
    const { financialYear } = req.query;

    const fy = financialYear
      ? { startYear: parseInt(financialYear), endYear: parseInt(financialYear) + 1 }
      : await Settings.getSetting('financialYear');

    const currentMonthIndex = monthOrder.indexOf(month);
    if (currentMonthIndex <= 0) {
      return res.json({ totalOutstanding: 0 });
    }

    const prevMonth = monthOrder[currentMonthIndex - 1];
    const prevYear = getYearForMonth(prevMonth, fy);

    const entry = await RoyaltyAccounting.findOne({
      clientId,
      month: prevMonth,
      year: prevYear
    });

    res.json({ totalOutstanding: entry?.totalOutstanding || 0 });
  } catch (error) {
    console.error('Error fetching previous outstanding:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/royalty-accounting/:clientId/:month
// @desc    Get specific entry
router.get('/:clientId/:month', async (req, res) => {
  try {
    const { clientId, month } = req.params;
    const { financialYear } = req.query;

    const fy = financialYear
      ? { startYear: parseInt(financialYear), endYear: parseInt(financialYear) + 1 }
      : await Settings.getSetting('financialYear');

    const year = getYearForMonth(month, fy);

    const entry = await RoyaltyAccounting.findOne({ clientId, month, year });

    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.json(entry);
  } catch (error) {
    console.error('Error fetching royalty accounting entry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/royalty-accounting
// @desc    Create or update a royalty accounting entry
router.post('/', async (req, res) => {
  try {
    const { clientId, month, ...data } = req.body;

    const client = await Client.findOne({ clientId });
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const financialYear = await Settings.getSetting('financialYear');
    const year = getYearForMonth(month, financialYear);

    // Auto-fetch previous month outstanding if not explicitly provided
    let previousMonthOutstanding = data.previousMonthOutstanding || 0;
    const currentMonthIndex = monthOrder.indexOf(month);
    if (currentMonthIndex > 0 && !data.previousMonthOutstanding) {
      const prevMonth = monthOrder[currentMonthIndex - 1];
      const prevYear = getYearForMonth(prevMonth, financialYear);
      const prevEntry = await RoyaltyAccounting.findOne({
        clientId,
        month: prevMonth,
        year: prevYear
      });
      if (prevEntry) {
        previousMonthOutstanding = prevEntry.totalOutstanding;
      }
    }

    const entryData = {
      clientId,
      clientName: client.name,
      month,
      year,
      royaltyType: data.royaltyType || 'IPRS + PRS',
      commissionRate: data.commissionRate ?? 0,
      gstRate: data.gstRate ?? 18,
      iprsAmount: data.iprsAmount || 0,
      prsAmount: data.prsAmount || 0,
      soundExchangeAmount: data.soundExchangeAmount || 0,
      isamraAmount: data.isamraAmount || 0,
      ascapAmount: data.ascapAmount || 0,
      pplAmount: data.pplAmount || 0,
      currentMonthGstBase: data.currentMonthGstBase || 0,
      previousOutstandingGstBase: data.previousOutstandingGstBase || 0,
      currentMonthReceipt: data.currentMonthReceipt || 0,
      currentMonthTds: data.currentMonthTds || 0,
      previousMonthReceipt: data.previousMonthReceipt || 0,
      previousMonthTds: data.previousMonthTds || 0,
      previousMonthOutstanding,
      status: data.status || 'draft'
    };

    const entry = await RoyaltyAccounting.findOneAndUpdate(
      { clientId, month, year },
      entryData,
      { upsert: true, new: true, runValidators: true }
    );

    // Cascade: update all subsequent months' previousMonthOutstanding
    if (currentMonthIndex < monthOrder.length - 1) {
      const cascadedEntries = await RoyaltyAccounting.cascadeUpdate(
        clientId,
        currentMonthIndex + 1,
        financialYear
      );

      // Return both the saved entry and any cascaded updates
      if (cascadedEntries.length > 0) {
        return res.status(201).json({
          entry,
          cascadedEntries
        });
      }
    }

    res.status(201).json({ entry });
  } catch (error) {
    console.error('Error saving royalty accounting entry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/royalty-accounting/:id
// @desc    Update entry by ID
router.put('/:id', async (req, res) => {
  try {
    const entry = await RoyaltyAccounting.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.json(entry);
  } catch (error) {
    console.error('Error updating royalty accounting entry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/royalty-accounting/:clientId/:month
// @desc    Delete an entry
router.delete('/:clientId/:month', async (req, res) => {
  try {
    const { clientId, month } = req.params;
    const { financialYear } = req.query;

    const fy = financialYear
      ? { startYear: parseInt(financialYear), endYear: parseInt(financialYear) + 1 }
      : await Settings.getSetting('financialYear');

    const year = getYearForMonth(month, fy);

    const result = await RoyaltyAccounting.findOneAndDelete({ clientId, month, year });

    if (!result) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.json({ message: 'Entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting royalty accounting entry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/royalty-accounting/reports/gst-invoice
// @desc    Get GST & Invoice report
router.get('/reports/gst-invoice', async (req, res) => {
  try {
    const { financialYear } = req.query;
    const fy = financialYear
      ? parseInt(financialYear)
      : (await Settings.getSetting('financialYear')).startYear;

    const matchQuery = {
      $or: [
        { year: fy, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
        { year: fy + 1, month: { $in: ['jan', 'feb', 'mar'] } }
      ]
    };

    const entries = await RoyaltyAccounting.find(matchQuery)
      .select('clientId clientName month year gstRate totalCommission currentMonthGstBase currentMonthGst currentMonthInvoiceTotal previousOutstandingGstBase previousOutstandingGst previousOutstandingInvoiceTotal status')
      .sort({ year: 1 });

    // Sort by client then by month order
    entries.sort((a, b) => {
      const idDiff = (parseInt(a.clientId?.match(/(\d+)/)?.[1], 10) || 0) - (parseInt(b.clientId?.match(/(\d+)/)?.[1], 10) || 0);
      return idDiff !== 0 ? idDiff : monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
    });

    const totals = entries.reduce((acc, e) => {
      acc.totalCommission += e.totalCommission || 0;
      acc.currentMonthGstBase += e.currentMonthGstBase || 0;
      acc.currentMonthGst += e.currentMonthGst || 0;
      acc.currentMonthInvoiceTotal += e.currentMonthInvoiceTotal || 0;
      acc.previousOutstandingGstBase += e.previousOutstandingGstBase || 0;
      acc.previousOutstandingGst += e.previousOutstandingGst || 0;
      acc.previousOutstandingInvoiceTotal += e.previousOutstandingInvoiceTotal || 0;
      return acc;
    }, {
      totalCommission: 0,
      currentMonthGstBase: 0,
      currentMonthGst: 0,
      currentMonthInvoiceTotal: 0,
      previousOutstandingGstBase: 0,
      previousOutstandingGst: 0,
      previousOutstandingInvoiceTotal: 0
    });

    res.json({ entries, totals });
  } catch (error) {
    console.error('Error fetching GST & Invoice report:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/royalty-accounting/reports/receipts-tds
// @desc    Get Receipts & TDS report
router.get('/reports/receipts-tds', async (req, res) => {
  try {
    const { financialYear } = req.query;
    const fy = financialYear
      ? parseInt(financialYear)
      : (await Settings.getSetting('financialYear')).startYear;

    const matchQuery = {
      $or: [
        { year: fy, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
        { year: fy + 1, month: { $in: ['jan', 'feb', 'mar'] } }
      ]
    };

    const entries = await RoyaltyAccounting.find(matchQuery)
      .select('clientId clientName month year totalCommission currentMonthReceipt currentMonthTds previousMonthReceipt previousMonthTds monthlyOutstanding totalOutstanding status')
      .sort({ year: 1 });

    entries.sort((a, b) => {
      const idDiff = (parseInt(a.clientId?.match(/(\d+)/)?.[1], 10) || 0) - (parseInt(b.clientId?.match(/(\d+)/)?.[1], 10) || 0);
      return idDiff !== 0 ? idDiff : monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
    });

    const totals = entries.reduce((acc, e) => {
      acc.totalCommission += e.totalCommission || 0;
      acc.currentMonthReceipt += e.currentMonthReceipt || 0;
      acc.currentMonthTds += e.currentMonthTds || 0;
      acc.previousMonthReceipt += e.previousMonthReceipt || 0;
      acc.previousMonthTds += e.previousMonthTds || 0;
      acc.monthlyOutstanding += e.monthlyOutstanding || 0;
      acc.totalOutstanding += e.totalOutstanding || 0;
      return acc;
    }, {
      totalCommission: 0,
      currentMonthReceipt: 0,
      currentMonthTds: 0,
      previousMonthReceipt: 0,
      previousMonthTds: 0,
      monthlyOutstanding: 0,
      totalOutstanding: 0
    });

    res.json({ entries, totals });
  } catch (error) {
    console.error('Error fetching Receipts & TDS report:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/royalty-accounting/reports/summary
// @desc    Get summary report
router.get('/reports/summary', async (req, res) => {
  try {
    const { financialYear } = req.query;
    const fy = financialYear
      ? parseInt(financialYear)
      : (await Settings.getSetting('financialYear')).startYear;

    const matchQuery = {
      $or: [
        { year: fy, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
        { year: fy + 1, month: { $in: ['jan', 'feb', 'mar'] } }
      ]
    };

    const summary = await RoyaltyAccounting.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalEntries: { $sum: 1 },
          draftCount: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
          submittedCount: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
          totalIprs: { $sum: '$iprsAmount' },
          totalPrs: { $sum: '$prsAmount' },
          totalSoundEx: { $sum: '$soundExchangeAmount' },
          totalIsamra: { $sum: '$isamraAmount' },
          totalAscap: { $sum: '$ascapAmount' },
          totalPpl: { $sum: '$pplAmount' },
          totalCommission: { $sum: '$totalCommission' },
          totalMonthlyOutstanding: { $sum: '$monthlyOutstanding' },
          totalFinalOutstanding: { $sum: '$totalOutstanding' }
        }
      }
    ]);

    res.json(summary[0] || {
      totalEntries: 0,
      draftCount: 0,
      submittedCount: 0,
      totalIprs: 0,
      totalPrs: 0,
      totalSoundEx: 0,
      totalIsamra: 0,
      totalAscap: 0,
      totalPpl: 0,
      totalCommission: 0,
      totalMonthlyOutstanding: 0,
      totalFinalOutstanding: 0
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/royalty-accounting/reports/client/:clientId
// @desc    Get report for a specific client
router.get('/reports/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { financialYear } = req.query;
    const fy = financialYear
      ? parseInt(financialYear)
      : (await Settings.getSetting('financialYear')).startYear;

    const entries = await RoyaltyAccounting.find({
      clientId,
      $or: [
        { year: fy, month: { $in: ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] } },
        { year: fy + 1, month: { $in: ['jan', 'feb', 'mar'] } }
      ]
    }).sort({ year: 1 });

    const summary = entries.reduce((acc, entry) => {
      acc.totalCommission += entry.totalCommission;
      acc.totalOutstanding += entry.totalOutstanding;
      acc.draftCount += entry.status === 'draft' ? 1 : 0;
      acc.submittedCount += entry.status === 'submitted' ? 1 : 0;
      return acc;
    }, {
      totalCommission: 0,
      totalOutstanding: 0,
      draftCount: 0,
      submittedCount: 0
    });

    res.json({ entries, summary });
  } catch (error) {
    console.error('Error fetching client report:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
