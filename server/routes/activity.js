const express = require('express');
const router = express.Router();
const ActivityEvent = require('../models/ActivityEvent');
const Client = require('../models/Client');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { recordView, VIEW_PLACES } = require('../services/activity');

router.use(authenticateToken);

const isAdmin = (req) => req.user?.role === 'admin';

// Admins see everyone's activity; anyone else sees only their own.
function scopeFilter(req) {
  const { from, to, user, action, clientId } = req.query;
  const q = {};
  if (from || to) {
    q.at = {};
    if (from) q.at.$gte = new Date(from);
    if (to) q.at.$lt = new Date(to);
  }
  if (!isAdmin(req)) q.userEmail = req.user.email;
  else if (user) q.userEmail = user;
  if (action) {
    const list = String(action).split(',').filter(Boolean);
    q.action = list.length === 1 ? list[0] : { $in: list };
  }
  if (clientId) q.clientId = clientId;
  // Entry-only filters: anything that is not a monthly entry drops out.
  if (req.query.month) q.month = req.query.month;
  if (req.query.status) q['meta.status'] = req.query.status;
  return q;
}

// @route POST /api/activity/view
// @desc  A client was opened somewhere in the app
router.post('/view', async (req, res) => {
  try {
    const { clientId, where } = req.body || {};
    if (!clientId) return res.status(400).json({ message: 'clientId is required' });
    if (where && !VIEW_PLACES.includes(where)) return res.status(400).json({ message: 'Unknown place' });
    const client = await Client.findOne({ clientId }).select('clientId name').lean();
    if (!client) return res.status(404).json({ message: 'Client not found' });
    const recorded = await recordView(req, { clientId, clientName: client.name, where });
    res.json({ recorded });
  } catch (error) {
    console.error('Error recording view:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/activity
// @desc  Events newest first. ?before=<iso> pages further back.
router.get('/', async (req, res) => {
  try {
    const q = scopeFilter(req);
    const { before, search } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    if (before) q.at = { ...(q.at || {}), $lt: new Date(before) };
    if (search) {
      const term = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      q.$or = [{ clientName: term }, { clientId: term }, { userEmail: term }];
    }
    const events = await ActivityEvent.find(q).sort({ at: -1 }).limit(limit + 1).lean();
    res.json({ events: events.slice(0, limit), more: events.length > limit });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route GET /api/activity/summary
// @desc  Per person and per person-and-client counts for a period
router.get('/summary', async (req, res) => {
  try {
    const match = scopeFilter(req);
    delete match.action;
    delete match.clientId;
    delete match.month;
    delete match['meta.status'];

    const [people, clients, users, firstEvent] = await Promise.all([
      ActivityEvent.aggregate([
        { $match: match },
        {
          $group: {
            _id: { user: '$userEmail', action: '$action' },
            count: { $sum: 1 },
            first: { $min: '$at' },
            last: { $max: '$at' },
          },
        },
      ]),
      ActivityEvent.aggregate([
        { $match: { ...match, clientId: { $ne: '' } } },
        { $sort: { at: 1 } },
        {
          $group: {
            _id: { user: '$userEmail', clientId: '$clientId', action: '$action' },
            clientName: { $last: '$clientName' },
            count: { $sum: 1 },
            last: { $max: '$at' },
          },
        },
      ]),
      User.find(isAdmin(req) ? {} : { email: req.user.email }).select('email name role').lean(),
      ActivityEvent.findOne({}).sort({ at: 1 }).select('at').lean(),
    ]);

    const byUser = new Map();
    const personOf = (email) => {
      if (!byUser.has(email)) byUser.set(email, { email, actions: {}, first: null, last: null, clients: new Map() });
      return byUser.get(email);
    };
    for (const row of people) {
      const p = personOf(row._id.user);
      p.actions[row._id.action] = row.count;
      if (!p.first || row.first < p.first) p.first = row.first;
      if (!p.last || row.last > p.last) p.last = row.last;
    }
    for (const row of clients) {
      const p = personOf(row._id.user);
      if (!p.clients.has(row._id.clientId)) {
        p.clients.set(row._id.clientId, { clientId: row._id.clientId, clientName: row.clientName, actions: {}, last: null });
      }
      const c = p.clients.get(row._id.clientId);
      c.actions[row._id.action] = row.count;
      if (row.clientName) c.clientName = row.clientName;
      if (!c.last || row.last > c.last) c.last = row.last;
    }

    const names = new Map(users.map((u) => [u.email, u]));
    const result = [...byUser.values()].map((p) => ({
      email: p.email,
      name: names.get(p.email)?.name || '',
      role: names.get(p.email)?.role || '',
      actions: p.actions,
      first: p.first,
      last: p.last,
      clients: [...p.clients.values()].sort((a, b) => new Date(b.last) - new Date(a.last)),
    })).sort((a, b) => new Date(b.last) - new Date(a.last));

    res.json({
      people: result,
      users: users.map((u) => ({ email: u.email, name: u.name, role: u.role })),
      scope: isAdmin(req) ? 'everyone' : 'self',
      recordingSince: firstEvent?.at || null,
    });
  } catch (error) {
    console.error('Error building activity summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
