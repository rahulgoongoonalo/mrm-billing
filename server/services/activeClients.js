// Removing a client is a soft delete: the client record is marked inactive and
// its entries are kept so the removal can be undone. Anything that reports
// across all clients must therefore skip entries belonging to removed clients.

const Client = require('../models/Client');

/** Client IDs that have been removed (isActive === false). */
async function inactiveClientIds() {
  const rows = await Client.find({ isActive: false }).select('clientId').lean();
  return rows.map((r) => r.clientId);
}

/** Mongo filter fragment that excludes removed clients' entries. */
async function excludeInactive() {
  const ids = await inactiveClientIds();
  return ids.length ? { clientId: { $nin: ids } } : {};
}

module.exports = { inactiveClientIds, excludeInactive };
