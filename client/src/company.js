// The companies (portals) this app serves, and which one this tab is using.
//
// Every company runs the same software on its own data (the server keeps each
// in its own database). The company is fixed for a browser tab when the page
// loads: switching reloads the page, so nothing from one company is ever on
// screen - or saved - while another is selected. Each tab remembers its own
// company, and a new tab opens on the one used last.
//
// Keep the keys in step with server/config/companies.js.

export const COMPANIES = {
  mrm: {
    key: 'mrm',
    name: 'Music Rights Management',
    appName: 'MRM Billing',
    // Wording such as "brings clients to MRM", "MRM ID".
    brand: 'MRM',
    // Badge text in the sidebar / login logo tile.
    badge: 'MRM',
    // Prefix for new client IDs (MRM-250).
    idPrefix: 'MRM',
    logo: 'mrm-logo.png',
    // Small logo for the company switcher (circle + MRM, no tagline).
    mark: 'mrm-mark.png',
    // Bank account: chosen per client; a client with none pays into the GST one.
    paymentAccount: null,
    defaultPaymentAccount: 'gst',
    clientMail: true,
  },
  kangabeats: {
    key: 'kangabeats',
    name: 'Kangabeats',
    appName: 'Kangabeats Billing',
    brand: 'Kangabeats',
    badge: 'KB',
    idPrefix: 'KB',
    // Upright logo (client/public), shown smaller on the login screen.
    logo: 'kangabeats-logo.png',
    mark: 'kangabeats-mark.png',
    // Kangabeats is non-GST: every client pays into the Kangabeat account,
    // so the form shows it instead of offering a choice.
    paymentAccount: 'non-gst',
    defaultPaymentAccount: 'non-gst',
    // Client mail goes from MRM's accounts@ mailbox under the name Kangabeats.
    clientMail: true,
  },
};

export const COMPANY_LIST = Object.values(COMPANIES);
export const DEFAULT_COMPANY = 'mrm';

const TAB_KEY = 'company';          // sessionStorage: this tab's company
const LAST_KEY = 'lastCompany';     // localStorage: default for new tabs

const read = (store, key) => {
  try { return store.getItem(key); } catch (e) { return null; }
};
const write = (store, key, value) => {
  try { store.setItem(key, value); } catch (e) { /* storage unavailable */ }
};

function initialCompanyKey() {
  const fromTab = read(sessionStorage, TAB_KEY);
  if (COMPANIES[fromTab]) return fromTab;
  const last = read(localStorage, LAST_KEY);
  const key = COMPANIES[last] ? last : DEFAULT_COMPANY;
  write(sessionStorage, TAB_KEY, key);
  return key;
}

// Read once, at page load, and never changed without a reload.
const CURRENT_KEY = initialCompanyKey();

export const COMPANY = COMPANIES[CURRENT_KEY];
export const isDefaultCompany = CURRENT_KEY === DEFAULT_COMPANY;

// "?co=kangabeats" style suffix for public statement links (empty for MRM,
// so MRM links stay exactly as they always were).
export const statementCompanyQuery = isDefaultCompany ? '' : `&co=${CURRENT_KEY}`;

// Switch this tab to another company: reloads into a clean app on its data.
export function switchCompany(key) {
  if (!COMPANIES[key] || key === CURRENT_KEY) return;
  write(sessionStorage, TAB_KEY, key);
  write(localStorage, LAST_KEY, key);
  // Land on the home screen of the other portal rather than a deep link.
  window.location.hash = '';
  window.location.reload();
}

// Mark the page so styles can tell the portals apart at a glance.
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-company', CURRENT_KEY);
  document.title = isDefaultCompany ? document.title : `${COMPANY.appName} Data Entry`;
}
