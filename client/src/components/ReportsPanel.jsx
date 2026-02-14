import React, { useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount || 0);
};

const getClientInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const monthLabels = {
  apr: 'April', may: 'May', jun: 'June', jul: 'July',
  aug: 'August', sep: 'September', oct: 'October', nov: 'November',
  dec: 'December', jan: 'January', feb: 'February', mar: 'March',
};

const MONTH_NUM = { apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, jan: 1, feb: 2, mar: 3 };

const getEntryDate = (entry) => {
  const m = MONTH_NUM[entry.month];
  return new Date(entry.year, m - 1, 1);
};

// Client filter dropdown
const ClientFilter = ({ clients, excludedClients, setExcludedClients, allClientIds }) => {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const ref = React.useRef(null);
  const searchRef = React.useRef(null);

  React.useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  React.useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
    if (!open) setSearch('');
  }, [open]);

  const toggleClient = (clientId) => {
    setExcludedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId); else next.add(clientId);
      return next;
    });
  };

  const activeCount = clients.length - excludedClients.size;
  const filtered = search
    ? clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.clientId.toLowerCase().includes(search.toLowerCase()))
    : clients;

  return (
    <div className="client-filter" ref={ref}>
      <button className="client-filter-btn" onClick={() => setOpen(!open)}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
        Clients ({activeCount}/{clients.length})
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      {open && (
        <div className="client-filter-dropdown">
          <div className="client-filter-search">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input ref={searchRef} type="text" placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="client-filter-actions">
            <button onClick={() => setExcludedClients(new Set())}>Select All</button>
            <button onClick={() => setExcludedClients(new Set(allClientIds || clients.map(c => c.clientId)))}>Deselect All</button>
          </div>
          <div className="client-filter-list">
            {filtered.length === 0 ? (
              <div className="client-filter-empty">No clients found</div>
            ) : (
              filtered.map(c => (
                <label key={c.clientId} className="client-filter-item">
                  <input type="checkbox" checked={!excludedClients.has(c.clientId)} onChange={() => toggleClient(c.clientId)} />
                  <span className="client-avatar" style={{ width: 24, height: 24, fontSize: 9 }}>{getClientInitials(c.name)}</span>
                  <span className="client-filter-name">{c.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const DateRangeFilter = ({ dateFrom, dateTo, setDateFrom, setDateTo, clients, excludedClients, setExcludedClients, allClientIds }) => (
  <div className="filter-bar">
    <div className="filter-group">
      <label>From</label>
      <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
    </div>
    <div className="filter-separator">&rarr;</div>
    <div className="filter-group">
      <label>To</label>
      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
    </div>
    {clients && <ClientFilter clients={clients} excludedClients={excludedClients} setExcludedClients={setExcludedClients} allClientIds={allClientIds} />}
  </div>
);

function ReportsPanel({ onClose }) {
  const { clients, billingEntries, settings, updateClient, showToast } = useApp();
  const [activeReport, setActiveReport] = useState('dashboard');
  const [selectedClientForEdit, setSelectedClientForEdit] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [expandedClient, setExpandedClient] = useState(null);
  const [clientSearch, setClientSearch] = useState('');

  const { financialYear } = settings;
  const entries = Object.values(billingEntries);

  const defaultFrom = `${financialYear.startYear}-04-01`;
  const defaultTo = `${financialYear.endYear}-03-31`;
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [excludedClients, setExcludedClients] = useState(new Set());

  const filteredEntries = useMemo(() => {
    const from = new Date(dateFrom + 'T00:00:00');
    const to = new Date(dateTo + 'T23:59:59');
    return entries.filter(e => {
      if (excludedClients.has(e.clientId)) return false;
      const d = getEntryDate(e);
      return d >= from && d <= to;
    });
  }, [entries, dateFrom, dateTo, excludedClients]);

  const allClientIds = useMemo(() => {
    const ids = new Set(clients.map(c => c.clientId));
    entries.forEach(e => ids.add(e.clientId));
    return [...ids];
  }, [clients, entries]);

  const filteredClients = useMemo(() => {
    return clients
      .filter(c => !excludedClients.has(c.clientId))
      .filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.clientId.toLowerCase().includes(clientSearch.toLowerCase()))
      .sort((a, b) => (parseInt(a.clientId?.match(/(\d+)/)?.[1], 10) || 0) - (parseInt(b.clientId?.match(/(\d+)/)?.[1], 10) || 0));
  }, [clients, excludedClients, clientSearch]);

  // Financial year month order for sorting (Apr=0 ... Mar=11)
  const FY_ORDER = { apr: 0, may: 1, jun: 2, jul: 3, aug: 4, sep: 5, oct: 6, nov: 7, dec: 8, jan: 9, feb: 10, mar: 11 };

  // Group entries by clientId, sorted by financial year month order
  const entriesByClient = useMemo(() => {
    const grouped = {};
    filteredEntries.forEach(e => {
      if (!grouped[e.clientId]) grouped[e.clientId] = [];
      grouped[e.clientId].push(e);
    });
    // Sort each client's entries: first by year, then by FY month order
    Object.keys(grouped).forEach(id => {
      grouped[id].sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return FY_ORDER[a.month] - FY_ORDER[b.month];
      });
    });
    return grouped;
  }, [filteredEntries]);

  const toggleClient = (clientId) => {
    setExpandedClient(prev => prev === clientId ? null : clientId);
  };

  // Get client summary stats for a given client
  const getClientSummary = (clientId) => {
    const clientEntries = entriesByClient[clientId] || [];
    return {
      entryCount: clientEntries.length,
      totalCommission: clientEntries.reduce((s, e) => s + (e.totalCommission || 0), 0),
      totalOutstanding: clientEntries.length > 0 ? clientEntries[clientEntries.length - 1].totalOutstanding || 0 : 0,
    };
  };

  const dashboardStats = useMemo(() => {
    const totalClients = clients.length;
    const totalEntries = entries.length;
    const draftCount = entries.filter(e => e.status === 'draft').length;
    const submittedCount = entries.filter(e => e.status === 'submitted').length;
    const totalCommission = entries.reduce((sum, e) => sum + (e.totalCommission || 0), 0);
    // Total Outstanding = sum of each client's latest month outstanding only
    const latestByClient = {};
    entries.forEach(e => {
      const prev = latestByClient[e.clientId];
      if (!prev || FY_ORDER[e.month] > FY_ORDER[prev.month] || (e.year > prev.year)) {
        latestByClient[e.clientId] = e;
      }
    });
    const totalOutstanding = Object.values(latestByClient).reduce((sum, e) => sum + (e.totalOutstanding || 0), 0);
    const totalIprs = entries.reduce((sum, e) => sum + (e.iprsAmount || 0), 0);
    const totalPrs = entries.reduce((sum, e) => sum + (e.prsAmount || 0), 0);
    const totalAscap = entries.reduce((sum, e) => sum + (e.ascapAmount || 0), 0);
    const totalIsamra = entries.reduce((sum, e) => sum + (e.isamraAmount || 0), 0);
    const totalSoundEx = entries.reduce((sum, e) => sum + (e.soundExchangeAmount || 0), 0);
    const totalPpl = entries.reduce((sum, e) => sum + (e.pplAmount || 0), 0);

    return { totalClients, totalEntries, draftCount, submittedCount, totalCommission, totalOutstanding, totalIprs, totalPrs, totalAscap, totalIsamra, totalSoundEx, totalPpl };
  }, [clients, entries]);

  const dateLabel = `${dateFrom}_to_${dateTo}`;

  const exportCSV = (reportType) => {
    let csv = '';
    let filename = '';

    switch (reportType) {
      case 'client-master':
        csv = 'Client ID,Client Name,Type,Commission Rate\n';
        filteredClients.forEach(client => {
          csv += `${client.clientId},"${client.name}","${client.type}",${client.commissionRate ?? (client.fee * 100).toFixed(0)}%\n`;
        });
        filename = 'MRM_Client_Master_Report.csv';
        break;

      case 'commission':
        csv = 'Client ID,Client Name,Month,Year,Commission Rate,IPRS,PRS,Sound Ex,ISAMRA,ASCAP,PPL,Total Commission\n';
        filteredEntries.forEach(e => {
          csv += `${e.clientId},"${e.clientName}","${monthLabels[e.month]}",${e.year},${e.commissionRate || 0}%,${e.iprsCommission || 0},${e.prsCommission || 0},${e.soundExchangeCommission || 0},${e.isamraCommission || 0},${e.ascapCommission || 0},${e.pplCommission || 0},${e.totalCommission || 0}\n`;
        });
        filename = `MRM_Commission_Report_${dateLabel}.csv`;
        break;

      case 'outstanding': {
        csv = 'Client ID,Client Name,Latest Month,Year,Total Outstanding\n';
        // One row per client: only latest month's outstanding
        const latestOutstanding = {};
        filteredEntries.forEach(e => {
          const prev = latestOutstanding[e.clientId];
          if (!prev || FY_ORDER[e.month] > FY_ORDER[prev.month] || e.year > prev.year) {
            latestOutstanding[e.clientId] = e;
          }
        });
        Object.values(latestOutstanding)
          .sort((a, b) => (parseInt(a.clientId?.match(/(\d+)/)?.[1], 10) || 0) - (parseInt(b.clientId?.match(/(\d+)/)?.[1], 10) || 0))
          .forEach(e => {
            csv += `${e.clientId},"${e.clientName}","${monthLabels[e.month]}",${e.year},${e.totalOutstanding || 0}\n`;
          });
        filename = `MRM_Outstanding_Report_${dateLabel}.csv`;
        break;
      }

      case 'gst-invoice':
        csv = 'Client ID,Client Name,Month,Year,GST Rate,Total Commission,Current GST Base,Current GST,Current Invoice Total,Prev Outstanding GST Base,Prev Outstanding GST,Prev Outstanding Invoice Total\n';
        filteredEntries.forEach(e => {
          csv += `${e.clientId},"${e.clientName}","${monthLabels[e.month]}",${e.year},${e.gstRate || 18}%,${e.totalCommission || 0},${e.currentMonthGstBase || 0},${e.currentMonthGst || 0},${e.currentMonthInvoiceTotal || 0},${e.previousOutstandingGstBase || 0},${e.previousOutstandingGst || 0},${e.previousOutstandingInvoiceTotal || 0}\n`;
        });
        filename = `MRM_GST_Invoice_Report_${dateLabel}.csv`;
        break;

      case 'receipts-tds':
        csv = 'Client ID,Client Name,Month,Year,Total Commission,Current Receipt,Current TDS,Previous Receipt,Previous TDS,Monthly Outstanding,Total Outstanding\n';
        filteredEntries.forEach(e => {
          csv += `${e.clientId},"${e.clientName}","${monthLabels[e.month]}",${e.year},${e.totalCommission || 0},${e.currentMonthReceipt || 0},${e.currentMonthTds || 0},${e.previousMonthReceipt || 0},${e.previousMonthTds || 0},${e.monthlyOutstanding || 0},${e.totalOutstanding || 0}\n`;
        });
        filename = `MRM_Receipts_TDS_Report_${dateLabel}.csv`;
        break;

      default:
        return;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadCSV = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportClientCSV = (reportType, clientId, clientName, clientEntries) => {
    let csv = '';
    let filename = '';
    const safeName = clientName.replace(/[^a-zA-Z0-9]/g, '_');

    switch (reportType) {
      case 'commission':
        csv = 'Client ID,Client Name,Month,Year,Commission Rate,IPRS,PRS,Sound Ex,ISAMRA,ASCAP,PPL,Total Commission\n';
        clientEntries.forEach(e => {
          csv += `${e.clientId},"${e.clientName}","${monthLabels[e.month]}",${e.year},${e.commissionRate || 0}%,${e.iprsCommission || 0},${e.prsCommission || 0},${e.soundExchangeCommission || 0},${e.isamraCommission || 0},${e.ascapCommission || 0},${e.pplCommission || 0},${e.totalCommission || 0}\n`;
        });
        filename = `MRM_Commission_${safeName}_${dateLabel}.csv`;
        break;
      case 'outstanding':
        csv = 'Client ID,Client Name,Month,Year,Total Commission,Monthly Outstanding,Total Outstanding,Status\n';
        clientEntries.forEach(e => {
          csv += `${e.clientId},"${e.clientName}","${monthLabels[e.month]}",${e.year},${e.totalCommission || 0},${e.monthlyOutstanding || 0},${e.totalOutstanding || 0},${e.status}\n`;
        });
        filename = `MRM_Outstanding_${safeName}_${dateLabel}.csv`;
        break;
      case 'gst-invoice':
        csv = 'Client ID,Client Name,Month,Year,GST Rate,Total Commission,Current GST Base,Current GST,Current Invoice Total,Prev Outstanding GST Base,Prev Outstanding GST,Prev Outstanding Invoice Total\n';
        clientEntries.forEach(e => {
          csv += `${e.clientId},"${e.clientName}","${monthLabels[e.month]}",${e.year},${e.gstRate || 18}%,${e.totalCommission || 0},${e.currentMonthGstBase || 0},${e.currentMonthGst || 0},${e.currentMonthInvoiceTotal || 0},${e.previousOutstandingGstBase || 0},${e.previousOutstandingGst || 0},${e.previousOutstandingInvoiceTotal || 0}\n`;
        });
        filename = `MRM_GST_Invoice_${safeName}_${dateLabel}.csv`;
        break;
      case 'receipts-tds':
        csv = 'Client ID,Client Name,Month,Year,Total Commission,Current Receipt,Current TDS,Previous Receipt,Previous TDS,Monthly Outstanding,Total Outstanding\n';
        clientEntries.forEach(e => {
          csv += `${e.clientId},"${e.clientName}","${monthLabels[e.month]}",${e.year},${e.totalCommission || 0},${e.currentMonthReceipt || 0},${e.currentMonthTds || 0},${e.previousMonthReceipt || 0},${e.previousMonthTds || 0},${e.monthlyOutstanding || 0},${e.totalOutstanding || 0}\n`;
        });
        filename = `MRM_Receipts_TDS_${safeName}_${dateLabel}.csv`;
        break;
      default:
        return;
    }
    downloadCSV(csv, filename);
  };

  const ExportClientBtn = ({ reportType, clientId, clientName, clientEntries }) => (
    <button
      className="btn btn-secondary btn-sm"
      onClick={(e) => { e.stopPropagation(); exportClientCSV(reportType, clientId, clientName, clientEntries); }}
      style={{ marginBottom: 8, marginLeft: 12, marginTop: 8 }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      Export {clientName}
    </button>
  );

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    { id: 'client-master', label: 'Client Master', icon: 'users' },
    { id: 'commission', label: 'Commission Report', icon: 'percent' },
    { id: 'gst-invoice', label: 'GST & Invoice', icon: 'file-text' },
    { id: 'receipts-tds', label: 'Receipts & TDS', icon: 'credit-card' },
    { id: 'outstanding', label: 'Outstanding', icon: 'alert' },
  ];

  return (
    <div className="reports-overlay show">
      <div className="reports-sidebar">
        <div className="reports-sidebar-header">
          <div className="logo-row">
            <div className="logo-icon" style={{ width: 42, height: 42, fontSize: 16 }}>MRM</div>
            <div>
              <h1 style={{ fontSize: 18 }}>Reports</h1>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                FY {financialYear.startYear}-{financialYear.endYear}
              </span>
            </div>
          </div>
          <button className="reports-close-btn" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Reports</div>
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activeReport === item.id ? 'active' : ''}`}
              onClick={() => setActiveReport(item.id)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {item.icon === 'home' && <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></>}
                {item.icon === 'users' && <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></>}
                {item.icon === 'percent' && <><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle></>}
                {item.icon === 'alert' && <><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></>}
                {item.icon === 'file-text' && <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></>}
                {item.icon === 'credit-card' && <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></>}
              </svg>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="reports-main">
        {/* Dashboard */}
        {activeReport === 'dashboard' && (
          <div className="report-section active">
            <div className="report-page-header">
              <div className="report-page-title">
                <h2>Reports Dashboard</h2>
                <p>Overview of royalty accounting data for FY {financialYear.startYear}-{financialYear.endYear}</p>
              </div>
            </div>
            <div className="stats-grid">
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-blue)' }}>
                <div className="stat-label">Total Clients</div>
                <div className="stat-value">{dashboardStats.totalClients}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-purple)' }}>
                <div className="stat-label">Total Entries</div>
                <div className="stat-value">{dashboardStats.totalEntries}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-orange)' }}>
                <div className="stat-label">Drafts</div>
                <div className="stat-value">{dashboardStats.draftCount}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-green)' }}>
                <div className="stat-label">Submitted</div>
                <div className="stat-value">{dashboardStats.submittedCount}</div>
              </div>
            </div>
            <div className="stats-grid">
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-blue)' }}>
                <div className="stat-label">Total Commission</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalCommission)}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-green)' }}>
                <div className="stat-label">Total Outstanding</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalOutstanding)}</div>
              </div>
            </div>
            <div className="stats-grid">
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-blue)' }}>
                <div className="stat-label">Total IPRS</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalIprs)}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-purple)' }}>
                <div className="stat-label">Total PRS</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalPrs)}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-orange)' }}>
                <div className="stat-label">Total ASCAP</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalAscap)}</div>
              </div>
            </div>
            <div className="stats-grid">
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-green)' }}>
                <div className="stat-label">Total ISAMRA</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalIsamra)}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-blue)' }}>
                <div className="stat-label">Total Sound Exchange</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalSoundEx)}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-purple)' }}>
                <div className="stat-label">Total PPL</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalPpl)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Client Master Report */}
        {activeReport === 'client-master' && (
          <div className="report-section active">
            <div className="report-page-header">
              <div className="report-page-title">
                <h2>Client Master Report</h2>
                <p>Complete list of all registered clients</p>
              </div>
              <button className="btn btn-primary" onClick={() => exportCSV('client-master')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export CSV
              </button>
            </div>
            <div className="filter-bar">
              <ClientFilter clients={clients} excludedClients={excludedClients} setExcludedClients={setExcludedClients} allClientIds={allClientIds} />
            </div>
            <div className="report-container">
              <div className="report-header">
                <h3>All Clients <span className="count">{filteredClients.length}</span></h3>
              </div>
              <div className="table-wrapper">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Type</th>
                      <th>Commission Rate</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map(client => (
                      <tr key={client.clientId} onClick={() => {
                        setSelectedClientForEdit(client);
                        setEditFormData({
                          name: client.name,
                          type: client.type || '',
                          clientType: client.clientType || '',
                          commissionRate: client.commissionRate ?? (client.fee * 100),
                          previousBalance: client.previousBalance || 0,
                          iprs: client.iprs || false,
                          prs: client.prs || false,
                          isamra: client.isamra || false,
                        });
                      }} style={{ cursor: 'pointer' }}>
                        <td>
                          <div className="client-cell">
                            <div className="client-avatar">{getClientInitials(client.name)}</div>
                            <div className="client-info">
                              <div className="name">{client.name}</div>
                              <div className="id">{client.clientId}</div>
                            </div>
                          </div>
                        </td>
                        <td>{client.type}</td>
                        <td><span className="amount highlight">{client.commissionRate ?? (client.fee * 100).toFixed(0)}%</span></td>
                        <td><span className={`status-badge ${client.isActive !== false ? 'yes' : 'no'}`}>
                          {client.isActive !== false ? 'Active' : 'Inactive'}
                        </span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Commission Report */}
        {activeReport === 'commission' && (
          <div className="report-section active">
            <div className="report-page-header">
              <div className="report-page-title">
                <h2>Commission Report</h2>
                <p>Commission calculations by client</p>
              </div>
              <button className="btn btn-primary" onClick={() => exportCSV('commission')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export CSV
              </button>
            </div>
            <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} clients={clients} excludedClients={excludedClients} setExcludedClients={setExcludedClients} allClientIds={allClientIds} />
            <div className="report-client-search">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" placeholder="Search clients..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
            </div>
            <div className="report-client-list">
              {filteredClients.length === 0 ? (
                <div className="report-empty">No clients found</div>
              ) : (
                filteredClients.map(client => {
                  const summary = getClientSummary(client.clientId);
                  const isExpanded = expandedClient === client.clientId;
                  const clientEntries = entriesByClient[client.clientId] || [];
                  return (
                    <div key={client.clientId} className={`report-client-card ${isExpanded ? 'expanded' : ''}`}>
                      <div className="report-client-row" onClick={() => toggleClient(client.clientId)}>
                        <div className="client-cell">
                          <div className="client-avatar">{getClientInitials(client.name)}</div>
                          <div className="client-info">
                            <div className="name">{client.name}</div>
                            <div className="id">{client.clientId}</div>
                          </div>
                        </div>
                        <div className="report-client-stats">
                          <div className="report-client-stat">
                            <span className="label">Entries</span>
                            <span className="value">{summary.entryCount}</span>
                          </div>
                          <div className="report-client-stat">
                            <span className="label">Total Commission</span>
                            <span className="value positive">{formatCurrency(summary.totalCommission)}</span>
                          </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`chevron ${isExpanded ? 'open' : ''}`}>
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </div>
                      {isExpanded && (
                        <div className="report-client-detail">
                          {clientEntries.length === 0 ? (
                            <div className="report-empty">No entries for this date range</div>
                          ) : (
                            <div className="table-wrapper">
                              <table className="report-table">
                                <thead>
                                  <tr>
                                    <th>Month</th>
                                    <th>Rate</th>
                                    <th>IPRS</th>
                                    <th>PRS</th>
                                    <th>Sound Ex</th>
                                    <th>ISAMRA</th>
                                    <th>ASCAP</th>
                                    <th>PPL</th>
                                    <th>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {clientEntries.map((entry, idx) => (
                                    <tr key={idx}>
                                      <td>{monthLabels[entry.month]} {entry.year}</td>
                                      <td><span className="amount">{entry.commissionRate || 0}%</span></td>
                                      <td><span className="amount">{formatCurrency(entry.iprsCommission)}</span></td>
                                      <td><span className="amount">{formatCurrency(entry.prsCommission)}</span></td>
                                      <td><span className="amount">{formatCurrency(entry.soundExchangeCommission)}</span></td>
                                      <td><span className="amount">{formatCurrency(entry.isamraCommission)}</span></td>
                                      <td><span className="amount">{formatCurrency(entry.ascapCommission)}</span></td>
                                      <td><span className="amount">{formatCurrency(entry.pplCommission)}</span></td>
                                      <td><span className="amount positive">{formatCurrency(entry.totalCommission)}</span></td>
                                    </tr>
                                  ))}
                                  <tr className="summary-row">
                                    <td colSpan="8"><strong>Total</strong></td>
                                    <td><span className="amount positive">{formatCurrency(clientEntries.reduce((s, e) => s + (e.totalCommission || 0), 0))}</span></td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                          {clientEntries.length > 0 && <ExportClientBtn reportType="commission" clientId={client.clientId} clientName={client.name} clientEntries={clientEntries} />}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Outstanding Report */}
        {activeReport === 'outstanding' && (
          <div className="report-section active">
            <div className="report-page-header">
              <div className="report-page-title">
                <h2>Outstanding Report</h2>
                <p>Outstanding tracking by client and month</p>
              </div>
              <button className="btn btn-primary" onClick={() => exportCSV('outstanding')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export CSV
              </button>
            </div>
            <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} clients={clients} excludedClients={excludedClients} setExcludedClients={setExcludedClients} allClientIds={allClientIds} />
            <div className="report-client-search">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" placeholder="Search clients..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
            </div>
            <div className="report-client-list">
              {filteredClients.length === 0 ? (
                <div className="report-empty">No clients found</div>
              ) : (
                filteredClients.map(client => {
                  const summary = getClientSummary(client.clientId);
                  const isExpanded = expandedClient === client.clientId;
                  const clientEntries = entriesByClient[client.clientId] || [];
                  return (
                    <div key={client.clientId} className={`report-client-card ${isExpanded ? 'expanded' : ''}`}>
                      <div className="report-client-row" onClick={() => toggleClient(client.clientId)}>
                        <div className="client-cell">
                          <div className="client-avatar">{getClientInitials(client.name)}</div>
                          <div className="client-info">
                            <div className="name">{client.name}</div>
                            <div className="id">{client.clientId}</div>
                          </div>
                        </div>
                        <div className="report-client-stats">
                          <div className="report-client-stat">
                            <span className="label">Entries</span>
                            <span className="value">{summary.entryCount}</span>
                          </div>
                          <div className="report-client-stat">
                            <span className="label">Outstanding</span>
                            <span className={`value ${(summary.totalOutstanding || 0) > 0 ? 'positive' : (summary.totalOutstanding || 0) < 0 ? 'negative' : ''}`}>{formatCurrency(summary.totalOutstanding)}</span>
                          </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`chevron ${isExpanded ? 'open' : ''}`}>
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </div>
                      {isExpanded && (
                        <div className="report-client-detail">
                          {clientEntries.length === 0 ? (
                            <div className="report-empty">No entries for this date range</div>
                          ) : (
                            <div className="table-wrapper">
                              <table className="report-table">
                                <thead>
                                  <tr>
                                    <th>Month</th>
                                    <th>Total Commission</th>
                                    <th>Monthly Outstanding</th>
                                    <th>Total Outstanding</th>
                                    <th>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {clientEntries.map((entry, idx) => (
                                    <tr key={idx}>
                                      <td>{monthLabels[entry.month]} {entry.year}</td>
                                      <td><span className="amount">{formatCurrency(entry.totalCommission)}</span></td>
                                      <td><span className={`amount ${(entry.monthlyOutstanding || 0) < 0 ? 'negative' : ''}`}>{formatCurrency(entry.monthlyOutstanding)}</span></td>
                                      <td><span className={`amount ${(entry.totalOutstanding || 0) < 0 ? 'negative' : 'positive'}`}>{formatCurrency(entry.totalOutstanding)}</span></td>
                                      <td>
                                        <span className={`status-badge ${entry.status === 'submitted' ? 'yes' : 'pending'}`}>
                                          {entry.status === 'submitted' ? 'Submitted' : 'Draft'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                  <tr className="summary-row">
                                    <td><strong>Total</strong></td>
                                    <td><span className="amount">{formatCurrency(clientEntries.reduce((s, e) => s + (e.totalCommission || 0), 0))}</span></td>
                                    <td><span className="amount">{formatCurrency(clientEntries.reduce((s, e) => s + (e.monthlyOutstanding || 0), 0))}</span></td>
                                    <td><span className="amount positive">{formatCurrency(clientEntries.length > 0 ? clientEntries[clientEntries.length - 1].totalOutstanding || 0 : 0)}</span></td>
                                    <td></td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                          {clientEntries.length > 0 && <ExportClientBtn reportType="outstanding" clientId={client.clientId} clientName={client.name} clientEntries={clientEntries} />}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* GST & Invoice Report */}
        {activeReport === 'gst-invoice' && (
          <div className="report-section active">
            <div className="report-page-header">
              <div className="report-page-title">
                <h2>GST & Invoice Report</h2>
                <p>GST calculations and invoice totals by client and month</p>
              </div>
              <button className="btn btn-primary" onClick={() => exportCSV('gst-invoice')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export CSV
              </button>
            </div>
            <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} clients={clients} excludedClients={excludedClients} setExcludedClients={setExcludedClients} allClientIds={allClientIds} />
            <div className="report-client-search">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" placeholder="Search clients..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
            </div>
            <div className="report-client-list">
              {filteredClients.length === 0 ? (
                <div className="report-empty">No clients found</div>
              ) : (
                filteredClients.map(client => {
                  const summary = getClientSummary(client.clientId);
                  const isExpanded = expandedClient === client.clientId;
                  const clientEntries = entriesByClient[client.clientId] || [];
                  return (
                    <div key={client.clientId} className={`report-client-card ${isExpanded ? 'expanded' : ''}`}>
                      <div className="report-client-row" onClick={() => toggleClient(client.clientId)}>
                        <div className="client-cell">
                          <div className="client-avatar">{getClientInitials(client.name)}</div>
                          <div className="client-info">
                            <div className="name">{client.name}</div>
                            <div className="id">{client.clientId}</div>
                          </div>
                        </div>
                        <div className="report-client-stats">
                          <div className="report-client-stat">
                            <span className="label">Entries</span>
                            <span className="value">{summary.entryCount}</span>
                          </div>
                          <div className="report-client-stat">
                            <span className="label">Commission</span>
                            <span className="value positive">{formatCurrency(summary.totalCommission)}</span>
                          </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`chevron ${isExpanded ? 'open' : ''}`}>
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </div>
                      {isExpanded && (
                        <div className="report-client-detail">
                          {clientEntries.length === 0 ? (
                            <div className="report-empty">No entries for this date range</div>
                          ) : (
                            <div className="table-wrapper">
                              <table className="report-table">
                                <thead>
                                  <tr>
                                    <th>Month</th>
                                    <th>Total Commission</th>
                                    <th>Cur. GST Base</th>
                                    <th>Cur. GST (18%)</th>
                                    <th>Cur. Invoice Total</th>
                                    <th>Prev. GST Base</th>
                                    <th>Prev. GST (18%)</th>
                                    <th>Prev. Invoice Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {clientEntries.map((entry, idx) => (
                                    <tr key={idx}>
                                      <td>{monthLabels[entry.month]} {entry.year}</td>
                                      <td><span className="amount">{formatCurrency(entry.totalCommission)}</span></td>
                                      <td><span className="amount">{formatCurrency(entry.currentMonthGstBase)}</span></td>
                                      <td><span className="amount">{formatCurrency(entry.currentMonthGst)}</span></td>
                                      <td><span className="amount positive">{formatCurrency(entry.currentMonthInvoiceTotal)}</span></td>
                                      <td><span className="amount">{formatCurrency(entry.previousOutstandingGstBase)}</span></td>
                                      <td><span className="amount">{formatCurrency(entry.previousOutstandingGst)}</span></td>
                                      <td><span className="amount positive">{formatCurrency(entry.previousOutstandingInvoiceTotal)}</span></td>
                                    </tr>
                                  ))}
                                  <tr className="summary-row">
                                    <td><strong>Total</strong></td>
                                    <td><span className="amount">{formatCurrency(clientEntries.reduce((s, e) => s + (e.totalCommission || 0), 0))}</span></td>
                                    <td><span className="amount">{formatCurrency(clientEntries.reduce((s, e) => s + (e.currentMonthGstBase || 0), 0))}</span></td>
                                    <td><span className="amount">{formatCurrency(clientEntries.reduce((s, e) => s + (e.currentMonthGst || 0), 0))}</span></td>
                                    <td><span className="amount positive">{formatCurrency(clientEntries.reduce((s, e) => s + (e.currentMonthInvoiceTotal || 0), 0))}</span></td>
                                    <td><span className="amount">{formatCurrency(clientEntries.reduce((s, e) => s + (e.previousOutstandingGstBase || 0), 0))}</span></td>
                                    <td><span className="amount">{formatCurrency(clientEntries.reduce((s, e) => s + (e.previousOutstandingGst || 0), 0))}</span></td>
                                    <td><span className="amount positive">{formatCurrency(clientEntries.reduce((s, e) => s + (e.previousOutstandingInvoiceTotal || 0), 0))}</span></td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                          {clientEntries.length > 0 && <ExportClientBtn reportType="gst-invoice" clientId={client.clientId} clientName={client.name} clientEntries={clientEntries} />}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Receipts & TDS Report */}
        {activeReport === 'receipts-tds' && (
          <div className="report-section active">
            <div className="report-page-header">
              <div className="report-page-title">
                <h2>Receipts & TDS Report</h2>
                <p>Receipt and TDS deductions by client and month</p>
              </div>
              <button className="btn btn-primary" onClick={() => exportCSV('receipts-tds')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export CSV
              </button>
            </div>
            <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} clients={clients} excludedClients={excludedClients} setExcludedClients={setExcludedClients} allClientIds={allClientIds} />
            <div className="report-client-search">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" placeholder="Search clients..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
            </div>
            <div className="report-client-list">
              {filteredClients.length === 0 ? (
                <div className="report-empty">No clients found</div>
              ) : (
                filteredClients.map(client => {
                  const summary = getClientSummary(client.clientId);
                  const isExpanded = expandedClient === client.clientId;
                  const clientEntries = entriesByClient[client.clientId] || [];
                  return (
                    <div key={client.clientId} className={`report-client-card ${isExpanded ? 'expanded' : ''}`}>
                      <div className="report-client-row" onClick={() => toggleClient(client.clientId)}>
                        <div className="client-cell">
                          <div className="client-avatar">{getClientInitials(client.name)}</div>
                          <div className="client-info">
                            <div className="name">{client.name}</div>
                            <div className="id">{client.clientId}</div>
                          </div>
                        </div>
                        <div className="report-client-stats">
                          <div className="report-client-stat">
                            <span className="label">Entries</span>
                            <span className="value">{summary.entryCount}</span>
                          </div>
                          <div className="report-client-stat">
                            <span className="label">Commission</span>
                            <span className="value positive">{formatCurrency(summary.totalCommission)}</span>
                          </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`chevron ${isExpanded ? 'open' : ''}`}>
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </div>
                      {isExpanded && (
                        <div className="report-client-detail">
                          {clientEntries.length === 0 ? (
                            <div className="report-empty">No entries for this date range</div>
                          ) : (
                            <div className="table-wrapper">
                              <table className="report-table">
                                <thead>
                                  <tr>
                                    <th>Month</th>
                                    <th>Total Commission</th>
                                    <th>Cur. Receipt</th>
                                    <th>Cur. TDS</th>
                                    <th>Prev. Receipt</th>
                                    <th>Prev. TDS</th>
                                    <th>Monthly O/S</th>
                                    <th>Total O/S</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {clientEntries.map((entry, idx) => (
                                    <tr key={idx}>
                                      <td>{monthLabels[entry.month]} {entry.year}</td>
                                      <td><span className="amount">{formatCurrency(entry.totalCommission)}</span></td>
                                      <td><span className="amount positive">{formatCurrency(entry.currentMonthReceipt)}</span></td>
                                      <td><span className="amount">{formatCurrency(entry.currentMonthTds)}</span></td>
                                      <td><span className="amount positive">{formatCurrency(entry.previousMonthReceipt)}</span></td>
                                      <td><span className="amount">{formatCurrency(entry.previousMonthTds)}</span></td>
                                      <td><span className={`amount ${(entry.monthlyOutstanding || 0) < 0 ? 'negative' : ''}`}>{formatCurrency(entry.monthlyOutstanding)}</span></td>
                                      <td><span className={`amount ${(entry.totalOutstanding || 0) < 0 ? 'negative' : 'positive'}`}>{formatCurrency(entry.totalOutstanding)}</span></td>
                                    </tr>
                                  ))}
                                  <tr className="summary-row">
                                    <td><strong>Total</strong></td>
                                    <td><span className="amount">{formatCurrency(clientEntries.reduce((s, e) => s + (e.totalCommission || 0), 0))}</span></td>
                                    <td><span className="amount positive">{formatCurrency(clientEntries.reduce((s, e) => s + (e.currentMonthReceipt || 0), 0))}</span></td>
                                    <td><span className="amount">{formatCurrency(clientEntries.reduce((s, e) => s + (e.currentMonthTds || 0), 0))}</span></td>
                                    <td><span className="amount positive">{formatCurrency(clientEntries.reduce((s, e) => s + (e.previousMonthReceipt || 0), 0))}</span></td>
                                    <td><span className="amount">{formatCurrency(clientEntries.reduce((s, e) => s + (e.previousMonthTds || 0), 0))}</span></td>
                                    <td><span className="amount">{formatCurrency(clientEntries.reduce((s, e) => s + (e.monthlyOutstanding || 0), 0))}</span></td>
                                    <td><span className="amount positive">{formatCurrency(clientEntries.length > 0 ? clientEntries[clientEntries.length - 1].totalOutstanding || 0 : 0)}</span></td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                          {clientEntries.length > 0 && <ExportClientBtn reportType="receipts-tds" clientId={client.clientId} clientName={client.name} clientEntries={clientEntries} />}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Client Detail Edit Modal */}
      {selectedClientForEdit && editFormData && (
        <div className="modal-overlay show" onClick={() => setSelectedClientForEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Edit Client: {selectedClientForEdit.clientId}</h3>
              <button className="modal-close" onClick={() => setSelectedClientForEdit(null)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="input-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="input-group" style={{ gridColumn: 'span 2' }}>
                  <label>Client Name</label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  />
                </div>
                <div className="input-group">
                  <label>Type</label>
                  <input
                    type="text"
                    value={editFormData.type}
                    onChange={(e) => setEditFormData({ ...editFormData, type: e.target.value })}
                  />
                </div>
                <div className="input-group">
                  <label>Client Type</label>
                  <input
                    type="text"
                    value={editFormData.clientType}
                    onChange={(e) => setEditFormData({ ...editFormData, clientType: e.target.value })}
                  />
                </div>
                <div className="input-group">
                  <label>Commission Rate (%)</label>
                  <div className="input-prefix">
                    <span>%</span>
                    <input
                      type="number"
                      value={editFormData.commissionRate}
                      onChange={(e) => setEditFormData({ ...editFormData, commissionRate: parseFloat(e.target.value) || 0 })}
                      step="0.01"
                    />
                  </div>
                </div>
                <div className="input-group">
                  <label>Previous Balance</label>
                  <div className="input-prefix">
                    <span>&#8377;</span>
                    <input
                      type="number"
                      value={editFormData.previousBalance}
                      onChange={(e) => setEditFormData({ ...editFormData, previousBalance: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="input-group" style={{ gridColumn: 'span 2', display: 'flex', gap: 24, alignItems: 'center', paddingTop: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={editFormData.iprs}
                      onChange={(e) => setEditFormData({ ...editFormData, iprs: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent-blue)' }}
                    />
                    IPRS
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={editFormData.prs}
                      onChange={(e) => setEditFormData({ ...editFormData, prs: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent-blue)' }}
                    />
                    PRS
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={editFormData.isamra}
                      onChange={(e) => setEditFormData({ ...editFormData, isamra: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent-blue)' }}
                    />
                    ISAMRA
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedClientForEdit(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    await updateClient(selectedClientForEdit.clientId, editFormData);
                    setSelectedClientForEdit(null);
                  } catch (error) {
                    // updateClient already shows toast on error
                  }
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportsPanel;
