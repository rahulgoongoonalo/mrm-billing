import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { royaltyApi, activityApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { MONTH_LABELS, formatDateTime } from '../utils/format';
import { SOCIETIES, SOCIETY_FIELDS } from '../utils/clientProfile';
import Icon from './Icon';

// All Entries: who did what, to which client, and when - one page.
//
// It reads top to bottom as three things: the headline numbers, one line per
// person, and one line per client a person worked on that day. Each line is a
// plain sentence ("Edited Jul, Aug 2026") followed by what was changed (IPRS,
// Receipt...); opening a client line lists every save with its before and
// after. Opening a client and signing in are left out unless asked for.
//
// Two sources feed it, merged into one timeline:
//   events  - recorded by the server as people work (services/activity.js):
//             every save, submit and delete with the figures that changed,
//             client master edits, clients opened, mails, sign-ins.
//   entries - the monthly entries themselves. Work done before events were
//             recorded survives only as each entry's last save, so for that
//             stretch the entry is shown as one "added" or "edited" by whoever
//             saved it last, marked as coming from the entry record.
//
// What was changed is read in groups of fields (IPRS, Receipt, GST invoice,
// Phone...), defined by the server and sent with the summary: a save counts
// once for each group it touched. Results such as total outstanding move with
// every edit, so they are in no group.

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
const WORK_ACTIONS = [
  'entry.created', 'entry.updated', 'entry.submitted', 'entry.deleted',
  'client.created', 'client.updated', 'client.deactivated', 'client.reactivated', 'client.deleted', 'client.imported',
  'mail.sent', 'mail.failed',
];
const DEFAULT_KIND = 'work';
const KINDS = [
  { id: 'work', label: 'All work', actions: WORK_ACTIONS },
  { id: 'all', label: 'Everything, with opens and sign-ins', actions: [] },
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

// What was done, in the order it is said. `count` words a person's line
// ("3 added"), `say` a client's ("Added Sep 2026"). The quiet ones are only
// mentioned when there is nothing else to say.
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
const WORK = [
  { key: 'added', tone: 'green', actions: ['entry.created'], count: (n) => `${n} added`, say: 'Added' },
  { key: 'edited', tone: 'orange', actions: ['entry.updated'], count: (n) => `${n} edited`, say: 'Edited' },
  { key: 'submitted', tone: 'blue', actions: ['entry.submitted'], count: (n) => `${n} submitted`, say: 'Submitted' },
  { key: 'deleted', tone: 'red', actions: ['entry.deleted', 'client.deleted'], count: (n) => `${n} deleted`, say: 'Deleted' },
  { key: 'clients', tone: 'purple', actions: ['client.created', 'client.updated', 'client.deactivated', 'client.reactivated', 'client.imported'], count: (n) => plural(n, 'client update'), say: 'Client details updated' },
  { key: 'mail', tone: 'blue', actions: ['mail.sent'], count: (n) => plural(n, 'mail'), say: 'Mail sent' },
  { key: 'mailFailed', tone: 'red', actions: ['mail.failed'], count: (n) => plural(n, 'failed mail'), say: 'Mail failed' },
  { key: 'resaved', tone: 'muted', quiet: true, actions: ['entry.resaved'], count: (n) => `saved ${plural(n, 'time')} with no change`, say: 'Saved again, nothing changed' },
  { key: 'viewed', tone: 'muted', quiet: true, actions: ['client.viewed'], count: (n) => `opened ${plural(n, 'time')}`, say: 'Only opened' },
  { key: 'login', tone: 'muted', quiet: true, actions: ['auth.login'], count: (n) => `signed in ${plural(n, 'time')}`, say: 'Signed in' },
];
const work = (key) => WORK.find((w) => w.key === key);
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

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
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

// 'Jul, Aug, Sep 2026' for the months a set of saves touched, in calendar order.
const CALENDAR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function monthsText(events) {
  const seen = new Map();
  for (const e of events) if (e.month) seen.set(`${e.year}-${e.month}`, e);
  const list = [...seen.values()].sort((a, b) => (a.year - b.year) || (CALENDAR.indexOf(a.month) - CALENDAR.indexOf(b.month)));
  const short = (e) => (MONTH_LABELS[e.month] || e.month).slice(0, 3);
  return list.map((e, i) => (i === list.length - 1 || list[i + 1].year !== e.year ? `${short(e)} ${e.year || ''}`.trim() : short(e))).join(', ');
}

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

// ── Field groups ────────────────────────────────────────────────────────
const scopeOf = (action) => action.split('.')[0];
const SCOPE_LABELS = { entry: 'Monthly entry', client: 'Client master' };

// Counts keyed by group, as chips in the server's own order.
function FieldChips({ groups, counts, plain, picked, onPick }) {
  const hit = groups.filter((g) => counts?.[g.key]);
  if (!hit.length) return null;
  const Chip = onPick ? 'button' : 'span';
  return (
    <span className="act-fields">
      <span className="act-fields-word">Changed</span>
      {hit.map((g) => (
        <Chip
          key={g.key}
          {...(onPick ? { type: 'button', onClick: (ev) => { ev.stopPropagation(); onPick(g.key); }, 'aria-pressed': picked === g.key } : {})}
          className={`act-field act-field--${g.scope}${picked === g.key ? ' picked' : ''}`}
          title={`${SCOPE_LABELS[g.scope]}: ${g.label}`}
        >
          {g.label}
          {!plain && counts[g.key] > 1 && <b>{counts[g.key]}</b>}
        </Chip>
      ))}
    </span>
  );
}

// ── What was done, as a sentence ────────────────────────────────────────
// `events` (a client's line) adds the months each thing was done to.
function Said({ actions, events, automatic, lead }) {
  const hit = WORK.filter((w) => countOf(actions, w.actions));
  const loud = hit.filter((w) => !w.quiet);
  const monthsOf = (w) => (events
    ? monthsText(events.filter((e) => e.action.startsWith('entry.') && w.actions.includes(countedAs(e))))
    : '');
  if (automatic) {
    return <span className="act-said"><span><b className="act-verb--muted">Recalculated</b> {monthsText(events || [])}</span></span>;
  }
  return (
    <span className="act-said">
      {lead && <span><b>{lead}</b></span>}
      {(loud.length ? loud : hit).map((w) => {
        const n = countOf(actions, w.actions);
        return (
          <span key={w.key}>
            {events
              ? <><b className={`act-verb--${w.tone}`}>{w.say}</b> {monthsOf(w)}</>
              : <b className={`act-verb--${w.tone}`}>{w.count(n)}</b>}
          </span>
        );
      })}
    </span>
  );
}

// ── One save, inside a client's line ────────────────────────────────────
function EventRow({ event, groups, groupOf }) {
  const [open, setOpen] = useState(false);
  const info = event.legacy && !event.userEmail
    ? { pill: 'Recalculated', tone: 'muted' }
    : ACTION_INFO[event.action] || { pill: event.action, tone: 'muted' };
  const detail = (event.changes?.length || 0) > 0 || hasFigures(event);
  const m = event.meta || {};
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
        <span className="act-text">{capital(describe(event))}</span>
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
                  <tr key={c.field} className={groups.length && !groupOf(event.action, c.field) ? 'is-result' : undefined}>
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

// ── One client, one person, one day ─────────────────────────────────────
// Events arrive newest first; each person-and-client pair becomes one line,
// placed by its latest save. Sign-ins and imports have no client and sit on
// the person's own line.
// As the server's summary counts it: a save that changed nothing is not an edit.
const countedAs = (e) => (e.action === 'entry.updated' && !e.legacy && !e.changes?.length ? 'entry.resaved' : e.action);

function groupWork(events, groupOf) {
  const map = new Map();
  for (const e of events) {
    const key = `${e.userEmail}|${e.clientId || ''}`;
    if (!map.has(key)) {
      map.set(key, { key, userEmail: e.userEmail, clientId: e.clientId, clientName: e.clientName, at: e.at, events: [], actions: {}, fields: {} });
    }
    const g = map.get(key);
    g.events.push(e);
    const action = countedAs(e);
    g.actions[action] = (g.actions[action] || 0) + 1;
    const touched = new Set((e.changes || []).map((c) => groupOf(e.action, c.field)?.key).filter(Boolean));
    for (const k of touched) g.fields[k] = (g.fields[k] || 0) + 1;
  }
  return [...map.values()];
}

function ClientRow({ group, who, groups, groupOf }) {
  const [open, setOpen] = useState(false);
  const automatic = group.events.every((e) => e.legacy && !e.userEmail);
  const latest = group.events.find(hasFigures);
  return (
    <li className={`act-group${open ? ' is-open' : ''}`}>
      <button type="button" className="act-group-main" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="act-time">{timeOnly(group.at)}</span>
        <span className="act-group-client">
          {group.clientId
            ? <><strong>{group.clientName || group.clientId}</strong><span className="entry-mrm">{group.clientId}</span></>
            : <strong>{who}</strong>}
          {group.clientId && <small className={group.userEmail ? '' : 'auto-account'}>{who}</small>}
        </span>
        <span className="act-group-work">
          <Said actions={group.actions} events={group.events} automatic={automatic} />
          <FieldChips groups={groups} counts={group.fields} plain />
        </span>
        <span className="act-side">
          {latest && (
            <span className="act-os" title={`Total outstanding after the last save (${monthText(latest)})`}>
              O/S <b>{money(latest.meta.totalOutstanding)}</b>
            </span>
          )}
          <span className="act-more">
            {open ? 'Hide' : 'Details'}
            <Icon name="chevron-down" size={14} />
          </span>
        </span>
      </button>
      {open && (
        <ul className="act-steps">
          {group.events.map((e) => <EventRow key={e._id} event={e} groups={groups} groupOf={groupOf} />)}
        </ul>
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
  const [kind, setKind] = useState(DEFAULT_KIND);
  const [moreFilters, setMoreFilters] = useState(false);
  const [status, setStatus] = useState('all');
  const [month, setMonth] = useState('all');
  const [field, setField] = useState('all');       // a field group's key
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
    if (status !== 'all') p.status = status;
    if (month !== 'all') p.month = month;
    if (field !== 'all') p.field = field;
    if (debounced) p.search = debounced;
    return p;
  }, [rangeParams, person, actionsFilter, status, month, field, debounced]);

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
    // What changed is unknown for entry-record items.
    if (field !== 'all') return [];
    // Entry-record items are only ever "added" or "edited".
    if (actionsFilter.length && !actionsFilter.some((a) => a === 'entry.created' || a === 'entry.updated')) return [];
    return legacyInPeriod.filter((it) => {
      if (person !== null && it.userEmail !== person) return false;
      if (actionsFilter.length && !actionsFilter.includes(it.action)) return false;
      if (status !== 'all' && it.meta.status !== status) return false;
      if (month !== 'all' && it.month !== month) return false;
      if (term && ![it.clientName, it.clientId, it.userEmail].some((v) => (v || '').toLowerCase().includes(term))) return false;
      return true;
    });
  }, [legacyInPeriod, person, actionsFilter, status, month, field, debounced]);

  // Everyone's numbers for the period: recorded events plus entry-record saves.
  const team = useMemo(() => {
    const map = new Map();
    const get = (email) => {
      if (!map.has(email)) map.set(email, { email, name: '', role: '', actions: {}, fields: {}, first: null, last: null, clients: new Map() });
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
      for (const [g, n] of Object.entries(sp.fields || {})) p.fields[g] = (p.fields[g] || 0) + n;
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
    return [...map.values()]
      .map((p) => ({ ...p, clients: [...p.clients.values()].sort((a, b) => new Date(b.last) - new Date(a.last)) }))
      // Keep the automatic row only when it has something to say.
      .filter((p) => p.email !== AUTOMATIC || p.last)
      .sort((a, b) => new Date(b.last || 0) - new Date(a.last || 0));
  }, [summary, legacyInPeriod]);

  const nameOf = useCallback((email) => {
    if (!email) return AUTOMATIC_LABEL;
    const p = team.find((t) => t.email === email);
    return p?.name || email;
  }, [team]);

  const selected = person !== null ? team.find((p) => p.email === person) : null;
  const active = team.filter((p) => p.last);
  const idle = team.filter((p) => !p.last && p.email);

  const groups = useMemo(() => summary?.fieldGroups || [], [summary]);
  const groupOf = useMemo(() => {
    const map = new Map();
    for (const g of groups) for (const f of g.fields) map.set(`${g.scope}:${f}`, g);
    return (action, name) => map.get(`${scopeOf(action)}:${name}`);
  }, [groups]);


  // Headline tiles follow the chosen person, else everyone.
  const headline = useMemo(() => {
    const people = selected ? [selected] : team;
    const total = (key) => people.reduce((s, p) => s + countOf(p.actions, work(key).actions), 0);
    const worked = new Set();
    for (const p of people) {
      for (const c of p.clients) {
        if (isWork(c.actions)) worked.add(c.clientId);
      }
    }
    return {
      added: total('added'), edited: total('edited'), submitted: total('submitted'),
      deleted: total('deleted'), worked: worked.size,
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
    return out.map((d) => ({ key: d.key, work: groupWork(d.events, groupOf) }));
  }, [feed, groupOf]);

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

  const filtersOn = person !== null || kind !== DEFAULT_KIND || status !== 'all' || month !== 'all' || field !== 'all' || search;
  const clearFilters = () => {
    setPerson(null); setKind(DEFAULT_KIND); setStatus('all'); setMonth('all'); setField('all'); setSearch('');
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

      {/* Team: one line per person */}
      <div className="report-container act-team">
        <div className="report-header">
          <h3><Icon name="users" size={18} />{everyone ? 'Team' : 'You'}</h3>
          <span className="count">Click a person to see only their work</span>
        </div>
        <ul className="act-people">
          {active.map((p) => {
            const picked = person === p.email;
            const worked = p.clients.filter((c) => isWork(c.actions)).length;
            return (
              <li key={p.email || 'automatic'}>
                <button
                  type="button"
                  className={`act-person${picked ? ' picked' : ''}`}
                  onClick={() => setPerson(picked ? null : p.email)}
                  aria-pressed={picked}
                >
                  <span className="act-person-cell">
                    <span className={`act-avatar${p.email ? '' : ' act-avatar--auto'}`}>
                      {p.email ? (p.name || p.email).charAt(0).toUpperCase() : '⟳'}
                    </span>
                    <span>
                      <strong className={p.email ? '' : 'auto-account'}>{p.email ? p.name || p.email : AUTOMATIC_LABEL}</strong>
                      <small>
                        {singleDay ? `${timeOnly(p.first)} – ${timeOnly(p.last)}` : `${shortDate(p.first)} – ${shortDate(p.last)}`}
                      </small>
                    </span>
                  </span>
                  <span className="act-group-work">
                    <Said actions={p.actions} automatic={!p.email} lead={worked > 0 && plural(worked, 'client')} />
                    <FieldChips groups={groups} counts={p.fields} />
                  </span>
                </button>
              </li>
            );
          })}
          {active.length === 0 && <li className="act-people-none">Nobody did anything {periodName}.</li>}
        </ul>
        {idle.length > 0 && (
          <p className="act-people-idle">No activity {periodName}: {idle.map((p) => p.name || p.email).join(', ')}</p>
        )}
      </div>

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
        {groups.length > 0 && (
          <select value={field} onChange={(e) => setField(e.target.value)} aria-label="Field changed">
            <option value="all">Any field changed</option>
            {Object.entries(SCOPE_LABELS).map(([scope, label]) => (
              <optgroup key={scope} label={label}>
                {groups.filter((g) => g.scope === scope).map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </optgroup>
            ))}
          </select>
        )}
        {(moreFilters || status !== 'all' || month !== 'all') ? (
          <>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Entry status">
              <option value="all">Any status</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
            </select>
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Entry month">
              <option value="all">Any month</option>
              {Object.entries(MONTH_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </>
        ) : (
          <button type="button" className="login-link act-clear" onClick={() => setMoreFilters(true)}>More filters</button>
        )}
        {filtersOn && <button type="button" className="login-link act-clear" onClick={clearFilters}>Clear filters</button>}
      </div>

      {/* Work: one line per client, per person, per day */}
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
                <span>{d.work.length}{hasOlder && d === days[days.length - 1] ? '+' : ''}</span>
              </div>
              <ul className="act-list">
                {d.work.map((g) => (
                  <ClientRow key={g.key} group={g} who={nameOf(g.userEmail)} groups={groups} groupOf={groupOf} />
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
