// Single source of truth for the sidebar. Every destination in the app is
// listed here once - the sidebar, the top bar title and the URL hash all read
// from this list, so adding a page means adding one entry.
//
// Ids under REPORT_VIEWS must match the `activeReport` values inside
// ReportsPanel, which renders those pages.

export const NAV_GROUPS = [
  {
    title: 'Workspace',
    items: [
      {
        id: 'data-entry',
        label: 'Data Entry',
        icon: 'edit',
        title: 'Royalty Data Entry',
        subtitle: 'Select a client and record this month’s royalty figures',
      },
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: 'home',
        title: 'Dashboard',
        subtitle: 'Overview of royalty accounting across the financial year',
      },
    ],
  },
  {
    title: 'Clients',
    items: [
      {
        id: 'client-master',
        label: 'Client Master',
        icon: 'users',
        title: 'Client Master',
        subtitle: 'Add, edit and remove clients, rates, societies and contact details',
      },
      {
        id: 'society-contracts',
        label: 'Society Contracts',
        icon: 'briefcase',
        title: 'Society Contracts',
        subtitle: 'Contract start and end dates per society',
      },
    ],
  },
  {
    title: 'Reports',
    items: [
      {
        id: 'client-report',
        label: 'Client Report',
        icon: 'file-text',
        title: 'Client Report',
        subtitle: 'Full royalty and commission history for one client',
      },
      {
        id: 'commission',
        label: 'Commission',
        icon: 'percent',
        title: 'Commission Report',
        subtitle: 'Commission earned per client and per month',
      },
      {
        id: 'outstanding',
        label: 'Outstanding',
        icon: 'alert',
        title: 'Outstanding Report',
        subtitle: 'What each client still owes, by month',
      },
      {
        id: 'receipts-tds',
        label: 'Receipts & TDS',
        icon: 'credit-card',
        title: 'Receipts & TDS',
        subtitle: 'Payments received and tax deducted at source',
      },
      {
        id: 'gst-invoice',
        label: 'GST Invoice',
        icon: 'clipboard',
        title: 'GST Invoice',
        subtitle: 'Invoice figures with GST per client',
      },
      {
        id: 'whatsapp',
        label: 'Whatsapp Report',
        icon: 'message',
        title: 'Whatsapp Report',
        subtitle: 'Short summaries formatted to send to clients',
      },
    ],
  },
  {
    title: 'Data',
    items: [
      {
        id: 'entries',
        label: 'All Entries',
        icon: 'list',
        title: 'All Entries',
        subtitle: 'Every saved entry across all months, newest first',
      },
      {
        id: 'export',
        label: 'Export',
        icon: 'download',
        title: 'Export Data',
        subtitle: 'Download royalty entries or the client list as CSV',
      },
    ],
  },
  {
    title: 'System',
    items: [
      {
        id: 'settings',
        label: 'Settings',
        icon: 'settings',
        title: 'Settings',
        subtitle: 'Financial year and application preferences',
      },
    ],
  },
];

// Pages that ReportsPanel owns. Everything else has its own component.
export const REPORT_VIEWS = [
  'dashboard',
  'client-master',
  'client-report',
  'commission',
  'outstanding',
  'receipts-tds',
  'gst-invoice',
  'whatsapp',
  'society-contracts',
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

// Stable identity - useHashRoute holds this in a dependency array.
export const NAV_IDS = NAV_ITEMS.map((item) => item.id);

export const DEFAULT_VIEW = 'data-entry';

export const getNavItem = (id) =>
  NAV_ITEMS.find((item) => item.id === id) || NAV_ITEMS[0];
