// Helpers shared by the referral page, its modals and its exports.

const pad = (n) => String(n).padStart(2, '0');

// Local dates built by hand: toLocaleDateString('en-CA') is not 'YYYY-MM-DD'
// in every browser, and a date input left empty blocks the payout form.
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const thisMonth = () => today().slice(0, 7);
export const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const o = y * 12 + (m - 1) + n;
  return `${Math.floor(o / 12)}-${pad((o % 12) + 1)}`;
};

export const monthName = (ym) => (ym
  ? new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  : '');
export const dateName = (d) => (d
  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  : '');
export const errorOf = (err) => err?.response?.data?.message
  || (err?.request && !err?.response ? 'Cannot reach the server. Is it running?' : 'Something went wrong. Please try again.');

// Rupees, with paise only when there are any: referral is often ₹12.50.
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return Number.isInteger(v) ? inr0.format(v) : inr2.format(v);
};
// Compact for chart axes: ₹1.2L, ₹45K.
export const moneyShort = (n) => {
  const v = Math.abs(Number(n) || 0);
  const sign = n < 0 ? '-' : '';
  if (v >= 1e7) return `${sign}₹${(v / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (v >= 1e5) return `${sign}₹${(v / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (v >= 1e3) return `${sign}₹${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return `${sign}₹${Math.round(v)}`;
};
export const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
// A steady colour per referrer, from the app's accents.
const HUES = ['var(--accent-blue)', 'var(--accent-purple)', 'var(--accent-green)', 'var(--accent-orange)', '#e5709d', '#4fd1c5'];
export const hueOf = (name) => {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
};

export const MODES = [
  { id: 'bank', label: 'Bank transfer', ref: 'UTR / transaction no.' },
  { id: 'upi', label: 'UPI', ref: 'UPI reference no.' },
  { id: 'cheque', label: 'Cheque', ref: 'Cheque no.' },
  { id: 'cash', label: 'Cash', ref: 'Receipt no.' },
  { id: 'other', label: 'Other', ref: 'Reference' },
];
export const modeLabel = (id) => MODES.find((m) => m.id === id)?.label || 'Bank transfer';

// Where a deal stands this month.
export const dealStatus = (d, current = thisMonth()) => {
  if (d.fromMonth > current) return { id: 'later', label: 'Starts later' };
  if (d.toMonth && d.toMonth < current) return { id: 'off', label: 'Ended' };
  if (d.toMonth === current) return { id: 'ending', label: 'Ends this month' };
  return { id: 'on', label: 'Active' };
};
