// The companies (portals) this app serves. Every company runs the same
// software on its own data: each has its own MongoDB database on the same
// cluster, so one company's clients, entries and reports never mix with
// another's.
//
// MRM is the original company. Its `dbName` is null, which means "the database
// named in MONGODB_URI" - the exact database MRM always used, untouched.
//
// Logins (users) are shared: one account can open either portal.

const COMPANIES = {
  mrm: {
    key: 'mrm',
    dbName: null,
    name: 'Music Rights Management',
    shortName: 'MRM',
    // Used in wording such as "Payments Received by MRM".
    brand: 'MRM',
    legalName: 'Samraj Music Rights Management',
    // Letterhead logo on statement pages (server/assets). null = text only.
    logoFile: 'mrm-logo.png',
    logoAlt: 'MRM | Music Rights Management',
    // Bank account clients pay into (keys of utils/paymentAccounts.js).
    // MRM: set per client (With GST / Without GST); a client with none set
    // pays into the GST account. Clients are never asked to choose.
    paymentAccount: null,
    defaultPaymentAccount: 'gst',
    // Outgoing scheduled mails (outstanding report, team reports, low royalty)
    // run only for companies with this switched on.
    scheduledMail: true,
    // Client mail (mail wizard) can be sent for this company.
    clientMail: true,
    // Client mail letterhead and signature (services/clientMail.js).
    mail: {
      // Sender display name; null = CLIENT_MAIL_FROM exactly as set in .env.
      fromName: null,
      signatureLine: 'Music Rights Management – MRM India',
      address: [
        'Samraj Music Rights Management Pvt. Ltd,',
        'Hotel Samraj Building,',
        'Near Chevrolet Showroom,',
        'Chakala Road, Andheri (E)',
        'Mumbai- 400099',
      ],
      website: 'https://www.musicrightsmanagementindia.com',
      logoFile: 'mrm-mail-logo.png',
      // Mail clients block data: images, so sent mail links a public copy
      // (MAIL_LOGO_URL overrides it, for MRM only).
      publicLogoUrl: 'https://billing.musicrightsmanagement.in/Original%20on%20transparent.png',
      logoAlt: 'MRM | Music Rights Management',
      logoWidth: 260,
      logoHeight: 91,
    },
  },
  kangabeats: {
    key: 'kangabeats',
    dbName: process.env.KANGABEATS_DB_NAME || 'kangabeats_billing',
    name: 'Kangabeats',
    shortName: 'KB',
    brand: 'Kangabeats',
    legalName: 'Kangabeat Entertainment Pvt. Ltd.',
    // Statement page leaves out "GST 18%" and "exclusive of GST" (MRM keeps them).
    statementGstNotes: false,
    logoFile: 'kangabeats-logo.png',
    logoAlt: 'Kangabeats',
    // The logo is upright, so it is shown taller than MRM's wide one.
    logoHeight: 64,
    // Kangabeats is non-GST: every client pays into the Kangabeat account.
    paymentAccount: 'non-gst',
    defaultPaymentAccount: 'non-gst',
    // Scheduled reports stay MRM-only (they go to MRM's managers).
    scheduledMail: false,
    // Client mail goes from MRM's accounts@ mailbox (Kangabeats has none of
    // its own), under the name "Kangabeats", with Kangabeats' letterhead.
    clientMail: true,
    mail: {
      fromName: 'Kangabeats',
      signatureLine: 'Kangabeats',
      address: [
        'Kangabeat Entertainment Pvt. Ltd.,',
        'Hotel Samraj Building,',
        'Near Chevrolet Showroom,',
        'Chakala Road, Andheri (E)',
        'Mumbai- 400099',
      ],
      website: null,
      logoFile: 'kangabeats-mail-logo.png',
      // Sent inside the mail itself (an inline image), so it shows whether or
      // not the web app is deployed. publicLogoUrl is the fallback for a mail
      // service that cannot embed images, and for the Mail History copy.
      embedLogo: true,
      publicLogoUrl: 'https://billing.musicrightsmanagement.in/kangabeats-logo.png',
      logoAlt: 'Kangabeats',
      logoWidth: 150,
      logoHeight: 165,
    },
  },
};

const DEFAULT_COMPANY = 'mrm';
const COMPANY_KEYS = Object.keys(COMPANIES);

const isCompanyKey = (key) => Object.prototype.hasOwnProperty.call(COMPANIES, key);

module.exports = { COMPANIES, COMPANY_KEYS, DEFAULT_COMPANY, isCompanyKey };
