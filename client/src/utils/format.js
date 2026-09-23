// Shared display helpers for the routed pages.

export const MONTH_LABELS = {
  apr: 'April', may: 'May', jun: 'June', jul: 'July',
  aug: 'August', sep: 'September', oct: 'October', nov: 'November',
  dec: 'December', jan: 'January', feb: 'February', mar: 'March',
};

export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);

export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString('en-IN') : '—';
