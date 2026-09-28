// The client mail wizard's API. A mail is only ever sent by a person who has
// walked through: check the client master -> pick a letter -> fill it in ->
// preview it with its attachments -> send.
//
//   GET  /api/client-mail/:clientId/check           readiness + letter types + defaults
//   POST /api/client-mail/:clientId/preview         the rendered mail and attachment list
//   GET  /api/client-mail/:clientId/statement/:mode the PDF that would be attached
//   POST /api/client-mail/:clientId/send            send it and log it on the month

const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const RoyaltyAccounting = require('../models/RoyaltyAccounting');
const { authenticateToken } = require('../middleware/auth');
const { getClientTransporter } = require('../services/emailService');
const { buildStatement, calOrder } = require('../services/statementBuilder');
const { statementPdf, TITLES } = require('../services/statementPdf');
const { SOCIETIES, SOCIETY_FIELDS } = require('../utils/clientProfile');
const {
  MAIL_TYPES, ACCOUNTS_EMAIL, describeTypes, missingFields, checkClient, mailContext, resolveRecipients, renderMail,
} = require('../services/clientMail');

router.use(authenticateToken);

// Extra files (catalogue, registration report) arrive base64-encoded in the
// JSON body. Brevo refuses mails much over 10 MB in total.
const MAX_EXTRA_BYTES = 8 * 1024 * 1024;

// 'full' is the complete record, 'outstanding' the trimmed build-up of the balance.
const STATEMENTS = {
  full: { mode: 'full', title: TITLES.full },
  outstanding: { mode: 'window', title: TITLES.window },
};

const safeName = (s) => String(s || '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const statementFilename = (client, key) =>
  `MRM-${key === 'full' ? 'Statement-of-Account' : 'Outstanding-Summary'}-${safeName(client.clientId)}-${safeName(client.name)}.pdf`;

async function load(clientId) {
  const client = await Client.findOne({ clientId });
  if (!client) return {};
  const rows = (await RoyaltyAccounting.find({ clientId }).lean()).sort((a, b) => calOrder(a) - calOrder(b));
  return { client, rows };
}

async function buildPdf(client, rows, key) {
  const spec = STATEMENTS[key];
  if (!spec || !rows.length) return null;
  const st = buildStatement(client, rows, { mode: spec.mode });
  if (!st || st.empty) return null;
  st.paymentAccount = client.paymentAccount;
  return statementPdf(st);
}

// Everything the mail needs, rebuilt from the request each time so what is
// sent is exactly what was previewed.
async function compose(req, { preview }) {
  const { clientId } = req.params;
  const { type, values = {}, subject, cc, attach = {}, extraFiles = [] } = req.body || {};
  const fail = (status, message, extra) => Object.assign(new Error(message), { status, extra });

  if (!MAIL_TYPES[type]) throw fail(400, 'Choose a mail type.');
  const { client, rows } = await load(clientId);
  if (!client) throw fail(404, 'Client not found.');

  const { checks, ready } = checkClient(client, rows.length);
  if (!ready) throw fail(400, 'The client record is incomplete. Fix it before sending mail.', { checks });

  const missing = missingFields(type, values);
  if (missing.length) throw fail(400, `Fill in: ${missing.join(', ')}`);

  const attachments = [];
  for (const key of Object.keys(STATEMENTS)) {
    if (!attach[key]) continue;
    const content = await buildPdf(client, rows, key);
    if (content) attachments.push({ key, filename: statementFilename(client, key), content, generated: true });
  }

  let extraBytes = 0;
  for (const f of Array.isArray(extraFiles) ? extraFiles : []) {
    if (!f || !f.filename || !f.content) continue;
    const content = Buffer.from(String(f.content), 'base64');
    extraBytes += content.length;
    attachments.push({ key: 'upload', filename: String(f.filename).slice(0, 150), content, generated: false });
  }
  if (extraBytes > MAX_EXTRA_BYTES) throw fail(400, 'Uploaded files are too large (8 MB in total at most).');
  // Every letter refers to what is attached, so one must go with it.
  if (!attachments.length) throw fail(400, 'Attach at least one file: tick a statement or add a file.');

  const recipients = resolveRecipients(client, cc);
  // rows are in calendar order, so the last is the latest month held.
  const mail = renderMail({ type, client, values, subject, recipients, latest: rows[rows.length - 1], preview });
  return { client, rows, recipients, mail, attachments };
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

    const { checks, ready } = checkClient(client, rows.length);
    const full = rows.length ? buildStatement(client, rows, { mode: 'full' }) : null;
    const context = mailContext(client, full, rows);
    const recipients = resolveRecipients(client, ACCOUNTS_EMAIL);

    // The last few mails sent to this client, from any month.
    const history = rows.flatMap((r) => (r.mailLog || []).map((m) => ({ ...m, month: r.month, year: r.year })))
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
    const { recipients, mail, attachments } = await compose(req, { preview: true });
    res.json({
      subject: mail.subject,
      html: mail.html,
      recipients,
      attachments: attachments.map((a) => ({ key: a.key, filename: a.filename, size: a.content.length, generated: a.generated })),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// @route GET /api/client-mail/:clientId/statement/:key   (key: full | outstanding)
router.get('/:clientId/statement/:key', async (req, res) => {
  try {
    const { client, rows } = await load(req.params.clientId);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    if (!client.paymentAccount) return res.status(400).json({ message: 'Set a payment account on the client first.' });
    const pdf = await buildPdf(client, rows, req.params.key);
    if (!pdf) return res.status(404).json({ message: 'No statement for this client.' });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${statementFilename(client, req.params.key)}"`,
    }).send(pdf);
  } catch (err) {
    sendError(res, err);
  }
});

// @route POST /api/client-mail/:clientId/send
router.post('/:clientId/send', async (req, res) => {
  try {
    const { client, rows, recipients, mail, attachments } = await compose(req, { preview: false });
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
      attachments: attachments.map((a) => a.filename),
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
        attachments: attachments.map(({ filename, content }) => ({ filename, content })),
      });
      logLine.ok = true;
    } catch (error) {
      logLine.ok = false;
      logLine.error = error.message;
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

    if (!logLine.ok) return res.status(502).json({ message: `The mail could not be sent: ${logLine.error}`, log: logLine });
    res.json({ ok: true, log: logLine, client: client.clientId });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
