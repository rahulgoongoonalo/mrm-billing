const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const Settings = require('../models/Settings');
const { authenticateToken } = require('../middleware/auth');

const monthOrder = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];

function getYearForMonth(month, financialYear) {
  return ['jan', 'feb', 'mar'].includes(month) ? financialYear.endYear : financialYear.startYear;
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Field-level problems (bad email, unknown society...) are the caller's to fix, not a server fault.
function sendSaveError(res, error, action) {
  if (error.name === 'ValidationError') {
    const message = Object.values(error.errors).map((e) => e.message).join('; ');
    return res.status(400).json({ message });
  }
  console.error(`Error ${action} client:`, error);
  if (error.code === 11000) return res.status(400).json({ message: 'Client ID already exists' });
  return res.status(500).json({ message: 'Server error', error: error.message });
}

// Copy the client-master fields present in the request body onto the document.
function applyProfileFields(client, body) {
  const { clientType, societies, phone, email, gstId, commissionMode, societyCommissions, paymentAccount } = body;
  if (clientType !== undefined) client.clientType = clientType;
  if (societies !== undefined) client.societies = Array.isArray(societies) ? societies : [];
  if (phone !== undefined) client.phone = phone;
  if (email !== undefined) client.email = email;
  if (gstId !== undefined) client.gstId = gstId;
  if (paymentAccount !== undefined) client.paymentAccount = paymentAccount || '';
  if (commissionMode !== undefined) client.commissionMode = commissionMode;
  if (societyCommissions !== undefined) {
    client.societyCommissions = Array.isArray(societyCommissions) ? societyCommissions : [];
  }
}

// Protect all client routes
router.use(authenticateToken);

// @route   GET /api/clients
// @desc    Get all active clients
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { search, includeInactive } = req.query;
    
    let query = {};
    
    // Filter inactive clients unless specifically requested
    if (includeInactive !== 'true') {
      query.isActive = true;
    }
    
    // Search functionality
    if (search) {
      const term = { $regex: escapeRegex(search), $options: 'i' };
      query.$or = [
        { name: term },
        { clientId: term },
        { phone: term },
        { email: term }
      ];
    }
    
    const clients = await Client.find(query);
    clients.sort((a, b) => (parseInt(a.clientId?.match(/(\d+)/)?.[1], 10) || 0) - (parseInt(b.clientId?.match(/(\d+)/)?.[1], 10) || 0));
    res.json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/clients/:id
// @desc    Get client by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findOne({ clientId: req.params.id });
    
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    
    res.json(client);
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/clients
// @desc    Create a new client
// @access  Public
router.post('/', async (req, res) => {
  try {
    const { clientId, name, type, fee, commissionRate, gstRate, previousBalance, iprs, prs, isamra, societies, clientType } = req.body;
    // Older callers send only the label and the three society flags.
    const sendsProfile = societies !== undefined || clientType !== undefined;

    // Check if client ID already exists
    const existingClient = await Client.findOne({ clientId });
    if (existingClient) {
      // If client exists but is inactive, reactivate with new data
      if (!existingClient.isActive) {
        existingClient.name = name || existingClient.name;
        if (!sendsProfile && type) existingClient.type = type;
        existingClient.fee = fee !== undefined ? parseFloat(fee) : existingClient.fee;
        if (commissionRate !== undefined) existingClient.commissionRate = parseFloat(commissionRate) || 0;
        if (gstRate !== undefined) existingClient.gstRate = parseFloat(gstRate);
        existingClient.previousBalance = previousBalance !== undefined ? previousBalance : existingClient.previousBalance;
        if (!sendsProfile) {
          existingClient.iprs = iprs !== undefined ? iprs : existingClient.iprs;
          existingClient.prs = prs !== undefined ? prs : existingClient.prs;
          existingClient.isamra = isamra !== undefined ? isamra : existingClient.isamra;
        }
        applyProfileFields(existingClient, req.body);
        existingClient.isActive = true;
        await existingClient.save();
        return res.status(201).json(existingClient);
      }
      return res.status(400).json({ message: 'Client ID already exists' });
    }

    const client = new Client({
      clientId,
      name,
      type: sendsProfile ? undefined : (type || 'Other'),
      fee: parseFloat(fee) || 0.10,
      commissionRate: parseFloat(commissionRate) || 0,
      gstRate: gstRate !== undefined ? parseFloat(gstRate) : 18,
      previousBalance: previousBalance || 0,
      iprs: iprs || false,
      prs: prs || false,
      isamra: isamra || false
    });
    applyProfileFields(client, req.body);

    await client.save();
    res.status(201).json(client);
  } catch (error) {
    sendSaveError(res, error, 'creating');
  }
});

// @route   PUT /api/clients/:id
// @desc    Update a client
// @access  Public
router.put('/:id', async (req, res) => {
  try {
    const { name, type, fee, commissionRate, gstRate, previousBalance, iprs, prs, isamra, isActive, contracts, societies, clientType } = req.body;
    // Older callers send only the label and the three society flags.
    const sendsProfile = societies !== undefined || clientType !== undefined;

    const client = await Client.findOne({ clientId: req.params.id });

    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    // Update fields
    const oldName = client.name;
    const oldType = client.type;
    const oldCommissionRate = client.commissionRate;
    // Compared as a string so a reordered or reworded rate list is not mistaken
    // for a change - re-saving every entry is expensive and marks them all edited.
    const commissionKey = (c) => JSON.stringify([
      c.commissionMode || 'flat',
      (c.societyCommissions || []).map((r) => [r.society, Number(r.rate)]).sort(),
    ]);
    const oldCommissionKey = commissionKey(client);
    if (name) client.name = name;
    if (type && !sendsProfile) client.type = type;
    if (fee !== undefined) client.fee = parseFloat(fee);
    if (commissionRate !== undefined) client.commissionRate = parseFloat(commissionRate);
    // commissionMode and societyCommissions are applied by applyProfileFields below.
    if (gstRate !== undefined && gstRate !== '') client.gstRate = parseFloat(gstRate);
    if (previousBalance !== undefined) client.previousBalance = previousBalance;
    if (!sendsProfile) {
      if (iprs !== undefined) client.iprs = iprs;
      if (prs !== undefined) client.prs = prs;
      if (isamra !== undefined) client.isamra = isamra;
    }
    if (isActive !== undefined) client.isActive = isActive;
    if (contracts !== undefined) client.contracts = contracts;
    applyProfileFields(client, req.body);

    await client.save();

    // The monthly entries mirror the client's name and royalty label. These are
    // relabels, not edits, so they leave each entry's updatedAt alone.
    if (client.name !== oldName) {
      await RoyaltyAccounting.updateMany(
        { clientId: req.params.id },
        { $set: { clientName: client.name } },
        { timestamps: false }
      );
    }
    if (client.type !== oldType) {
      await RoyaltyAccounting.updateMany(
        { clientId: req.params.id },
        { $set: { royaltyType: client.type } },
        { timestamps: false }
      );
    }

    // Cascade a commission rate change to all RoyaltyAccounting entries (in chronological order).
    // Only when the rate really changed - re-saving every entry for a phone edit would
    // re-chain outstanding balances and mark every month as edited today.
    const rateChanged = commissionRate !== undefined && client.commissionRate !== oldCommissionRate;
    const structureChanged = commissionKey(client) !== oldCommissionKey;
    if (rateChanged || structureChanged) {
      const entries = await RoyaltyAccounting.find({ clientId: req.params.id });

      // Chronological position: FY-apr = 0..FY-mar = 11.
      // For a given entry, its FY startYear = (month in jan/feb/mar) ? year-1 : year.
      const fyStart = (e) => (['jan', 'feb', 'mar'].includes(e.month) ? e.year - 1 : e.year);
      const chronoKey = (e) => fyStart(e) * 12 + monthOrder.indexOf(e.month);

      entries.sort((a, b) => chronoKey(a) - chronoKey(b));

      // Update commission rate and save in chronological order, cascading previousMonthOutstanding
      // across month boundaries AND across FY boundaries (March -> next April).
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (rateChanged) entry.commissionRate = parseFloat(commissionRate);
        // Re-snapshot the rate structure so each entry recomputes under the
        // client's current setup.
        entry.commissionMode = client.commissionMode || 'flat';
        entry.societyCommissions = client.commissionMode === 'per-society'
          ? (client.societyCommissions || []).map(({ society, rate }) => ({ society, rate }))
          : [];

        if (i > 0) {
          const prevEntry = entries[i - 1];
          // Chain only if this entry is the immediate chronological successor.
          if (chronoKey(entry) === chronoKey(prevEntry) + 1) {
            entry.previousMonthOutstanding = Math.round((prevEntry.totalOutstanding + Number.EPSILON) * 100) / 100;
          }
        }

        await entry.save(); // pre-save hook recomputes commissions & outstanding
      }
    }

    res.json(client);
  } catch (error) {
    sendSaveError(res, error, 'updating');
  }
});

// @route   DELETE /api/clients/:id
// @desc    Soft delete a client (mark as inactive)
// @access  Public
router.delete('/:id', async (req, res) => {
  try {
    const { permanent } = req.query;

    if (permanent === 'true') {
      // Permanent delete - the client and every entry it owns are removed for good
      const result = await Client.findOneAndDelete({ clientId: req.params.id });
      if (!result) {
        return res.status(404).json({ message: 'Client not found' });
      }
      await RoyaltyAccounting.deleteMany({ clientId: req.params.id });
      res.json({ message: 'Client permanently deleted' });
    } else {
      // Soft delete - hide the client but keep its entries, so the removal
      // can be reversed by setting isActive back to true
      const client = await Client.findOne({ clientId: req.params.id });
      if (!client) {
        return res.status(404).json({ message: 'Client not found' });
      }
      client.isActive = false;
      await client.save();
      res.json({ message: 'Client deactivated', client });
    }
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/clients/bulk
// @desc    Import multiple clients
// @access  Public
router.post('/bulk', async (req, res) => {
  try {
    const { clients } = req.body;
    
    if (!Array.isArray(clients)) {
      return res.status(400).json({ message: 'Clients must be an array' });
    }
    
    const results = {
      created: [],
      errors: []
    };
    
    for (const clientData of clients) {
      try {
        const existingClient = await Client.findOne({ clientId: clientData.clientId });
        if (existingClient) {
          results.errors.push({ clientId: clientData.clientId, error: 'Already exists' });
          continue;
        }
        
        const client = new Client(clientData);
        await client.save();
        results.created.push(client);
      } catch (error) {
        results.errors.push({ clientId: clientData.clientId, error: error.message });
      }
    }
    
    res.status(201).json(results);
  } catch (error) {
    console.error('Error bulk importing clients:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
