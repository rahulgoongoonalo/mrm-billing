// Shared bits for the scheduled report mails, which cover every company
// (MRM and Kangabeats) in one mail and name the company on each client.

const { COMPANIES, COMPANY_KEYS, DEFAULT_COMPANY } = require('../config/companies');

// "Music Rights Management & Kangabeats" - the report header.
const REPORT_COMPANIES = COMPANY_KEYS.map((k) => COMPANIES[k].name).join(' &amp; ');
// "MRM & Kangabeats" - the mail subject.
const REPORT_SUBJECT_BRANDS = COMPANY_KEYS.map((k) => COMPANIES[k].brand).join(' & ');

const TAG_COLOURS = {
  mrm: { bg: '#e8f0fb', fg: '#1F3864', border: '#cfdcf0' },
  kangabeats: { bg: '#fdf0e6', fg: '#a3471a', border: '#f5d4bd' },
};

// Small company label for a client row, e.g. [MRM] or [Kangabeats].
function companyTag(key = DEFAULT_COMPANY) {
  const c = COMPANIES[key] || COMPANIES[DEFAULT_COMPANY];
  const t = TAG_COLOURS[c.key] || TAG_COLOURS[DEFAULT_COMPANY];
  return `<span style="display:inline-block;font-family:'Segoe UI',system-ui,sans-serif;font-size:10px;font-weight:700;letter-spacing:.3px;line-height:1.5;padding:0 6px;border-radius:4px;background:${t.bg};color:${t.fg};border:1px solid ${t.border};margin-left:6px;vertical-align:1px;">${c.brand}</span>`;
}

const companyName = (key) => (COMPANIES[key] || COMPANIES[DEFAULT_COMPANY]).brand;

module.exports = { REPORT_COMPANIES, REPORT_SUBJECT_BRANDS, companyTag, companyName, COMPANY_KEYS };
