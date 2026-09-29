// The client mail wizard's API. A mail is only ever sent by a person who has
// walked through: check the client master -> pick a letter -> fill it in ->
// preview it -> send. Mails carry no attachments: the client opens and
// downloads the statement from the links in the mail.
//
//   GET  /api/client-mail/:clientId/check     readiness + letter types + defaults
//   POST /api/client-mail/:clientId/preview   the rendered mail
//   POST /api/client-mail/:clientId/send      send it and log it on the month

const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const { authenticateToken } = require('../middleware/auth');
const activity = require('../services/activity');
const { getClientTransporter } = require('../services/emailService');
const { buildStatement, calOrder, statementUrl } = require('../services/statementBuilder');
const { SOCIETIES, SOCIETY_FIELDS } = require('../utils/clientProfile');
const {
  MAIL_TYPES, ACCOUNTS_EMAIL, describeTypes, missingFields, checkClient, mailContext, resolveRecipients, renderMail,
} = require('../services/clientMail');

router.use(authenticateToken);

async function load(clientId) {
  const client = await Client.findOne({ clientId });
  if (!client) return {};
  const rows = (await RoyaltyAccounting.find({ clientId }).lean()).sort((a, b) => calOrder(a) - calOrder(b));
  return { client, rows };
}

// Everything the mail needs, rebuilt from the request each time so what is
// sent is exactly what was previewed.
async function compose(req, { preview }) {
  const { clientId } = req.params;
  const { type, values = {}, subject, cc } = req.body || {};
  const fail = (status, message, extra) => Object.assign(new Error(message), { status, extra });

  if (!MAIL_TYPES[type]) throw fail(400, 'Choose a mail type.');
  const { client, rows } = await load(clientId);
  if (!client) throw fail(404, 'Client not found.');

  const { checks, ready } = checkClient(client, rows.length);
  if (!ready) throw fail(400, 'The client record is incomplete. Fix it before sending mail.', { checks });

  const missing = missingFields(type, values);
  if (missing.length) throw fail(400, `Fill in: ${missing.join(', ')}`);

  const recipients = resolveRecipients(client, cc);
  // rows are in calendar order, so the last is the latest month held.
  const mail = renderMail({ type, client, values, subject, recipients, latest: rows[rows.length - 1], preview });
  return { client, rows, recipients, mail };
}

const sendError = (res, err) => {
  if (err.status) return res.status(err.status).json({ message: err.message, ...(err.extra || {}) });
  console.error('Client mail failed:', err);
  return res.status(500).json({ message: err.message || 'Server error' });
};

// @route GET /api/client-mail/history
// Every mail ever sent, newest first, each with the figures of the month it
// was sent from. Not limited to one financial year: a mail log is a record.
router.get('/history', async (req, res) => {
  try {
    const entries = await RoyaltyAccounting.find(
      { 'mailLog.0': { $exists: true } },
      { royaltyType: 0, iprsEntries: 0, prsEntries: 0 }
    ).lean();

    const mails = entries.flatMap((e) => (e.mailLog || []).map((m, i) => ({
      id: `${e._id}-${i}`,
      entryId: String(e._id),
      index: i,
      sentAt: m.sentAt,
      ok: !!m.ok,
      isTest: !!m.isTest,
      mailType: m.mailType || '',
      subject: m.subject || '',
      to: m.to || '',
      intendedTo: m.intendedTo || '',
      cc: m.cc || '',
      // only mails sent before attachments were dropped have any
      attachments: m.attachments || [],
      error: m.error || '',
      byEmail: m.byEmail || '',
      // Mails from before the sender was recorded all went out as EMAIL_FROM.
      from: m.from || process.env.EMAIL_FROM || '',
      hasBody: !!m.html,
      entry: {
        clientId: e.clientId,
        clientName: e.clientName,
        month: e.month,
        year: e.year,
        status: e.status,
        royalty: SOCIETIES.reduce((t, s) => t + (e[SOCIETY_FIELDS[s].amount] || 0), 0),
        commission: e.totalCommission || 0,
        gst: e.currentMonthGst || 0,
        received: (e.currentMonthReceipt || 0) + (e.previousMonthReceipt || 0),
        tds: (e.currentMonthTds || 0) + (e.previousMonthTds || 0),
        opening: e.previousMonthOutstanding || 0,
        outstanding: e.totalOutstanding || 0,
      },
    })));

    mails.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
    res.json(mails);
  } catch (err) {
    sendError(res, err);
  }
});

// @route GET /api/client-mail/history/:entryId/:index
// The body of one sent mail, as it went out.
router.get('/history/:entryId/:index', async (req, res) => {
  try {
    const entry = await RoyaltyAccounting.findById(req.params.entryId, { mailLog: 1 }).lean().catch(() => null);
    const line = entry?.mailLog?.[parseInt(req.params.index, 10)];
    if (!line) return res.status(404).json({ message: 'Mail not found.' });
    res.json({ html: line.html || '' });
  } catch (err) {
    sendError(res, err);
  }
});

// @route GET /api/client-mail/:clientId/check
router.get('/:clientId/check', async (req, res) => {
  try {
    const { client, rows } = await load(req.params.clientId);
    if (!client) return res.status(404).json({ message: 'Client not found.' });

    await activity.recordView(req, { clientId: client.clientId, clientName: client.name, where: 'mail-wizard' });

    const { checks, ready } = checkClient(client, rows.length);
    const full = rows.length ? buildStatement(client, rows, { mode: 'full' }) : null;
    const context = mailContext(client, full, rows);
    const recipients = resolveRecipients(client, ACCOUNTS_EMAIL);

    // The last few mails sent to this client, from any month.
    const history = rows.flatMap((r) => (r.mailLog || []).map((m) => ({ ...m, html: undefined, month: r.month, year: r.year })))
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
      .slice(0, 5);

    res.json({
      client: {
        clientId: client.clientId, name: client.name, email: client.email, phone: client.phone,
        gstId: client.gstId, type: client.type, paymentAccount: client.paymentAccount,
      },
      checks,
      ready,
      context,
      types: describeTypes(client, context),
      defaultCc: ACCOUNTS_EMAIL,
      recipients,
      history,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// @route POST /api/client-mail/:clientId/preview
router.post('/:clientId/preview', async (req, res) => {
  try {
    const { client, recipients, mail } = await compose(req, { preview: true });
    res.json({
      subject: mail.subject,
      html: mail.html,
      recipients,
      // the links the mail carries, so they can be checked before sending
      statementLinks: {
        full: statementUrl(client.clientId, 'full'),
        outstanding: statementUrl(client.clientId, 'outstanding'),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

// @route POST /api/client-mail/:clientId/send
router.post('/:clientId/send', async (req, res) => {
  try {
    const { client, rows, recipients, mail } = await compose(req, { preview: false });
    if (recipients.blocked) return res.status(400).json({ message: recipients.blocked });

    const from = process.env.CLIENT_MAIL_FROM || process.env.EMAIL_FROM || '';
    const logLine = {
      sentAt: new Date(),
      from,
      html: mail.html,
      to: recipients.to.join(', '),
      intendedTo: recipients.intendedTo.join(', '),
      cc: recipients.cc.join(', '),
      subject: mail.subject,
      mailType: req.body.type,
      isTest: recipients.isTest,
      byEmail: req.user?.email || '',
    };

    try {
      await getClientTransporter().sendMail({
        // Client mail has its own sender (the accounts address); the internal
        // reports keep using EMAIL_FROM.
        from,
        to: recipients.to.join(', '),
        cc: recipients.cc.join(', '),
        replyTo: ACCOUNTS_EMAIL,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      logLine.ok = true;
    } catch (error) {
      logLine.ok = false;
      // A timeout means the mail server was never reached - almost always the
      // host blocking the port - which the bare message does not say.
      const unreachable = /timeout|ETIMEDOUT|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(`${error.code || ''} ${error.message}`);
      logLine.error = unreachable
        ? `${error.message} - this server could not reach the mail server (the hosting provider may be blocking the mail port).`
        : error.message;
    }

    // Logged on the month the wizard was opened from, else the latest month.
    const { month, year } = req.body;
    const target = rows.find((r) => r.month === month && r.year === Number(year)) || rows[rows.length - 1];
    if (target) {
      // Straight to the collection so recording a send does not count as editing the month.
      await RoyaltyAccounting.updateOne(
        { _id: target._id },
        { $push: { mailLog: logLine }, ...(logLine.ok ? { $set: { lastMailSentAt: logLine.sentAt } } : {}) },
        { timestamps: false }
      );
    }

    await activity.record(req, {
      action: logLine.ok ? 'mail.sent' : 'mail.failed',
      clientId: client.clientId,
      clientName: client.name,
      month: target?.month || '',
      year: target?.year,
      meta: {
        subject: logLine.subject, mailType: logLine.mailType, to: logLine.to,
        isTest: logLine.isTest, error: logLine.error || '',
      },
    });

    if (!logLine.ok) return res.status(502).json({ message: `The mail could not be sent: ${logLine.error}`, log: logLine });
    // The stored copy of the mail is not needed back.
    res.json({ ok: true, log: { ...logLine, html: undefined }, client: client.clientId });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
