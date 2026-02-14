const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const { authenticateToken } = require('../middleware/auth');

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
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { clientId: { $regex: search, $options: 'i' } }
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
    const { clientId, name, type, clientType, fee, commissionRate, previousBalance, iprs, prs, isamra } = req.body;

    // Check if client ID already exists
    const existingClient = await Client.findOne({ clientId });
    if (existingClient) {
      // If client exists but is inactive, reactivate with new data
      if (!existingClient.isActive) {
        existingClient.name = name || existingClient.name;
        existingClient.type = type || existingClient.type;
        existingClient.clientType = clientType !== undefined ? clientType : existingClient.clientType;
        existingClient.fee = fee !== undefined ? parseFloat(fee) : existingClient.fee;
        existingClient.previousBalance = previousBalance !== undefined ? previousBalance : existingClient.previousBalance;
        existingClient.iprs = iprs !== undefined ? iprs : existingClient.iprs;
        existingClient.prs = prs !== undefined ? prs : existingClient.prs;
        existingClient.isamra = isamra !== undefined ? isamra : existingClient.isamra;
        existingClient.isActive = true;
        await existingClient.save();
        return res.status(201).json(existingClient);
      }
      return res.status(400).json({ message: 'Client ID already exists' });
    }

    const client = new Client({
      clientId,
      name,
      type: type || 'Other',
      clientType: clientType || '',
      fee: parseFloat(fee) || 0.10,
      commissionRate: parseFloat(commissionRate) || 0,
      previousBalance: previousBalance || 0,
      iprs: iprs || false,
      prs: prs || false,
      isamra: isamra || false
    });

    await client.save();
    res.status(201).json(client);
  } catch (error) {
    console.error('Error creating client:', error);
    if (error.code === 11000) {
      res.status(400).json({ message: 'Client ID already exists' });
    } else {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
});

// @route   PUT /api/clients/:id
// @desc    Update a client
// @access  Public
router.put('/:id', async (req, res) => {
  try {
    const { name, type, clientType, fee, commissionRate, previousBalance, iprs, prs, isamra, isActive } = req.body;

    const client = await Client.findOne({ clientId: req.params.id });

    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    // Update fields
    const oldName = client.name;
    if (name) client.name = name;
    if (type) client.type = type;
    if (clientType !== undefined) client.clientType = clientType;
    if (fee !== undefined) client.fee = parseFloat(fee);
    if (commissionRate !== undefined) client.commissionRate = parseFloat(commissionRate);
    if (previousBalance !== undefined) client.previousBalance = previousBalance;
    if (iprs !== undefined) client.iprs = iprs;
    if (prs !== undefined) client.prs = prs;
    if (isamra !== undefined) client.isamra = isamra;
    if (isActive !== undefined) client.isActive = isActive;
    
    await client.save();

    // Cascade name change to all RoyaltyAccounting entries
    if (name && name !== oldName) {
      await RoyaltyAccounting.updateMany(
        { clientId: req.params.id },
        { $set: { clientName: name } }
      );
    }

    res.json(client);
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/clients/:id
// @desc    Soft delete a client (mark as inactive)
// @access  Public
router.delete('/:id', async (req, res) => {
  try {
    const { permanent } = req.query;
    
    // Delete all billing entries for this client
    await RoyaltyAccounting.deleteMany({ clientId: req.params.id });

    if (permanent === 'true') {
      // Permanent delete
      const result = await Client.findOneAndDelete({ clientId: req.params.id });
      if (!result) {
        return res.status(404).json({ message: 'Client not found' });
      }
      res.json({ message: 'Client permanently deleted' });
    } else {
      // Soft delete
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
