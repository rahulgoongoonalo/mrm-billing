import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import { royaltyApi } from '../services/api';

const inr = (v) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
const inr0 = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(v || 0));
const rupees = (v) => `₹${inr(v)}`;

const Icon = ({ children, size = 16 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

function WhatsappReport() {
  const { settings, showToast } = useApp();
  const currentFy = settings?.financialYear?.startYear || new Date().getFullYear();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  // Period / Year ask for the selection before the statement opens.
  const [picker, setPicker] = useState(null);     // { client, kind: 'period' | 'year' }
  const [pFrom, setPFrom] = useState('');
  const [pTo, setPTo] = useState('');
  const [pYear, setPYear] = useState(currentFy);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await royaltyApi.getOutstandingSummary({ mode: 'latest' });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the report. Please try again.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    let list = data?.rows || [];
    const term = search.trim().toLowerCase();
    if (term) list = list.filter((r) => r.clientName.toLowerCase().includes(term) || r.clientId.toLowerCase().includes(term));
    return list;
  }, [data, search]);

  // Headline figures follow whatever is on screen.
  const shown = useMemo(() => {
    const t = { totalRoyalty: 0, commission: 0, receivable: 0, owing: 0, settled: 0, overpaid: 0 };
    for (const r of rows) {
      t.totalRoyalty += r.totalRoyalty || 0;
      t.commission += r.commission || 0;
      if (r.outstanding > 0) { t.receivable += r.outstanding; t.owing++; }
      else if (r.outstanding <= -1) t.overpaid++;
      else t.settled++;
    }
    return t;
  }, [rows]);

  const whatsappText = useMemo(() => {
    const lines = [
      '*MRM Outstanding Report*',
      `_${data?.dateLabel || ''}_`,
      '',
      `Receivable: *${rupees(shown.receivable)}*`,
      `Royalty: ${rupees(shown.totalRoyalty)}  |  Commission: ${rupees(shown.commission)}`,
      `Clients: ${rows.length}`,
      '',
    ];
    rows.forEach((r, i) => {
      lines.push(`${i + 1}. *${r.clientId}* ${r.clientName}`);
      lines.push(`   Royalty ${inr0(r.totalRoyalty)} | Comm ${inr0(r.commission)} | *Outstanding ${inr0(r.outstanding)}*`);
    });
    return lines.join('\n');
  }, [rows, shown, data]);

  const copyForWhatsapp = async () => {
    try {
      await navigator.clipboard.writeText(whatsappText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      showToast?.('Report copied — paste it into WhatsApp', 'success');
    } catch {
      showToast?.('Could not copy. Open the preview below and copy it manually.', 'error');
    }
  };

  const exportCSV = () => {
    const head = ['#', 'MRM ID', 'Client', 'Months', 'Outstanding'];
    const body = rows.map((r, i) => [
      i + 1, r.clientId, `"${(r.clientName || '').replace(/"/g, '""')}"`, r.month, r.outstanding || 0,
    ].join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MRM_Whatsapp_Report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Period and Year open on the current financial year; both can be changed
  // on the statement page itself, which carries the same four options.
  const fyFrom = `${currentFy}-04-01`;
  const fyTo = `${currentFy + 1}-03-31`;

  const years = useMemo(() => {
    const list = [];
    for (let y = currentFy; y >= 2025; y--) list.push(y);
    return list;
  }, [currentFy]);

  const openPicker = (client, kind) => {
    setPFrom(fyFrom);
    setPTo(fyTo);
    setPYear(currentFy);
    setPicker({ client, kind });
  };

  const openPicked = () => {
    if (!picker) return;
    const { client, kind } = picker;
    const out = `${client.statementBase}/outstanding?t=${client.statementToken}`;
    const url = kind === 'period'
      ? `${out}&mode=period&from=${pFrom}&to=${pTo}`
      : `${out}&mode=year&year=${pYear}`;
    window.open(url, '_blank', 'noopener');
    setPicker(null);
  };

  const kpis = [
    { label: 'Total receivable', value: rupees(shown.receivable), tone: 'navy' },
    { label: 'Royalty', value: rupees(shown.totalRoyalty), tone: 'blue' },
    { label: 'Commission', value: rupees(shown.commission), tone: 'green' },
    { label: 'Clients owing', value: String(shown.owing), tone: 'orange' },
    { label: 'Settled', value: String(shown.settled), tone: 'green' },
    { label: 'Overpaid', value: String(shown.overpaid), tone: 'red' },
  ];

  return (
    <div className="report-section active">
      <div className="report-page-header">
        <div className="report-page-title">
          <h2>Whatsapp Report</h2>
          <p>The same report the daily email sends</p>
        </div>
        <div className="wa-actions">
          <button className="btn btn-secondary" onClick={exportCSV} disabled={!rows.length}>
            <Icon><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Icon>
            Export CSV
          </button>
          <button className="btn btn-primary" onClick={copyForWhatsapp} disabled={!rows.length}>
            {copied
              ? <><Icon><polyline points="20 6 9 17 4 12" /></Icon>Copied</>
              : <><Icon><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></Icon>Copy for WhatsApp</>}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading report…</p></div>
      ) : error ? (
        <div className="empty-state">
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={load} style={{ marginTop: 12 }}>Try again</button>
        </div>
      ) : (
        <div className="wa-sheet">
          <div className="wa-sheet-head">
            <div className="wa-eyebrow">Music Rights Management</div>
            <h3>Outstanding Report</h3>
            <p>{data?.dateLabel} — every client, latest month only, highest first.</p>
          </div>

          <div className="wa-kpis">
            {kpis.map((k) => (
              <div className="wa-kpi" key={k.label} data-tone={k.tone}>
                <span>{k.label}</span><strong>{k.value}</strong>
              </div>
            ))}
          </div>

          <div className="wa-block">
            <div className="wa-block-title">New clients added in {data?.monthLabel}</div>
            {data?.newClients?.length ? (
              <>
                <div className="wa-block-sub">{data.newClients.length} client{data.newClients.length === 1 ? '' : 's'} added to the master this month.</div>
                <div className="wa-table-wrap">
                  <table className="wa-table wa-table--plain">
                    <thead><tr><th>ID</th><th>Client</th><th>Type</th><th className="r">Rate</th><th className="r">Added</th></tr></thead>
                    <tbody>
                      {data.newClients.map((c) => (
                        <tr key={c.clientId}>
                          <td className="wa-id">{c.clientId}</td>
                          <td className="wa-client">{c.name}</td>
                          <td className="wa-months">{c.type}</td>
                          <td className="r">{c.commissionRate}%</td>
                          <td className="r wa-months">{new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="wa-empty-note">No new clients were added this month.</div>
            )}
          </div>

          <div className="wa-block">
            <div className="wa-block-title">All clients — latest month outstanding</div>
            <div className="wa-block-sub">{rows.length} clients, highest first. Each client has all four statement views; every one can be downloaded as a PDF.</div>

            <div className="wa-filters">
              <div className="report-client-search">
                <Icon size={14}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Icon>
                <input type="text" placeholder="Search by name or MRM ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>

            {!rows.length ? (
              <div className="empty-state"><p>No clients match this report.</p></div>
            ) : (
              <div className="wa-table-wrap">
                <table className="wa-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Client</th>
                      <th>Months</th>
                      <th className="r">Outstanding</th>
                      <th className="r">Statement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.clientId}>
                        <td className="wa-idx">{i + 1}</td>
                        <td>
                          <div className="wa-client">{r.clientName}</div>
                          <div className="wa-id">{r.clientId}</div>
                        </td>
                        <td className="wa-months">{r.month}</td>
                        <td className={`r wa-out${r.outstanding > 0 ? '' : r.outstanding <= -1 ? ' wa-neg' : ' wa-zero'}`}>{inr(r.outstanding)}</td>
                        <td className="r">
                          <div className="wa-links">
                            <a href={`${r.statementBase}/outstanding?t=${r.statementToken}`} target="_blank" rel="noreferrer">Balance build-up</a>
                            <a href={`${r.statementBase}/full?t=${r.statementToken}`} target="_blank" rel="noreferrer">Full record</a>
                            <button type="button" onClick={() => openPicker(r, 'period')}>Period</button>
                            <button type="button" onClick={() => openPicker(r, 'year')}>Year</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {picker && (
            <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) setPicker(null); }}>
              <div className="modal wa-modal" role="dialog" aria-modal="true" aria-label={picker.kind === 'period' ? 'Choose a period' : 'Choose a financial year'}>
                <div className="modal-header">
                  <h3>{picker.kind === 'period' ? 'Choose a period' : 'Choose a financial year'}</h3>
                  <button className="modal-close" onClick={() => setPicker(null)} aria-label="Close">
                    <Icon size={20}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>
                  </button>
                </div>
                <div className="modal-body">
                  <p className="wa-modal-client">
                    <strong>{picker.client.clientName}</strong>
                    <span>{picker.client.clientId}</span>
                  </p>
                  {picker.kind === 'period' ? (
                    <div className="wa-modal-fields">
                      <label>
                        <span>From</span>
                        <input type="date" value={pFrom} onChange={(e) => setPFrom(e.target.value)} />
                      </label>
                      <label>
                        <span>To</span>
                        <input type="date" value={pTo} onChange={(e) => setPTo(e.target.value)} />
                      </label>
                    </div>
                  ) : (
                    <div className="wa-modal-fields">
                      <label>
                        <span>Financial year</span>
                        <select value={pYear} onChange={(e) => setPYear(parseInt(e.target.value, 10))}>
                          {years.map((y) => <option key={y} value={y}>FY {y}-{y + 1}</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                  <p className="wa-modal-note">
                    Royalty and commission are added up across every month in this range. Outstanding is the balance at the end of it.
                  </p>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setPicker(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={openPicked} disabled={picker.kind === 'period' && (!pFrom || !pTo)}>
                    Open statement
                  </button>
                </div>
              </div>
            </div>
          )}

          <details className="wa-preview">
            <summary>WhatsApp message preview ({whatsappText.split('\n').length} lines)</summary>
            <pre>{whatsappText}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default WhatsappReport;
