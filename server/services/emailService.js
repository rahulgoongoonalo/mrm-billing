const nodemailer = require('nodemailer');

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
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
