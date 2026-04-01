import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

const FY_ORDER = { apr: 0, may: 1, jun: 2, jul: 3, aug: 4, sep: 5, oct: 6, nov: 7, dec: 8, jan: 9, feb: 10, mar: 11 };

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
  const { clients, billingEntries, settings, updateClient } = useApp();
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
  const [dashboardClient, setDashboardClient] = useState('all');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardDropdownOpen, setDashboardDropdownOpen] = useState(false);
  const dashboardDropdownRef = useRef(null);
  const [outstandingSortDesc, setOutstandingSortDesc] = useState(false);
  const [clientReportClient, setClientReportClient] = useState(null);
  const [clientReportSearch, setClientReportSearch] = useState('');
  const [clientReportDropdownOpen, setClientReportDropdownOpen] = useState(false);
  const clientReportDropdownRef = useRef(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [contractSearch, setContractSearch] = useState('');
  const [editingContracts, setEditingContracts] = useState(null);
  const [expandedContractClient, setExpandedContractClient] = useState(null);

  const SOCIETIES = ['IPRS', 'PRS', 'ASCAP', 'ISAMRA', 'PPL', 'MLC', 'Sound Exchange'];
  const societyClass = (s) => 'society-' + s.toLowerCase().replace(/\s+/g, '');
  const [showRoyaltyBreakdown, setShowRoyaltyBreakdown] = useState(false);
  const [royaltyBreakdownType, setRoyaltyBreakdownType] = useState('IPRS');
  const [royaltyBreakdownFormat, setRoyaltyBreakdownFormat] = useState('pdf');
  const [royaltyBreakdownMonths, setRoyaltyBreakdownMonths] = useState(null);
  const royaltyBreakdownRef = useRef(null);
  const [selectedExportSections, setSelectedExportSections] = useState({
    royalty: true,
    commission: true,
    gst: true,
    receipts: true,
    outstanding: true,
    summary: true,
  });

  // Proper outside click handler for dashboard filter dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dashboardDropdownRef.current && !dashboardDropdownRef.current.contains(e.target)) {
        setDashboardDropdownOpen(false);
      }
      if (clientReportDropdownRef.current && !clientReportDropdownRef.current.contains(e.target)) {
        setClientReportDropdownOpen(false);
      }
      if (royaltyBreakdownRef.current && !royaltyBreakdownRef.current.contains(e.target)) {
        setShowRoyaltyBreakdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    const src = dashboardClient === 'all' ? entries : entries.filter(e => e.clientId === dashboardClient);
    const totalClients = dashboardClient === 'all' ? clients.length : 1;
    const totalEntries = src.length;
    const draftCount = src.filter(e => e.status === 'draft').length;
    const submittedCount = src.filter(e => e.status === 'submitted').length;
    const totalCommission = src.reduce((sum, e) => sum + (e.totalCommission || 0), 0);
    // Previous Year Outstanding = sum of April entries' previousMonthOutstanding (carry-forward from prev FY March)
    const prevYearOutstanding = src
      .filter(e => e.month === 'apr')
      .reduce((sum, e) => sum + (e.previousMonthOutstanding || 0), 0);
    // Total Outstanding = sum of each client's latest month outstanding only
    const latestByClient = {};
    src.forEach(e => {
      const prev = latestByClient[e.clientId];
      if (!prev || FY_ORDER[e.month] > FY_ORDER[prev.month] || (e.year > prev.year)) {
        latestByClient[e.clientId] = e;
      }
    });
    const totalOutstanding = Object.values(latestByClient).reduce((sum, e) => sum + (e.totalOutstanding || 0), 0);
    const totalIprs = src.reduce((sum, e) => sum + (e.iprsAmount || 0), 0);
    const totalPrs = src.reduce((sum, e) => sum + (e.prsAmount || 0), 0);
    const totalAscap = src.reduce((sum, e) => sum + (e.ascapAmount || 0), 0);
    const totalIsamra = src.reduce((sum, e) => sum + (e.isamraAmount || 0), 0);
    const totalSoundEx = src.reduce((sum, e) => sum + (e.soundExchangeAmount || 0), 0);
    const totalPpl = src.reduce((sum, e) => sum + (e.pplAmount || 0), 0);
    const totalMlc = src.reduce((sum, e) => sum + (e.mlcAmount || 0), 0);

    return { totalClients, totalEntries, draftCount, submittedCount, totalCommission, prevYearOutstanding, totalOutstanding, totalIprs, totalPrs, totalAscap, totalIsamra, totalSoundEx, totalPpl, totalMlc };
  }, [clients, entries, dashboardClient]);

  const dateLabel = `${dateFrom}_to_${dateTo}`;

  // Client Report data: all entries for selected client, sorted by FY order
  const clientReportEntries = useMemo(() => {
    if (!clientReportClient) return [];
    return entries
      .filter(e => e.clientId === clientReportClient)
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return FY_ORDER[a.month] - FY_ORDER[b.month];
      });
  }, [entries, clientReportClient]);

  const clientReportSummary = useMemo(() => {
    const e = clientReportEntries;
    if (e.length === 0) return null;
    const sum = (fn) => e.reduce((s, x) => s + (fn(x) || 0), 0);
    const last = e[e.length - 1];
    const first = e[0];
    return {
      iprsAmount: sum(x => x.iprsAmount),
      prsAmount: sum(x => x.prsAmount),
      soundExchangeAmount: sum(x => x.soundExchangeAmount),
      isamraAmount: sum(x => x.isamraAmount),
      ascapAmount: sum(x => x.ascapAmount),
      pplAmount: sum(x => x.pplAmount),
      mlcAmount: sum(x => x.mlcAmount),
      iprsCommission: sum(x => x.iprsCommission),
      prsCommission: sum(x => x.prsCommission),
      soundExchangeCommission: sum(x => x.soundExchangeCommission),
      isamraCommission: sum(x => x.isamraCommission),
      ascapCommission: sum(x => x.ascapCommission),
      pplCommission: sum(x => x.pplCommission),
      mlcCommission: sum(x => x.mlcCommission),
      totalCommission: sum(x => x.totalCommission),
      currentMonthGstBase: sum(x => x.currentMonthGstBase),
      currentMonthGst: sum(x => x.currentMonthGst),
      currentMonthInvoiceTotal: sum(x => x.currentMonthInvoiceTotal),
      previousOutstandingGstBase: sum(x => x.previousOutstandingGstBase),
      previousOutstandingGst: sum(x => x.previousOutstandingGst),
      previousOutstandingInvoiceTotal: sum(x => x.previousOutstandingInvoiceTotal),
      currentMonthReceipt: sum(x => x.currentMonthReceipt),
      currentMonthTds: sum(x => x.currentMonthTds),
      previousMonthReceipt: sum(x => x.previousMonthReceipt),
      previousMonthTds: sum(x => x.previousMonthTds),
      monthlyOutstanding: sum(x => x.monthlyOutstanding),
      totalOutstanding: last.totalOutstanding || 0,
      previousMonthOutstanding: first.previousMonthOutstanding || 0,
      invoicePendingCurrentMonth: sum(x => x.invoicePendingCurrentMonth),
      previousInvoicePending: sum(x => x.previousInvoicePending),
    };
  }, [clientReportEntries]);

  const exportClientReportExcel = () => {
    if (!clientReportClient || clientReportEntries.length === 0) return;
    const clientObj = clients.find(c => c.clientId === clientReportClient);
    const clientName = clientObj?.name || clientReportClient;
    const safeName = clientName.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 31);

    const headers = [
      'Month', 'IPRS Amount', 'PRS Amount (INR)', 'Sound Exchange', 'ISAMRA', 'ASCAP', 'PPL', 'MLC',
      'Commission Rate', 'IPRS Comm.', 'PRS Comm.', 'Sound Ex. Comm.', 'ISAMRA Comm.', 'ASCAP Comm.', 'PPL Comm.', 'MLC Comm.',
      'Total Commission',
      'Cur. GST Base', 'Cur. GST', 'Cur. Invoice Total',
      'Prev. GST Base', 'Prev. GST', 'Prev. Invoice Total',
      'Cur. Receipt', 'Cur. TDS', 'Prev. Receipt', 'Prev. TDS',
      'Prev. Month O/S (Carry-Forward)', 'Invoice Pending (Current)', 'Prev. Invoice Pending',
      'Monthly Outstanding', 'Total Outstanding', 'Status'
    ];

    const dataRows = clientReportEntries.map(e => [
      `${monthLabels[e.month]} ${e.year}`,
      e.iprsAmount || 0, e.prsAmount || 0, e.soundExchangeAmount || 0, e.isamraAmount || 0, e.ascapAmount || 0, e.pplAmount || 0, e.mlcAmount || 0,
      `${e.commissionRate || 0}%`,
      e.iprsCommission || 0, e.prsCommission || 0, e.soundExchangeCommission || 0, e.isamraCommission || 0, e.ascapCommission || 0, e.pplCommission || 0, e.mlcCommission || 0,
      e.totalCommission || 0,
      e.currentMonthGstBase || 0, e.currentMonthGst || 0, e.currentMonthInvoiceTotal || 0,
      e.previousOutstandingGstBase || 0, e.previousOutstandingGst || 0, e.previousOutstandingInvoiceTotal || 0,
      e.currentMonthReceipt || 0, e.currentMonthTds || 0, e.previousMonthReceipt || 0, e.previousMonthTds || 0,
      e.previousMonthOutstanding || 0, e.invoicePendingCurrentMonth || 0, e.previousInvoicePending || 0,
      e.monthlyOutstanding || 0, e.totalOutstanding || 0, e.status || ''
    ]);

    // Add totals row
    if (clientReportSummary) {
      const s = clientReportSummary;
      dataRows.push([
        'TOTAL',
        s.iprsAmount, s.prsAmount, s.soundExchangeAmount, s.isamraAmount, s.ascapAmount, s.pplAmount, s.mlcAmount,
        '',
        s.iprsCommission, s.prsCommission, s.soundExchangeCommission, s.isamraCommission, s.ascapCommission, s.pplCommission, s.mlcCommission,
        s.totalCommission,
        s.currentMonthGstBase, s.currentMonthGst, s.currentMonthInvoiceTotal,
        s.previousOutstandingGstBase, s.previousOutstandingGst, s.previousOutstandingInvoiceTotal,
        s.currentMonthReceipt, s.currentMonthTds, s.previousMonthReceipt, s.previousMonthTds,
        s.previousMonthOutstanding, s.invoicePendingCurrentMonth, s.previousInvoicePending,
        s.monthlyOutstanding, s.totalOutstanding, ''
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet([
      [`Client Report: ${clientName} (${clientReportClient})`],
      [`FY ${financialYear.startYear}-${financialYear.endYear}`],
      [`Commission Rate: ${clientObj?.commissionRate || ''}% | Type: ${clientObj?.type || ''}`],
      [],
      headers,
      ...dataRows
    ]);

    // Set column widths
    ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 16 : Math.max(h.length + 2, 14) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, safeName || 'Client Report');
    XLSX.writeFile(wb, `MRM_Client_Report_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_FY${financialYear.startYear}-${financialYear.endYear}.xlsx`);
  };

  // Helper to create a sheet with a title header
  const makeSheet = (title, subtitle, headers, rows, colWidths) => {
    const aoa = [
      [title],
      [subtitle],
      [],
      headers,
      ...rows
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = colWidths || headers.map((h, i) => ({ wch: i === 0 ? 18 : Math.max(String(h).length + 2, 15) }));
    return ws;
  };

  const exportClientReportDetailedExcel = () => {
    if (!clientReportClient || clientReportEntries.length === 0) return;
    const clientObj = clients.find(c => c.clientId === clientReportClient);
    const clientName = clientObj?.name || clientReportClient;
    const fyLabel = `FY ${financialYear.startYear}-${financialYear.endYear}`;
    const titleLine = `${clientName} (${clientReportClient}) — ${fyLabel}`;
    const infoLine = `Commission: ${clientObj?.commissionRate || 0}% | Type: ${clientObj?.type || 'N/A'}`;
    const s = clientReportSummary;
    const ee = clientReportEntries;
    const m = (e) => `${monthLabels[e.month]} ${e.year}`;

    const wb = XLSX.utils.book_new();

    // 1. Royalty Amounts
    {
      const h = ['Month', 'IPRS Amount', 'PRS Amount (INR)', 'Sound Exchange', 'ISAMRA', 'ASCAP', 'PPL', 'MLC'];
      const rows = ee.map(e => [m(e), e.iprsAmount||0, e.prsAmount||0, e.soundExchangeAmount||0, e.isamraAmount||0, e.ascapAmount||0, e.pplAmount||0, e.mlcAmount||0]);
      if (s) rows.push(['TOTAL', s.iprsAmount, s.prsAmount, s.soundExchangeAmount, s.isamraAmount, s.ascapAmount, s.pplAmount, s.mlcAmount]);
      XLSX.utils.book_append_sheet(wb, makeSheet(titleLine, infoLine, h, rows), 'Royalty Amounts');
    }

    // 2. Commission Breakdown
    {
      const h = ['Month', 'Rate', 'IPRS Comm.', 'PRS Comm.', 'Sound Ex. Comm.', 'ISAMRA Comm.', 'ASCAP Comm.', 'PPL Comm.', 'MLC Comm.', 'Total Commission'];
      const rows = ee.map(e => [m(e), `${e.commissionRate||0}%`, e.iprsCommission||0, e.prsCommission||0, e.soundExchangeCommission||0, e.isamraCommission||0, e.ascapCommission||0, e.pplCommission||0, e.mlcCommission||0, e.totalCommission||0]);
      if (s) rows.push(['TOTAL', '', s.iprsCommission, s.prsCommission, s.soundExchangeCommission, s.isamraCommission, s.ascapCommission, s.pplCommission, s.mlcCommission, s.totalCommission]);
      XLSX.utils.book_append_sheet(wb, makeSheet(titleLine, infoLine, h, rows), 'Commission');
    }

    // 3. GST & Invoice
    {
      const h = ['Month', 'Cur. GST Base', 'Cur. GST (18%)', 'Cur. Invoice Total', 'Prev. GST Base', 'Prev. GST (18%)', 'Prev. Invoice Total'];
      const rows = ee.map(e => [m(e), e.currentMonthGstBase||0, e.currentMonthGst||0, e.currentMonthInvoiceTotal||0, e.previousOutstandingGstBase||0, e.previousOutstandingGst||0, e.previousOutstandingInvoiceTotal||0]);
      if (s) rows.push(['TOTAL', s.currentMonthGstBase, s.currentMonthGst, s.currentMonthInvoiceTotal, s.previousOutstandingGstBase, s.previousOutstandingGst, s.previousOutstandingInvoiceTotal]);
      XLSX.utils.book_append_sheet(wb, makeSheet(titleLine, infoLine, h, rows), 'GST & Invoice');
    }

    // 4. Receipts & TDS
    {
      const h = ['Month', 'Cur. Receipt', 'Cur. TDS', 'Prev. Receipt', 'Prev. TDS', 'Total Deductions'];
      const rows = ee.map(e => {
        const td = (e.currentMonthReceipt||0)+(e.currentMonthTds||0)+(e.previousMonthReceipt||0)+(e.previousMonthTds||0);
        return [m(e), e.currentMonthReceipt||0, e.currentMonthTds||0, e.previousMonthReceipt||0, e.previousMonthTds||0, td];
      });
      if (s) {
        const totalDed = s.currentMonthReceipt + s.currentMonthTds + s.previousMonthReceipt + s.previousMonthTds;
        rows.push(['TOTAL', s.currentMonthReceipt, s.currentMonthTds, s.previousMonthReceipt, s.previousMonthTds, totalDed]);
      }
      XLSX.utils.book_append_sheet(wb, makeSheet(titleLine, infoLine, h, rows), 'Receipts & TDS');
    }

    // 5. Outstanding Tracking
    {
      const h = ['Month', 'Prev. O/S (Carry-Forward)', 'Total Commission', 'Cur. Invoice Total', 'Prev. Invoice Total', 'Cur. Receipt', 'Cur. TDS', 'Prev. Receipt', 'Prev. TDS', 'Invoice Pending (Cur.)', 'Prev. Invoice Pending', 'Monthly Outstanding', 'Total Outstanding'];
      const rows = ee.map(e => [m(e), e.previousMonthOutstanding||0, e.totalCommission||0, e.currentMonthInvoiceTotal||0, e.previousOutstandingInvoiceTotal||0, e.currentMonthReceipt||0, e.currentMonthTds||0, e.previousMonthReceipt||0, e.previousMonthTds||0, e.invoicePendingCurrentMonth||0, e.previousInvoicePending||0, e.monthlyOutstanding||0, e.totalOutstanding||0]);
      if (s) rows.push(['TOTAL', s.previousMonthOutstanding, s.totalCommission, s.currentMonthInvoiceTotal, s.previousOutstandingInvoiceTotal, s.currentMonthReceipt, s.currentMonthTds, s.previousMonthReceipt, s.previousMonthTds, s.invoicePendingCurrentMonth, s.previousInvoicePending, s.monthlyOutstanding, s.totalOutstanding]);
      XLSX.utils.book_append_sheet(wb, makeSheet(titleLine, infoLine, h, rows), 'Outstanding');
    }

    // 6. Summary sheet
    {
      const totalReceipts = (s?.currentMonthReceipt||0) + (s?.previousMonthReceipt||0);
      const totalTds = (s?.currentMonthTds||0) + (s?.previousMonthTds||0);
      const totalInvoiced = (s?.currentMonthInvoiceTotal||0) + (s?.previousOutstandingInvoiceTotal||0);
      const summaryData = [
        [titleLine],
        [infoLine],
        [],
        ['FINAL SUMMARY'],
        [],
        ['Description', 'Amount (INR)'],
        ['Opening Balance (Carry-Forward)', s?.previousMonthOutstanding || 0],
        ['(+) Total Commission Earned', s?.totalCommission || 0],
        ['(+) Total GST Invoiced', totalInvoiced],
        ['(−) Total Receipts Received', totalReceipts],
        ['(−) Total TDS Deducted', totalTds],
        [],
        ['(=) Final Outstanding', s?.totalOutstanding || 0],
        [],
        [],
        ['ROYALTY BREAKDOWN'],
        ['Source', 'Amount', 'Commission'],
        ['IPRS', s?.iprsAmount||0, s?.iprsCommission||0],
        ['PRS', s?.prsAmount||0, s?.prsCommission||0],
        ['Sound Exchange', s?.soundExchangeAmount||0, s?.soundExchangeCommission||0],
        ['ISAMRA', s?.isamraAmount||0, s?.isamraCommission||0],
        ['ASCAP', s?.ascapAmount||0, s?.ascapCommission||0],
        ['PPL', s?.pplAmount||0, s?.pplCommission||0],
        ['MLC', s?.mlcAmount||0, s?.mlcCommission||0],
        ['Total', (s?.iprsAmount||0)+(s?.prsAmount||0)+(s?.soundExchangeAmount||0)+(s?.isamraAmount||0)+(s?.ascapAmount||0)+(s?.pplAmount||0)+(s?.mlcAmount||0), s?.totalCommission||0],
      ];
      const ws = XLSX.utils.aoa_to_sheet(summaryData);
      ws['!cols'] = [{ wch: 36 }, { wch: 20 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    }

    XLSX.writeFile(wb, `MRM_Detailed_Report_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${fyLabel.replace(/\s/g, '')}.xlsx`);
  };

  // ── IPRS Detail PDF Export ──
  const exportIprsPDF = (filteredEntries) => {
    const entries = filteredEntries || clientReportEntries;
    if (!clientReportClient || entries.length === 0) return;
    const clientObj = clients.find(c => c.clientId === clientReportClient);
    const clientName = clientObj?.name || clientReportClient;
    const fyLabel = `FY ${financialYear.startYear}-${financialYear.endYear}`;
    const commRate = clientObj?.commissionRate || 0;
    const fmtNum = (v) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Title
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
    doc.text(`IPRS Royalty Details — ${clientName}`, 14, 18);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`${clientReportClient} | ${fyLabel} | Commission Rate: ${commRate}%`, 14, 25);

    // Collect all IPRS entries across all months
    const allRows = [];
    let grandReceived = 0, grandTds = 0, grandAfterTds = 0, grandCommission = 0;

    entries.forEach(entry => {
      const monthLabel = `${monthLabels[entry.month]} ${entry.year}`;
      if (entry.iprsEntries && entry.iprsEntries.length > 0) {
        entry.iprsEntries.forEach(row => {
          const received = row.receivedAmount || 0;
          const tds = row.tdsDeduction || 0;
          const afterTds = row.afterTdsAmount || (received - tds);
          const commission = row.commission || 0;
          allRows.push([monthLabel, row.date || '—', fmtNum(received), fmtNum(tds), fmtNum(afterTds), fmtNum(commission)]);
          grandReceived += received; grandTds += tds; grandAfterTds += afterTds; grandCommission += commission;
        });
      } else if ((entry.iprsAmount || 0) > 0) {
        // Legacy entry without detailed rows
        const amt = entry.iprsAmount || 0;
        const comm = entry.iprsCommission || 0;
        allRows.push([monthLabel, '—', fmtNum(amt), '—', '—', fmtNum(comm)]);
        grandReceived += amt; grandCommission += comm;
      }
    });

    if (allRows.length === 0) {
      allRows.push(['No IPRS data', '', '', '', '', '']);
    }

    allRows.push(['TOTAL', '', fmtNum(grandReceived), fmtNum(grandTds), fmtNum(grandAfterTds), fmtNum(grandCommission)]);

    autoTable(doc, {
      startY: 32,
      head: [['Month', 'Date of Royalty Received', 'Received Royalty Amount', 'TDS Deduction', 'After TDS Received Royalty', 'Commission']],
      body: allRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.5, halign: 'right' },
      headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 8 },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' }, 1: { halign: 'center' } },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.row.raw && data.row.raw[0] === 'TOTAL') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [229, 231, 235];
        }
      },
    });

    doc.save(`IPRS_Details_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${fyLabel.replace(/\s/g, '')}.pdf`);
  };

  // ── PRS Detail PDF Export ──
  const exportPrsPDF = (filteredEntries) => {
    const entries = filteredEntries || clientReportEntries;
    if (!clientReportClient || entries.length === 0) return;
    const clientObj = clients.find(c => c.clientId === clientReportClient);
    const clientName = clientObj?.name || clientReportClient;
    const fyLabel = `FY ${financialYear.startYear}-${financialYear.endYear}`;
    const commRate = clientObj?.commissionRate || 0;
    const fmtNum = (v) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
    const fmtGbp = (v) => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
    doc.text(`PRS Royalty Details — ${clientName}`, 14, 18);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`${clientReportClient} | ${fyLabel} | Commission Rate: ${commRate}%`, 14, 25);

    const allRows = [];
    let grandGbp = 0, grandInr = 0, grandCommission = 0;

    entries.forEach(entry => {
      const monthLabel = `${monthLabels[entry.month]} ${entry.year}`;
      if (entry.prsEntries && entry.prsEntries.length > 0) {
        entry.prsEntries.forEach(row => {
          const gbp = row.receivedGbp || 0;
          const rate = row.gbpToInrRate || 0;
          const inr = row.receivedInr || 0;
          const commission = row.commission || 0;
          allRows.push([monthLabel, row.date || '—', fmtGbp(gbp), fmtNum(rate), fmtNum(inr), fmtNum(commission)]);
          grandGbp += gbp; grandInr += inr; grandCommission += commission;
        });
      } else if ((entry.prsAmount || 0) > 0) {
        // Legacy entry — use prsGbp, gbpToInrRate, prsAmount
        const gbp = entry.prsGbp || 0;
        const rate = entry.gbpToInrRate || 0;
        const inr = entry.prsAmount || 0;
        const comm = entry.prsCommission || 0;
        allRows.push([monthLabel, '—', fmtGbp(gbp), rate ? fmtNum(rate) : '—', fmtNum(inr), fmtNum(comm)]);
        grandGbp += gbp; grandInr += inr; grandCommission += comm;
      }
    });

    if (allRows.length === 0) {
      allRows.push(['No PRS data', '', '', '', '', '']);
    }

    allRows.push(['TOTAL', '', fmtGbp(grandGbp), '', fmtNum(grandInr), fmtNum(grandCommission)]);

    autoTable(doc, {
      startY: 32,
      head: [['Month', 'Date of Royalty Received', 'Received Royalty (GBP)', 'GBP to INR Rate', 'Received Royalty (INR)', 'Commission']],
      body: allRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.5, halign: 'right' },
      headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 8 },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' }, 1: { halign: 'center' } },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.row.raw && data.row.raw[0] === 'TOTAL') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [229, 231, 235];
        }
      },
    });

    doc.save(`PRS_Details_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${fyLabel.replace(/\s/g, '')}.pdf`);
  };

  // ── Generic Royalty Breakdown Export (PDF / Excel) ──
  const exportRoyaltyBreakdown = (type, format, selectedMonthKeys) => {
    const filteredEntries = (selectedMonthKeys && selectedMonthKeys.length > 0)
      ? clientReportEntries.filter(e => selectedMonthKeys.includes(`${e.month}-${e.year}`))
      : clientReportEntries;
    if (!clientReportClient || filteredEntries.length === 0) return;
    const clientObj = clients.find(c => c.clientId === clientReportClient);
    const clientName = clientObj?.name || clientReportClient;
    const fyLabel = `FY ${financialYear.startYear}-${financialYear.endYear}`;
    const commRate = clientObj?.commissionRate || 0;
    const fmtNum = (v) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

    // Special handling for IPRS and PRS (they have detailed entries)
    if (type === 'IPRS') {
      if (format === 'pdf') { exportIprsPDF(filteredEntries); return; }
      // Excel export for IPRS
      const headers = ['Month', 'Date of Royalty Received', 'Received Royalty Amount', 'TDS Deduction', 'After TDS Received Royalty', 'Commission'];
      const rows = [];
      let grandReceived = 0, grandTds = 0, grandAfterTds = 0, grandCommission = 0;
      filteredEntries.forEach(entry => {
        const ml = `${monthLabels[entry.month]} ${entry.year}`;
        if (entry.iprsEntries && entry.iprsEntries.length > 0) {
          entry.iprsEntries.forEach(row => {
            const received = row.receivedAmount || 0, tds = row.tdsDeduction || 0;
            const afterTds = row.afterTdsAmount || (received - tds), commission = row.commission || 0;
            rows.push([ml, row.date || '—', received, tds, afterTds, commission]);
            grandReceived += received; grandTds += tds; grandAfterTds += afterTds; grandCommission += commission;
          });
        } else if ((entry.iprsAmount || 0) > 0) {
          rows.push([ml, '—', entry.iprsAmount || 0, 0, 0, entry.iprsCommission || 0]);
          grandReceived += entry.iprsAmount || 0; grandCommission += entry.iprsCommission || 0;
        }
      });
      rows.push(['TOTAL', '', grandReceived, grandTds, grandAfterTds, grandCommission]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'IPRS Details');
      XLSX.writeFile(wb, `IPRS_Details_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${fyLabel.replace(/\s/g, '')}.xlsx`);
      return;
    }

    if (type === 'PRS') {
      if (format === 'pdf') { exportPrsPDF(filteredEntries); return; }
      // Excel export for PRS
      const headers = ['Month', 'Date of Royalty Received', 'Received Royalty (GBP)', 'GBP to INR Rate', 'Received Royalty (INR)', 'Commission'];
      const rows = [];
      let grandGbp = 0, grandInr = 0, grandCommission = 0;
      filteredEntries.forEach(entry => {
        const ml = `${monthLabels[entry.month]} ${entry.year}`;
        if (entry.prsEntries && entry.prsEntries.length > 0) {
          entry.prsEntries.forEach(row => {
            const gbp = row.receivedGbp || 0, rate = row.gbpToInrRate || 0, inr = row.receivedInr || 0, commission = row.commission || 0;
            rows.push([ml, row.date || '—', gbp, rate, inr, commission]);
            grandGbp += gbp; grandInr += inr; grandCommission += commission;
          });
        } else if ((entry.prsAmount || 0) > 0) {
          rows.push([ml, '—', entry.prsGbp || 0, entry.gbpToInrRate || 0, entry.prsAmount || 0, entry.prsCommission || 0]);
          grandGbp += entry.prsGbp || 0; grandInr += entry.prsAmount || 0; grandCommission += entry.prsCommission || 0;
        }
      });
      rows.push(['TOTAL', '', grandGbp, '', grandInr, grandCommission]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PRS Details');
      XLSX.writeFile(wb, `PRS_Details_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${fyLabel.replace(/\s/g, '')}.xlsx`);
      return;
    }

    // Generic royalty types: Sound Exchange, ISAMRA, ASCAP, PPL, MLC
    const fieldMap = {
      'Sound Exchange': { amount: 'soundExchangeAmount', commission: 'soundExchangeCommission' },
      'ISAMRA': { amount: 'isamraAmount', commission: 'isamraCommission' },
      'ASCAP': { amount: 'ascapAmount', commission: 'ascapCommission' },
      'PPL': { amount: 'pplAmount', commission: 'pplCommission' },
      'MLC': { amount: 'mlcAmount', commission: 'mlcCommission' },
    };
    const fields = fieldMap[type];
    if (!fields) return;

    const headers = ['Month', `${type} Amount`, `${type} Commission`];
    const rows = [];
    let grandAmount = 0, grandCommission = 0;
    filteredEntries.forEach(entry => {
      const ml = `${monthLabels[entry.month]} ${entry.year}`;
      const amt = entry[fields.amount] || 0;
      const comm = entry[fields.commission] || 0;
      rows.push([ml, amt, comm]);
      grandAmount += amt;
      grandCommission += comm;
    });
    rows.push(['TOTAL', grandAmount, grandCommission]);

    if (format === 'pdf') {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
      doc.text(`${type} Royalty Details — ${clientName}`, 14, 18);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(`${clientReportClient} | ${fyLabel} | Commission Rate: ${commRate}%`, 14, 25);

      const pdfRows = rows.map(r => [r[0], fmtNum(r[1]), fmtNum(r[2])]);
      autoTable(doc, {
        startY: 32,
        head: [headers],
        body: pdfRows,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5, halign: 'right' },
        headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 8 },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.row.raw && data.row.raw[0] === 'TOTAL') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [229, 231, 235];
          }
        },
      });
      doc.save(`${type.replace(/\s/g, '_')}_Details_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${fyLabel.replace(/\s/g, '')}.pdf`);
    } else {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${type} Details`);
      XLSX.writeFile(wb, `${type.replace(/\s/g, '_')}_Details_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${fyLabel.replace(/\s/g, '')}.xlsx`);
    }
  };

  const exportSelectedSectionsPDF = () => {
    if (!clientReportClient || clientReportEntries.length === 0) return;
    const clientObj = clients.find(c => c.clientId === clientReportClient);
    const clientName = clientObj?.name || clientReportClient;
    const fyLabel = `FY ${financialYear.startYear}-${financialYear.endYear}`;
    const titleLine = `${clientName} (${clientReportClient}) — ${fyLabel}`;
    const infoLine = `Commission: ${clientObj?.commissionRate || 0}% | Type: ${clientObj?.type || 'N/A'}`;
    const s = clientReportSummary;
    const ee = clientReportEntries;
    const m = (e) => `${monthLabels[e.month]} ${e.year}`;
    const sel = selectedExportSections;
    const fmtNum = (v) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

    // ── Payment status analysis per entry ──
    const entryPaymentStatus = ee.map(e => {
      const commission = e.totalCommission || 0;
      const totalPaid = (e.currentMonthReceipt || 0) + (e.currentMonthTds || 0) + (e.previousMonthReceipt || 0) + (e.previousMonthTds || 0);
      const shortfall = Math.max(0, commission - totalPaid);
      // per-source: which royalty sources have unpaid commissions
      const sources = [
        { name: 'IPRS', amount: e.iprsAmount || 0, comm: e.iprsCommission || 0 },
        { name: 'PRS', amount: e.prsAmount || 0, comm: e.prsCommission || 0 },
        { name: 'Sound Exchange', amount: e.soundExchangeAmount || 0, comm: e.soundExchangeCommission || 0 },
        { name: 'ISAMRA', amount: e.isamraAmount || 0, comm: e.isamraCommission || 0 },
        { name: 'ASCAP', amount: e.ascapAmount || 0, comm: e.ascapCommission || 0 },
        { name: 'PPL', amount: e.pplAmount || 0, comm: e.pplCommission || 0 },
        { name: 'MLC', amount: e.mlcAmount || 0, comm: e.mlcCommission || 0 },
      ];
      let status = 'none'; // no commission
      if (commission > 0) {
        if (totalPaid <= 0) status = 'unpaid';
        else if (totalPaid < commission) status = 'partial';
        else status = 'paid';
      }
      return { ...e, commission, totalPaid, shortfall, status, sources };
    });

    // Color constants
    const RED_BG = [255, 230, 230];       // light red
    const RED_TEXT = [180, 30, 30];        // dark red
    const ORANGE_BG = [255, 243, 224];     // light orange
    const ORANGE_TEXT = [180, 100, 0];     // dark orange
    const GREEN_BG = [230, 255, 230];      // light green
    const GREEN_TEXT = [30, 130, 30];      // dark green
    const GRAY_BG = [229, 231, 235];

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    let isFirstSection = true;

    const addSectionHeader = (sectionTitle, subtitle) => {
      if (!isFirstSection) doc.addPage();
      isFirstSection = false;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text(titleLine, 14, 18);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(infoLine, 14, 25);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text(sectionTitle, 14, 34);
      if (subtitle) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        doc.text(subtitle, 14, 39);
      }
    };

    const getStatusColor = (idx) => {
      if (idx >= ee.length) return null; // TOTAL row
      const ps = entryPaymentStatus[idx];
      if (!ps) return null;
      return ps.status;
    };

    const autoTableDefaults = {
      startY: 42,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak', halign: 'right' },
      headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 8 },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 14, right: 14 },
    };

    // Shared cell parser that marks TOTAL row + applies payment status colors
    const makeDidParseCell = (opts = {}) => (data) => {
      const { colorAmountCells, colorFullRow, sourceColumns } = opts;
      // TOTAL row styling
      if (data.row.raw && data.row.raw[0] === 'TOTAL') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = GRAY_BG;
        return;
      }
      const status = getStatusColor(data.row.index);
      if (!status || status === 'none') return;

      // Color the status indicator column (first column: month name)
      if (colorFullRow && data.section === 'body') {
        if (status === 'unpaid') {
          data.cell.styles.fillColor = RED_BG;
          if (data.column.index > 0) data.cell.styles.textColor = RED_TEXT;
        } else if (status === 'partial') {
          data.cell.styles.fillColor = ORANGE_BG;
          if (data.column.index > 0) data.cell.styles.textColor = ORANGE_TEXT;
        } else if (status === 'paid') {
          data.cell.styles.fillColor = GREEN_BG;
          if (data.column.index > 0) data.cell.styles.textColor = GREEN_TEXT;
        }
      }

      if (colorAmountCells && data.section === 'body' && data.column.index > 0) {
        // Mark individual source amount cells red if that source has unpaid commission
        const entry = entryPaymentStatus[data.row.index];
        if (entry && sourceColumns) {
          const srcIdx = data.column.index - 1; // column 0 is month
          if (srcIdx >= 0 && srcIdx < sourceColumns.length) {
            const src = sourceColumns[srcIdx];
            const srcData = entry.sources.find(s => s.name === src);
            if (srcData && srcData.amount > 0 && entry.status !== 'paid') {
              data.cell.styles.fillColor = RED_BG;
              data.cell.styles.textColor = RED_TEXT;
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      }
    };

    let sectionCount = 0;

    // ── 1. Royalty Amounts (red-mark unpaid source cells) ──
    if (sel.royalty) {
      addSectionHeader('Royalty Amounts', 'RED cells = royalty source with unpaid commission contributing to outstanding');
      const sourceNames = ['IPRS', 'PRS', 'Sound Exchange', 'ISAMRA', 'ASCAP', 'PPL', 'MLC'];
      const head = [['Month', 'IPRS Amount', 'PRS Amount (INR)', 'Sound Exchange', 'ISAMRA', 'ASCAP', 'PPL', 'MLC']];
      const body = ee.map(e => [m(e), fmtNum(e.iprsAmount), fmtNum(e.prsAmount), fmtNum(e.soundExchangeAmount), fmtNum(e.isamraAmount), fmtNum(e.ascapAmount), fmtNum(e.pplAmount), fmtNum(e.mlcAmount)]);
      if (s) body.push(['TOTAL', fmtNum(s.iprsAmount), fmtNum(s.prsAmount), fmtNum(s.soundExchangeAmount), fmtNum(s.isamraAmount), fmtNum(s.ascapAmount), fmtNum(s.pplAmount), fmtNum(s.mlcAmount)]);
      autoTable(doc, { ...autoTableDefaults, head, body, didParseCell: makeDidParseCell({ colorAmountCells: true, sourceColumns: sourceNames }) });
      sectionCount++;
    }

    // ── 2. Commission Breakdown (red-mark unpaid commission cells) ──
    if (sel.commission) {
      addSectionHeader('Commission Breakdown', 'RED = unpaid commission | ORANGE = partially paid | GREEN = fully paid');
      const head = [['Month', 'Rate', 'IPRS Comm.', 'PRS Comm.', 'Sound Ex.', 'ISAMRA', 'ASCAP', 'PPL', 'MLC', 'Total Comm.']];
      const body = ee.map(e => [m(e), `${e.commissionRate||0}%`, fmtNum(e.iprsCommission), fmtNum(e.prsCommission), fmtNum(e.soundExchangeCommission), fmtNum(e.isamraCommission), fmtNum(e.ascapCommission), fmtNum(e.pplCommission), fmtNum(e.mlcCommission), fmtNum(e.totalCommission)]);
      if (s) body.push(['TOTAL', '', fmtNum(s.iprsCommission), fmtNum(s.prsCommission), fmtNum(s.soundExchangeCommission), fmtNum(s.isamraCommission), fmtNum(s.ascapCommission), fmtNum(s.pplCommission), fmtNum(s.mlcCommission), fmtNum(s.totalCommission)]);

      autoTable(doc, {
        ...autoTableDefaults, head, body,
        didParseCell: (data) => {
          if (data.row.raw && data.row.raw[0] === 'TOTAL') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = GRAY_BG;
            return;
          }
          const status = getStatusColor(data.row.index);
          if (!status || status === 'none' || data.section !== 'body') return;
          const entry = entryPaymentStatus[data.row.index];
          if (!entry) return;

          // Color the Total Commission column (last col = 8)
          if (data.column.index === 8) {
            if (status === 'unpaid') { data.cell.styles.fillColor = RED_BG; data.cell.styles.textColor = RED_TEXT; data.cell.styles.fontStyle = 'bold'; }
            else if (status === 'partial') { data.cell.styles.fillColor = ORANGE_BG; data.cell.styles.textColor = ORANGE_TEXT; data.cell.styles.fontStyle = 'bold'; }
            else if (status === 'paid') { data.cell.styles.fillColor = GREEN_BG; data.cell.styles.textColor = GREEN_TEXT; }
          }
          // Color individual source commission cells (cols 2-7)
          if (data.column.index >= 2 && data.column.index <= 7) {
            const srcNames = ['IPRS', 'PRS', 'Sound Exchange', 'ISAMRA', 'ASCAP', 'PPL'];
            const srcData = entry.sources.find(ss => ss.name === srcNames[data.column.index - 2]);
            if (srcData && srcData.comm > 0 && status !== 'paid') {
              data.cell.styles.fillColor = RED_BG;
              data.cell.styles.textColor = RED_TEXT;
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });
      sectionCount++;
    }

    // ── 3. GST & Invoice ──
    if (sel.gst) {
      addSectionHeader('GST & Invoice');
      const head = [['Month', 'Cur. GST Base', 'Cur. GST (18%)', 'Cur. Invoice Total', 'Prev. GST Base', 'Prev. GST (18%)', 'Prev. Invoice Total']];
      const body = ee.map(e => [m(e), fmtNum(e.currentMonthGstBase), fmtNum(e.currentMonthGst), fmtNum(e.currentMonthInvoiceTotal), fmtNum(e.previousOutstandingGstBase), fmtNum(e.previousOutstandingGst), fmtNum(e.previousOutstandingInvoiceTotal)]);
      if (s) body.push(['TOTAL', fmtNum(s.currentMonthGstBase), fmtNum(s.currentMonthGst), fmtNum(s.currentMonthInvoiceTotal), fmtNum(s.previousOutstandingGstBase), fmtNum(s.previousOutstandingGst), fmtNum(s.previousOutstandingInvoiceTotal)]);
      autoTable(doc, { ...autoTableDefaults, head, body, didParseCell: makeDidParseCell({}) });
      sectionCount++;
    }

    // ── 4. Receipts & TDS ──
    if (sel.receipts) {
      addSectionHeader('Receipts & TDS', 'RED row = no payment received for that month\'s commission');
      const head = [['Month', 'Cur. Receipt', 'Cur. TDS', 'Prev. Receipt', 'Prev. TDS', 'Total Deductions']];
      const body = ee.map(e => {
        const td = (e.currentMonthReceipt||0)+(e.currentMonthTds||0)+(e.previousMonthReceipt||0)+(e.previousMonthTds||0);
        return [m(e), fmtNum(e.currentMonthReceipt), fmtNum(e.currentMonthTds), fmtNum(e.previousMonthReceipt), fmtNum(e.previousMonthTds), fmtNum(td)];
      });
      if (s) {
        const totalDed = s.currentMonthReceipt + s.currentMonthTds + s.previousMonthReceipt + s.previousMonthTds;
        body.push(['TOTAL', fmtNum(s.currentMonthReceipt), fmtNum(s.currentMonthTds), fmtNum(s.previousMonthReceipt), fmtNum(s.previousMonthTds), fmtNum(totalDed)]);
      }
      autoTable(doc, { ...autoTableDefaults, head, body, didParseCell: makeDidParseCell({ colorFullRow: true }) });
      sectionCount++;
    }

    // ── 5. Outstanding Tracking (full row coloring) ──
    if (sel.outstanding) {
      addSectionHeader('Outstanding Tracking', 'RED = unpaid (adds to O/S) | ORANGE = partially paid | GREEN = fully settled');
      const head = [['Month', 'Prev O/S', 'Total Comm.', 'Cur. Inv.', 'Prev. Inv.', 'Cur. Rcpt', 'Cur. TDS', 'Prev. Rcpt', 'Prev. TDS', 'Inv. Pending', 'Prev. Inv. Pend.', 'Monthly O/S', 'Total O/S']];
      const body = ee.map(e => [m(e), fmtNum(e.previousMonthOutstanding), fmtNum(e.totalCommission), fmtNum(e.currentMonthInvoiceTotal), fmtNum(e.previousOutstandingInvoiceTotal), fmtNum(e.currentMonthReceipt), fmtNum(e.currentMonthTds), fmtNum(e.previousMonthReceipt), fmtNum(e.previousMonthTds), fmtNum(e.invoicePendingCurrentMonth), fmtNum(e.previousInvoicePending), fmtNum(e.monthlyOutstanding), fmtNum(e.totalOutstanding)]);
      if (s) body.push(['TOTAL', fmtNum(s.previousMonthOutstanding), fmtNum(s.totalCommission), fmtNum(s.currentMonthInvoiceTotal), fmtNum(s.previousOutstandingInvoiceTotal), fmtNum(s.currentMonthReceipt), fmtNum(s.currentMonthTds), fmtNum(s.previousMonthReceipt), fmtNum(s.previousMonthTds), fmtNum(s.invoicePendingCurrentMonth), fmtNum(s.previousInvoicePending), fmtNum(s.monthlyOutstanding), fmtNum(s.totalOutstanding)]);
      autoTable(doc, { ...autoTableDefaults, head, body, styles: { ...autoTableDefaults.styles, fontSize: 7 }, didParseCell: makeDidParseCell({ colorFullRow: true }) });
      sectionCount++;
    }

    // ── 6. Final Summary + Payment Status Analysis ──
    if (sel.summary && s) {
      addSectionHeader('Final Summary');
      const totalReceipts = (s.currentMonthReceipt||0) + (s.previousMonthReceipt||0);
      const totalTds = (s.currentMonthTds||0) + (s.previousMonthTds||0);
      const totalInvoiced = (s.currentMonthInvoiceTotal||0) + (s.previousOutstandingInvoiceTotal||0);

      const summaryBody = [
        ['Opening Balance (Carry-Forward)', fmtNum(s.previousMonthOutstanding)],
        ['(+) Total Commission Earned', fmtNum(s.totalCommission)],
        ['(+) Total GST Invoiced', fmtNum(totalInvoiced)],
        ['(\u2212) Total Receipts Received', fmtNum(totalReceipts)],
        ['(\u2212) Total TDS Deducted', fmtNum(totalTds)],
        ['(=) Final Outstanding', fmtNum(s.totalOutstanding)],
      ];
      autoTable(doc, {
        ...autoTableDefaults,
        head: [['Description', 'Amount (INR)']],
        body: summaryBody,
        columnStyles: { 0: { halign: 'left', cellWidth: 120 }, 1: { halign: 'right', cellWidth: 60 } },
        didParseCell: (data) => {
          if (data.row.index === summaryBody.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [255, 220, 220];
            data.cell.styles.textColor = RED_TEXT;
            data.cell.styles.fontSize = 10;
          }
          // Color add/subtract rows
          if (data.section === 'body' && data.column.index === 1) {
            if (data.row.index === 0 && (s.previousMonthOutstanding || 0) > 0) { data.cell.styles.textColor = ORANGE_TEXT; }
            if (data.row.index === 1 || data.row.index === 2) { data.cell.styles.textColor = [30, 130, 30]; }
            if (data.row.index === 3 || data.row.index === 4) { data.cell.styles.textColor = RED_TEXT; }
          }
        },
      });

      // ── Royalty Breakdown ──
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text('Royalty Breakdown', 14, finalY);

      const breakdownBody = [
        ['IPRS', fmtNum(s.iprsAmount), fmtNum(s.iprsCommission)],
        ['PRS', fmtNum(s.prsAmount), fmtNum(s.prsCommission)],
        ['Sound Exchange', fmtNum(s.soundExchangeAmount), fmtNum(s.soundExchangeCommission)],
        ['ISAMRA', fmtNum(s.isamraAmount), fmtNum(s.isamraCommission)],
        ['ASCAP', fmtNum(s.ascapAmount), fmtNum(s.ascapCommission)],
        ['PPL', fmtNum(s.pplAmount), fmtNum(s.pplCommission)],
        ['MLC', fmtNum(s.mlcAmount), fmtNum(s.mlcCommission)],
        ['Total', fmtNum((s.iprsAmount||0)+(s.prsAmount||0)+(s.soundExchangeAmount||0)+(s.isamraAmount||0)+(s.ascapAmount||0)+(s.pplAmount||0)+(s.mlcAmount||0)), fmtNum(s.totalCommission)],
      ];
      autoTable(doc, {
        ...autoTableDefaults,
        startY: finalY + 3,
        head: [['Source', 'Amount', 'Commission']],
        body: breakdownBody,
        columnStyles: { 0: { halign: 'left', cellWidth: 60 }, 1: { halign: 'right', cellWidth: 60 }, 2: { halign: 'right', cellWidth: 60 } },
        didParseCell: (data) => {
          if (data.row.index === breakdownBody.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = GRAY_BG;
          }
        },
      });

      // ── NEW: Payment Status Analysis page ──
      doc.addPage();
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text(titleLine, 14, 18);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(infoLine, 14, 25);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 30, 30);
      doc.text('Payment Status Analysis — Outstanding Breakdown', 14, 34);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text('This section explains WHY the outstanding amount is what it is. RED = unpaid, ORANGE = partially paid, GREEN = fully settled.', 14, 39);

      // Build analysis body
      const analysisHead = [['Month', 'Commission Earned', 'Receipts + TDS Paid', 'Shortfall (Unpaid)', 'Unpaid Sources', 'Status']];
      const analysisBody = entryPaymentStatus.map(e => {
        const unpaidSources = e.sources.filter(src => src.comm > 0 && e.status !== 'paid').map(src => `${src.name} (${fmtNum(src.comm)})`).join(', ') || '-';
        const statusLabel = e.status === 'unpaid' ? 'UNPAID' : e.status === 'partial' ? 'PARTIAL' : e.status === 'paid' ? 'PAID' : '-';
        return [m(e), fmtNum(e.commission), fmtNum(e.totalPaid), fmtNum(e.shortfall), unpaidSources, statusLabel];
      });

      // Add totals
      const totalComm = entryPaymentStatus.reduce((a, e) => a + e.commission, 0);
      const totalPaidAll = entryPaymentStatus.reduce((a, e) => a + e.totalPaid, 0);
      const totalShortfall = entryPaymentStatus.reduce((a, e) => a + e.shortfall, 0);
      analysisBody.push(['TOTAL', fmtNum(totalComm), fmtNum(totalPaidAll), fmtNum(totalShortfall), '', '']);

      autoTable(doc, {
        ...autoTableDefaults,
        head: analysisHead,
        body: analysisBody,
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold', cellWidth: 30 },
          1: { halign: 'right', cellWidth: 35 },
          2: { halign: 'right', cellWidth: 35 },
          3: { halign: 'right', cellWidth: 35 },
          4: { halign: 'left', cellWidth: 100, fontSize: 7 },
          5: { halign: 'center', cellWidth: 25 },
        },
        didParseCell: (data) => {
          if (data.row.raw && data.row.raw[0] === 'TOTAL') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = GRAY_BG;
            return;
          }
          if (data.section !== 'body' || data.row.index >= ee.length) return;
          const ps = entryPaymentStatus[data.row.index];
          if (!ps) return;

          // Status column coloring
          if (data.column.index === 5) {
            if (ps.status === 'unpaid') { data.cell.styles.fillColor = RED_BG; data.cell.styles.textColor = RED_TEXT; data.cell.styles.fontStyle = 'bold'; }
            else if (ps.status === 'partial') { data.cell.styles.fillColor = ORANGE_BG; data.cell.styles.textColor = ORANGE_TEXT; data.cell.styles.fontStyle = 'bold'; }
            else if (ps.status === 'paid') { data.cell.styles.fillColor = GREEN_BG; data.cell.styles.textColor = GREEN_TEXT; data.cell.styles.fontStyle = 'bold'; }
          }
          // Shortfall column red if > 0
          if (data.column.index === 3 && ps.shortfall > 0) {
            data.cell.styles.fillColor = RED_BG;
            data.cell.styles.textColor = RED_TEXT;
            data.cell.styles.fontStyle = 'bold';
          }
          // Unpaid sources column red if unpaid
          if (data.column.index === 4 && ps.status !== 'paid' && ps.status !== 'none') {
            data.cell.styles.textColor = RED_TEXT;
          }
          // Full row tint
          if (ps.status === 'unpaid') {
            data.cell.styles.fillColor = RED_BG;
          } else if (ps.status === 'partial') {
            data.cell.styles.fillColor = ORANGE_BG;
          } else if (ps.status === 'paid') {
            data.cell.styles.fillColor = GREEN_BG;
          }
        },
      });

      // Outstanding explanation text below table
      const explainY = doc.lastAutoTable.finalY + 8;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 30, 30);
      const openingBal = s.previousMonthOutstanding || 0;
      doc.text(`Outstanding Explanation:`, 14, explainY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const lines = [
        `Opening Balance (Carry-Forward from previous FY): ${fmtNum(openingBal)}`,
        `Total Commission Earned this FY: ${fmtNum(totalComm)}`,
        `Total Payments Received (Receipts + TDS): ${fmtNum(totalPaidAll)}`,
        `Unpaid Commission (Shortfall): ${fmtNum(totalShortfall)}`,
        `Final Outstanding = Opening Balance + Shortfall = ${fmtNum(openingBal)} + ${fmtNum(totalShortfall)} = ${fmtNum(s.totalOutstanding)}`,
      ];
      lines.forEach((line, i) => {
        if (i === lines.length - 1) { doc.setFont('helvetica', 'bold'); doc.setTextColor(180, 30, 30); }
        doc.text(line, 14, explainY + 6 + (i * 5));
      });

      // Legend
      const legendY = explainY + 6 + (lines.length * 5) + 8;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text('Color Legend:', 14, legendY);
      const legends = [
        { color: RED_BG, label: 'RED — Unpaid: Commission earned but no payment received', textColor: RED_TEXT },
        { color: ORANGE_BG, label: 'ORANGE — Partial: Payment received but less than commission', textColor: ORANGE_TEXT },
        { color: GREEN_BG, label: 'GREEN — Paid: Commission fully settled', textColor: GREEN_TEXT },
      ];
      legends.forEach((lg, i) => {
        const y = legendY + 5 + (i * 6);
        doc.setFillColor(...lg.color);
        doc.rect(14, y - 3, 4, 4, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...lg.textColor);
        doc.text(lg.label, 20, y);
      });

      sectionCount++;
    }

    if (sectionCount === 0) return;

    // Add page numbers
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${totalPages}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
      doc.text('MRM Billing Report', 14, doc.internal.pageSize.getHeight() - 8);
    }

    const selectedNames = [];
    if (sel.royalty) selectedNames.push('Royalty');
    if (sel.commission) selectedNames.push('Comm');
    if (sel.gst) selectedNames.push('GST');
    if (sel.receipts) selectedNames.push('Rcpt');
    if (sel.outstanding) selectedNames.push('OS');
    if (sel.summary) selectedNames.push('Sum');
    const suffix = sectionCount === 6 ? 'Full' : selectedNames.join('_');

    doc.save(`MRM_Report_${suffix}_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${fyLabel.replace(/\s/g, '')}.pdf`);
    setShowExportModal(false);
  };

  const exportSingleTableExcel = (sheetName, headers, rows) => {
    if (!clientReportClient || clientReportEntries.length === 0) return;
    const clientObj = clients.find(c => c.clientId === clientReportClient);
    const clientName = clientObj?.name || clientReportClient;
    const fyLabel = `FY ${financialYear.startYear}-${financialYear.endYear}`;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeSheet(
      `${clientName} (${clientReportClient}) — ${fyLabel}`,
      `Commission: ${clientObj?.commissionRate || 0}% | Type: ${clientObj?.type || 'N/A'}`,
      headers, rows
    ), sheetName.substring(0, 31));
    XLSX.writeFile(wb, `MRM_${sheetName.replace(/[^a-zA-Z0-9]/g, '_')}_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${fyLabel.replace(/\s/g, '')}.xlsx`);
  };

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
        csv = 'Client ID,Client Name,Month,Year,Commission Rate,IPRS,PRS,Sound Ex,ISAMRA,ASCAP,PPL,MLC,Total Commission\n';
        filteredEntries.forEach(e => {
          csv += `${e.clientId},"${e.clientName}","${monthLabels[e.month]}",${e.year},${e.commissionRate || 0}%,${e.iprsCommission || 0},${e.prsCommission || 0},${e.soundExchangeCommission || 0},${e.isamraCommission || 0},${e.ascapCommission || 0},${e.pplCommission || 0},${e.mlcCommission || 0},${e.totalCommission || 0}\n`;
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
        csv = 'Client ID,Client Name,Month,Year,Commission Rate,IPRS,PRS,Sound Ex,ISAMRA,ASCAP,PPL,MLC,Total Commission\n';
        clientEntries.forEach(e => {
          csv += `${e.clientId},"${e.clientName}","${monthLabels[e.month]}",${e.year},${e.commissionRate || 0}%,${e.iprsCommission || 0},${e.prsCommission || 0},${e.soundExchangeCommission || 0},${e.isamraCommission || 0},${e.ascapCommission || 0},${e.pplCommission || 0},${e.mlcCommission || 0},${e.totalCommission || 0}\n`;
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
    { id: 'client-report', label: 'Client Report', icon: 'clipboard' },
    { id: 'commission', label: 'Commission Report', icon: 'percent' },
    { id: 'gst-invoice', label: 'GST & Invoice', icon: 'file-text' },
    { id: 'receipts-tds', label: 'Receipts & TDS', icon: 'credit-card' },
    { id: 'outstanding', label: 'Outstanding', icon: 'alert' },
    { id: 'society-contracts', label: 'Society Contracts', icon: 'briefcase' },
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
                {item.icon === 'clipboard' && <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></>}
                {item.icon === 'briefcase' && <><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></>}
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
            <div className="dashboard-filter-bar">
              <div className="dashboard-filter-dropdown" ref={dashboardDropdownRef}>
                <button className="dashboard-filter-btn" onClick={() => setDashboardDropdownOpen(!dashboardDropdownOpen)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                  </svg>
                  {dashboardClient === 'all' ? 'All Members' : clients.find(c => c.clientId === dashboardClient)?.name || dashboardClient}
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: dashboardDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
                {dashboardDropdownOpen && (
                  <div className="dashboard-filter-menu">
                    <div className="dashboard-filter-search">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      </svg>
                      <input type="text" placeholder="Search members..." value={dashboardSearch} onChange={(e) => setDashboardSearch(e.target.value)} autoFocus />
                    </div>
                    <div className="dashboard-filter-list">
                      {!dashboardSearch && (
                        <div className={`dashboard-filter-item ${dashboardClient === 'all' ? 'active' : ''}`} onClick={() => { setDashboardClient('all'); setDashboardDropdownOpen(false); setDashboardSearch(''); }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                          </svg>
                          All Members
                        </div>
                      )}
                      {clients
                        .filter(c => !dashboardSearch || c.name.toLowerCase().includes(dashboardSearch.toLowerCase()) || c.clientId.toLowerCase().includes(dashboardSearch.toLowerCase()))
                        .sort((a, b) => (parseInt(a.clientId?.match(/(\d+)/)?.[1], 10) || 0) - (parseInt(b.clientId?.match(/(\d+)/)?.[1], 10) || 0))
                        .map(c => (
                          <div key={c.clientId} className={`dashboard-filter-item ${dashboardClient === c.clientId ? 'active' : ''}`} onClick={() => { setDashboardClient(c.clientId); setDashboardDropdownOpen(false); setDashboardSearch(''); }}>
                            <span className="client-avatar" style={{ width: 24, height: 24, fontSize: 9 }}>{getClientInitials(c.name)}</span>
                            <span>{c.name}</span>
                            <span className="dashboard-filter-id">{c.clientId}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
              {dashboardClient !== 'all' && (
                <button className="dashboard-filter-clear" onClick={() => setDashboardClient('all')}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                  Clear Filter
                </button>
              )}
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
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-orange)' }}>
                <div className="stat-label">Previous Year Outstanding</div>
                <div className="stat-value">{formatCurrency(dashboardStats.prevYearOutstanding)}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-purple)' }}>
                <div className="stat-label">This Year Outstanding</div>
                <div className="stat-value">{formatCurrency((dashboardStats.totalOutstanding || 0) - (dashboardStats.prevYearOutstanding || 0))}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-green)' }}>
                <div className="stat-label">Total Outstanding</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalOutstanding)}</div>
              </div>
            </div>
            <div className="stats-grid">
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-blue)' }}>
                <div className="stat-label">Total Commission</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalCommission)}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-blue)' }}>
                <div className="stat-label">Total IPRS</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalIprs)}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-purple)' }}>
                <div className="stat-label">Total PRS</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalPrs)}</div>
              </div>
            </div>
            <div className="stats-grid">
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-orange)' }}>
                <div className="stat-label">Total ASCAP</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalAscap)}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-green)' }}>
                <div className="stat-label">Total ISAMRA</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalIsamra)}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-blue)' }}>
                <div className="stat-label">Total Sound Exchange</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalSoundEx)}</div>
              </div>
            </div>
            <div className="stats-grid">
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-purple)' }}>
                <div className="stat-label">Total PPL</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalPpl)}</div>
              </div>
              <div className="stat-card" style={{ '--card-accent': 'var(--accent-purple)' }}>
                <div className="stat-label">Total MLC</div>
                <div className="stat-value">{formatCurrency(dashboardStats.totalMlc)}</div>
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

        {/* Client Report */}
        {activeReport === 'client-report' && (
          <div className="report-section active">
            <div className="report-page-header">
              <div className="report-page-title">
                <h2>Client Report</h2>
                <p>Detailed monthly summary for a single client — all amounts, commissions, GST, receipts &amp; outstanding</p>
              </div>
              {clientReportClient && clientReportEntries.length > 0 && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" onClick={exportClientReportExcel}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Export All-in-One
                  </button>
                  <button className="btn btn-success" onClick={exportClientReportDetailedExcel}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    Export Detailed
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    Export PDF
                  </button>
                  <div ref={royaltyBreakdownRef} style={{ position: 'relative', display: 'inline-block' }}>
                    <button className="btn btn-info" onClick={() => { if (!showRoyaltyBreakdown) setRoyaltyBreakdownMonths(clientReportEntries.map(e => `${e.month}-${e.year}`)); setShowRoyaltyBreakdown(!showRoyaltyBreakdown); }} style={{ background: '#8b5cf6' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="12" y1="11" x2="12" y2="17"></line>
                        <polyline points="9 14 12 11 15 14"></polyline>
                      </svg>
                      Royalty Breakdown
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 4 }}>
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>
                    {showRoyaltyBreakdown && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, marginTop: 8,
                        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                        padding: 16, zIndex: 100, minWidth: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      }}>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Royalty Type</label>
                          <select
                            value={royaltyBreakdownType}
                            onChange={(e) => setRoyaltyBreakdownType(e.target.value)}
                            style={{
                              width: '100%', padding: '8px 10px', borderRadius: 6,
                              background: 'var(--bg-input)', color: 'var(--text-primary)',
                              border: '1px solid var(--border)', fontSize: 13,
                            }}
                          >
                            <option value="IPRS">IPRS</option>
                            <option value="PRS">PRS</option>
                            <option value="Sound Exchange">Sound Exchange</option>
                            <option value="ISAMRA">ISAMRA</option>
                            <option value="ASCAP">ASCAP</option>
                            <option value="PPL">PPL</option>
                            <option value="MLC">MLC</option>
                          </select>
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Format</label>
                          <select
                            value={royaltyBreakdownFormat}
                            onChange={(e) => setRoyaltyBreakdownFormat(e.target.value)}
                            style={{
                              width: '100%', padding: '8px 10px', borderRadius: 6,
                              background: 'var(--bg-input)', color: 'var(--text-primary)',
                              border: '1px solid var(--border)', fontSize: 13,
                            }}
                          >
                            <option value="pdf">PDF</option>
                            <option value="excel">Excel</option>
                          </select>
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Months</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button type="button" onClick={() => setRoyaltyBreakdownMonths(clientReportEntries.map(e => `${e.month}-${e.year}`))}
                                style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>All</button>
                              <button type="button" onClick={() => setRoyaltyBreakdownMonths([])}
                                style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>None</button>
                            </div>
                          </div>
                          <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 0' }}>
                            {clientReportEntries.map(entry => {
                              const key = `${entry.month}-${entry.year}`;
                              const label = `${monthLabels[entry.month]} ${entry.year}`;
                              const allKeys = clientReportEntries.map(e => `${e.month}-${e.year}`);
                              const currentSelection = royaltyBreakdownMonths || allKeys;
                              const checked = currentSelection.includes(key);
                              return (
                                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)' }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const cur = royaltyBreakdownMonths || allKeys;
                                      if (cur.includes(key)) {
                                        setRoyaltyBreakdownMonths(cur.filter(k => k !== key));
                                      } else {
                                        setRoyaltyBreakdownMonths([...cur, key]);
                                      }
                                    }}
                                  />
                                  {label}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <button
                          className="btn btn-primary"
                          style={{ width: '100%' }}
                          onClick={() => {
                            exportRoyaltyBreakdown(royaltyBreakdownType, royaltyBreakdownFormat, royaltyBreakdownMonths);
                            setShowRoyaltyBreakdown(false);
                          }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                          </svg>
                          Download
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Client Selector */}
            <div className="dashboard-filter-bar" style={{ marginBottom: 24 }}>
              <div className="dashboard-filter-dropdown" ref={clientReportDropdownRef}>
                <button className="dashboard-filter-btn" onClick={() => setClientReportDropdownOpen(!clientReportDropdownOpen)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle>
                  </svg>
                  {clientReportClient
                    ? (clients.find(c => c.clientId === clientReportClient)?.name || clientReportClient)
                    : 'Select Client'}
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: clientReportDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
                {clientReportDropdownOpen && (
                  <div className="dashboard-filter-menu">
                    <div className="dashboard-filter-search">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      </svg>
                      <input type="text" placeholder="Search clients..." value={clientReportSearch} onChange={(e) => setClientReportSearch(e.target.value)} autoFocus />
                    </div>
                    <div className="dashboard-filter-list">
                      {clients
                        .filter(c => !clientReportSearch || c.name.toLowerCase().includes(clientReportSearch.toLowerCase()) || c.clientId.toLowerCase().includes(clientReportSearch.toLowerCase()))
                        .sort((a, b) => (parseInt(a.clientId?.match(/(\d+)/)?.[1], 10) || 0) - (parseInt(b.clientId?.match(/(\d+)/)?.[1], 10) || 0))
                        .map(c => (
                          <div key={c.clientId} className={`dashboard-filter-item ${clientReportClient === c.clientId ? 'active' : ''}`} onClick={() => { setClientReportClient(c.clientId); setClientReportDropdownOpen(false); setClientReportSearch(''); }}>
                            <span className="client-avatar" style={{ width: 24, height: 24, fontSize: 9 }}>{getClientInitials(c.name)}</span>
                            <span>{c.name}</span>
                            <span className="dashboard-filter-id">{c.clientId}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
              {clientReportClient && (
                <button className="dashboard-filter-clear" onClick={() => setClientReportClient(null)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                  Clear
                </button>
              )}
            </div>

            {!clientReportClient ? (
              <div className="report-empty" style={{ padding: '80px 20px' }}>
                <h3 style={{ marginBottom: 8, color: 'var(--text-primary)' }}>Select a Client</h3>
                <p>Choose a client from the dropdown above to view their detailed monthly report</p>
              </div>
            ) : clientReportEntries.length === 0 ? (
              <div className="report-empty" style={{ padding: '80px 20px' }}>
                <h3 style={{ marginBottom: 8, color: 'var(--text-primary)' }}>No Entries Found</h3>
                <p>No billing entries found for this client in FY {financialYear.startYear}-{financialYear.endYear}</p>
              </div>
            ) : (
              <>
                {/* Client Info Banner */}
                {(() => {
                  const clientObj = clients.find(c => c.clientId === clientReportClient);
                  return clientObj ? (
                    <div className="client-report-banner">
                      <div className="client-avatar" style={{ width: 48, height: 48, fontSize: 16 }}>{getClientInitials(clientObj.name)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{clientObj.name}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          {clientObj.clientId} &bull; {clientObj.type || 'N/A'} &bull; Commission: {clientObj.commissionRate ?? 0}% &bull; FY {financialYear.startYear}-{financialYear.endYear}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 24 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 4 }}>Entries</div>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700 }}>{clientReportEntries.length}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 4 }}>Total Commission</div>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: 'var(--accent-green)' }}>{formatCurrency(clientReportSummary?.totalCommission || 0)}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 4 }}>Total Outstanding</div>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: (clientReportSummary?.totalOutstanding || 0) > 0 ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{formatCurrency(clientReportSummary?.totalOutstanding || 0)}</div>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Color Legend */}
                <div className="client-report-legend">
                  <div className="client-report-legend-item">
                    <span className="legend-dot" style={{ background: 'var(--accent-green)' }}></span>
                    <span>Adds to Outstanding (Commission, Invoice, Pending)</span>
                  </div>
                  <div className="client-report-legend-item">
                    <span className="legend-dot" style={{ background: 'var(--accent-red)' }}></span>
                    <span>Reduces Outstanding (Receipts, TDS)</span>
                  </div>
                  <div className="client-report-legend-item">
                    <span className="legend-dot" style={{ background: 'var(--accent-blue)' }}></span>
                    <span>Computed / Tracking</span>
                  </div>
                </div>

                {/* Main Data Table */}
                <div className="report-container" style={{ marginBottom: 24 }}>
                  <div className="report-header">
                    <h3>Royalty Amounts</h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                      const h = ['Month', 'IPRS Amount', 'PRS Amount (INR)', 'Sound Exchange', 'ISAMRA', 'ASCAP', 'PPL', 'MLC'];
                      const rows = clientReportEntries.map(e => [`${monthLabels[e.month]} ${e.year}`, e.iprsAmount||0, e.prsAmount||0, e.soundExchangeAmount||0, e.isamraAmount||0, e.ascapAmount||0, e.pplAmount||0, e.mlcAmount||0]);
                      if (clientReportSummary) { const s = clientReportSummary; rows.push(['TOTAL', s.iprsAmount, s.prsAmount, s.soundExchangeAmount, s.isamraAmount, s.ascapAmount, s.pplAmount, s.mlcAmount]); }
                      exportSingleTableExcel('Royalty Amounts', h, rows);
                    }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      Export
                    </button>
                  </div>
                  <div className="table-wrapper">
                    <table className="report-table client-report-table">
                      <thead>
                        <tr>
                          <th className="sticky-col">Month</th>
                          <th>IPRS Amount</th>
                          <th>PRS Amount (INR)</th>
                          <th>Sound Exchange</th>
                          <th>ISAMRA</th>
                          <th>ASCAP</th>
                          <th>PPL</th>
                          <th>MLC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientReportEntries.map((e, idx) => (
                          <tr key={idx}>
                            <td className="sticky-col">{monthLabels[e.month]} {e.year}</td>
                            <td><span className="amount">{formatCurrency(e.iprsAmount)}</span></td>
                            <td><span className="amount">{formatCurrency(e.prsAmount)}</span></td>
                            <td><span className="amount">{formatCurrency(e.soundExchangeAmount)}</span></td>
                            <td><span className="amount">{formatCurrency(e.isamraAmount)}</span></td>
                            <td><span className="amount">{formatCurrency(e.ascapAmount)}</span></td>
                            <td><span className="amount">{formatCurrency(e.pplAmount)}</span></td>
                            <td><span className="amount">{formatCurrency(e.mlcAmount)}</span></td>
                          </tr>
                        ))}
                        {clientReportSummary && (
                          <tr className="summary-row">
                            <td className="sticky-col"><strong>Total</strong></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.iprsAmount)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.prsAmount)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.soundExchangeAmount)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.isamraAmount)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.ascapAmount)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.pplAmount)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.mlcAmount)}</span></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Commission Table */}
                <div className="report-container" style={{ marginBottom: 24 }}>
                  <div className="report-header">
                    <h3>Commission Breakdown <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--accent-green)' }}>+ Adds to Outstanding</span></h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                      const h = ['Month', 'Rate', 'IPRS Comm.', 'PRS Comm.', 'Sound Ex. Comm.', 'ISAMRA Comm.', 'ASCAP Comm.', 'PPL Comm.', 'MLC Comm.', 'Total Commission'];
                      const rows = clientReportEntries.map(e => [`${monthLabels[e.month]} ${e.year}`, `${e.commissionRate||0}%`, e.iprsCommission||0, e.prsCommission||0, e.soundExchangeCommission||0, e.isamraCommission||0, e.ascapCommission||0, e.pplCommission||0, e.mlcCommission||0, e.totalCommission||0]);
                      if (clientReportSummary) { const s = clientReportSummary; rows.push(['TOTAL', '', s.iprsCommission, s.prsCommission, s.soundExchangeCommission, s.isamraCommission, s.ascapCommission, s.pplCommission, s.mlcCommission, s.totalCommission]); }
                      exportSingleTableExcel('Commission', h, rows);
                    }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      Export
                    </button>
                  </div>
                  <div className="table-wrapper">
                    <table className="report-table client-report-table">
                      <thead>
                        <tr>
                          <th className="sticky-col">Month</th>
                          <th>Rate</th>
                          <th>IPRS Comm.</th>
                          <th>PRS Comm.</th>
                          <th>Sound Ex. Comm.</th>
                          <th>ISAMRA Comm.</th>
                          <th>ASCAP Comm.</th>
                          <th>PPL Comm.</th>
                          <th>MLC Comm.</th>
                          <th className="col-highlight-green">Total Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientReportEntries.map((e, idx) => (
                          <tr key={idx}>
                            <td className="sticky-col">{monthLabels[e.month]} {e.year}</td>
                            <td><span className="amount">{e.commissionRate || 0}%</span></td>
                            <td><span className="amount">{formatCurrency(e.iprsCommission)}</span></td>
                            <td><span className="amount">{formatCurrency(e.prsCommission)}</span></td>
                            <td><span className="amount">{formatCurrency(e.soundExchangeCommission)}</span></td>
                            <td><span className="amount">{formatCurrency(e.isamraCommission)}</span></td>
                            <td><span className="amount">{formatCurrency(e.ascapCommission)}</span></td>
                            <td><span className="amount">{formatCurrency(e.pplCommission)}</span></td>
                            <td><span className="amount">{formatCurrency(e.mlcCommission)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(e.totalCommission)}</span></td>
                          </tr>
                        ))}
                        {clientReportSummary && (
                          <tr className="summary-row">
                            <td className="sticky-col"><strong>Total</strong></td>
                            <td></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.iprsCommission)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.prsCommission)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.soundExchangeCommission)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.isamraCommission)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.ascapCommission)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.pplCommission)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.mlcCommission)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(clientReportSummary.totalCommission)}</span></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* GST & Invoice Table */}
                <div className="report-container" style={{ marginBottom: 24 }}>
                  <div className="report-header">
                    <h3>GST &amp; Invoice <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--accent-green)' }}>+ Adds to Outstanding</span></h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                      const h = ['Month', 'Cur. GST Base', 'Cur. GST (18%)', 'Cur. Invoice Total', 'Prev. GST Base', 'Prev. GST (18%)', 'Prev. Invoice Total'];
                      const rows = clientReportEntries.map(e => [`${monthLabels[e.month]} ${e.year}`, e.currentMonthGstBase||0, e.currentMonthGst||0, e.currentMonthInvoiceTotal||0, e.previousOutstandingGstBase||0, e.previousOutstandingGst||0, e.previousOutstandingInvoiceTotal||0]);
                      if (clientReportSummary) { const s = clientReportSummary; rows.push(['TOTAL', s.currentMonthGstBase, s.currentMonthGst, s.currentMonthInvoiceTotal, s.previousOutstandingGstBase, s.previousOutstandingGst, s.previousOutstandingInvoiceTotal]); }
                      exportSingleTableExcel('GST & Invoice', h, rows);
                    }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      Export
                    </button>
                  </div>
                  <div className="table-wrapper">
                    <table className="report-table client-report-table">
                      <thead>
                        <tr>
                          <th className="sticky-col">Month</th>
                          <th>Cur. GST Base</th>
                          <th>Cur. GST</th>
                          <th className="col-highlight-green">Cur. Invoice Total</th>
                          <th>Prev. GST Base</th>
                          <th>Prev. GST</th>
                          <th className="col-highlight-green">Prev. Invoice Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientReportEntries.map((e, idx) => (
                          <tr key={idx}>
                            <td className="sticky-col">{monthLabels[e.month]} {e.year}</td>
                            <td><span className="amount">{formatCurrency(e.currentMonthGstBase)}</span></td>
                            <td><span className="amount">{formatCurrency(e.currentMonthGst)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(e.currentMonthInvoiceTotal)}</span></td>
                            <td><span className="amount">{formatCurrency(e.previousOutstandingGstBase)}</span></td>
                            <td><span className="amount">{formatCurrency(e.previousOutstandingGst)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(e.previousOutstandingInvoiceTotal)}</span></td>
                          </tr>
                        ))}
                        {clientReportSummary && (
                          <tr className="summary-row">
                            <td className="sticky-col"><strong>Total</strong></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.currentMonthGstBase)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.currentMonthGst)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(clientReportSummary.currentMonthInvoiceTotal)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.previousOutstandingGstBase)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.previousOutstandingGst)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(clientReportSummary.previousOutstandingInvoiceTotal)}</span></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Receipts & TDS Table */}
                <div className="report-container" style={{ marginBottom: 24 }}>
                  <div className="report-header">
                    <h3>Receipts &amp; TDS <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--accent-red)' }}>- Reduces Outstanding</span></h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                      const h = ['Month', 'Cur. Receipt', 'Cur. TDS', 'Prev. Receipt', 'Prev. TDS', 'Total Deductions'];
                      const rows = clientReportEntries.map(e => { const td = (e.currentMonthReceipt||0)+(e.currentMonthTds||0)+(e.previousMonthReceipt||0)+(e.previousMonthTds||0); return [`${monthLabels[e.month]} ${e.year}`, e.currentMonthReceipt||0, e.currentMonthTds||0, e.previousMonthReceipt||0, e.previousMonthTds||0, td]; });
                      if (clientReportSummary) { const s = clientReportSummary; const totalDed = s.currentMonthReceipt+s.currentMonthTds+s.previousMonthReceipt+s.previousMonthTds; rows.push(['TOTAL', s.currentMonthReceipt, s.currentMonthTds, s.previousMonthReceipt, s.previousMonthTds, totalDed]); }
                      exportSingleTableExcel('Receipts & TDS', h, rows);
                    }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      Export
                    </button>
                  </div>
                  <div className="table-wrapper">
                    <table className="report-table client-report-table">
                      <thead>
                        <tr>
                          <th className="sticky-col">Month</th>
                          <th className="col-highlight-red">Cur. Receipt</th>
                          <th className="col-highlight-red">Cur. TDS</th>
                          <th className="col-highlight-red">Prev. Receipt</th>
                          <th className="col-highlight-red">Prev. TDS</th>
                          <th>Total Deductions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientReportEntries.map((e, idx) => {
                          const totalDeductions = (e.currentMonthReceipt || 0) + (e.currentMonthTds || 0) + (e.previousMonthReceipt || 0) + (e.previousMonthTds || 0);
                          return (
                            <tr key={idx}>
                              <td className="sticky-col">{monthLabels[e.month]} {e.year}</td>
                              <td className="col-highlight-red"><span className={`amount ${(e.currentMonthReceipt || 0) > 0 ? 'negative' : ''}`}>{formatCurrency(e.currentMonthReceipt)}</span></td>
                              <td className="col-highlight-red"><span className={`amount ${(e.currentMonthTds || 0) > 0 ? 'negative' : ''}`}>{formatCurrency(e.currentMonthTds)}</span></td>
                              <td className="col-highlight-red"><span className={`amount ${(e.previousMonthReceipt || 0) > 0 ? 'negative' : ''}`}>{formatCurrency(e.previousMonthReceipt)}</span></td>
                              <td className="col-highlight-red"><span className={`amount ${(e.previousMonthTds || 0) > 0 ? 'negative' : ''}`}>{formatCurrency(e.previousMonthTds)}</span></td>
                              <td><span className={`amount ${totalDeductions > 0 ? 'negative' : ''}`}>{formatCurrency(totalDeductions)}</span></td>
                            </tr>
                          );
                        })}
                        {clientReportSummary && (
                          <tr className="summary-row">
                            <td className="sticky-col"><strong>Total</strong></td>
                            <td className="col-highlight-red"><span className="amount negative">{formatCurrency(clientReportSummary.currentMonthReceipt)}</span></td>
                            <td className="col-highlight-red"><span className="amount negative">{formatCurrency(clientReportSummary.currentMonthTds)}</span></td>
                            <td className="col-highlight-red"><span className="amount negative">{formatCurrency(clientReportSummary.previousMonthReceipt)}</span></td>
                            <td className="col-highlight-red"><span className="amount negative">{formatCurrency(clientReportSummary.previousMonthTds)}</span></td>
                            <td><span className="amount negative">{formatCurrency(clientReportSummary.currentMonthReceipt + clientReportSummary.currentMonthTds + clientReportSummary.previousMonthReceipt + clientReportSummary.previousMonthTds)}</span></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Outstanding Tracking Table */}
                <div className="report-container" style={{ marginBottom: 24 }}>
                  <div className="report-header">
                    <h3>Outstanding Tracking</h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                      const h = ['Month', 'Prev. O/S (Carry-Forward)', 'Total Commission', 'Cur. Invoice Total', 'Prev. Invoice Total', 'Cur. Receipt', 'Cur. TDS', 'Prev. Receipt', 'Prev. TDS', 'Invoice Pending (Cur.)', 'Prev. Invoice Pending', 'Monthly Outstanding', 'Total Outstanding'];
                      const rows = clientReportEntries.map(e => [`${monthLabels[e.month]} ${e.year}`, e.previousMonthOutstanding||0, e.totalCommission||0, e.currentMonthInvoiceTotal||0, e.previousOutstandingInvoiceTotal||0, e.currentMonthReceipt||0, e.currentMonthTds||0, e.previousMonthReceipt||0, e.previousMonthTds||0, e.invoicePendingCurrentMonth||0, e.previousInvoicePending||0, e.monthlyOutstanding||0, e.totalOutstanding||0]);
                      if (clientReportSummary) { const s = clientReportSummary; rows.push(['TOTAL', s.previousMonthOutstanding, s.totalCommission, s.currentMonthInvoiceTotal, s.previousOutstandingInvoiceTotal, s.currentMonthReceipt, s.currentMonthTds, s.previousMonthReceipt, s.previousMonthTds, s.invoicePendingCurrentMonth, s.previousInvoicePending, s.monthlyOutstanding, s.totalOutstanding]); }
                      exportSingleTableExcel('Outstanding', h, rows);
                    }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      Export
                    </button>
                  </div>
                  <div className="table-wrapper">
                    <table className="report-table client-report-table">
                      <thead>
                        <tr>
                          <th className="sticky-col">Month</th>
                          <th>Prev. O/S (Carry-Forward)</th>
                          <th className="col-highlight-green">Total Commission</th>
                          <th className="col-highlight-green">Cur. Invoice Total</th>
                          <th className="col-highlight-green">Prev. Invoice Total</th>
                          <th className="col-highlight-red">Cur. Receipt</th>
                          <th className="col-highlight-red">Cur. TDS</th>
                          <th className="col-highlight-red">Prev. Receipt</th>
                          <th className="col-highlight-red">Prev. TDS</th>
                          <th className="col-highlight-green">Invoice Pending (Cur.)</th>
                          <th className="col-highlight-green">Prev. Invoice Pending</th>
                          <th>Monthly O/S</th>
                          <th style={{ background: 'rgba(240, 160, 64, 0.15)' }}>Total Outstanding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientReportEntries.map((e, idx) => (
                          <tr key={idx}>
                            <td className="sticky-col">{monthLabels[e.month]} {e.year}</td>
                            <td><span className="amount highlight">{formatCurrency(e.previousMonthOutstanding)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(e.totalCommission)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(e.currentMonthInvoiceTotal)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(e.previousOutstandingInvoiceTotal)}</span></td>
                            <td className="col-highlight-red"><span className={`amount ${(e.currentMonthReceipt || 0) > 0 ? 'negative' : ''}`}>{formatCurrency(e.currentMonthReceipt)}</span></td>
                            <td className="col-highlight-red"><span className={`amount ${(e.currentMonthTds || 0) > 0 ? 'negative' : ''}`}>{formatCurrency(e.currentMonthTds)}</span></td>
                            <td className="col-highlight-red"><span className={`amount ${(e.previousMonthReceipt || 0) > 0 ? 'negative' : ''}`}>{formatCurrency(e.previousMonthReceipt)}</span></td>
                            <td className="col-highlight-red"><span className={`amount ${(e.previousMonthTds || 0) > 0 ? 'negative' : ''}`}>{formatCurrency(e.previousMonthTds)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(e.invoicePendingCurrentMonth)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(e.previousInvoicePending)}</span></td>
                            <td><span className={`amount ${(e.monthlyOutstanding || 0) > 0 ? 'positive' : (e.monthlyOutstanding || 0) < 0 ? 'negative' : ''}`}>{formatCurrency(e.monthlyOutstanding)}</span></td>
                            <td style={{ background: 'rgba(240, 160, 64, 0.08)' }}><span className="amount" style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>{formatCurrency(e.totalOutstanding)}</span></td>
                          </tr>
                        ))}
                        {clientReportSummary && (
                          <tr className="summary-row">
                            <td className="sticky-col"><strong>Total</strong></td>
                            <td><span className="amount highlight">{formatCurrency(clientReportSummary.previousMonthOutstanding)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(clientReportSummary.totalCommission)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(clientReportSummary.currentMonthInvoiceTotal)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(clientReportSummary.previousOutstandingInvoiceTotal)}</span></td>
                            <td className="col-highlight-red"><span className="amount negative">{formatCurrency(clientReportSummary.currentMonthReceipt)}</span></td>
                            <td className="col-highlight-red"><span className="amount negative">{formatCurrency(clientReportSummary.currentMonthTds)}</span></td>
                            <td className="col-highlight-red"><span className="amount negative">{formatCurrency(clientReportSummary.previousMonthReceipt)}</span></td>
                            <td className="col-highlight-red"><span className="amount negative">{formatCurrency(clientReportSummary.previousMonthTds)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(clientReportSummary.invoicePendingCurrentMonth)}</span></td>
                            <td className="col-highlight-green"><span className="amount positive">{formatCurrency(clientReportSummary.previousInvoicePending)}</span></td>
                            <td><span className="amount">{formatCurrency(clientReportSummary.monthlyOutstanding)}</span></td>
                            <td style={{ background: 'rgba(240, 160, 64, 0.15)' }}><span className="amount" style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>{formatCurrency(clientReportSummary.totalOutstanding)}</span></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Final Summary Card */}
                <div className="client-report-summary-card">
                  <div className="summary-header">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="1" x2="12" y2="23"></line>
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                    <h3>Final Summary</h3>
                  </div>
                  {clientReportSummary && (() => {
                    const s = clientReportSummary;
                    const totalReceipts = s.currentMonthReceipt + s.previousMonthReceipt;
                    const totalTds = s.currentMonthTds + s.previousMonthTds;
                    const totalInvoiced = s.currentMonthInvoiceTotal + s.previousOutstandingInvoiceTotal;
                    return (
                      <div className="client-report-summary-grid">
                        <div className="client-report-summary-item">
                          <div className="label">Opening Balance</div>
                          <div className="value" style={{ color: 'var(--accent-blue)' }}>{formatCurrency(s.previousMonthOutstanding)}</div>
                        </div>
                        <div className="client-report-summary-item add">
                          <div className="label">+ Total Commission</div>
                          <div className="value">{formatCurrency(s.totalCommission)}</div>
                        </div>
                        <div className="client-report-summary-item add">
                          <div className="label">+ Total Invoiced (GST)</div>
                          <div className="value">{formatCurrency(totalInvoiced)}</div>
                        </div>
                        <div className="client-report-summary-item subtract">
                          <div className="label">− Total Receipts</div>
                          <div className="value">{formatCurrency(totalReceipts)}</div>
                        </div>
                        <div className="client-report-summary-item subtract">
                          <div className="label">− Total TDS</div>
                          <div className="value">{formatCurrency(totalTds)}</div>
                        </div>
                        <div className="client-report-summary-item final">
                          <div className="label">= Final Outstanding</div>
                          <div className="value">{formatCurrency(s.totalOutstanding)}</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}

            {/* Custom Export Modal */}
            {showExportModal && (
              <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) setShowExportModal(false); }}>
                <div className="modal" style={{ maxWidth: 480 }}>
                  <div className="modal-header">
                    <h3>Export PDF</h3>
                    <button className="modal-close" onClick={() => setShowExportModal(false)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                  <div className="modal-body">
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
                      Select which sections to include in the exported PDF file:
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedExportSections({ royalty: true, commission: true, gst: true, receipts: true, outstanding: true, summary: true })}
                      >Select All</button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedExportSections({ royalty: false, commission: false, gst: false, receipts: false, outstanding: false, summary: false })}
                      >Deselect All</button>
                    </div>
                    {[
                      { key: 'royalty', label: 'Royalty Amounts', desc: 'IPRS, PRS, Sound Exchange, ISAMRA, ASCAP, PPL, MLC', icon: '🎵' },
                      { key: 'commission', label: 'Commission Breakdown', desc: 'Commission rates and per-source commissions', icon: '💰' },
                      { key: 'gst', label: 'GST & Invoice', desc: 'GST base, GST amount, invoice totals', icon: '🧾' },
                      { key: 'receipts', label: 'Receipts & TDS', desc: 'Current/previous receipts and TDS deductions', icon: '📥' },
                      { key: 'outstanding', label: 'Outstanding Tracking', desc: 'Monthly and total outstanding with carry-forward', icon: '📊' },
                      { key: 'summary', label: 'Final Summary', desc: 'Overview with royalty breakdown', icon: '📋' },
                    ].map(section => (
                      <label
                        key={section.key}
                        className="export-section-item"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                          background: selectedExportSections[section.key] ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-input)',
                          border: `1px solid ${selectedExportSections[section.key] ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                          borderRadius: 10, marginBottom: 8, cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedExportSections[section.key]}
                          onChange={() => setSelectedExportSections(prev => ({ ...prev, [section.key]: !prev[section.key] }))}
                          style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)', cursor: 'pointer', flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{section.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{section.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{section.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={() => setShowExportModal(false)}>Cancel</button>
                    <button
                      className="btn btn-primary"
                      disabled={!Object.values(selectedExportSections).some(Boolean)}
                      onClick={exportSelectedSectionsPDF}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                      </svg>
                      Export PDF ({Object.values(selectedExportSections).filter(Boolean).length} sections)
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                                    <th>MLC</th>
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
                                      <td><span className="amount">{formatCurrency(entry.mlcCommission)}</span></td>
                                      <td><span className="amount positive">{formatCurrency(entry.totalCommission)}</span></td>
                                    </tr>
                                  ))}
                                  <tr className="summary-row">
                                    <td colSpan="9"><strong>Total</strong></td>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div className="report-client-search" style={{ flex: 1, marginBottom: 0 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input type="text" placeholder="Search clients..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
              </div>
              <button
                className={`btn ${outstandingSortDesc ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setOutstandingSortDesc(prev => !prev)}
                title={outstandingSortDesc ? 'Sorted by outstanding (high to low). Click to reset.' : 'Sort by outstanding (high to low)'}
                style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M3 12h12M3 18h6"></path>
                </svg>
                {outstandingSortDesc ? 'Sorted: High → Low' : 'Sort Outstanding'}
              </button>
            </div>
            <div className="report-client-list">
              {filteredClients.length === 0 ? (
                <div className="report-empty">No clients found</div>
              ) : (
                (outstandingSortDesc
                  ? [...filteredClients].sort((a, b) => {
                      const aOut = getClientSummary(a.clientId).totalOutstanding || 0;
                      const bOut = getClientSummary(b.clientId).totalOutstanding || 0;
                      return bOut - aOut;
                    })
                  : filteredClients
                ).map(client => {
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

        {/* Society Contracts */}
        {activeReport === 'society-contracts' && (() => {
          const activeClients = clients.filter(c => c.isActive);
          const filteredContractClients = activeClients
            .filter(c => !contractSearch || c.name.toLowerCase().includes(contractSearch.toLowerCase()) || c.clientId.toLowerCase().includes(contractSearch.toLowerCase()))
            .sort((a, b) => a.name.localeCompare(b.name));
          const now = new Date();
          const getContractStatus = (client, society) => {
            const ct = (client.contracts || []).find(c => c.society === society);
            if (!ct) return 'none';
            if (ct.endDate && new Date(ct.endDate) < now) return 'expired';
            if (ct.startDate) return 'active';
            return 'none';
          };
          return (
          <div className="report-section active">
            <div className="report-page-header">
              <div className="report-page-title">
                <h2>Society Contracts</h2>
                <p>Track and manage contract dates across all societies</p>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const headers = ['Client ID', 'Client Name', 'Type', ...SOCIETIES.flatMap(s => [`${s} Start`, `${s} End`, `${s} Status`])];
                  let csv = headers.join(',') + '\n';
                  activeClients.forEach(client => {
                    const row = [client.clientId, `"${client.name}"`, client.type || ''];
                    SOCIETIES.forEach(society => {
                      const contract = (client.contracts || []).find(c => c.society === society);
                      if (contract) {
                        const start = contract.startDate ? new Date(contract.startDate).toLocaleDateString('en-IN') : '';
                        const end = contract.endDate ? new Date(contract.endDate).toLocaleDateString('en-IN') : '';
                        const isExpired = contract.endDate && new Date(contract.endDate) < now;
                        row.push(start, end, isExpired ? 'Expired' : 'Active');
                      } else {
                        row.push('', '', 'No Contract');
                      }
                    });
                    csv += row.join(',') + '\n';
                  });
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `MRM_Society_Contracts_${new Date().toISOString().split('T')[0]}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export CSV
              </button>
            </div>

            {/* Summary Cards */}
            <div className="society-contracts-grid">
              {SOCIETIES.map(society => {
                const withContract = activeClients.filter(c => (c.contracts || []).some(ct => ct.society === society));
                const activeContracts = withContract.filter(c => getContractStatus(c, society) === 'active');
                const expiredContracts = withContract.filter(c => getContractStatus(c, society) === 'expired');
                return (
                  <div key={society} className={`society-stat-card ${societyClass(society)}`}>
                    <div className="society-name">{society}</div>
                    <div className="society-count">
                      {withContract.length} <span className="society-total">/ {activeClients.length}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {activeContracts.length > 0 && (
                        <div className="society-active-count">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          {activeContracts.length} active
                        </div>
                      )}
                      {expiredContracts.length > 0 && (
                        <div className="society-expired">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                          {expiredContracts.length} expired
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Search */}
            <div className="contract-search-bar">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search by client name or ID..."
                value={contractSearch}
                onChange={(e) => setContractSearch(e.target.value)}
              />
              <span className="search-count">{filteredContractClients.length} clients</span>
            </div>

            {/* Client Accordion List */}
            <div className="contract-client-list">
              {filteredContractClients.length === 0 ? (
                <div className="report-empty">No clients found matching your search.</div>
              ) : (
                filteredContractClients.map(client => {
                  const isExpanded = expandedContractClient === client.clientId;
                  const clientContracts = client.contracts || [];
                  const activeCount = SOCIETIES.filter(s => getContractStatus(client, s) === 'active').length;
                  const expiredCount = SOCIETIES.filter(s => getContractStatus(client, s) === 'expired').length;

                  return (
                    <div key={client.clientId} className={`contract-client-card ${isExpanded ? 'expanded' : ''}`}>
                      <div
                        className="contract-client-header"
                        onClick={() => setExpandedContractClient(isExpanded ? null : client.clientId)}
                      >
                        <div className="client-avatar" style={{ width: 36, height: 36, fontSize: 12 }}>
                          {getClientInitials(client.name)}
                        </div>
                        <div className="contract-client-info">
                          <div className="name">{client.name}</div>
                          <div className="meta">
                            <span className="client-id-tag">{client.clientId}</span>
                            <span>{client.type || 'Composer'}</span>
                            {activeCount > 0 && <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>{activeCount} active</span>}
                            {expiredCount > 0 && <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>{expiredCount} expired</span>}
                          </div>
                        </div>
                        <div className="contract-society-pills">
                          {SOCIETIES.map(society => {
                            const status = getContractStatus(client, society);
                            return (
                              <span key={society} className={`contract-pill ${status}`}>
                                {society === 'Sound Exchange' ? 'SE' : society}
                              </span>
                            );
                          })}
                        </div>
                        <svg className={`chevron ${isExpanded ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </div>

                      {isExpanded && (
                        <div className="contract-detail">
                          <div className="contract-detail-grid">
                            {SOCIETIES.map(society => {
                              const contract = clientContracts.find(c => c.society === society);
                              const status = getContractStatus(client, society);
                              return (
                                <div key={society} className={`contract-detail-item ${societyClass(society)}`}>
                                  <div className="society-label">
                                    {society}
                                    {status !== 'none' && (
                                      <span className={`contract-pill ${status}`} style={{ fontSize: 9 }}>
                                        {status === 'active' ? 'Active' : 'Expired'}
                                      </span>
                                    )}
                                  </div>
                                  {contract ? (
                                    <>
                                      <div className="date-row">
                                        <span className="date-label">From</span>
                                        <span className="date-value">
                                          {contract.startDate ? new Date(contract.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                        </span>
                                      </div>
                                      <div className="date-row">
                                        <span className="date-label">To</span>
                                        <span className="date-value" style={{ color: status === 'expired' ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                                          {contract.endDate ? new Date(contract.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="no-contract">No contract</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="contract-detail-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                const existingContracts = SOCIETIES.map(society => {
                                  const existing = clientContracts.find(c => c.society === society);
                                  return {
                                    society,
                                    startDate: existing?.startDate ? new Date(existing.startDate).toISOString().split('T')[0] : '',
                                    endDate: existing?.endDate ? new Date(existing.endDate).toISOString().split('T')[0] : ''
                                  };
                                });
                                setEditingContracts({
                                  clientId: client.clientId,
                                  clientName: client.name,
                                  contracts: existingContracts
                                });
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                              Edit Contracts
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          );
        })()}
      </div>

      {/* Contract Edit Modal */}
      {editingContracts && (
        <div className="modal-overlay show" onClick={() => setEditingContracts(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div>
                <h3>Edit Contracts</h3>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{editingContracts.clientName}</div>
              </div>
              <button className="modal-close" onClick={() => setEditingContracts(null)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {editingContracts.contracts.map((contract, idx) => (
                  <div key={contract.society} className={`contract-modal-item ${societyClass(contract.society)}`}>
                    <div className="contract-modal-label">{contract.society}</div>
                    <div className="input-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 10, marginBottom: 4 }}>Start Date</label>
                      <input
                        type="date"
                        value={contract.startDate}
                        onChange={(e) => {
                          const updated = [...editingContracts.contracts];
                          updated[idx] = { ...updated[idx], startDate: e.target.value };
                          setEditingContracts({ ...editingContracts, contracts: updated });
                        }}
                        style={{ fontSize: 12, padding: '8px 10px' }}
                      />
                    </div>
                    <div className="input-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 10, marginBottom: 4 }}>End Date</label>
                      <input
                        type="date"
                        value={contract.endDate}
                        onChange={(e) => {
                          const updated = [...editingContracts.contracts];
                          updated[idx] = { ...updated[idx], endDate: e.target.value };
                          setEditingContracts({ ...editingContracts, contracts: updated });
                        }}
                        style={{ fontSize: 12, padding: '8px 10px' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingContracts(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    const contractsToSave = editingContracts.contracts
                      .filter(c => c.startDate || c.endDate)
                      .map(c => ({
                        society: c.society,
                        startDate: c.startDate || null,
                        endDate: c.endDate || null
                      }));
                    await updateClient(editingContracts.clientId, { contracts: contractsToSave });
                    setEditingContracts(null);
                  } catch (error) {
                    // updateClient already shows toast
                  }
                }}
              >
                Save Contracts
              </button>
            </div>
          </div>
        </div>
      )}

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
