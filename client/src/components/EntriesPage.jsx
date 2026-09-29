import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { royaltyApi, activityApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { MONTH_LABELS, formatDateTime } from '../utils/format';
import { SOCIETIES, SOCIETY_FIELDS } from '../utils/clientProfile';
import Icon from './Icon';

// All Entries: who did what, to which client, and when - one page.
//
// Two sources feed it, merged into one timeline:
//   events  - recorded by the server as people work (services/activity.js):
//             every save, submit and delete with the figures that changed,
//             client master edits, clients opened, mails, sign-ins.
//   entries - the monthly entries themselves. Work done before events were
//             recorded survives only as each entry's last save, so for that
//             stretch the entry is shown as one "added" or "edited" by whoever
//             saved it last, marked as coming from the entry record.

const PAGE = 200;

// ── Period ──────────────────────────────────────────────────────────────
const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

const startOfDay = (offset = 0, base = new Date()) => {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

function periodRange(period, day) {
  switch (period) {
    case 'today': return { from: startOfDay(0) };
    case 'yesterday': return { from: startOfDay(-1), to: startOfDay(0) };
    case '7d': return { from: startOfDay(-6) };
    case '30d': return { from: startOfDay(-29) };
    case 'day': {
      const d = new Date(`${day}T00:00:00`);
      return Number.isNaN(d.getTime()) ? {} : { from: d, to: startOfDay(1, d) };
    }
    default: return {};
  }
}

const inRange = (at, r) => {
  const t = new Date(at).getTime();
  return (!r.from || t >= r.from.getTime()) && (!r.to || t < r.to.getTime());
};

// ── What happened ───────────────────────────────────────────────────────
const KINDS = [
  { id: 'all', label: 'Everything', actions: [] },
  { id: 'entries', label: 'All entry work', actions: ['entry.created', 'entry.updated', 'entry.submitted', 'entry.deleted'] },
  { id: 'added', label: 'Entries added', actions: ['entry.created'] },
  { id: 'edited', label: 'Entries edited', actions: ['entry.updated'] },
  { id: 'submitted', label: 'Entries submitted', actions: ['entry.submitted'] },
  { id: 'deleted', label: 'Deleted / deactivated', actions: ['entry.deleted', 'client.deleted', 'client.deactivated'] },
  { id: 'viewed', label: 'Clients opened', actions: ['client.viewed'] },
  { id: 'clients', label: 'Client master changes', actions: ['client.created', 'client.updated', 'client.deactivated', 'client.reactivated', 'client.deleted', 'client.imported'] },
  { id: 'mail', label: 'Mail sent', actions: ['mail.sent', 'mail.failed'] },
  { id: 'login', label: 'Sign-ins', actions: ['auth.login'] },
];

const ACTION_INFO = {
  'entry.created': { pill: 'Added', tone: 'green' },
  'entry.updated': { pill: 'Edited', tone: 'orange' },
  'entry.submitted': { pill: 'Submitted', tone: 'blue' },
  'entry.deleted': { pill: 'Deleted', tone: 'red' },
  'client.created': { pill: 'New client', tone: 'green' },
  'client.updated': { pill: 'Client edited', tone: 'purple' },
  'client.deactivated': { pill: 'Deactivated', tone: 'red' },
  'client.reactivated': { pill: 'Reactivated', tone: 'green' },
  'client.deleted': { pill: 'Client deleted', tone: 'red' },
  'client.imported': { pill: 'Imported', tone: 'purple' },
  'client.viewed': { pill: 'Opened', tone: 'muted' },
  'mail.sent': { pill: 'Mail sent', tone: 'blue' },
  'mail.failed': { pill: 'Mail failed', tone: 'red' },
  'auth.login': { pill: 'Signed in', tone: 'muted' },
};

const PLACES = {
  'data-entry': 'Data Entry',
  'client-report': 'Client Report',
  'client-master': 'Client Master',
  'mail-wizard': 'the mail wizard',
};

// Columns of the team and client tables, and the headline tiles.
const COUNTERS = [
  { key: 'added', label: 'Added', tone: 'green', actions: ['entry.created'] },
  { key: 'edited', label: 'Edited', tone: 'orange', actions: ['entry.updated'] },
  { key: 'submitted', label: 'Submitted', tone: 'blue', actions: ['entry.submitted'] },
  { key: 'deleted', label: 'Deleted', tone: 'red', actions: ['entry.deleted', 'client.deleted'] },
  { key: 'viewed', label: 'Opened', tone: 'muted', actions: ['client.viewed'] },
  { key: 'clients', label: 'Client edits', tone: 'purple', actions: ['client.created', 'client.updated', 'client.deactivated', 'client.reactivated', 'client.imported'] },
  { key: 'mail', label: 'Mails', tone: 'blue', actions: ['mail.sent'] },
];
const counter = (key) => COUNTERS.find((c) => c.key === key);
const countOf = (actions, list) => list.reduce((s, a) => s + (actions?.[a] || 0), 0);
const isWork = (actions) => Object.keys(actions || {}).some((a) => a !== 'client.viewed' && a !== 'auth.login');

// Saves made by the server itself (carry-forward recalculation) have no account.
const AUTOMATIC = '';
const AUTOMATIC_LABEL = 'Automatic recalculation';

// ── Formatting ──────────────────────────────────────────────────────────
const money = (n) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(Number(n) || 0);

const showValue = (kind, v) => {
  if (v === '' || v === null || v === undefined) return '—';
  if (kind === 'money') return money(v);
  if (kind === 'percent') return `${v}%`;
  return String(v);
};

const num = (n) => (n ? n.toLocaleString('en-IN') : '—');
const dayKey = (value) => new Date(value).toLocaleDateString('en-CA');
const dayLabel = (key) => {
  if (key === startOfDay(0).toLocaleDateString('en-CA')) return 'Today';
  if (key === startOfDay(-1).toLocaleDateString('en-CA')) return 'Yesterday';
  return new Date(`${key}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
};
const timeOnly = (value) => new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const shortDate = (value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const monthText = (e) => (e.month ? `${MONTH_LABELS[e.month] || e.month} ${e.year || ''}`.trim() : '');

// ── Entries as timeline items (before events were recorded) ────────────
const stampOf = (e) => e.updatedAt || e.createdAt;
// Saved once and never touched again: created and updated within the write.
const savedOnce = (e) => Math.abs(new Date(e.updatedAt || 0) - new Date(e.createdAt || 0)) < 2000;
const royaltyOf = (e) => SOCIETIES.reduce((sum, s) => sum + (e[SOCIETY_FIELDS[s].amount] || 0), 0);

const legacyItem = (e) => ({
  _id: `entry-${e._id || `${e.clientId}-${e.month}-${e.year}`}`,
  legacy: true,
  at: stampOf(e),
  userEmail: e.lastEditedByEmail || AUTOMATIC,
  action: savedOnce(e) ? 'entry.created' : 'entry.updated',
  clientId: e.clientId,
  clientName: e.clientName,
  month: e.month,
  year: e.year,
  changes: [],
  meta: {
    status: e.status || 'draft',
    royalty: royaltyOf(e),
    totalCommission: e.totalCommission || 0,
    received: (e.currentMonthReceipt || 0) + (e.previousMonthReceipt || 0),
    tds: (e.currentMonthTds || 0) + (e.previousMonthTds || 0),
    totalOutstanding: e.totalOutstanding || 0,
  },
});

// One line saying what happened, without the person or the client.
function describe(e) {
  const m = e.meta || {};
  const month = monthText(e);
  const draft = m.status === 'draft' ? ' (draft)' : '';
  if (e.legacy) {
    if (!e.userEmail) return `recalculated the ${month} entry after an earlier month changed`;
    return e.action === 'entry.created' ? `added the ${month} entry${draft}` : `edited the ${month} entry${draft}`;
  }
  const later = m.cascaded ? ` · ${m.cascaded} later month${m.cascaded === 1 ? '' : 's'} recalculated` : '';
  switch (e.action) {
    case 'entry.created': return `added the ${month} entry${m.status === 'submitted' ? ' and submitted it' : ' as a draft'}${later}`;
    case 'entry.updated': return `${e.changes?.length ? `edited the ${month} entry` : `saved the ${month} entry again, nothing changed`}${draft}${later}`;
    case 'entry.submitted': return `submitted the ${month} entry${later}`;
    case 'entry.deleted': return `deleted the ${month} entry`;
    case 'client.created': return 'added a new client';
    case 'client.updated': return 'changed client details';
    case 'client.deactivated': return 'deactivated the client';
    case 'client.reactivated': return 'reactivated the client';
    case 'client.deleted': return `permanently deleted the client${m.entriesRemoved ? ` and its ${m.entriesRemoved} entries` : ''}`;
    case 'client.imported': return `imported ${m.count || 0} clients`;
    case 'client.viewed': return `opened the client in ${PLACES[m.where] || 'the app'}`;
    case 'mail.sent': return `${m.isTest ? 'sent a test mail' : 'mailed the client'}${m.subject ? `: ${m.subject}` : ''}`;
    case 'mail.failed': return `tried to mail the client, but it failed${m.error ? ` (${m.error})` : ''}`;
    case 'auth.login': return 'signed in';
    default: return e.action;
  }
}

const hasFigures = (e) => e.action.startsWith('entry.') && e.meta?.royalty !== undefined;

// ── Timeline row ────────────────────────────────────────────────────────
function EventRow({ event, who, onPickClient }) {
  const [open, setOpen] = useState(false);
  const info = event.legacy && !event.userEmail
    ? { pill: 'Recalculated', tone: 'muted' }
    : ACTION_INFO[event.action] || { pill: event.action, tone: 'muted' };
  const detail = (event.changes?.length || 0) > 0 || hasFigures(event);
  const m = event.meta || {};
  const pick = (ev) => { ev.stopPropagation(); onPickClient(event.clientId, event.clientName); };
  return (
    <li className={`act-row${open ? ' is-open' : ''}${event.legacy ? ' is-legacy' : ''}`}>
      <button
        type="button"
        className="act-row-main"
        onClick={() => detail && setOpen((o) => !o)}
        aria-expanded={detail ? open : undefined}
        disabled={!detail}
      >
        <span className="act-time">{timeOnly(event.at)}</span>
        <span
          className={`act-pill act-pill--${info.tone}`}
          title={event.legacy ? 'From the entry record - only the last save is known' : undefined}
        >
          {info.pill}
        </span>
        <span className="act-text">
          <strong className={`act-who${event.userEmail ? '' : ' auto-account'}`}>{who}</strong>{' '}
          {describe(event)}
          {event.clientId && (
            <>
              {' — '}
              <span
                className="act-client"
                role="link"
                tabIndex={0}
                onClick={pick}
                onKeyDown={(ev) => ev.key === 'Enter' && pick(ev)}
                title="Show only this client"
              >
                {event.clientName || event.clientId}
              </span>
              <span className="entry-mrm">{event.clientId}</span>
            </>
          )}
        </span>
        <span className="act-side">
          {hasFigures(event) && <span className="act-os">O/S <b>{money(m.totalOutstanding)}</b></span>}
          {detail && (
            <span className="act-more">
              {event.changes?.length ? `${event.changes.length} change${event.changes.length === 1 ? '' : 's'}` : 'figures'}
              <Icon name="chevron-down" size={14} />
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="act-detail">
          {event.changes?.length > 0 && (
            <table className="act-changes">
              <tbody>
                {event.changes.map((c) => (
                  <tr key={c.field}>
                    <th>{c.label || c.field}</th>
                    <td className="act-from">{showValue(c.kind, c.from)}</td>
                    <td className="act-arrow">&rarr;</td>
                    <td className="act-to">{showValue(c.kind, c.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {hasFigures(event) && (
            <div className="act-figures">
              <span>Royalty <strong>{money(m.royalty)}</strong></span>
              <span>Commission <strong>{money(m.totalCommission)}</strong></span>
              <span>Received <strong>{money(m.received)}</strong></span>
              <span>TDS <strong>{money(m.tds)}</strong></span>
              <span>Total O/S <strong>{money(m.totalOutstanding)}</strong></span>
              <span>Status <strong>{m.status}</strong></span>
            </div>
          )}
          {event.legacy && (
            <p className="act-legacy-note">
              From the entry record: saved before activity was recorded, so only the last save is known.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

// ── Page ────────────────────────────────────────────────────────────────
function EntriesPage() {
  const { user } = useAuth();

  const [period, setPeriod] = useState('today');
  const [day, setDay] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [person, setPerson] = useState(null);      // email, AUTOMATIC or null for everyone
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [month, setMonth] = useState('all');
  const [client, setClient] = useState(null);      // { clientId, clientName }
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  const [entries, setEntries] = useState(null);
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [more, setMore] = useState(false);
  const [legacyLimit, setLegacyLimit] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // The ledger itself - loaded once, it does not depend on the period.
  const loadEntries = useCallback(() => royaltyApi.getAll()
    .then((res) => setEntries(res.data || []))
    .catch((err) => setError(err.response?.data?.message || 'Could not load entries')), []);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const range = useMemo(() => periodRange(period, day), [period, day]);
  const rangeParams = useMemo(() => {
    const p = {};
    if (range.from) p.from = range.from.toISOString();
    if (range.to) p.to = range.to.toISOString();
    return p;
  }, [range]);

  const actionsFilter = useMemo(() => KINDS.find((k) => k.id === kind)?.actions || [], [kind]);

  const listParams = useMemo(() => {
    const p = { ...rangeParams, limit: PAGE };
    if (person !== null) p.user = person;
    if (actionsFilter.length) p.action = actionsFilter.join(',');
    if (client) p.clientId = client.clientId;
    if (status !== 'all') p.status = status;
    if (month !== 'all') p.month = month;
    if (debounced) p.search = debounced;
    return p;
  }, [rangeParams, person, actionsFilter, client, status, month, debounced]);

  const loadActivity = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setLegacyLimit(PAGE);
    Promise.all([activityApi.summary(rangeParams), activityApi.list(listParams)])
      .then(([s, l]) => {
        if (cancelled) return;
        setSummary(s.data);
        setEvents(l.data.events || []);
        setMore(!!l.data.more);
      })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || 'Could not load activity'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [rangeParams, listParams]);
  useEffect(() => loadActivity(), [loadActivity]);

  const refresh = () => { loadEntries(); loadActivity(); };

  const everyone = summary ? summary.scope !== 'self' : user?.role === 'admin';
  const sinceIso = summary?.recordingSince || null;
  const since = useMemo(() => (sinceIso ? new Date(sinceIso) : null), [sinceIso]);

  // Entries last saved before recording began, inside the period.
  const legacyInPeriod = useMemo(() => {
    if (!entries) return [];
    return entries
      .filter((e) => stampOf(e) && (!since || new Date(stampOf(e)) < since))
      .filter((e) => everyone || e.lastEditedByEmail === user?.email)
      .map(legacyItem)
      .filter((it) => inRange(it.at, range))
      .sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [entries, since, everyone, user, range]);

  const legacyShown = useMemo(() => {
    const term = debounced.toLowerCase();
    // Entry-record items are only ever "added" or "edited".
    if (actionsFilter.length && !actionsFilter.some((a) => a === 'entry.created' || a === 'entry.updated')) return [];
    return legacyInPeriod.filter((it) => {
      if (person !== null && it.userEmail !== person) return false;
      if (actionsFilter.length && !actionsFilter.includes(it.action)) return false;
      if (client && it.clientId !== client.clientId) return false;
      if (status !== 'all' && it.meta.status !== status) return false;
      if (month !== 'all' && it.month !== month) return false;
      if (term && ![it.clientName, it.clientId, it.userEmail].some((v) => (v || '').toLowerCase().includes(term))) return false;
      return true;
    });
  }, [legacyInPeriod, person, actionsFilter, client, status, month, debounced]);

  // Everyone's numbers for the period: recorded events plus entry-record saves.
  const team = useMemo(() => {
    const map = new Map();
    const get = (email) => {
      if (!map.has(email)) map.set(email, { email, name: '', role: '', actions: {}, first: null, last: null, clients: new Map(), lastSaved: 0 });
      return map.get(email);
    };
    const stretch = (p, at) => {
      if (!at) return;
      if (!p.first || new Date(at) < new Date(p.first)) p.first = at;
      if (!p.last || new Date(at) > new Date(p.last)) p.last = at;
    };
    for (const u of summary?.users || []) Object.assign(get(u.email), { name: u.name, role: u.role });
    for (const sp of summary?.people || []) {
      const p = get(sp.email);
      for (const [a, n] of Object.entries(sp.actions)) p.actions[a] = (p.actions[a] || 0) + n;
      stretch(p, sp.first); stretch(p, sp.last);
      for (const c of sp.clients) p.clients.set(c.clientId, { ...c, actions: { ...c.actions } });
    }
    for (const it of legacyInPeriod) {
      const p = get(it.userEmail);
      p.actions[it.action] = (p.actions[it.action] || 0) + 1;
      stretch(p, it.at);
      if (!p.clients.has(it.clientId)) p.clients.set(it.clientId, { clientId: it.clientId, clientName: it.clientName, actions: {}, last: null });
      const c = p.clients.get(it.clientId);
      c.actions[it.action] = (c.actions[it.action] || 0) + 1;
      if (!c.last || new Date(it.at) > new Date(c.last)) c.last = it.at;
    }
    for (const e of entries || []) {
      if (!everyone && e.lastEditedByEmail !== user?.email) continue;
      get(e.lastEditedByEmail || AUTOMATIC).lastSaved++;
    }
    return [...map.values()]
      .map((p) => ({ ...p, clients: [...p.clients.values()].sort((a, b) => new Date(b.last) - new Date(a.last)) }))
      // Keep the automatic row only when it has something to say.
      .filter((p) => p.email !== AUTOMATIC || p.last)
      .sort((a, b) => (b.last ? 1 : 0) - (a.last ? 1 : 0) || new Date(b.last || 0) - new Date(a.last || 0) || b.lastSaved - a.lastSaved);
  }, [summary, legacyInPeriod, entries, everyone, user]);

  const nameOf = useCallback((email) => {
    if (!email) return AUTOMATIC_LABEL;
    const p = team.find((t) => t.email === email);
    return p?.name || email;
  }, [team]);

  const selected = person !== null ? team.find((p) => p.email === person) : null;

  // Headline tiles follow the chosen person, else everyone.
  const headline = useMemo(() => {
    const people = selected ? [selected] : team;
    const total = (key) => people.reduce((s, p) => s + countOf(p.actions, counter(key).actions), 0);
    const worked = new Set();
    const opened = new Set();
    for (const p of people) {
      for (const c of p.clients) {
        if (isWork(c.actions)) worked.add(c.clientId);
        if (c.actions['client.viewed']) opened.add(c.clientId);
      }
    }
    return {
      added: total('added'), edited: total('edited'), submitted: total('submitted'),
      deleted: total('deleted'), worked: worked.size, opened: opened.size,
    };
  }, [team, selected]);

  const ledger = useMemo(() => {
    const list = entries || [];
    return {
      total: list.length,
      submitted: list.filter((e) => e.status === 'submitted').length,
      draft: list.filter((e) => (e.status || 'draft') === 'draft').length,
      clients: new Set(list.map((e) => e.clientId)).size,
    };
  }, [entries]);

  // Recorded events first (newest); entry-record items follow once they run out,
  // since every one of them is older than the first recorded event.
  // Automatic recalculations are never recorded as events of their own.
  const automaticOnly = person === AUTOMATIC;
  const moreEvents = more && !automaticOnly;
  const feed = useMemo(() => {
    const recorded = automaticOnly ? [] : events;
    return moreEvents ? recorded : [...recorded, ...legacyShown.slice(0, legacyLimit)];
  }, [events, automaticOnly, moreEvents, legacyShown, legacyLimit]);
  const hasOlder = moreEvents || legacyShown.length > legacyLimit;

  const days = useMemo(() => {
    const out = [];
    for (const e of feed) {
      const key = dayKey(e.at);
      if (!out.length || out[out.length - 1].key !== key) out.push({ key, events: [] });
      out[out.length - 1].events.push(e);
    }
    return out;
  }, [feed]);

  const showOlder = async () => {
    if (!moreEvents) { setLegacyLimit((n) => n + PAGE); return; }
    setLoadingMore(true);
    try {
      const res = await activityApi.list({ ...listParams, before: events[events.length - 1].at });
      setEvents((prev) => [...prev, ...(res.data.events || [])]);
      setMore(!!res.data.more);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load older activity');
    } finally {
      setLoadingMore(false);
    }
  };

  const pickClient = (clientId, clientName) => setClient({ clientId, clientName });
  const filtersOn = person !== null || kind !== 'all' || status !== 'all' || month !== 'all' || client || search;
  const clearFilters = () => {
    setPerson(null); setKind('all'); setStatus('all'); setMonth('all'); setClient(null); setSearch('');
  };
  const singleDay = ['today', 'yesterday', 'day'].includes(period);
  const periodName = period === 'day'
    ? new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : PERIODS.find((p) => p.id === period)?.label.toLowerCase();

  const TILES = [
    { key: 'added', label: 'Entries added', value: headline.added, tone: 'green' },
    { key: 'edited', label: 'Entries edited', value: headline.edited, tone: 'orange' },
    { key: 'submitted', label: 'Submitted', value: headline.submitted, tone: 'blue' },
    { key: 'deleted', label: 'Deleted', value: headline.deleted, tone: 'red' },
    { key: 'worked', label: 'Clients worked on', value: headline.worked, tone: 'purple' },
    { key: 'opened', label: 'Clients opened', value: headline.opened, tone: 'muted' },
  ];

  if (error && !summary && !entries) {
    return <div className="empty-state"><h3>Failed to load</h3><p>{error}</p></div>;
  }

  return (
    <div className="activity">
      {/* Period + ledger */}
      <div className="act-toolbar">
        <div className="act-periods" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              className={`act-period${period === p.id ? ' active' : ''}`}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
          <label className={`act-period act-day${period === 'day' ? ' active' : ''}`}>
            <Icon name="calendar" size={14} />
            <input
              type="date"
              value={day}
              max={new Date().toLocaleDateString('en-CA')}
              onChange={(e) => { setDay(e.target.value); setPeriod('day'); }}
              aria-label="Pick a day"
            />
          </label>
        </div>
        <div className="act-ledger" title="The ledger as it stands now, whatever the period">
          <span><b>{ledger.total.toLocaleString('en-IN')}</b> entries</span>
          <span><b className="t-green">{ledger.submitted.toLocaleString('en-IN')}</b> submitted</span>
          <span><b className="t-orange">{ledger.draft.toLocaleString('en-IN')}</b> draft</span>
          <span><b>{ledger.clients.toLocaleString('en-IN')}</b> clients</span>
          <button type="button" className="act-refresh" onClick={refresh} disabled={loading} title="Refresh">
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* Headline */}
      <div className="act-tiles">
        {TILES.map((t) => (
          <div key={t.key} className={`act-tile act-tile--${t.tone}`}>
            <span>{t.label}</span>
            <b>{loading && !summary ? '…' : t.value.toLocaleString('en-IN')}</b>
          </div>
        ))}
      </div>
      <p className="act-caption">
        {selected ? <><strong>{nameOf(selected.email)}</strong>, </> : everyone ? 'Whole team, ' : 'Your work, '}
        {periodName}.
        {!everyone && ' Admins can see the whole team.'}
      </p>

      {error && <div className="act-note act-note--error">{error}</div>}

      {/* Team */}
      <div className="report-container act-team">
        <div className="report-header">
          <h3><Icon name="users" size={18} />{everyone ? 'Team' : 'You'}</h3>
          <span className="count">Click a person to focus on them</span>
        </div>
        <div className="table-wrapper">
          <table className="report-table">
            <thead>
              <tr>
                <th>Person</th>
                {COUNTERS.map((c) => <th key={c.key} style={{ textAlign: 'right' }}>{c.label}</th>)}
                <th style={{ textAlign: 'right' }} title="Clients worked on (opening a client alone does not count)">Clients</th>
                <th title={singleDay ? 'First to last activity' : 'First to last active day'}>{singleDay ? 'Window' : 'Active'}</th>
                <th style={{ textAlign: 'right' }} title="Entries this account was the last to save, across all time">Last saved</th>
              </tr>
            </thead>
            <tbody>
              {team.map((p) => {
                const picked = person === p.email;
                const idle = !p.last;
                const worked = p.clients.filter((c) => isWork(c.actions)).length;
                return (
                  <tr
                    key={p.email || 'automatic'}
                    className={`account-row${picked ? ' picked' : ''}${idle ? ' act-idle' : ''}`}
                    onClick={() => { setPerson(picked ? null : p.email); setClient(null); }}
                  >
                    <td>
                      <div className="act-person-cell">
                        <span className={`act-avatar${p.email ? '' : ' act-avatar--auto'}`}>
                          {p.email ? (p.name || p.email).charAt(0).toUpperCase() : '⟳'}
                        </span>
                        <span>
                          <strong className={p.email ? '' : 'auto-account'}>{p.email ? p.name || p.email : AUTOMATIC_LABEL}</strong>
                          {p.email && p.name && <small>{p.email}</small>}
                        </span>
                        {p.role === 'admin' && <span className="act-role">admin</span>}
                      </div>
                    </td>
                    {COUNTERS.map((c) => {
                      const n = countOf(p.actions, c.actions);
                      return <td key={c.key} style={{ textAlign: 'right' }} className={n ? `act-num--${c.tone}` : 'act-num--zero'}>{num(n)}</td>;
                    })}
                    <td style={{ textAlign: 'right' }}>{num(worked)}</td>
                    <td className="act-window">
                      {idle ? <span className="act-num--zero">No activity</span> : singleDay
                        ? `${timeOnly(p.first)} – ${timeOnly(p.last)}`
                        : `${shortDate(p.first)} – ${shortDate(p.last)}`}
                    </td>
                    <td style={{ textAlign: 'right' }}>{num(p.lastSaved)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* One person's clients */}
      {selected && selected.clients.length > 0 && (
        <div className="report-container act-clients">
          <div className="report-header">
            <h3><Icon name="file-text" size={18} />Clients {nameOf(selected.email)} touched, {periodName}</h3>
            <span className="count">{selected.clients.length}</span>
          </div>
          <div className="table-wrapper">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Client</th>
                  {COUNTERS.map((c) => <th key={c.key} style={{ textAlign: 'right' }}>{c.label}</th>)}
                  <th>Last</th>
                </tr>
              </thead>
              <tbody>
                {selected.clients.map((c) => (
                  <tr
                    key={c.clientId}
                    className={`account-row${client?.clientId === c.clientId ? ' picked' : ''}`}
                    onClick={() => (client?.clientId === c.clientId ? setClient(null) : pickClient(c.clientId, c.clientName))}
                    title="Show only this client in the timeline"
                  >
                    <td>{c.clientName || c.clientId}<span className="entry-mrm">{c.clientId}</span></td>
                    {COUNTERS.map((k) => {
                      const n = countOf(c.actions, k.actions);
                      return <td key={k.key} style={{ textAlign: 'right' }} className={n ? `act-num--${k.tone}` : 'act-num--zero'}>{num(n)}</td>;
                    })}
                    <td>{formatDateTime(c.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Timeline filters */}
      <div className="filter-bar">
        <div className="client-search entries-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search client, MRM ID or account"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search the timeline"
          />
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="What happened">
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        {everyone && (
          <select
            value={person === null ? '__all' : person}
            onChange={(e) => setPerson(e.target.value === '__all' ? null : e.target.value)}
            aria-label="Person"
          >
            <option value="__all">Everyone</option>
            {team.map((p) => (
              <option key={p.email || 'automatic'} value={p.email}>
                {p.email ? (p.name ? `${p.name} (${p.email})` : p.email) : AUTOMATIC_LABEL}
              </option>
            ))}
          </select>
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Entry status">
          <option value="all">Any status</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Entry month">
          <option value="all">Any month</option>
          {Object.entries(MONTH_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        {client && (
          <button type="button" className="act-chip" onClick={() => setClient(null)} title="Show all clients">
            {client.clientName || client.clientId}
            <span aria-hidden="true">&times;</span>
          </button>
        )}
        {filtersOn && <button type="button" className="login-link act-clear" onClick={clearFilters}>Clear filters</button>}
      </div>

      {/* Timeline */}
      {loading && !events.length ? (
        <div className="empty-state"><h3>Loading&hellip;</h3></div>
      ) : feed.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing here</h3>
          <p>{filtersOn ? 'Try clearing the filters or choosing a longer period.' : `Nobody did anything ${periodName}.`}</p>
        </div>
      ) : (
        <>
          {days.map((d) => (
            <section className="entry-day" key={d.key}>
              <div className="entry-day-head">
                <h3>{dayLabel(d.key)}</h3>
                <span>{d.events.length}{hasOlder && d === days[days.length - 1] ? '+' : ''}</span>
              </div>
              <ul className="act-list">
                {d.events.map((e) => (
                  <EventRow key={e._id} event={e} who={nameOf(e.userEmail)} onPickClient={pickClient} />
                ))}
              </ul>
            </section>
          ))}
          {hasOlder && (
            <button className="btn btn-secondary load-more" onClick={showOlder} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Show older'}
            </button>
          )}
        </>
      )}

      <p className="act-since">
        {since
          ? <>Detailed activity has been recorded since {formatDateTime(since)}. Before that, only the last save of each entry is known, and those lines are marked as coming from the entry record.</>
          : 'Detailed activity starts recording from now. Until then, each entry shows only its last save.'}
      </p>
    </div>
  );
}

export default EntriesPage;
