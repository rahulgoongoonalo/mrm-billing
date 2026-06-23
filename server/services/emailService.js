const nodemailer = require('nodemailer');

let smtpTransporter = null;

// SMTP transport (Gmail) — used locally / as a fallback when BREVO_API_KEY is
// not set. Pinned to 465 (implicit TLS) since some hosts block outbound 587.
const getSmtpTransporter = () => {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      service: 'gmail',
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    });
  }
  return smtpTransporter;
};

// "MRM Billing <a@b.com>" -> { name: 'MRM Billing', email: 'a@b.com' }
function parseSender(from) {
  const m = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(from || '');
  if (m && m[2]) return { name: m[1] || undefined, email: m[2].trim() };
  return { email: (from || '').trim() };
}

// "a@x.com, b@y.com" -> [{ email: 'a@x.com' }, { email: 'b@y.com' }]
function parseRecipients(to) {
  return String(to || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(email => ({ email }));
}

// Send via Brevo's transactional HTTP API (port 443) — bypasses hosts that
// block outbound SMTP. Same call signature as nodemailer's sendMail.
async function brevoSendMail({ from, to, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      'accept': 'application/json'
    },
    body: JSON.stringify({
      sender: parseSender(from || process.env.EMAIL_FROM),
      to: parseRecipients(to),
      subject,
      htmlContent: html
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API ${res.status}: ${body}`);
  }
  return res.json().catch(() => ({}));
}

// Drop-in transporter: Brevo HTTP API when BREVO_API_KEY is set, else SMTP.
// Both expose sendMail({ from, to, subject, html }) so call sites don't change.
const getTransporter = () => {
  if (process.env.BREVO_API_KEY) {
    return { sendMail: brevoSendMail };
  }
  return getSmtpTransporter();
};

const sendVerificationEmail = async (email, token, name) => {
  const verificationUrl = `${process.env.APP_URL}/?token=${token}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Verify Your MRM Billing Account',
    html: `
      <h2>Welcome to MRM Billing, ${name}!</h2>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
      <p>Or copy this link: ${verificationUrl}</p>
      <p>This link expires in 24 hours.</p>
      <p>If you didn't create this account, please ignore this email.</p>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

const sendPasswordResetEmail = async (email, token, name) => {
  const resetUrl = `${process.env.APP_URL}/?resetToken=${token}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Reset Your MRM Billing Password',
    html: `
      <h2>Password Reset Request</h2>
      <p>Hi ${name},</p>
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
      <p>Or copy this link: ${resetUrl}</p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

module.exports = {
  getTransporter,
  sendVerificationEmail,
  sendPasswordResetEmail
};
