// Shared aggregation + email rendering for the daily outstanding notification.
// Single source of truth used by both the production notifier
// (services/outstandingNotification.js) and the test script
// (scripts/testOutstandingMail.js) so the test mail and the real mail are identical.

const monthOrder = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];
const calMonthIdx = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const calMonthName = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const monthLabels = {
  apr: 'April', may: 'May', jun: 'June', jul: 'July',
  aug: 'August', sep: 'September', oct: 'October', nov: 'November',
  dec: 'December', jan: 'January', feb: 'February', mar: 'March',
};
const monthShort = {
  apr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul',
  aug: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov',
  dec: 'Dec', jan: 'Jan', feb: 'Feb', mar: 'Mar',
};

// Absolute calendar ordering — works across fiscal years.
const calOrder = (e) => (e.year || 0) * 12 + (calMonthIdx[e.month] ?? -1);

// An entry "has activity" if it was submitted OR has any non-zero value that
// affects outstanding. Pure blank seeded drafts are ignored when picking the
// "latest" month, so a client with only April data isn't classified by an
// empty March draft.
const hasActivity = (e) => {
  if (e.status === 'submitted') return true;
  return (
    (e.iprsAmount || 0) !== 0 ||
    (e.prsAmount || 0) !== 0 ||
    (e.soundExchangeAmount || 0) !== 0 ||
    (e.isamraAmount || 0) !== 0 ||
    (e.ascapAmount || 0) !== 0 ||
    (e.pplAmount || 0) !== 0 ||
    (e.mlcAmount || 0) !== 0 ||
    (e.extraAmount || 0) !== 0 ||
    (e.currentMonthGstBase || 0) !== 0 ||
    (e.previousOutstandingGstBase || 0) !== 0 ||
    (e.currentMonthReceipt || 0) !== 0 ||
    (e.currentMonthTds || 0) !== 0 ||
    (e.previousMonthReceipt || 0) !== 0 ||
    (e.previousMonthTds || 0) !== 0 ||
    (e.previousMonthOutstanding || 0) !== 0 ||
    (e.totalOutstanding || 0) !== 0
  );
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount || 0);
};

// Grouped digits without the currency symbol — used for the compact trail cells.
const formatNumber = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
};

// Decode an absolute calOrder back into { year, month(fy key), label, short }.
function decodeOrder(order) {
  const year = Math.floor(order / 12);
  const month = calMonthName[order % 12];
  return {
    order,
    year,
    month,
    label: `${monthShort[month]} '${String(year).slice(-2)}`,
    longLabel: `${monthLabels[month]} ${year}`,
  };
}

// Pick each client's latest entry, preferring the latest month with real
// activity; fall back to a blank draft only if the client has nothing active.
function pickLatestByClient(entries) {
  const latestByClient = {};
  entries.forEach(e => {
    const prev = latestByClient[e.clientId];
    const eActive = hasActivity(e);
    if (!prev) { latestByClient[e.clientId] = e; return; }
    const prevActive = hasActivity(prev);
    if (eActive && !prevActive) {
      latestByClient[e.clientId] = e;
    } else if (eActive === prevActive && calOrder(e) > calOrder(prev)) {
      latestByClient[e.clientId] = e;
    }
  });
  return latestByClient;
}

// Build the per-client 6-month balance trail using last-observation-carried-forward
// for months with no entry. Returns trail aligned to windowMonths.
function buildTrail(clientEntries, windowMonths) {
  const byOrder = new Map(clientEntries.map(e => [calOrder(e), e]));
  let lastSeen = null;
  return windowMonths.map(({ order }) => {
    const hit = byOrder.get(order);
    if (hit) {
      lastSeen = hit.totalOutstanding || 0;
      return { value: lastSeen, carried: false };
    }
    if (lastSeen != null) return { value: lastSeen, carried: true };
    return { value: null, carried: false }; // before this client's first entry
  });
}

/**
 * Aggregate all royalty-accounting entries into the two report groups, each
 * client carrying a 6-month outstanding trail.
 */
function aggregateOutstanding(entries) {
  // Group all entries by client (we keep every month for the trail).
  const entriesByClient = {};
  entries.forEach(e => {
    (entriesByClient[e.clientId] = entriesByClient[e.clientId] || []).push(e);
  });

  // 6-month window anchored to the latest active month across all clients.
  const activeOrders = entries.filter(hasActivity).map(calOrder);
  const endOrder = activeOrders.length ? Math.max(...activeOrders) : Math.max(0, ...entries.map(calOrder));
  const windowMonths = [];
  for (let i = 5; i >= 0; i--) windowMonths.push(decodeOrder(endOrder - i));

  const latestByClient = pickLatestByClient(entries);

  const allClients = Object.values(latestByClient).map(latest => {
    const clientEntries = entriesByClient[latest.clientId] || [];
    const trail = buildTrail(clientEntries, windowMonths);
    // Each client's OWN last 6 months (up to their latest active month) — used by
    // the per-client dynamic table. Independent of the global matrix window.
    const cutoff = calOrder(latest);
    const history = clientEntries
      .filter(e => calOrder(e) <= cutoff)
      .sort((a, b) => calOrder(a) - calOrder(b))
      .slice(-6);
    return { ...latest, trail, history };
  });

  const positiveClients = allClients
    .filter(e => (e.totalOutstanding || 0) > 0)
    .sort((a, b) => (b.totalOutstanding || 0) - (a.totalOutstanding || 0)); // highest first

  const zeroNegativeClients = allClients
    .filter(e => (e.totalOutstanding || 0) <= 0)
    .sort((a, b) => (a.totalOutstanding || 0) - (b.totalOutstanding || 0)); // most negative first

  const positiveTotal = positiveClients.reduce((s, e) => s + (e.totalOutstanding || 0), 0);
  const zeroNegativeTotal = zeroNegativeClients.reduce((s, e) => s + (e.totalOutstanding || 0), 0);

  // Per-column month totals for each group (carried values included, null = 0).
  const monthTotals = (rows) => windowMonths.map((_, i) =>
    rows.reduce((s, r) => s + (r.trail[i].value || 0), 0)
  );

  return {
    positiveClients,
    zeroNegativeClients,
    positiveTotal,
    zeroNegativeTotal,
    windowMonths,
    positiveMonthTotals: monthTotals(positiveClients),
    zeroNegativeMonthTotals: monthTotals(zeroNegativeClients),
  };
}

function trailCell(cell) {
  if (cell.value == null) {
    return `<td style="padding: 7px 8px; border-bottom: 1px solid #eef0f2; text-align: right; color: #cbd5e1; white-space: nowrap;">&mdash;</td>`;
  }
  const color = cell.value > 0 ? '#2563eb' : cell.value < 0 ? '#dc2626' : '#6b7280';
  const carriedStyle = cell.carried ? 'font-style: italic; color: #94a3b8;' : `color: ${color}; font-weight: 600;`;
  return `<td style="padding: 7px 8px; border-bottom: 1px solid #eef0f2; text-align: right; font-size: 12px; white-space: nowrap; ${carriedStyle}">${formatNumber(cell.value)}</td>`;
}

/**
 * Render one report email (matrix layout: one row per client, six month
 * columns + a Current column, plus a Month totals footer).
 */
function buildReportHtml({
  title, subtitle, fyStart, clientRows, grandTotal,
  accentColor, badgeText, windowMonths, monthTotals, isTest,
}) {
  const testBanner = isTest ? `
    <div style="background: #fef3c7; padding: 10px 32px; color: #92400e; font-size: 12px; font-weight: 600; border-bottom: 1px solid #fde68a;">
      TEST EMAIL - Sent only to the test recipient
    </div>` : '';

  const monthHeaders = windowMonths.map(m => `
    <th style="padding: 9px 8px; text-align: right; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap;">${m.label}</th>
  `).join('');

  const tableRows = clientRows.map((e, idx) => {
    const cur = e.totalOutstanding || 0;
    const curColor = cur > 0 ? '#2563eb' : cur < 0 ? '#dc2626' : '#6b7280';
    return `
    <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding: 7px 8px; border-bottom: 1px solid #eef0f2; color: #94a3b8; font-size: 12px;">${idx + 1}</td>
      <td style="padding: 7px 8px; border-bottom: 1px solid #eef0f2; font-size: 12px; line-height: 1.35; min-width: 150px;">
        <span style="font-weight: 600; color: #334155; white-space: nowrap;">${e.clientId}</span>
        <span style="color: #64748b;"> &middot; ${e.clientName}</span>
      </td>
      ${e.trail.map(c => trailCell(c)).join('')}
      <td style="padding: 7px 8px; border-bottom: 1px solid #eef0f2; text-align: right; font-weight: 700; font-size: 13px; color: ${curColor}; white-space: nowrap;">${formatCurrency(cur)}</td>
    </tr>`;
  }).join('');

  const totalsRow = `
    <tr>
      <td colspan="2" style="padding: 12px 8px; border-top: 2px solid ${accentColor}40; font-weight: 700; font-size: 12px; color: #333;">Month totals (${clientRows.length} clients)</td>
      ${(monthTotals || []).map(t => `<td style="padding: 12px 8px; border-top: 2px solid ${accentColor}40; text-align: right; font-weight: 600; font-size: 12px; color: #475569; white-space: nowrap;">${formatNumber(t)}</td>`).join('')}
      <td style="padding: 12px 8px; border-top: 2px solid ${accentColor}40; text-align: right; font-weight: 700; font-size: 14px; color: ${accentColor}; white-space: nowrap;">${formatCurrency(grandTotal)}</td>
    </tr>`;

  const rangeLabel = windowMonths.length
    ? `${windowMonths[0].longLabel} &ndash; ${windowMonths[windowMonths.length - 1].longLabel}`
    : '';

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 940px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
      ${testBanner}
      <!-- Header -->
      <div style="background: linear-gradient(135deg, ${accentColor}, ${accentColor}dd); padding: 28px 32px; color: white;">
        <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 700;">${title}</h1>
        <p style="margin: 0; opacity: 0.9; font-size: 14px;">
          FY ${fyStart}-${fyStart + 1} | ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <!-- Summary Bar -->
      <div style="display: flex; padding: 18px 32px; background: #f8fafc; border-bottom: 1px solid #eef0f2;">
        <div style="flex: 1;">
          <span style="display: inline-block; background: ${accentColor}18; color: ${accentColor}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid ${accentColor}30;">
            ${badgeText}
          </span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 13px; color: #888;">Total Clients: </span>
          <span style="font-size: 15px; font-weight: 700; color: #333;">${clientRows.length}</span>
          <span style="margin: 0 10px; color: #ddd;">|</span>
          <span style="font-size: 13px; color: #888;">Grand Total: </span>
          <span style="font-size: 15px; font-weight: 700; color: ${accentColor};">${formatCurrency(grandTotal)}</span>
        </div>
      </div>

      ${subtitle ? `<p style="padding: 12px 32px 0; margin: 0; color: #666; font-size: 13px;">${subtitle}</p>` : ''}
      ${rangeLabel ? `<p style="padding: 4px 32px 0; margin: 0; color: #94a3b8; font-size: 12px;">6-month balance trail: ${rangeLabel} (each cell = month-end outstanding)</p>` : ''}

      <!-- Table -->
      <div style="padding: 12px 16px 8px; overflow-x: auto;">
        ${clientRows.length === 0 ? `
          <div style="text-align: center; padding: 40px 20px; color: #999;">
            <p style="font-size: 16px; margin: 0;">No clients in this category</p>
          </div>
        ` : `
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="padding: 9px 8px; text-align: left; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px;">#</th>
                <th style="padding: 9px 8px; text-align: left; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px;">Client</th>
                ${monthHeaders}
                <th style="padding: 9px 8px; text-align: right; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap;">Current</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              ${totalsRow}
            </tfoot>
          </table>
        `}
      </div>

      <!-- Legend -->
      <p style="padding: 4px 32px 0; margin: 0; color: #94a3b8; font-size: 11px;">
        Month columns show ₹ (no symbol). <span style="font-style: italic; color: #94a3b8;">Italic grey</span> = carried forward (no new entry that month). &mdash; = no entry yet.
      </p>

      <!-- Footer -->
      <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid #eef0f2; text-align: center; margin-top: 12px;">
        <p style="margin: 0; color: #aaa; font-size: 11px;">
          ${isTest ? 'TEST email' : 'Automated email'} from MRM Billing App | Generated at ${new Date().toLocaleTimeString('en-IN')}
        </p>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Per-client dynamic table (each client's OWN last 6 months — simple summary)
// ---------------------------------------------------------------------------

// One month cell: small month label on top + that month's closing outstanding.
function dynCell(entry, isLatest, accentColor) {
  if (!entry) {
    return `<td style="padding: 7px 8px; border-bottom: 1px solid #eef0f2;"></td>`;
  }
  const v = entry.totalOutstanding || 0;
  const color = v > 0 ? '#2563eb' : v < 0 ? '#dc2626' : '#6b7280';
  const label = `${monthShort[entry.month]} '${String(entry.year).slice(-2)}`;
  const bg = isLatest ? `background: ${accentColor}0d;` : '';
  const tag = isLatest ? ` &middot; <span style="color: ${accentColor}; font-weight: 700;">now</span>` : '';
  return `<td style="padding: 7px 8px; border-bottom: 1px solid #eef0f2; text-align: right; white-space: nowrap; ${bg}">
    <div style="font-size: 10px; color: #94a3b8;">${label}${tag}</div>
    <div style="font-size: 13px; font-weight: ${isLatest ? 700 : 600}; color: ${color};">${formatNumber(v)}</div>
  </td>`;
}

/**
 * Render one report email as a simple dynamic table: one row per client, six
 * columns showing that client's OWN last 6 months (oldest -> latest) of
 * month-end outstanding, with the month labelled inside each cell. The latest
 * (current) month is highlighted. Unlike the matrix format, columns are NOT a
 * fixed calendar window — they float per client.
 */
function buildPerClientReportHtml({
  title, subtitle, fyStart, clientRows, grandTotal, accentColor, badgeText, isTest,
}) {
  const testBanner = isTest ? `
    <div style="background: #fef3c7; padding: 10px 32px; color: #92400e; font-size: 12px; font-weight: 600; border-bottom: 1px solid #fde68a;">
      TEST EMAIL - Sent only to the test recipient
    </div>` : '';

  const tableRows = clientRows.map((e, idx) => {
    const hist = e.history || [];
    // Pad the oldest side so each client's current month lands in the last column.
    const padded = [...Array(Math.max(0, 6 - hist.length)).fill(null), ...hist].slice(-6);
    const cells = padded.map((entry, i) => dynCell(entry, i === 5 && !!entry, accentColor)).join('');
    return `
    <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding: 7px 8px; border-bottom: 1px solid #eef0f2; color: #94a3b8; font-size: 12px; vertical-align: top;">${idx + 1}</td>
      <td style="padding: 7px 8px; border-bottom: 1px solid #eef0f2; font-size: 12px; line-height: 1.35; vertical-align: top; min-width: 150px;">
        <span style="font-weight: 600; color: #334155; white-space: nowrap;">${e.clientId}</span>
        <span style="color: #64748b;"> &middot; ${e.clientName}</span>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 900px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
      ${testBanner}
      <!-- Header -->
      <div style="background: linear-gradient(135deg, ${accentColor}, ${accentColor}dd); padding: 28px 32px; color: white;">
        <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 700;">${title}</h1>
        <p style="margin: 0; opacity: 0.9; font-size: 14px;">
          FY ${fyStart}-${fyStart + 1} | ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <!-- Summary Bar -->
      <div style="display: flex; padding: 18px 32px; background: #f8fafc; border-bottom: 1px solid #eef0f2;">
        <div style="flex: 1;">
          <span style="display: inline-block; background: ${accentColor}18; color: ${accentColor}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid ${accentColor}30;">
            ${badgeText}
          </span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 13px; color: #888;">Total Clients: </span>
          <span style="font-size: 15px; font-weight: 700; color: #333;">${clientRows.length}</span>
          <span style="margin: 0 10px; color: #ddd;">|</span>
          <span style="font-size: 13px; color: #888;">Grand Total: </span>
          <span style="font-size: 15px; font-weight: 700; color: ${accentColor};">${formatCurrency(grandTotal)}</span>
        </div>
      </div>

      ${subtitle ? `<p style="padding: 12px 32px 0; margin: 0; color: #666; font-size: 13px;">${subtitle}</p>` : ''}
      <p style="padding: 4px 32px 0; margin: 0; color: #94a3b8; font-size: 12px;">Each row shows that client's own last 6 months of outstanding (oldest &rarr; latest). The highlighted column is the current month.</p>

      <!-- Table -->
      <div style="padding: 12px 16px 8px; overflow-x: auto;">
        ${clientRows.length === 0 ? `
          <div style="text-align: center; padding: 40px 20px; color: #999;">
            <p style="font-size: 16px; margin: 0;">No clients in this category</p>
          </div>
        ` : `
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="padding: 9px 8px; text-align: left; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px;">#</th>
                <th style="padding: 9px 8px; text-align: left; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px;">Client</th>
                <th colspan="6" style="padding: 9px 8px; text-align: center; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px;">Last 6 months &mdash; month-end outstanding (oldest &rarr; latest)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="7" style="padding: 12px 8px; border-top: 2px solid ${accentColor}40; font-weight: 700; font-size: 13px; color: #333;">Grand Total &mdash; current outstanding (${clientRows.length} clients)</td>
                <td style="padding: 12px 8px; border-top: 2px solid ${accentColor}40; text-align: right; font-weight: 700; font-size: 14px; color: ${accentColor}; white-space: nowrap;">${formatCurrency(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        `}
      </div>

      <!-- Legend -->
      <p style="padding: 4px 32px 0; margin: 0; color: #94a3b8; font-size: 11px;">
        Figures in ₹ (no symbol), coloured <span style="color: #2563eb;">blue</span> when owed and <span style="color: #dc2626;">red</span> when overpaid. Blank cell = client had no entry that far back.
      </p>

      <!-- Footer -->
      <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid #eef0f2; text-align: center; margin-top: 12px;">
        <p style="margin: 0; color: #aaa; font-size: 11px;">
          ${isTest ? 'TEST email' : 'Automated email'} from MRM Billing App | Generated at ${new Date().toLocaleTimeString('en-IN')}
        </p>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Movement summary — "how the current outstanding came about" over 6 months.
// Opening + Billed (net new charges) - Paid (receipts+TDS) = Current. The Billed
// figure is derived (Current - Opening + Paid) so the statement reconciles exactly.
// ---------------------------------------------------------------------------

function receivedOf(e) {
  return (e.currentMonthReceipt || 0) + (e.currentMonthTds || 0)
    + (e.previousMonthReceipt || 0) + (e.previousMonthTds || 0);
}

// Per-month movement over a client's last 6 months: for each month the payment
// (receipts + TDS) and the net new billing (derived so the balance reconciles:
// closing = previous closing + billed - paid).
function monthMovements(client) {
  const hist = client.history || [];
  return hist.map((e, i) => {
    const paid = receivedOf(e);
    const closing = e.totalOutstanding || 0;
    const prevClosing = i === 0 ? (e.previousMonthOutstanding || 0) : (hist[i - 1].totalOutstanding || 0);
    return {
      label: `${monthShort[e.month]} '${String(e.year).slice(-2)}`,
      paid,
      billed: closing - prevClosing + paid,
    };
  });
}

// One month cell: payment collected (−, green, prominent) + net new billing (+, blue).
function moveCell(c, isLatest, accentColor) {
  if (!c) return `<td style="padding: 8px 8px; border-bottom: 1px solid #eef0f2;"></td>`;
  const paidStr = c.paid ? `&minus;${formatNumber(c.paid)}` : `<span style="color: #cbd5e1;">&mdash;</span>`;
  const billedStr = c.billed ? `+${formatNumber(c.billed)}` : '';
  const bg = isLatest ? `background: ${accentColor}0d;` : '';
  const tag = isLatest ? ` &middot; <span style="color: ${accentColor}; font-weight: 700;">now</span>` : '';
  return `<td style="padding: 8px 8px; border-bottom: 1px solid #eef0f2; text-align: right; white-space: nowrap; ${bg}">
    <div style="font-size: 10px; color: #94a3b8;">${c.label}${tag}</div>
    <div style="font-size: 13px; font-weight: 700; color: #059669;">${paidStr}</div>
    ${billedStr ? `<div style="font-size: 11px; color: #2563eb;">${billedStr}</div>` : ''}
  </td>`;
}

/**
 * Render one report email as a movement summary: one row per client showing how
 * the current outstanding was reached over the last 6 months —
 * Opening balance + Billed (net new charges) − Paid (receipts/TDS) = Current.
 */
function buildMovementReportHtml({
  title, subtitle, fyStart, clientRows, grandTotal, accentColor, badgeText, isTest,
}) {
  const testBanner = isTest ? `
    <div style="background: #fef3c7; padding: 10px 32px; color: #92400e; font-size: 12px; font-weight: 600; border-bottom: 1px solid #fde68a;">
      TEST EMAIL - Sent only to the test recipient
    </div>` : '';

  let totalPaid = 0;
  const rows = clientRows.map((e, idx) => {
    const moves = monthMovements(e);
    totalPaid += moves.reduce((s, mm) => s + mm.paid, 0);
    const padded = [...Array(Math.max(0, 6 - moves.length)).fill(null), ...moves].slice(-6);
    const cells = padded.map((c, i) => moveCell(c, i === 5 && !!c, accentColor)).join('');
    const cur = e.totalOutstanding || 0;
    const curColor = cur > 0 ? '#2563eb' : cur < 0 ? '#dc2626' : '#6b7280';
    return `
    <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding: 8px 8px; border-bottom: 1px solid #eef0f2; color: #94a3b8; font-size: 12px; vertical-align: top;">${idx + 1}</td>
      <td style="padding: 8px 8px; border-bottom: 1px solid #eef0f2; font-size: 12px; line-height: 1.35; vertical-align: top; min-width: 150px;">
        <span style="font-weight: 600; color: #334155; white-space: nowrap;">${e.clientId}</span>
        <span style="color: #64748b;"> &middot; ${e.clientName}</span>
      </td>
      ${cells}
      <td style="padding: 8px 8px; border-bottom: 1px solid #eef0f2; text-align: right; white-space: nowrap; vertical-align: top;">
        <div style="font-size: 14px; font-weight: 700; color: ${curColor};">${formatNumber(cur)}</div>
      </td>
    </tr>`;
  }).join('');

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 980px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
      ${testBanner}
      <!-- Header -->
      <div style="background: linear-gradient(135deg, ${accentColor}, ${accentColor}dd); padding: 28px 32px; color: white;">
        <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 700;">${title}</h1>
        <p style="margin: 0; opacity: 0.9; font-size: 14px;">
          FY ${fyStart}-${fyStart + 1} | ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <!-- Summary Bar -->
      <div style="display: flex; padding: 18px 32px; background: #f8fafc; border-bottom: 1px solid #eef0f2;">
        <div style="flex: 1;">
          <span style="display: inline-block; background: ${accentColor}18; color: ${accentColor}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid ${accentColor}30;">
            ${badgeText}
          </span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 13px; color: #888;">Total Clients: </span>
          <span style="font-size: 15px; font-weight: 700; color: #333;">${clientRows.length}</span>
          <span style="margin: 0 10px; color: #ddd;">|</span>
          <span style="font-size: 13px; color: #888;">Grand Total: </span>
          <span style="font-size: 15px; font-weight: 700; color: ${accentColor};">${formatCurrency(grandTotal)}</span>
        </div>
      </div>

      ${subtitle ? `<p style="padding: 12px 32px 0; margin: 0; color: #666; font-size: 13px;">${subtitle}</p>` : ''}
      <p style="padding: 4px 32px 0; margin: 0; color: #94a3b8; font-size: 12px;">Each row = that client's last 6 months. Per month: <b style="color:#059669;">− payment collected</b> and <b style="color:#2563eb;">+ new billing</b>, leading to the current outstanding.</p>

      <!-- Table -->
      <div style="padding: 12px 16px 8px; overflow-x: auto;">
        ${clientRows.length === 0 ? `
          <div style="text-align: center; padding: 40px 20px; color: #999;">
            <p style="font-size: 16px; margin: 0;">No clients in this category</p>
          </div>
        ` : `
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="padding: 9px 8px; text-align: left; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px;">#</th>
                <th style="padding: 9px 8px; text-align: left; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px;">Client</th>
                <th colspan="6" style="padding: 9px 8px; text-align: center; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px;">Last 6 months &mdash; payment (&minus;) &amp; billing (+) per month (oldest &rarr; latest)</th>
                <th style="padding: 9px 8px; text-align: right; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap;">Current</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="8" style="padding: 12px 8px; border-top: 2px solid ${accentColor}40; font-weight: 700; font-size: 12px; color: #333;">Total collected over 6 months: <span style="color:#059669;">${formatCurrency(totalPaid)}</span> &middot; current outstanding &rarr;</td>
                <td style="padding: 12px 8px; border-top: 2px solid ${accentColor}40; text-align: right; font-weight: 700; font-size: 14px; color: ${accentColor}; white-space: nowrap;">${formatCurrency(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        `}
      </div>

      <!-- Legend -->
      <p style="padding: 4px 32px 0; margin: 0; color: #94a3b8; font-size: 11px;">
        Figures in ₹ (no symbol). <b style="color:#059669;">&minus; green</b> = payment collected that month (receipts + TDS) &middot;
        <b style="color:#2563eb;">+ blue</b> = net new billing &middot; <b>Current</b> = outstanding now. Highlighted column = current month.
      </p>

      <!-- Footer -->
      <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid #eef0f2; text-align: center; margin-top: 12px;">
        <p style="margin: 0; color: #aaa; font-size: 11px;">
          ${isTest ? 'TEST email' : 'Automated email'} from MRM Billing App | Generated at ${new Date().toLocaleTimeString('en-IN')}
        </p>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Statement format — per-client month-by-month ledger using the REAL fields,
// reconciling exactly to the model's totalOutstanding formula:
//   Closing = Opening + Commission + GST - (Receipts + TDS) - Adjustment
// ---------------------------------------------------------------------------

function gstOf(e) {
  return (e.currentMonthGst || 0) + (e.previousOutstandingGst || 0);
}

// Build the table rows for one client (a grouped block in the single statement
// table): the #/Client cells span the client's months via rowspan; one row per month.
function statementRowsFor(e, idx, accentColor) {
  const hist = e.history || [];
  if (!hist.length) return '';
  const opening = hist[0].previousMonthOutstanding || 0;
  const openLabel = `${monthShort[hist[0].month]} '${String(hist[0].year).slice(-2)}`;
  const cur = e.totalOutstanding || 0;
  const curColor = cur > 0 ? '#2563eb' : cur < 0 ? '#dc2626' : '#6b7280';
  const N = hist.length;
  const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

  return hist.map((x, i) => {
    const isLast = i === N - 1;
    const bb = isLast ? '2px solid #cbd5e1' : '1px solid #eef0f2'; // group separator
    const commission = x.totalCommission || 0;
    const gst = gstOf(x);
    const received = receivedOf(x);
    const bal = x.totalOutstanding || 0;
    const balColor = bal > 0 ? '#2563eb' : bal < 0 ? '#dc2626' : '#6b7280';
    const td = (v, color, weight) => `<td style="padding: 7px 10px; border-bottom: ${bb}; font-size: 12px; text-align: right; color: ${color}; font-weight: ${weight}; white-space: nowrap;">${v ? formatNumber(v) : '<span style="color:#cbd5e1;">&mdash;</span>'}</td>`;

    const idClientCells = i === 0 ? `
        <td rowspan="${N}" style="padding: 8px 8px; border-bottom: 2px solid #cbd5e1; border-right: 1px solid #eef0f2; color: #94a3b8; font-size: 12px; vertical-align: top; text-align: center;">${idx + 1}</td>
        <td rowspan="${N}" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; border-right: 1px solid #eef0f2; font-size: 12px; vertical-align: top; min-width: 160px;">
          <div style="font-weight: 700; color: #334155; white-space: nowrap;">${e.clientId}</div>
          <div style="color: #64748b; line-height: 1.3;">${e.clientName}</div>
          <div style="margin-top: 5px; font-size: 11px; color: #94a3b8;">Opening (before ${openLabel}): <b style="color:#64748b;">${formatNumber(opening)}</b></div>
          <div style="font-size: 11px; color: #94a3b8;">Current: <b style="color:${curColor};">${formatCurrency(cur)}</b></div>
        </td>` : '';

    return `
      <tr style="background: ${rowBg};">${idClientCells}
        <td style="padding: 7px 10px; border-bottom: ${bb}; font-size: 12px; color: #475569; white-space: nowrap;">${monthLabels[x.month]} '${String(x.year).slice(-2)}${isLast ? ` &middot; <b style="color:${accentColor};">now</b>` : ''}</td>
        ${td(commission, '#334155', 400)}
        ${td(gst, '#64748b', 400)}
        ${td(received, '#059669', 600)}
        <td style="padding: 7px 10px; border-bottom: ${bb}; font-size: 13px; text-align: right; font-weight: 700; color: ${balColor}; white-space: nowrap;">${formatNumber(bal)}</td>
      </tr>`;
  }).join('');
}

/**
 * Render one report email as per-client statements of account: each client gets a
 * month-by-month ledger of their last 6 months —
 * Opening + Commission + GST − Received = Balance — using the real model fields.
 */
function buildStatementReportHtml({
  title, subtitle, fyStart, clientRows, grandTotal, accentColor, badgeText, isTest,
}) {
  const testBanner = isTest ? `
    <div style="background: #fef3c7; padding: 10px 32px; color: #92400e; font-size: 12px; font-weight: 600; border-bottom: 1px solid #fde68a;">
      TEST EMAIL - Sent only to the test recipient
    </div>` : '';

  const colHead = (label, align) => `<th style="padding: 9px 10px; text-align: ${align}; background: #f1f5f9; border-bottom: 2px solid ${accentColor}40; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap;">${label}</th>`;
  const body = clientRows.length === 0
    ? `<tr><td colspan="7" style="text-align: center; padding: 40px 20px; color: #999; font-size: 16px;">No clients in this category</td></tr>`
    : clientRows.map((e, idx) => statementRowsFor(e, idx, accentColor)).join('');
  const cards = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          ${colHead('#', 'center')}${colHead('Client', 'left')}${colHead('Month', 'left')}${colHead('Commission', 'right')}${colHead('GST', 'right')}${colHead('Received', 'right')}${colHead('Balance', 'right')}
        </tr>
      </thead>
      <tbody>
        ${body}
      </tbody>
    </table>`;

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 880px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
      ${testBanner}
      <div style="background: linear-gradient(135deg, ${accentColor}, ${accentColor}dd); padding: 28px 32px; color: white;">
        <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 700;">${title}</h1>
        <p style="margin: 0; opacity: 0.9; font-size: 14px;">
          FY ${fyStart}-${fyStart + 1} | ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div style="display: flex; padding: 18px 32px; background: #f8fafc; border-bottom: 1px solid #eef0f2;">
        <div style="flex: 1;">
          <span style="display: inline-block; background: ${accentColor}18; color: ${accentColor}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid ${accentColor}30;">
            ${badgeText}
          </span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 13px; color: #888;">Total Clients: </span>
          <span style="font-size: 15px; font-weight: 700; color: #333;">${clientRows.length}</span>
          <span style="margin: 0 10px; color: #ddd;">|</span>
          <span style="font-size: 13px; color: #888;">Grand Total: </span>
          <span style="font-size: 15px; font-weight: 700; color: ${accentColor};">${formatCurrency(grandTotal)}</span>
        </div>
      </div>

      ${subtitle ? `<p style="padding: 12px 32px 0; margin: 0; color: #666; font-size: 13px;">${subtitle}</p>` : ''}
      <p style="padding: 4px 32px 0; margin: 0; color: #94a3b8; font-size: 12px;">Each client's last 6 months: <b>Opening + Commission + GST − Received = Balance</b> (reconciles every month).</p>

      <div style="padding: 12px 16px 8px; overflow-x: auto;">
        ${cards}
      </div>

      <p style="padding: 0 32px; margin: 0; color: #94a3b8; font-size: 11px;">
        Figures in ₹ (no symbol). <b style="color:#334155;">Commission</b> &amp; <b style="color:#64748b;">GST</b> add to the balance &middot;
        <b style="color:#059669;">Received</b> (receipts + TDS) reduces it &middot; <b>Balance</b> = outstanding at month-end. Highlighted row = current month.
      </p>

      <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid #eef0f2; text-align: center; margin-top: 12px;">
        <p style="margin: 0; color: #aaa; font-size: 11px;">
          ${isTest ? 'TEST email' : 'Automated email'} from MRM Billing App | Generated at ${new Date().toLocaleTimeString('en-IN')}
        </p>
      </div>
    </div>
  `;
}

module.exports = {
  monthOrder,
  calMonthIdx,
  monthLabels,
  calOrder,
  hasActivity,
  formatCurrency,
  aggregateOutstanding,
  buildReportHtml,
  buildPerClientReportHtml,
  buildMovementReportHtml,
  buildStatementReportHtml,
};
