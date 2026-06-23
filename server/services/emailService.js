const nodemailer = require('nodemailer');

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    // Port hardcoded to 465 (implicit TLS), NOT read from env: some hosts block
    // outbound 587, so we pin the SSL port to avoid relying on a server env var.
    transporter = nodemailer.createTransport({
      service: 'gmail',
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: 465,
      secure: true, // 465 = implicit TLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      // Fail fast instead of hanging ~2 min when outbound SMTP is blocked.
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    });
  }
  return transporter;
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
