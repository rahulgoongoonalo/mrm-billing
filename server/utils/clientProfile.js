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

module.exports = {
  SOCIETIES,
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
