import React, { useState, useEffect, useMemo } from 'react';
import { royaltyApi } from '../services/api';
import { MONTH_LABELS, formatCurrency, formatDateTime } from '../utils/format';
import { SOCIETIES, SOCIETY_FIELDS } from '../utils/clientProfile';
import Icon from './Icon';

const PAGE = 150;

// An entry saved once and never touched again has the same created and updated
// stamp, give or take the write itself.
const isNew = (e) => {
  const c = new Date(e.createdAt || 0).getTime();
  const u = new Date(e.updatedAt || 0).getTime();
  return Math.abs(u - c) < 2000;
};

const dayKey = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
};

const dayLabel = (key) => {
  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('en-CA');
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return new Date(`${key}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
};

const royaltyOf = (e) => SOCIETIES.reduce((sum, s) => sum + (e[SOCIETY_FIELDS[s].amount] || 0), 0);

// Entries saved with no account against them are the carry-forward recalculations
// the server runs itself, not somebody's work.
const AUTOMATIC = 'Automatic recalculation';
const accountOf = (e) => e.lastEditedByEmail || AUTOMATIC;

// What happened the last time this month's statement was mailed to the client.
const mailStateOf = (e) => {
  const log = e.mailLog || [];
  if (!log.length) return { state: 'none', last: null, attempts: 0 };
  const last = log[log.length - 1];
  return { state: last.ok ? 'sent' : 'failed', last, attempts: log.length };
};

const timeOnly = (value) =>
  new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

function EntriesPage() {
  const [allEntries, setAllEntries] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [month, setMonth] = useState('all');
  const [account, setAccount] = useState('all');
  const [period, setPeriod] = useState('all');
  const [mail, setMail] = useState('all');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    royaltyApi.getAll()
      .then((res) => { if (!cancelled) setAllEntries(res.data || []); })
      .catch((err) => {
        if (!cancelled) setLoadError(err.response?.data?.message || 'Failed to load entries');
      });
    return () => { cancelled = true; };
  }, []);

  // Who saved what, and when. "Today" is the machine's day, which is the day the
  // team is working in.
  const accounts = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    const map = new Map();
    for (const e of allEntries || []) {
      const key = accountOf(e);
      if (!map.has(key)) {
        map.set(key, {
          account: key, total: 0, today: 0, createdToday: 0, editedToday: 0,
          clientsToday: new Set(), firstToday: null, lastToday: null, lastActive: null,
        });
      }
      const a = map.get(key);
      a.total++;
      const stamp = e.updatedAt || e.createdAt;
      if (stamp && (!a.lastActive || new Date(stamp) > new Date(a.lastActive))) a.lastActive = stamp;
      if (dayKey(stamp) === today) {
        a.today++;
        if (isNew(e)) a.createdToday++; else a.editedToday++;
        a.clientsToday.add(e.clientId);
        if (!a.firstToday || new Date(stamp) < new Date(a.firstToday)) a.firstToday = stamp;
        if (!a.lastToday || new Date(stamp) > new Date(a.lastToday)) a.lastToday = stamp;
      }
    }
    return [...map.values()].sort((x, y) => y.today - x.today || y.total - x.total);
  }, [allEntries]);

  const summary = useMemo(() => {
    const list = allEntries || [];
    const today = new Date().toLocaleDateString('en-CA');
    return {
      total: list.length,
      submitted: list.filter((e) => e.status === 'submitted').length,
      draft: list.filter((e) => (e.status || 'draft') === 'draft').length,
      clients: new Set(list.map((e) => e.clientId)).size,
      people: new Set(list.filter((e) => e.lastEditedByEmail).map((e) => e.lastEditedByEmail)).size,
      touchedToday: list.filter((e) => dayKey(e.updatedAt || e.createdAt) === today).length,
      mailed: list.filter((e) => mailStateOf(e).state === 'sent').length,
      mailFailed: list.filter((e) => mailStateOf(e).state === 'failed').length,
      awaitingMail: list.filter((e) => e.status === 'submitted' && mailStateOf(e).state === 'none').length,
    };
  }, [allEntries]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const today = new Date().toLocaleDateString('en-CA');
    const weekAgo = new Date(Date.now() - 7 * 864e5);
    return (allEntries || [])
      .filter((e) => {
        if (status !== 'all' && (e.status || 'draft') !== status) return false;
        if (month !== 'all' && e.month !== month) return false;
        if (account !== 'all' && accountOf(e) !== account) return false;
        if (mail !== 'all') {
          const m = mailStateOf(e).state;
          if (mail === 'pending' && !(m === 'none' && e.status === 'submitted')) return false;
          if (mail !== 'pending' && m !== mail) return false;
        }
        const stamp = e.updatedAt || e.createdAt;
        if (period === 'today' && dayKey(stamp) !== today) return false;
        if (period === 'week' && new Date(stamp) < weekAgo) return false;
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
  }, [allEntries, search, status, month, account, period, mail]);

  // Newest first, broken into the day each entry was last saved.
  const days = useMemo(() => {
    const out = [];
    let current = null;
    for (const e of filtered.slice(0, limit)) {
      const key = dayKey(e.updatedAt || e.createdAt);
      if (!current || current.key !== key) {
        current = { key, entries: [] };
        out.push(current);
      }
      current.entries.push(e);
    }
    return out;
  }, [filtered, limit]);

  useEffect(() => { setLimit(PAGE); }, [search, status, month, account, period, mail]);

  if (loadError) {
    return <div className="empty-state"><h3>Failed to load</h3><p>{loadError}</p></div>;
  }
  if (allEntries === null) {
    return <div className="empty-state"><h3>Loading entries&hellip;</h3></div>;
  }

  return (
    <>
      <div className="stats-grid entries-stats">
        <div className="stat-card">
          <div className="stat-label">Total Entries</div>
          <div className="stat-value">{summary.total.toLocaleString('en-IN')}</div>
        </div>
        <div className="stat-card" style={{ '--card-accent': 'var(--accent-green)' }}>
          <div className="stat-label">Submitted</div>
          <div className="stat-value">{summary.submitted.toLocaleString('en-IN')}</div>
        </div>
        <div className="stat-card" style={{ '--card-accent': 'var(--accent-orange)' }}>
          <div className="stat-label">Draft</div>
          <div className="stat-value">{summary.draft.toLocaleString('en-IN')}</div>
        </div>
        <div className="stat-card" style={{ '--card-accent': 'var(--accent-purple)' }}>
          <div className="stat-label">Clients Covered</div>
          <div className="stat-value">{summary.clients}</div>
        </div>
        <div className="stat-card" style={{ '--card-accent': 'var(--accent-blue)' }}>
          <div className="stat-label">Saved Today</div>
          <div className="stat-value">{summary.touchedToday.toLocaleString('en-IN')}</div>
        </div>
        <div className="stat-card" style={{ '--card-accent': 'var(--accent-green)' }}>
          <div className="stat-label">Statement Mailed</div>
          <div className="stat-value">{summary.mailed.toLocaleString('en-IN')}</div>
          <div className="stat-sub">
            {summary.awaitingMail.toLocaleString('en-IN')} not sent
            {summary.mailFailed > 0 && <span className="stat-bad"> &middot; {summary.mailFailed} failed</span>}
          </div>
        </div>
      </div>

      <div className="report-container">
        <div className="report-header">
          <h3>
            <Icon name="users" size={18} />
            Entries by account
          </h3>
          <span className="count">{summary.people} {summary.people === 1 ? 'person' : 'people'}</span>
        </div>
        <div className="table-wrapper">
          <table className="report-table">
            <thead>
              <tr>
                <th>Account</th>
                <th style={{ textAlign: 'right' }}>Today</th>
                <th style={{ textAlign: 'right' }}>New</th>
                <th style={{ textAlign: 'right' }}>Edits</th>
                <th style={{ textAlign: 'right' }}>Clients today</th>
                <th>Working window</th>
                <th style={{ textAlign: 'right' }}>All time</th>
                <th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr
                  key={a.account}
                  className={`account-row${account === a.account ? ' picked' : ''}`}
                  onClick={() => setAccount(account === a.account ? 'all' : a.account)}
                  title="Click to filter the list below by this account"
                >
                  <td>
                    {a.account === AUTOMATIC
                      ? <span className="auto-account">{AUTOMATIC}</span>
                      : a.account}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <strong>{a.today || '—'}</strong>
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--accent-green)' }}>{a.createdToday || '—'}</td>
                  <td style={{ textAlign: 'right', color: 'var(--accent-orange)' }}>{a.editedToday || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{a.clientsToday.size || '—'}</td>
                  <td>
                    {a.firstToday
                      ? `${timeOnly(a.firstToday)} – ${timeOnly(a.lastToday)}`
                      : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>{a.total.toLocaleString('en-IN')}</td>
                  <td>{a.lastActive ? formatDateTime(a.lastActive) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="report-note">
          Entries with no account against them are the carry-forward recalculations the
          server runs when an earlier month changes &mdash; not somebody&rsquo;s work.
        </div>
      </div>

      <div className="filter-bar">
        <div className="client-search entries-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search client, MRM ID or account"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search entries"
          />
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Filter by period">
          <option value="all">Any time</option>
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
        </select>
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
        <select value={mail} onChange={(e) => setMail(e.target.value)} aria-label="Filter by mail status">
          <option value="all">Any mail status</option>
          <option value="sent">Statement mailed</option>
          <option value="pending">Submitted, not mailed</option>
          <option value="failed">Mail failed</option>
        </select>
        <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Filter by account">
          <option value="all">All accounts</option>
          {accounts.map((a) => <option key={a.account} value={a.account}>{a.account}</option>)}
        </select>
        <span className="filter-count">
          {filtered.length.toLocaleString('en-IN')} of {summary.total.toLocaleString('en-IN')}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <h3>No entries match</h3>
          <p>
            {summary.total === 0
              ? 'Start by selecting a client on the Data Entry page.'
              : 'Try clearing the search or filters.'}
          </p>
        </div>
      ) : (
        <>
          {days.map((day) => (
            <section className="entry-day" key={day.key}>
              <div className="entry-day-head">
                <h3>{dayLabel(day.key)}</h3>
                <span>{day.entries.length} {day.entries.length === 1 ? 'entry' : 'entries'}</span>
              </div>
              <div className="entry-list">
                {day.entries.map((entry) => {
                  const royalty = royaltyOf(entry);
                  const receipts = (entry.currentMonthReceipt || 0) + (entry.previousMonthReceipt || 0);
                  const tds = (entry.currentMonthTds || 0) + (entry.previousMonthTds || 0);
                  const m = mailStateOf(entry);
                  return (
                    <div className="entry-card" key={`${entry.clientId}_${entry.month}_${entry.year}`}>
                      <div className="entry-card-top">
                        <span className="entry-client">
                          {entry.clientName}
                          <span className="entry-mrm">{entry.clientId}</span>
                        </span>
                        <span className="entry-badges">
                          <span className={`status-pill status-pill--${isNew(entry) ? 'new' : 'edited'}`}>
                            {isNew(entry) ? 'new' : 'edited'}
                          </span>
                          <span className={`status-pill status-pill--${entry.status || 'draft'}`}>
                            {entry.status || 'draft'}
                          </span>
                          {m.state === 'sent' && (
                            <span className="status-pill status-pill--mailed" title={`Sent to ${m.last.to}`}>
                              <Icon name="message" size={11} />
                              mailed
                            </span>
                          )}
                          {m.state === 'failed' && (
                            <span className="status-pill status-pill--mailfail" title={m.last.error}>
                              mail failed
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="entry-figures">
                        <span>Month <strong>{MONTH_LABELS[entry.month]} {entry.year}</strong></span>
                        <span>Royalty <strong>{formatCurrency(royalty)}</strong></span>
                        <span>Commission <strong>{formatCurrency(entry.totalCommission)}</strong></span>
                        <span>GST <strong>{formatCurrency(entry.currentMonthGst)}</strong></span>
                        <span>Received <strong>{formatCurrency(receipts)}</strong></span>
                        <span>TDS <strong>{formatCurrency(tds)}</strong></span>
                        <span>Opened at <strong>{formatCurrency(entry.previousMonthOutstanding)}</strong></span>
                        <span>Total O/S <strong className="accent">{formatCurrency(entry.totalOutstanding)}</strong></span>
                      </div>
                      <div className="entry-meta">
                        <span>Created <strong>{formatDateTime(entry.createdAt)}</strong></span>
                        <span>Updated <strong>{formatDateTime(entry.updatedAt)}</strong></span>
                        <span>
                          By <strong>{entry.lastEditedByEmail || <em className="auto-account">{AUTOMATIC}</em>}</strong>
                        </span>
                        {m.state !== 'none' && (
                          <span className={m.state === 'failed' ? 'mail-line mail-line--bad' : 'mail-line'}>
                            {m.state === 'sent' ? 'Statement sent ' : 'Statement failed '}
                            <strong>{formatDateTime(m.last.sentAt)}</strong>
                            {' to '}<strong>{m.last.to}</strong>
                            {m.last.isTest && <span className="test-tag">test</span>}
                            {m.attempts > 1 && <span className="attempt-tag">{m.attempts} attempts</span>}
                            {m.state === 'failed' && m.last.error && <em> &mdash; {m.last.error}</em>}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {filtered.length > limit && (
            <button className="btn btn-secondary load-more" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, filtered.length - limit)} more
              <span className="load-more-rest">
                {(filtered.length - limit).toLocaleString('en-IN')} still to show
              </span>
            </button>
          )}
        </>
      )}
    </>
  );
}

export default EntriesPage;
