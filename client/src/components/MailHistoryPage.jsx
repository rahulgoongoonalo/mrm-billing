import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { clientMailApi } from '../services/api';
import { MONTH_LABELS, formatCurrency, formatDateTime } from '../utils/format';
import Icon from './Icon';

// Mail History: a sent-mail box. The list on the left is every mail sent to a
// client, newest first; the reader on the right shows the selected mail as the
// client received it, with its envelope, attachments and the month's figures.

const TYPE_LABELS = {
  statement: 'Statement',
  historical: 'Historical outstanding',
  regular: 'Regular payer',
  catalogue: 'Membership & catalogue',
  '': 'Auto on submit',
};

// sent = reached the client, test = went to the test address, failed = not sent
const outcomeOf = (m) => (!m.ok ? 'failed' : m.isTest ? 'test' : 'sent');
const OUTCOME = {
  sent: { label: 'Delivered', hint: 'Sent to the client' },
  test: { label: 'Test', hint: 'Went to the test address, not the client' },
  failed: { label: 'Failed', hint: 'Not sent' },
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
  return new Date(`${key}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

// Time today, else the date - like any mail client's list.
const listTime = (value) => {
  const d = new Date(value);
  return dayKey(value) === new Date().toLocaleDateString('en-CA')
    ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// "Name <a@b.com>" -> { name, email }
const parseAddress = (value) => {
  const m = /^\s*"?(.*?)"?\s*<([^>]+)>\s*$/.exec(value || '');
  return m ? { name: m[1], email: m[2] } : { name: '', email: (value || '').trim() };
};

function MailBody({ mail }) {
  const [state, setState] = useState({ loading: true, html: '' });
  const frame = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, html: '' });
    if (!mail.hasBody) { setState({ loading: false, html: '' }); return undefined; }
    clientMailApi.historyBody(mail.entryId, mail.index)
      .then((res) => { if (!cancelled) setState({ loading: false, html: res.data.html || '' }); })
      .catch(() => { if (!cancelled) setState({ loading: false, html: '', error: true }); });
    return () => { cancelled = true; };
  }, [mail]);

  // Grow the frame to the mail's own height so the reader scrolls as one page.
  const fit = () => {
    const doc = frame.current?.contentDocument;
    if (doc?.body) frame.current.style.height = `${doc.documentElement.scrollHeight + 8}px`;
  };

  if (state.loading) return <div className="mh-body-note">Loading mail&hellip;</div>;
  if (!state.html) {
    return (
      <div className="mh-body-note">
        {state.error
          ? 'This mail could not be loaded.'
          : 'The text of this mail was not saved — it was sent before Mail History started keeping a copy. Mails sent from now on show here exactly as the client received them.'}
      </div>
    );
  }
  return (
    <iframe
      ref={frame}
      className="mh-frame"
      title="Mail as sent"
      srcDoc={state.html}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={fit}
    />
  );
}

function Reader({ mail, onBack }) {
  const result = outcomeOf(mail);
  const e = mail.entry;
  const from = parseAddress(mail.from);

  const figures = [
    ['Royalty', e.royalty],
    ['Commission', e.commission],
    ['GST', e.gst],
    ['Received', e.received],
    ['TDS', e.tds],
    ['Opening balance', e.opening],
  ];

  return (
    <article className="mh-reader">
      <button type="button" className="mh-back" onClick={onBack}>&larr; All mail</button>

      <header className="mh-head">
        <div className="mh-tags">
          <span className="mh-tag mh-tag--type">{TYPE_LABELS[mail.mailType] ?? mail.mailType}</span>
          <span className={`mh-tag mh-tag--${result}`} title={OUTCOME[result].hint}>{OUTCOME[result].label}</span>
        </div>
        <h2>{mail.subject || '(no subject)'}</h2>
      </header>

      <div className="mh-envelope">
        <div className="mh-avatar" aria-hidden="true">MRM</div>
        <div className="mh-env-main">
          <div className="mh-from">
            <b>{from.name || 'MRM'}</b>
            {from.email && <span>&lt;{from.email}&gt;</span>}
          </div>
          <div className="mh-env-line"><span>to</span> {mail.to || '—'}</div>
          {mail.cc && <div className="mh-env-line"><span>cc</span> {mail.cc}</div>}
          <div className="mh-env-line"><span>by</span> {mail.byEmail || '—'}</div>
        </div>
        <time className="mh-date" dateTime={mail.sentAt}>{formatDateTime(mail.sentAt)}</time>
      </div>

      {result === 'test' && (
        <div className="mh-notice mh-notice--test">
          Test mail &mdash; the client{mail.intendedTo ? <> (<b>{mail.intendedTo}</b>)</> : ''} did not receive this.
        </div>
      )}
      {result === 'failed' && (
        <div className="mh-notice mh-notice--failed">
          <b>Not sent.</b> {mail.error || 'No reason was recorded.'}
        </div>
      )}

      {/* Only mails sent before attachments were dropped have any; the files
          themselves were never kept, so just their names are shown. */}
      {mail.attachments.length > 0 && (
        <div className="mh-attachments">
          <div className="mh-section-label">{mail.attachments.length} attachment{mail.attachments.length === 1 ? '' : 's'}</div>
          <div className="mh-att-list">
            {mail.attachments.map((a) => (
              <span key={a} className="mh-att">
                <span className="mh-att-icon">PDF</span>
                <span className="mh-att-name">{a}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mh-paper">
        <MailBody mail={mail} />
      </div>

      <section className="mh-entry">
        <div className="mh-entry-head">
          <div>
            <div className="mh-section-label">Sent from entry</div>
            <b>{e.clientName}</b> <span className="mh-mono">{e.clientId}</span> &middot; {MONTH_LABELS[e.month]} {e.year}
          </div>
          <span className={`status-pill status-pill--${e.status || 'draft'}`}>{e.status || 'draft'}</span>
        </div>
        <div className="mh-figures">
          {figures.map(([label, value]) => (
            <div key={label}><span>{label}</span><b>{formatCurrency(value)}</b></div>
          ))}
          <div className="mh-figure-total"><span>Total outstanding</span><b>{formatCurrency(e.outstanding)}</b></div>
        </div>
      </section>
    </article>
  );
}

function MailHistoryPage() {
  const [mails, setMails] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState('all');
  const [type, setType] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [readerOpen, setReaderOpen] = useState(false); // phones: list or reader

  useEffect(() => {
    let cancelled = false;
    clientMailApi.history()
      .then((res) => { if (!cancelled) setMails(res.data || []); })
      .catch((err) => { if (!cancelled) setLoadError(err.response?.data?.message || 'Failed to load mail history'); });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const list = mails || [];
    return {
      all: list.length,
      sent: list.filter((m) => outcomeOf(m) === 'sent').length,
      test: list.filter((m) => outcomeOf(m) === 'test').length,
      failed: list.filter((m) => outcomeOf(m) === 'failed').length,
      clients: new Set(list.map((m) => m.entry.clientId)).size,
    };
  }, [mails]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (mails || []).filter((m) => {
      if (outcome !== 'all' && outcomeOf(m) !== outcome) return false;
      if (type !== 'all' && m.mailType !== type) return false;
      if (!term) return true;
      return [m.entry.clientName, m.entry.clientId, m.subject, m.to, m.intendedTo, m.byEmail]
        .some((v) => (v || '').toLowerCase().includes(term));
    });
  }, [mails, search, outcome, type]);

  // Keep a mail selected: the first one, or the nearest still in the list.
  useEffect(() => {
    if (!filtered.length) { setSelectedId(null); return; }
    if (!filtered.some((m) => m.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = filtered.find((m) => m.id === selectedId) || null;

  const select = useCallback((id) => { setSelectedId(id); setReaderOpen(true); }, []);

  // Up / down arrows move through the list, like a mail client.
  const onListKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = filtered.findIndex((m) => m.id === selectedId);
    const next = filtered[Math.min(filtered.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      setSelectedId(next.id);
      document.getElementById(`mh-item-${next.id}`)?.scrollIntoView({ block: 'nearest' });
    }
  };

  if (loadError) return <div className="empty-state"><h3>Failed to load</h3><p>{loadError}</p></div>;
  if (mails === null) return <div className="empty-state"><h3>Loading mail history&hellip;</h3></div>;

  const tabs = [
    ['all', 'All'],
    ['sent', 'Delivered'],
    ['test', 'Test'],
    ['failed', 'Failed'],
  ];

  let lastDay = null;

  return (
    <div className={`mh${readerOpen ? ' mh--reading' : ''}`}>
      <aside className="mh-list-pane">
        <div className="mh-toolbar">
          <div className="mh-search">
            <Icon name="search" size={15} />
            <input
              type="search"
              placeholder="Search client, subject, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search mail"
            />
          </div>
          <div className="mh-tabs" role="tablist">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={outcome === key}
                className={`mh-tab${outcome === key ? ' active' : ''}${key === 'failed' && counts.failed ? ' has-failed' : ''}`}
                onClick={() => setOutcome(key)}
              >
                {label}<span>{counts[key]}</span>
              </button>
            ))}
          </div>
          <select className="mh-type" value={type} onChange={(e) => setType(e.target.value)} aria-label="Mail type">
            <option value="all">All mail types</option>
            {Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key || 'old'} value={key}>{label}</option>)}
          </select>
        </div>

        <div className="mh-list" tabIndex={0} onKeyDown={onListKey} aria-label="Sent mail">
          {filtered.length === 0 && (
            <div className="mh-empty">
              {counts.all === 0
                ? 'No mail sent yet. Mails sent with Send Mail on the Data Entry page appear here.'
                : 'No mail matches.'}
            </div>
          )}
          {filtered.map((m) => {
            const day = dayKey(m.sentAt);
            const heading = day !== lastDay ? <div className="mh-day" key={`d-${day}`}>{dayLabel(day)}</div> : null;
            lastDay = day;
            const result = outcomeOf(m);
            return (
              <React.Fragment key={m.id}>
                {heading}
                <button
                  id={`mh-item-${m.id}`}
                  type="button"
                  className={`mh-item${m.id === selectedId ? ' selected' : ''}`}
                  onClick={() => select(m.id)}
                >
                  <span className={`mh-avatar-sm mh-avatar-sm--${result}`} aria-hidden="true">{initials(m.entry.clientName)}</span>
                  <span className="mh-item-main">
                    <span className="mh-item-top">
                      <b>{m.entry.clientName}</b>
                      <time>{listTime(m.sentAt)}</time>
                    </span>
                    <span className="mh-item-subject">{m.subject.replace(/^\[TEST\]\s*/, '') || '(no subject)'}</span>
                    <span className="mh-item-meta">
                      <span className={`mh-dot mh-dot--${result}`} />
                      {OUTCOME[result].label}
                      <span className="mh-sep">&middot;</span>
                      {TYPE_LABELS[m.mailType] ?? m.mailType}
                      {m.attachments.length > 0 && <span className="mh-clip" title={`${m.attachments.length} attachment(s)`}>📎{m.attachments.length}</span>}
                    </span>
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="mh-list-foot">
          {filtered.length} of {counts.all} mails &middot; {counts.clients} client{counts.clients === 1 ? '' : 's'}
        </div>
      </aside>

      <section className="mh-reader-pane">
        {selected
          ? <Reader key={selected.id} mail={selected} onBack={() => setReaderOpen(false)} />
          : <div className="mh-empty mh-empty--reader">Select a mail to read it.</div>}
      </section>
    </div>
  );
}

export default MailHistoryPage;
