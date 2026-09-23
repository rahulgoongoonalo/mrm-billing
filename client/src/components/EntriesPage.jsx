import React, { useState, useEffect, useMemo } from 'react';
import { royaltyApi } from '../services/api';
import { MONTH_LABELS, formatCurrency, formatDateTime } from '../utils/format';
import Icon from './Icon';

// Was the "View Entries" modal. As a full page it has room to filter, which is
// what makes a list of every entry in the year usable.
function EntriesPage() {
  const [allEntries, setAllEntries] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [month, setMonth] = useState('all');

  useEffect(() => {
    let cancelled = false;
    royaltyApi.getAll()
      .then((res) => { if (!cancelled) setAllEntries(res.data || []); })
      .catch((err) => {
        if (!cancelled) setLoadError(err.response?.data?.message || 'Failed to load entries');
      });
    return () => { cancelled = true; };
  }, []);

  const entries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (allEntries || [])
      .filter((e) => {
        if (status !== 'all' && (e.status || 'draft') !== status) return false;
        if (month !== 'all' && e.month !== month) return false;
        if (!term) return true;
        return (
          (e.clientName || '').toLowerCase().includes(term) ||
          (e.clientId || '').toLowerCase().includes(term) ||
          (e.lastEditedByEmail || '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bt - at;
      });
  }, [allEntries, search, status, month]);

  if (loadError) {
    return <div className="empty-state"><h3>Failed to load</h3><p>{loadError}</p></div>;
  }
  if (allEntries === null) {
    return <div className="empty-state"><h3>Loading entries&hellip;</h3></div>;
  }

  return (
    <>
      <div className="filter-bar">
        <div className="client-search entries-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search client, MRM ID or editor email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search entries"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Filter by month">
          <option value="all">All months</option>
          {Object.entries(MONTH_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <span className="filter-count">
          {entries.length} of {allEntries.length} {allEntries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <h3>No entries match</h3>
          <p>
            {allEntries.length === 0
              ? 'Start by selecting a client on the Data Entry page.'
              : 'Try clearing the search or filters.'}
          </p>
        </div>
      ) : (
        <div className="entry-list">
          {entries.map((entry) => (
            <div className="entry-card" key={`${entry.clientId}_${entry.month}_${entry.year}`}>
              <div className="entry-card-top">
                <span className="entry-client">{entry.clientName}</span>
                <span className={`status-pill status-pill--${entry.status || 'draft'}`}>
                  {entry.status || 'draft'}
                </span>
              </div>
              <div className="entry-figures">
                <span>Month <strong>{MONTH_LABELS[entry.month]} {entry.year}</strong></span>
                <span>Commission <strong>{formatCurrency(entry.totalCommission)}</strong></span>
                <span>Monthly O/S <strong>{formatCurrency(entry.monthlyOutstanding)}</strong></span>
                <span>Total O/S <strong className="accent">{formatCurrency(entry.totalOutstanding)}</strong></span>
              </div>
              <div className="entry-meta">
                <span>Created <strong>{formatDateTime(entry.createdAt)}</strong></span>
                <span>Updated <strong>{formatDateTime(entry.updatedAt)}</strong></span>
                <span>By <strong>{entry.lastEditedByEmail || '—'}</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default EntriesPage;
