// Client master rules shared by the Client model, the clients API and the
// migration script: which societies exist, how the royalty label is built from
// the client type + societies, and how contact details are tidied and checked.
//
// The client app keeps a mirror of these rules in client/src/utils/clientProfile.js
// (CRA cannot import from outside src) - change both together.

// Canonical order. The royalty label lists societies in this order, which
// reproduces every well-formed label already in use.
const SOCIETIES = ['IPRS', 'PRS', 'ASCAP', 'BMI', 'SOCAN', 'MLC', 'ISAMRA', 'Sound Exchange', 'PPL'];

const DEFAULT_CLIENT_TYPE = 'Royalty';

// Spellings found in historical labels, keyed in lower case.
const SOCIETY_ALIASES = {
  iprs: 'IPRS',
  prs: 'PRS',
  ascap: 'ASCAP',
  bmi: 'BMI',
  socan: 'SOCAN',
  mlc: 'MLC',
  isamra: 'ISAMRA',
  'sound exchange': 'Sound Exchange',
  soundexchange: 'Sound Exchange',
  'sound exchang': 'Sound Exchange',
  ppl: 'PPL',
  pple: 'PPL',
  'ppl(india)': 'PPL',
  'ppl (india)': 'PPL',
  'ppl india': 'PPL',
};

const LABEL_DASH = ' – ';

const canonicalSociety = (name) => {
  const key = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return SOCIETY_ALIASES[key] || null;
};

/** Canonical, de-duplicated, ordered society list. Unknown names are kept (so validation can report them). */
function normalizeSocieties(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(/\s*[+,&/]\s*/);
  const known = new Set();
  const unknown = [];
  for (const raw of list) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;
    const canon = canonicalSociety(trimmed);
    if (canon) known.add(canon);
    else if (!unknown.includes(trimmed)) unknown.push(trimmed);
  }
  return [...SOCIETIES.filter((s) => known.has(s)), ...unknown];
}

/** Split a society list ("IPRS + PRS", "IPRS -PRS", "IPRS PRS") into known societies and leftover text. */
function parseSocietyList(text) {
  const societies = [];
  const residue = [];
  const parts = String(text || '')
    .split(/\s*[+,&/]\s*|\s+-\s*|\s*-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const whole = canonicalSociety(part);
    if (whole) { societies.push(whole); continue; }
    const words = part.split(/\s+/);
    const each = words.map(canonicalSociety);
    if (each.every(Boolean)) { societies.push(...each); continue; }
    residue.push(part);
  }
  return { societies: normalizeSocieties(societies), residue };
}

/**
 * Read a free-text royalty label into its parts.
 *   "Royalty – IPRS + PRS"  -> { clientType: 'Royalty', societies: ['IPRS', 'PRS'], residue: [] }
 *   "In House"              -> { clientType: 'In House', societies: [], residue: [] }
 *   "IPRS PRS"              -> { clientType: 'Royalty', societies: ['IPRS', 'PRS'], residue: [] }
 * `residue` holds any text that is neither the type nor a known society.
 */
function parseTypeLabel(label) {
  const text = String(label || '').replace(/\s+/g, ' ').trim();
  if (!text) return { clientType: '', societies: [], residue: [] };

  const royalty = text.match(/^royalty\b\s*[–—-]?\s*/i);
  if (royalty) {
    return { clientType: DEFAULT_CLIENT_TYPE, ...parseSocietyList(text.slice(royalty[0].length)) };
  }

  const dash = text.match(/^(.*?)\s*[–—]\s*(.*)$/);
  if (dash && !parseSocietyList(dash[1]).societies.length) {
    return { clientType: dash[1].trim(), ...parseSocietyList(dash[2]) };
  }

  const asList = parseSocietyList(text);
  if (asList.societies.length) return { clientType: DEFAULT_CLIENT_TYPE, ...asList };
  return { clientType: text, societies: [], residue: [] };
}

/** "Royalty" + ['IPRS', 'PRS'] -> "Royalty – IPRS + PRS"; a type with no societies is its own label. */
function composeTypeLabel(clientType, societies) {
  const list = normalizeSocieties(societies);
  const kind = String(clientType || '').trim() || (list.length ? DEFAULT_CLIENT_TYPE : '');
  return list.length ? `${kind}${LABEL_DASH}${list.join(' + ')}` : kind;
}

// ---- Contact details --------------------------------------------------------

const splitList = (value) => String(value || '').split(/[,;/\n]+/).map((v) => v.trim()).filter(Boolean);

/** Tidy one or more phone numbers: Indian numbers become 10 digits, others keep a leading +. */
function normalizePhone(value) {
  const out = [];
  for (const item of splitList(value)) {
    const plus = item.trim().startsWith('+');
    let digits = item.replace(/\D/g, '');
    if (/^91\d{10}$/.test(digits)) digits = digits.slice(2);
    else if (/^0\d{10}$/.test(digits)) digits = digits.slice(1);
    const tidy = digits.length === 10 || !plus ? digits : `+${digits}`;
    if (tidy && !out.includes(tidy)) out.push(tidy);
  }
  return out.join(', ');
}

/** Lower-case, de-duplicate and comma-separate one or more email addresses. */
function normalizeEmail(value) {
  const out = [];
  for (const item of String(value || '').split(/[\s,;]+/)) {
    const email = item.trim().toLowerCase();
    if (email && !out.includes(email)) out.push(email);
  }
  return out.join(', ');
}

const normalizeGstId = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();

const PHONE_RE = /^\+?\d{7,15}$/;
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
// 15-character GSTIN: state code, PAN, entity number, 'Z', checksum
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const invalidPhones = (value) => splitList(value).filter((p) => !PHONE_RE.test(p));
const invalidEmails = (value) => String(value || '').split(/\s*,\s*/).filter(Boolean).filter((e) => !EMAIL_RE.test(e));
const isValidGstId = (value) => !value || GSTIN_RE.test(value);

// Which columns on a monthly entry hold each society's money. Societies live on
// the client; this maps them to the entry fields that carry the amounts.
const SOCIETY_FIELDS = {
  'IPRS': { amount: 'iprsAmount', commission: 'iprsCommission' },
  'PRS': { amount: 'prsAmount', commission: 'prsCommission' },
  'ASCAP': { amount: 'ascapAmount', commission: 'ascapCommission' },
  'BMI': { amount: 'bmiAmount', commission: 'bmiCommission' },
  'SOCAN': { amount: 'socanAmount', commission: 'socanCommission' },
  'MLC': { amount: 'mlcAmount', commission: 'mlcCommission' },
  'ISAMRA': { amount: 'isamraAmount', commission: 'isamraCommission' },
  'Sound Exchange': { amount: 'soundExchangeAmount', commission: 'soundExchangeCommission' },
  'PPL': { amount: 'pplAmount', commission: 'pplCommission' },
};

const COMMISSION_MODES = ['flat', 'per-society'];
const DEFAULT_COMMISSION_MODE = 'flat';

/**
 * Commission rate for one society, as a percentage.
 *
 * Anything not explicitly in per-society mode - which includes every client and
 * every entry saved before per-society rates existed - uses the single
 * commissionRate, so historical figures recompute exactly as before.
 *
 * Works on both Mongoose documents and plain objects, because computeFields
 * runs against both.
 */
function societyRate(doc, society) {
  const flat = Number(doc && doc.commissionRate) || 0;
  if (!doc || doc.commissionMode !== 'per-society') return flat;
  const list = Array.isArray(doc.societyCommissions) ? doc.societyCommissions : [];
  const hit = list.find((r) => r && r.society === society);
  // A society with no rate falls back to the flat rate rather than to zero:
  // validation blocks that case, so reaching here means older or imported data,
  // and silently charging 0% commission would be the costlier failure.
  return hit && hit.rate != null && !Number.isNaN(Number(hit.rate)) ? Number(hit.rate) : flat;
}

/** Societies the client has selected but given no rate. Empty unless per-society. */
function missingSocietyRates(client) {
  if (!client || client.commissionMode !== 'per-society') return [];
  const list = Array.isArray(client.societyCommissions) ? client.societyCommissions : [];
  return (client.societies || []).filter((s) => {
    const hit = list.find((r) => r && r.society === s);
    return !hit || hit.rate == null || Number.isNaN(Number(hit.rate));
  });
}

/** Keep only rates for societies the client still has, in canonical order. */
function normalizeSocietyCommissions(list, societies) {
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

module.exports = {
  SOCIETIES,
  SOCIETY_FIELDS,
  COMMISSION_MODES,
  DEFAULT_COMMISSION_MODE,
  societyRate,
  missingSocietyRates,
  normalizeSocietyCommissions,
  DEFAULT_CLIENT_TYPE,
  normalizeSocieties,
  parseTypeLabel,
  composeTypeLabel,
  normalizePhone,
  normalizeEmail,
  normalizeGstId,
  invalidPhones,
  invalidEmails,
  isValidGstId,
};
