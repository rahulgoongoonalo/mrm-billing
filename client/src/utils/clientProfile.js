// Client master rules: societies, the royalty label built from client type +
// societies, and contact-detail tidying/validation.
//
// Mirror of server/utils/clientProfile.js - the server applies the same rules on
// save, so change both together.

export const SOCIETIES = ['IPRS', 'PRS', 'ASCAP', 'BMI', 'SOCAN', 'MLC', 'ISAMRA', 'Sound Exchange', 'PPL'];

export const DEFAULT_CLIENT_TYPE = 'Royalty';

// Which columns on a monthly entry hold each society's money. The label is what
// the data-entry form prints above each amount box.
export const SOCIETY_FIELDS = {
  'IPRS': { amount: 'iprsAmount', commission: 'iprsCommission', label: 'IPRS Amount' },
  'PRS': { amount: 'prsAmount', commission: 'prsCommission', label: 'PRS Amount (INR)' },
  'ASCAP': { amount: 'ascapAmount', commission: 'ascapCommission', label: 'ASCAP Amount' },
  'BMI': { amount: 'bmiAmount', commission: 'bmiCommission', label: 'BMI Amount' },
  'SOCAN': { amount: 'socanAmount', commission: 'socanCommission', label: 'SOCAN Amount' },
  'MLC': { amount: 'mlcAmount', commission: 'mlcCommission', label: 'MLC Amount' },
  'ISAMRA': { amount: 'isamraAmount', commission: 'isamraCommission', label: 'ISAMRA Amount' },
  'Sound Exchange': { amount: 'soundExchangeAmount', commission: 'soundExchangeCommission', label: 'Sound Exchange Amount' },
  'PPL': { amount: 'pplAmount', commission: 'pplCommission', label: 'PPL Amount' },
};

export const COMMISSION_MODES = ['flat', 'per-society'];
export const DEFAULT_COMMISSION_MODE = 'flat';

/**
 * Commission rate for one society, as a percentage.
 *
 * Anything not explicitly in per-society mode - which includes every client and
 * entry saved before per-society rates existed - uses the single commissionRate.
 */
export function societyRate(doc, society) {
  const flat = Number(doc && doc.commissionRate) || 0;
  if (!doc || doc.commissionMode !== 'per-society') return flat;
  const list = Array.isArray(doc.societyCommissions) ? doc.societyCommissions : [];
  const hit = list.find((r) => r && r.society === society);
  // Falls back to the flat rate rather than zero: the form blocks this case, so
  // reaching here means older data, and charging 0% would be the costlier bug.
  return hit && hit.rate != null && !Number.isNaN(Number(hit.rate)) ? Number(hit.rate) : flat;
}

/** Societies the client has selected but given no rate. Empty unless per-society. */
export function missingSocietyRates(client) {
  if (!client || client.commissionMode !== 'per-society') return [];
  const list = Array.isArray(client.societyCommissions) ? client.societyCommissions : [];
  return (client.societies || []).filter((s) => {
    const hit = list.find((r) => r && r.society === s);
    return !hit || hit.rate == null || Number.isNaN(Number(hit.rate));
  });
}

/** Keep only rates for societies the client still has, in canonical order. */
export function normalizeSocietyCommissions(list, societies) {
  const src = Array.isArray(list) ? list : [];
  const keep = new Set(societies || []);
  return SOCIETIES.filter((s) => keep.has(s)).reduce((out, s) => {
    const hit = src.find((r) => r && r.society === s);
    if (hit && hit.rate != null && !Number.isNaN(Number(hit.rate))) {
      out.push({ society: s, rate: Number(hit.rate) });
    }
    return out;
  }, []);
}

const SOCIETY_ALIASES = {
  iprs: 'IPRS', prs: 'PRS', ascap: 'ASCAP', bmi: 'BMI', socan: 'SOCAN', mlc: 'MLC', isamra: 'ISAMRA',
  'sound exchange': 'Sound Exchange', soundexchange: 'Sound Exchange', 'sound exchang': 'Sound Exchange',
  ppl: 'PPL', pple: 'PPL', 'ppl(india)': 'PPL', 'ppl (india)': 'PPL', 'ppl india': 'PPL',
};

const canonicalSociety = (name) => SOCIETY_ALIASES[String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')] || null;

export const societyClass = (s) => 'society-' + String(s).toLowerCase().replace(/\s+/g, '');

export function normalizeSocieties(list) {
  const known = new Set((list || []).map(canonicalSociety).filter(Boolean));
  return SOCIETIES.filter((s) => known.has(s));
}

function parseSocietyList(text) {
  const societies = [];
  const residue = [];
  String(text || '')
    .split(/\s*[+,&/]\s*|\s+-\s*|\s*-\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((part) => {
      const whole = canonicalSociety(part);
      if (whole) { societies.push(whole); return; }
      const each = part.split(/\s+/).map(canonicalSociety);
      if (each.every(Boolean)) societies.push(...each);
      else residue.push(part);
    });
  return { societies: normalizeSocieties(societies), residue };
}

/** "Royalty – IPRS + PRS" -> { clientType: 'Royalty', societies: ['IPRS', 'PRS'] } */
export function parseTypeLabel(label) {
  const text = String(label || '').replace(/\s+/g, ' ').trim();
  if (!text) return { clientType: '', societies: [], residue: [] };
  const royalty = text.match(/^royalty\b\s*[–—-]?\s*/i);
  if (royalty) return { clientType: DEFAULT_CLIENT_TYPE, ...parseSocietyList(text.slice(royalty[0].length)) };
  const dash = text.match(/^(.*?)\s*[–—]\s*(.*)$/);
  if (dash && !parseSocietyList(dash[1]).societies.length) return { clientType: dash[1].trim(), ...parseSocietyList(dash[2]) };
  const asList = parseSocietyList(text);
  if (asList.societies.length) return { clientType: DEFAULT_CLIENT_TYPE, ...asList };
  return { clientType: text, societies: [], residue: [] };
}

/** "Royalty" + ['IPRS', 'PRS'] -> "Royalty – IPRS + PRS" */
export function composeTypeLabel(clientType, societies) {
  const list = normalizeSocieties(societies);
  const kind = String(clientType || '').trim() || (list.length ? DEFAULT_CLIENT_TYPE : '');
  return list.length ? `${kind} – ${list.join(' + ')}` : kind;
}

/** A client's type and societies, read from the label for records saved before they were stored. */
export function profileOf(client) {
  if (!client) return { clientType: DEFAULT_CLIENT_TYPE, societies: [] };
  const stored = Array.isArray(client.societies) ? client.societies : [];
  const typeIsSociety = !!canonicalSociety(client.clientType);
  if ((stored.length || client.clientType) && !typeIsSociety) {
    return { clientType: client.clientType || DEFAULT_CLIENT_TYPE, societies: normalizeSocieties(stored) };
  }
  const parsed = parseTypeLabel(client.type);
  return { clientType: parsed.clientType || DEFAULT_CLIENT_TYPE, societies: parsed.societies };
}

// ---- Contact details --------------------------------------------------------

const splitList = (value) => String(value || '').split(/[,;/\n]+/).map((v) => v.trim()).filter(Boolean);

export function normalizePhone(value) {
  const out = [];
  splitList(value).forEach((item) => {
    const plus = item.startsWith('+');
    let digits = item.replace(/\D/g, '');
    if (/^91\d{10}$/.test(digits)) digits = digits.slice(2);
    else if (/^0\d{10}$/.test(digits)) digits = digits.slice(1);
    const tidy = digits.length === 10 || !plus ? digits : `+${digits}`;
    if (tidy && !out.includes(tidy)) out.push(tidy);
  });
  return out.join(', ');
}

export function normalizeEmail(value) {
  const out = [];
  String(value || '').split(/[\s,;]+/).forEach((item) => {
    const email = item.trim().toLowerCase();
    if (email && !out.includes(email)) out.push(email);
  });
  return out.join(', ');
}

export const normalizeGstId = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();

const PHONE_RE = /^\+?\d{7,15}$/;
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Error message for each contact field, or '' when the (tidied) value is fine. Blank is always fine. */
export function contactErrors({ phone, email, gstId }) {
  const badPhones = splitList(normalizePhone(phone)).filter((p) => !PHONE_RE.test(p));
  const badEmails = normalizeEmail(email).split(/\s*,\s*/).filter(Boolean).filter((e) => !EMAIL_RE.test(e));
  const gst = normalizeGstId(gstId);
  return {
    phone: badPhones.length ? `Not a phone number: ${badPhones.join(', ')}` : '',
    email: badEmails.length ? `Not an email address: ${badEmails.join(', ')}` : '',
    gstId: gst && !GSTIN_RE.test(gst) ? 'GSTIN is 15 characters, e.g. 27AAPFU0939F1ZV' : '',
  };
}

// ---- Export -----------------------------------------------------------------

const csvCell = (value) => {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const commissionOf = (c) => c.commissionRate ?? Math.round((c.fee || 0) * 10000) / 100;

/** Commission as a person reads it: "15%", or "IPRS 15% + PRS 20%" per society. */
export function commissionSummary(c) {
  if (c?.commissionMode !== 'per-society') return `${commissionOf(c)}%`;
  const rates = normalizeSocietyCommissions(c.societyCommissions, c.societies);
  if (!rates.length) return `${commissionOf(c)}%`;
  return rates.map((r) => `${r.society} ${r.rate}%`).join(' + ');
}

/** Client master as CSV, one row per client, in the column order of the client master sheet. */
export function buildClientMasterCsv(clients) {
  const header = ['Client ID', 'Client Name', 'Client Type', 'Society', 'Commission Rate', 'GST Rate', 'Phone No', 'Email', 'GST ID', 'Status'];
  const rows = clients.map((c) => {
    const { clientType, societies } = profileOf(c);
    return [
      c.clientId,
      c.name,
      clientType,
      societies.join(' + '),
      commissionSummary(c),
      `${c.gstRate ?? 18}%`,
      c.phone || '',
      c.email || '',
      c.gstId || '',
      c.isActive === false ? 'Inactive' : 'Active',
    ];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** Save text as a file; the BOM lets Excel read the en dash and other non-ASCII names. */
export function downloadCsv(csv, filename) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
