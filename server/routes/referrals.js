const express = require('express');
const router = express.Router();
const ReferralDeal = require('../models/ReferralDeal');
const ReferralPayout = require('../models/ReferralPayout');
const Referrer = require('../models/Referrer');
const Client = require('../models/Client');
const { authenticateToken } = require('../middleware/auth');
const { referralSummary, dealPreview, liveDeals, referrerKey, monthOrder } = require('../services/referrals');
const { MONTH_RE } = ReferralDeal;
const { MODES } = ReferralPayout;

router.use(authenticateToken);

const fail = (res, message, status = 400) => res.status(status).json({ message });
const tidyName = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const byName = (name) => ({ $regex: `^\\s*${escapeRe(tidyName(name)).replace(/ /g, '\\s+')}\\s*$`, $options: 'i' });

function sendError(res, error, what) {
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return fail(res, error.errors ? Object.values(error.errors).map((e) => e.message).join('; ') : error.message);
  }
  console.error(`Error ${what}:`, error);
  return fail(res, 'Server error', 500);
}

// 'YYYY-MM-DD' from what the browser sent; '' when it is not a real date.
function isoDate(value) {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/) || s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return '';
  const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  if (date.getUTCMonth() !== +mo - 1) return '';
  return date.toISOString().slice(0, 10);
}

// Check a deal; returns an error message or the tidied fields. `id` is the deal being edited.
async function checkDeal(body, id) {
  const referrer = tidyName(body.referrer);
  const rate = Number(body.rate);
  if (!referrer) return 'Enter who referred the client';
  if (!(rate > 0 && rate <= 100)) return 'Enter a referral rate above 0 and up to 100';
  if (!MONTH_RE.test(body.fromMonth || '')) return 'Choose the month the referral starts';
  if (body.toMonth && !MONTH_RE.test(body.toMonth)) return 'The end month is not valid';
  if (body.toMonth && monthOrder(body.toMonth) < monthOrder(body.fromMonth)) return 'The end month is before the start month';
  const client = await Client.findOne({ clientId: body.clientId, isActive: { $ne: false } }).select('clientId name').lean();
  if (!client) return 'Choose a client';

  // Two deals for the same client and referrer must not cover the same month,
  // or one payment would earn twice.
  const lo = monthOrder(body.fromMonth);
  const hi = body.toMonth ? monthOrder(body.toMonth) : Infinity;
  const others = await ReferralDeal.find({ clientId: client.clientId, ...(id ? { _id: { $ne: id } } : {}) }).lean();
  const clash = others.find((d) => referrerKey(d.referrer) === referrerKey(referrer)
    && monthOrder(d.fromMonth) <= hi && (d.toMonth ? monthOrder(d.toMonth) : Infinity) >= lo);
  if (clash) {
    return `${referrer} already has a deal on ${client.name} from ${clash.fromMonth}${clash.toMonth ? ` to ${clash.toMonth}` : ' (open)'}. End that deal first.`;
  }
  // Spell a known referrer the way the other deals do.
  const known = (await ReferralDeal.find({ referrer: byName(referrer) }).select('referrer').limit(1).lean())[0];
  return { client, referrer: known ? known.referrer : referrer, rate };
}

// Check a payout; returns an error message or the tidied fields. `id` is the payout being edited.
async function checkPayout(body, id) {
  const amount = r2(body.amount);
  const tds = r2(body.tds);
  const date = isoDate(body.date);
  const mode = MODES.includes(body.mode) ? body.mode : 'bank';
  if (!tidyName(body.referrer)) return 'Choose the referrer who was paid';
  if (!(amount > 0)) return 'Enter the amount paid';
  if (tds < 0 || tds >= amount) return 'TDS must be less than the amount';
  if (!date) return 'Choose the date it was paid';
  if (date > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) return 'The payout date is in the future';

  // Spell the name the way the deals do, so the payout lands on the same referrer.
  const deal = (await ReferralDeal.find({ referrer: byName(body.referrer) }).select('referrer').limit(1).lean())[0];
  if (!deal) return `${tidyName(body.referrer)} has no referral deal`;

  // Paying more than was earned needs saying so: it is an advance.
  if (!body.advance) {
    const { referrers } = await referralSummary();
    const r = referrers.find((x) => x.key === referrerKey(deal.referrer));
    const before = id ? r2((await ReferralPayout.findById(id).lean())?.amount) : 0;
    const due = r2((r?.due || 0) + before);
    if (amount > due + 0.5) {
      return `${deal.referrer} has ₹${due.toLocaleString('en-IN')} still to be paid. Tick "Advance" to pay more than that.`;
    }
  }
  return {
    referrer: deal.referrer, date, amount, tds, mode,
    reference: tidyName(body.reference), note: String(body.note || '').trim(),
  };
}

// @route GET /api/referrals/summary?from=YYYY-MM&to=YYYY-MM
router.get('/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    if ((from && !MONTH_RE.test(from)) || (to && !MONTH_RE.test(to))) return fail(res, 'Months must be YYYY-MM');
    if (from && to && monthOrder(to) < monthOrder(from)) return fail(res, 'The end month is before the start month');
    res.json(await referralSummary({ from, to }));
  } catch (error) { sendError(res, error, 'building referral summary'); }
});

// @route GET /api/referrals/preview?clientId=&rate=&fromMonth=&toMonth=
router.get('/preview', async (req, res) => {
  try {
    const { clientId, rate, fromMonth, toMonth } = req.query;
    if (!clientId) return fail(res, 'Choose a client');
    if ((fromMonth && !MONTH_RE.test(fromMonth)) || (toMonth && !MONTH_RE.test(toMonth))) return fail(res, 'Months must be YYYY-MM');
    res.json(await dealPreview({ clientId, rate, fromMonth, toMonth }));
  } catch (error) { sendError(res, error, 'previewing referral deal'); }
});

// ---- Referrers --------------------------------------------------------------

router.get('/referrers', async (req, res) => {
  try {
    res.json(await Referrer.find({}).sort({ name: 1 }).lean());
  } catch (error) { sendError(res, error, 'listing referrers'); }
});

// Save a referrer's profile; a changed name is carried to their deals and payouts.
router.put('/referrers/:key', async (req, res) => {
  try {
    const key = referrerKey(req.params.key);
    const deal = (await ReferralDeal.find({ referrer: byName(key) }).select('referrer').limit(1).lean())[0];
    if (!deal) return fail(res, 'Referrer not found', 404);
    const name = tidyName(req.body.name) || deal.referrer;
    const nextKey = referrerKey(name);
    const tdsRate = Number(req.body.tdsRate) || 0;
    if (tdsRate < 0 || tdsRate > 100) return fail(res, 'TDS rate must be from 0 to 100');
    if (req.body.email && !/^\S+@\S+\.\S+$/.test(String(req.body.email).trim())) return fail(res, 'The email is not valid');
    if (req.body.pan && !/^[A-Z]{5}\d{4}[A-Z]$/i.test(String(req.body.pan).trim())) return fail(res, 'PAN must look like ABCDE1234F');
    if (req.body.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(String(req.body.ifsc).trim())) return fail(res, 'IFSC must look like HDFC0001234');

    if (nextKey !== key) {
      const taken = await ReferralDeal.exists({ referrer: byName(name) });
      if (taken) return fail(res, `${name} is already a referrer. Pick another name.`);
      await Referrer.deleteOne({ key: nextKey }); // a leftover profile with no deals
    }
    const fields = ['phone', 'email', 'pan', 'upi', 'bankName', 'accountName', 'accountNo', 'ifsc', 'note'];
    const update = { key: nextKey, name, tdsRate, updatedByEmail: req.user?.email || '' };
    for (const f of fields) update[f] = String(req.body[f] ?? '').trim();

    const profile = await Referrer.findOneAndUpdate({ key }, update, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
    if (name !== deal.referrer) {
      await ReferralDeal.updateMany({ referrer: byName(key) }, { referrer: name });
      await ReferralPayout.updateMany({ referrer: byName(key) }, { referrer: name });
    }
    res.json(profile);
  } catch (error) { sendError(res, error, 'saving referrer'); }
});

// ---- Deals ----------------------------------------------------------------

router.get('/deals', async (req, res) => {
  try {
    res.json(await liveDeals());
  } catch (error) { sendError(res, error, 'listing referral deals'); }
});

router.post('/deals', async (req, res) => {
  try {
    const ok = await checkDeal(req.body);
    if (typeof ok === 'string') return fail(res, ok);
    const deal = await ReferralDeal.create({
      clientId: ok.client.clientId,
      clientName: ok.client.name,
      referrer: ok.referrer,
      rate: ok.rate,
      fromMonth: req.body.fromMonth,
      toMonth: req.body.toMonth || '',
      note: req.body.note || '',
      createdByEmail: req.user?.email || '',
    });
    res.status(201).json(deal);
  } catch (error) { sendError(res, error, 'creating referral deal'); }
});

router.put('/deals/:id', async (req, res) => {
  try {
    const deal = await ReferralDeal.findById(req.params.id);
    if (!deal) return fail(res, 'Deal not found', 404);
    const next = { ...deal.toObject(), ...req.body };
    const ok = await checkDeal(next, deal._id);
    if (typeof ok === 'string') return fail(res, ok);
    Object.assign(deal, {
      clientId: ok.client.clientId,
      clientName: ok.client.name,
      referrer: ok.referrer,
      rate: ok.rate,
      fromMonth: next.fromMonth,
      toMonth: next.toMonth || '',
      note: next.note || '',
      updatedByEmail: req.user?.email || '',
    });
    await deal.save();
    res.json(deal);
  } catch (error) { sendError(res, error, 'updating referral deal'); }
});

// Change a running deal's rate from a month on: the deal ends the month
// before and a new one starts, so referral already earned keeps its rate.
router.post('/deals/:id/change-rate', async (req, res) => {
  try {
    const deal = await ReferralDeal.findById(req.params.id);
    if (!deal) return fail(res, 'Deal not found', 404);
    const rate = Number(req.body.rate);
    const { fromMonth } = req.body;
    if (!(rate > 0 && rate <= 100)) return fail(res, 'Enter a new rate above 0 and up to 100');
    if (rate === deal.rate) return fail(res, `The rate is already ${rate}%`);
    if (!MONTH_RE.test(fromMonth || '')) return fail(res, 'Choose the month the new rate starts');
    if (monthOrder(fromMonth) <= monthOrder(deal.fromMonth)) return fail(res, 'The new rate must start after the deal started. To fix the rate from the start, edit the deal.');
    if (deal.toMonth && monthOrder(fromMonth) > monthOrder(deal.toMonth)) return fail(res, 'The deal has already ended by then');

    const prev = monthOrder(fromMonth) - 1;
    const endMonth = `${Math.floor(prev / 12)}-${String((prev % 12) + 1).padStart(2, '0')}`;
    const oldEnd = deal.toMonth;
    deal.toMonth = endMonth;
    deal.updatedByEmail = req.user?.email || '';
    await deal.save();
    const next = await ReferralDeal.create({
      clientId: deal.clientId,
      clientName: deal.clientName,
      referrer: deal.referrer,
      rate,
      fromMonth,
      toMonth: oldEnd || '',
      note: String(req.body.note || '').trim() || `Rate changed from ${deal.rate}%`,
      createdByEmail: req.user?.email || '',
    });
    res.status(201).json({ ended: deal, started: next });
  } catch (error) { sendError(res, error, 'changing referral rate'); }
});

router.delete('/deals/:id', async (req, res) => {
  try {
    const deal = await ReferralDeal.findByIdAndDelete(req.params.id);
    if (!deal) return fail(res, 'Deal not found', 404);
    res.json({ message: 'Deal deleted' });
  } catch (error) { sendError(res, error, 'deleting referral deal'); }
});

// ---- Payouts --------------------------------------------------------------

router.get('/payouts', async (req, res) => {
  try {
    res.json(await ReferralPayout.find({}).sort({ date: -1, createdAt: -1 }).lean());
  } catch (error) { sendError(res, error, 'listing referral payouts'); }
});

router.post('/payouts', async (req, res) => {
  try {
    const ok = await checkPayout(req.body);
    if (typeof ok === 'string') return fail(res, ok);
    const payout = await ReferralPayout.create({ ...ok, createdByEmail: req.user?.email || '' });
    res.status(201).json(payout);
  } catch (error) { sendError(res, error, 'recording referral payout'); }
});

router.put('/payouts/:id', async (req, res) => {
  try {
    const payout = await ReferralPayout.findById(req.params.id);
    if (!payout) return fail(res, 'Payout not found', 404);
    const ok = await checkPayout({ ...payout.toObject(), ...req.body }, payout._id);
    if (typeof ok === 'string') return fail(res, ok);
    Object.assign(payout, ok, { updatedByEmail: req.user?.email || '' });
    await payout.save();
    res.json(payout);
  } catch (error) { sendError(res, error, 'updating referral payout'); }
});

router.delete('/payouts/:id', async (req, res) => {
  try {
    const payout = await ReferralPayout.findByIdAndDelete(req.params.id);
    if (!payout) return fail(res, 'Payout not found', 404);
    res.json({ message: 'Payout deleted' });
  } catch (error) { sendError(res, error, 'deleting referral payout'); }
});

module.exports = router;
