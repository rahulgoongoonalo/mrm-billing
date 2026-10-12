import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';
import { referralApi } from '../../services/api';
import Icon from '../Icon';
import {
  today, thisMonth, addMonths, monthName, dateName, errorOf, money, r2, MODES, dealStatus, initials, hueOf,
} from './shared';

// ---- Frame ------------------------------------------------------------------

export function Modal({ title, subtitle, onClose, onSubmit, children, footer, size }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay show rf-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal rf-modal${size ? ` ${size}` : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header rf-modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <form className="rf-modal-form" onSubmit={onSubmit} noValidate>
          <div className="modal-body rf-modal-body">{children}</div>
          <div className="modal-footer rf-modal-foot">{footer}</div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, hint, error, htmlFor, children, className }) {
  return (
    <div className={`rf-field${error ? ' has-error' : ''}${className ? ` ${className}` : ''}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <div className="rf-field-error">{error}</div> : hint && <div className="rf-field-hint">{hint}</div>}
    </div>
  );
}

function FormError({ message }) {
  if (!message) return null;
  return <div className="rf-form-error" role="alert"><Icon name="alert" size={16} /><span>{message}</span></div>;
}

// ---- Confirm ----------------------------------------------------------------

// const [confirm, confirmEl] = useConfirm(); ... if (!(await confirm({...}))) return;
export function useConfirm() {
  const [ask, setAsk] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setAsk({ ...opts, resolve })), []);
  const done = (answer) => { ask?.resolve(answer); setAsk(null); };
  const el = ask && (
    <Modal
      title={ask.title}
      onClose={() => done(false)}
      onSubmit={(e) => { e.preventDefault(); done(true); }}
      size="small"
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={() => done(false)}>Cancel</button>
          <button type="submit" className={`btn ${ask.danger ? 'btn-danger-solid' : 'btn-primary'}`} autoFocus>{ask.confirmLabel || 'Confirm'}</button>
        </>
      )}
    >
      <div className="rf-confirm">{ask.message}</div>
    </Modal>
  );
  return [confirm, el];
}

// ---- Client picker ------------------------------------------------------------

function ClientPicker({ clients, value, onChange, invalid, id }) {
  const selected = clients.find((c) => c.clientId === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listRef = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...clients].sort((a, b) => a.name.localeCompare(b.name));
    return (q ? list.filter((c) => c.name.toLowerCase().includes(q) || String(c.clientId).toLowerCase().includes(q)) : list).slice(0, 60);
  }, [clients, query]);

  useEffect(() => { setHi(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector('.hi')?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  const pick = (c) => { onChange(c.clientId); setQuery(''); setOpen(false); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, matches.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter' && open) { e.preventDefault(); if (matches[hi]) pick(matches[hi]); }
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  };

  return (
    <div className={`rf-picker${invalid ? ' invalid' : ''}`}>
      <div className="rf-picker-box">
        <Icon name="search" size={15} />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? query : selected ? selected.name : ''}
          placeholder={selected ? selected.name : 'Search by client name or ID…'}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={onKey}
        />
        {selected && !open && <span className="rf-mono">{selected.clientId}</span>}
      </div>
      {open && (
        <ul className="rf-picker-list" id={`${id}-list`} ref={listRef} role="listbox">
          {matches.length ? matches.map((c, i) => (
            <li
              key={c.clientId}
              role="option"
              aria-selected={c.clientId === value}
              className={`${i === hi ? 'hi' : ''}${c.clientId === value ? ' sel' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}
              onMouseEnter={() => setHi(i)}
            >
              <span>{c.name}</span><span className="rf-mono">{c.clientId}</span>
            </li>
          )) : <li className="rf-picker-none">No client matches “{query}”</li>}
        </ul>
      )}
    </div>
  );
}

// ---- Deal -------------------------------------------------------------------

const RATE_CHIPS = [2, 5, 7.5, 10, 15];

export function DealModal({ deal, clients, deals, referrers, presetReferrer, onClose, onSaved }) {
  const { showToast } = useApp();
  const [form, setForm] = useState(() => ({
    clientId: deal?.clientId || '',
    referrer: deal?.referrer || presetReferrer || '',
    rate: deal ? String(deal.rate) : '',
    fromMonth: deal?.fromMonth || thisMonth(),
    toMonth: deal?.toMonth || '',
    note: deal?.note || '',
  }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); setFormError(''); };

  const client = clients.find((c) => c.clientId === form.clientId);
  const clientDeals = useMemo(
    () => deals.filter((d) => d.clientId === form.clientId && d._id !== deal?._id),
    [deals, form.clientId, deal],
  );
  const rateN = Number(form.rate);

  // What this deal earns on the client's payments already recorded.
  useEffect(() => {
    if (!form.clientId || !form.fromMonth) { setPreview(null); return undefined; }
    const t = setTimeout(async () => {
      try {
        const { data } = await referralApi.preview({ clientId: form.clientId, rate: rateN || 0, fromMonth: form.fromMonth, ...(form.toMonth ? { toMonth: form.toMonth } : {}) });
        setPreview(data);
      } catch { setPreview(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [form.clientId, form.fromMonth, form.toMonth, rateN]);

  const validate = () => {
    const e = {};
    if (!form.clientId) e.clientId = 'Choose the client who was referred';
    if (!form.referrer.trim()) e.referrer = 'Enter who referred them';
    if (!(rateN > 0 && rateN <= 100)) e.rate = 'A rate above 0 and up to 100';
    if (!form.fromMonth) e.fromMonth = 'Choose a start month';
    if (form.toMonth && form.toMonth < form.fromMonth) e.toMonth = 'Ends before it starts';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      if (deal) await referralApi.updateDeal(deal._id, form);
      else await referralApi.createDeal(form);
      showToast(deal ? 'Referral deal updated' : `Deal added: ${form.referrer.trim()} earns ${rateN}% on ${client?.name}`);
      onSaved();
    } catch (err) {
      setFormError(errorOf(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={deal ? 'Edit referral deal' : 'New referral deal'}
      subtitle="The referrer earns a share of every payment this client makes to MRM."
      onClose={onClose}
      onSubmit={save}
      size="wide"
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : deal ? 'Save changes' : 'Add deal'}</button>
        </>
      )}
    >
      <div className="rf-split">
        <div className="rf-form">
          <FormError message={formError} />
          <Field label="Client" htmlFor="rf-client" error={errors.clientId}>
            <ClientPicker id="rf-client" clients={clients} value={form.clientId} onChange={(v) => set('clientId', v)} invalid={!!errors.clientId} />
          </Field>

          <Field label="Referred by" htmlFor="rf-referrer" error={errors.referrer} hint={referrers.length ? null : 'A new name starts a new referrer.'}>
            <input id="rf-referrer" className="rf-input" value={form.referrer} onChange={(e) => set('referrer', e.target.value)} placeholder="Name of the person who referred" autoComplete="off" />
            {referrers.length > 0 && (
              <div className="rf-chips">
                {referrers.slice(0, 8).map((r) => (
                  <button type="button" key={r} className={`rf-chip${r.toLowerCase() === form.referrer.trim().toLowerCase() ? ' on' : ''}`} onClick={() => set('referrer', r)}>
                    <span className="rf-dot" style={{ background: hueOf(r) }} />{r}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field label="Referral rate" htmlFor="rf-rate" error={errors.rate} hint="Share of each payment received. TDS deducted by the client is not counted.">
            <div className="rf-affix">
              <input id="rf-rate" className="rf-input" type="number" inputMode="decimal" min="0.01" max="100" step="0.01" value={form.rate} onChange={(e) => set('rate', e.target.value)} placeholder="5" />
              <span>%</span>
            </div>
            <div className="rf-chips">
              {RATE_CHIPS.map((r) => (
                <button type="button" key={r} className={`rf-chip${rateN === r ? ' on' : ''}`} onClick={() => set('rate', String(r))}>{r}%</button>
              ))}
            </div>
          </Field>

          <div className="rf-row">
            <Field label="From month" htmlFor="rf-from" error={errors.fromMonth}>
              <input id="rf-from" className="rf-input" type="month" value={form.fromMonth} onChange={(e) => set('fromMonth', e.target.value)} />
            </Field>
            <Field label="Until month" htmlFor="rf-to" error={errors.toMonth} hint="Empty while the deal runs">
              <input id="rf-to" className="rf-input" type="month" value={form.toMonth} min={form.fromMonth} onChange={(e) => set('toMonth', e.target.value)} />
            </Field>
          </div>

          <Field label="Note" htmlFor="rf-note">
            <input id="rf-note" className="rf-input" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Optional, e.g. agreed on call with Sherley" />
          </Field>
        </div>

        <aside className="rf-aside">
          <div className="rf-aside-title">Earnings preview</div>
          {!client ? (
            <p className="rf-muted">Choose a client to see what this deal earns on payments already recorded.</p>
          ) : !preview ? (
            <p className="rf-muted">Working it out…</p>
          ) : (
            <>
              <div className="rf-preview-big">{money(preview.referral)}</div>
              <p className="rf-muted">
                on {preview.payments} payment{preview.payments === 1 ? '' : 's'} totalling {money(preview.received)}
                {' '}recorded from {monthName(form.fromMonth)}{form.toMonth ? ` to ${monthName(form.toMonth)}` : ''}.
              </p>
              <div className="rf-preview-kv"><span>Last 12 months received</span><b>{money(preview.last12Received)}</b></div>
              <div className="rf-preview-kv"><span>Referral on that</span><b className="rf-earned">{money(preview.last12Referral)}</b></div>
              {preview.months.length > 0 && (
                <table className="rf-mini">
                  <thead><tr><th>Month</th><th className="num">Received</th><th className="num">Referral</th></tr></thead>
                  <tbody>
                    {preview.months.map((m) => (
                      <tr key={m.label}><td>{m.label}</td><td className="num">{money(m.received)}</td><td className="num rf-earned">{money(m.referral)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {clientDeals.length > 0 && (
            <>
              <div className="rf-aside-title spaced">Other deals on this client</div>
              {clientDeals.map((d) => {
                const s = dealStatus(d);
                return (
                  <div key={d._id} className="rf-aside-deal">
                    <span><b>{d.referrer}</b> · {d.rate}%</span>
                    <span className="rf-muted">{monthName(d.fromMonth)} – {d.toMonth ? monthName(d.toMonth) : 'open'} <span className={`rf-status ${s.id}`}>{s.label}</span></span>
                  </div>
                );
              })}
            </>
          )}

          {deal && (
            <div className="rf-tip">
              <Icon name="alert" size={14} />
              <span>Editing the rate here changes referral already earned. To change it from a month on, use <b>Change rate</b> instead.</span>
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}

// ---- Change rate ------------------------------------------------------------

export function ChangeRateModal({ deal, onClose, onSaved }) {
  const { showToast } = useApp();
  const firstAllowed = addMonths(deal.fromMonth, 1);
  const [rate, setRate] = useState('');
  const [fromMonth, setFromMonth] = useState(() => (thisMonth() > deal.fromMonth ? thisMonth() : firstAllowed));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (!(Number(rate) > 0 && Number(rate) <= 100)) { setError('Enter the new rate, above 0 and up to 100'); return; }
    setSaving(true);
    try {
      await referralApi.changeRate(deal._id, { rate: Number(rate), fromMonth, note });
      showToast(`Rate changed to ${rate}% from ${monthName(fromMonth)}`);
      onSaved();
    } catch (err) {
      setError(errorOf(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Change referral rate"
      subtitle={`${deal.referrer} on ${deal.clientName}, now ${deal.rate}%`}
      onClose={onClose}
      onSubmit={save}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Change rate'}</button>
        </>
      )}
    >
      <div className="rf-form">
        <FormError message={error} />
        <div className="rf-row">
          <Field label="New rate" htmlFor="rf-newrate">
            <div className="rf-affix">
              <input id="rf-newrate" className="rf-input" type="number" step="0.01" min="0.01" max="100" value={rate} onChange={(e) => { setRate(e.target.value); setError(''); }} autoFocus />
              <span>%</span>
            </div>
          </Field>
          <Field label="From month" htmlFor="rf-newfrom">
            <input id="rf-newfrom" className="rf-input" type="month" min={firstAllowed} max={deal.toMonth || undefined} value={fromMonth} onChange={(e) => { setFromMonth(e.target.value); setError(''); }} />
          </Field>
        </div>
        <Field label="Note" htmlFor="rf-newnote">
          <input id="rf-newnote" className="rf-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Rate changed from ${deal.rate}%`} />
        </Field>
        <div className="rf-timeline">
          <div><span className="rf-dot" style={{ background: 'var(--text-muted)' }} /><b>{deal.rate}%</b> {monthName(deal.fromMonth)} – {fromMonth ? monthName(addMonths(fromMonth, -1)) : '…'}</div>
          <div><span className="rf-dot" style={{ background: 'var(--accent-blue)' }} /><b>{rate || '—'}%</b> {monthName(fromMonth)} – {deal.toMonth ? monthName(deal.toMonth) : 'open'}</div>
        </div>
        <p className="rf-muted small">Referral earned before {monthName(fromMonth)} stays at {deal.rate}%.</p>
      </div>
    </Modal>
  );
}

// ---- Payout -----------------------------------------------------------------

export function PayoutModal({ payout, referrer: presetReferrer, referrers, onClose, onSaved }) {
  const { showToast } = useApp();
  const first = payout?.referrer || presetReferrer || (referrers.length === 1 ? referrers[0].name : '');
  const firstRef = referrers.find((r) => r.name === first);
  const dueOf = (r) => r2((r?.due || 0) + (payout && r && r.name === payout.referrer ? payout.amount : 0));

  const [form, setForm] = useState(() => {
    const amount = payout ? payout.amount : Math.max(0, dueOf(firstRef));
    const tdsRate = payout ? (payout.amount ? r2(payout.tds / payout.amount * 100) : 0) : (firstRef?.profile?.tdsRate || 0);
    return {
      referrer: first,
      amount: amount ? String(amount) : '',
      tdsRate: String(tdsRate || 0),
      tds: payout ? String(payout.tds || 0) : String(r2(amount * tdsRate / 100)),
      date: payout?.date || today(),
      mode: payout?.mode || 'bank',
      reference: payout?.reference || '',
      note: payout?.note || '',
      advance: false,
    };
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const r = referrers.find((x) => x.name === form.referrer);
  const due = dueOf(r);
  const amount = r2(form.amount);
  const tds = r2(form.tds);
  const net = r2(amount - tds);
  const after = r2(due - amount);
  const over = amount > due + 0.5;
  const mode = MODES.find((m) => m.id === form.mode) || MODES[0];

  const update = (patch) => {
    setForm((f) => {
      const next = { ...f, ...patch };
      // TDS follows the amount and rate unless typed in by hand.
      if (('amount' in patch || 'tdsRate' in patch) && !('tds' in patch)) {
        next.tds = String(r2(r2(next.amount) * (Number(next.tdsRate) || 0) / 100));
      }
      return next;
    });
    setErrors({});
    setFormError('');
  };
  const pickReferrer = (name) => {
    const x = referrers.find((y) => y.name === name);
    const amt = Math.max(0, dueOf(x));
    update({ referrer: name, amount: amt ? String(amt) : '', tdsRate: String(x?.profile?.tdsRate || 0), advance: false });
  };

  const validate = () => {
    const e = {};
    if (!form.referrer) e.referrer = 'Choose who was paid';
    if (!(amount > 0)) e.amount = 'Enter the amount';
    if (tds < 0 || (amount > 0 && tds >= amount)) e.tds = 'TDS must be less than the amount';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) e.date = 'Choose the date paid';
    else if (form.date > today()) e.date = 'Cannot be in the future';
    if (over && !form.advance) e.amount = `More than the ${money(due)} still to pay. Tick “Advance” to allow it.`;
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const body = { referrer: form.referrer, amount, tds, date: form.date, mode: form.mode, reference: form.reference, note: form.note, advance: form.advance };
    try {
      if (payout) await referralApi.updatePayout(payout._id, body);
      else await referralApi.createPayout(body);
      showToast(payout ? 'Payout updated' : `${money(net)} paid to ${form.referrer} recorded`);
      onSaved();
    } catch (err) {
      setFormError(errorOf(err));
    } finally {
      setSaving(false);
    }
  };

  const copy = (text, what) => {
    navigator.clipboard?.writeText(text).then(() => showToast(`${what} copied`), () => {});
  };
  const p = r?.profile || {};

  return (
    <Modal
      title={payout ? 'Edit payout' : 'Record referral payout'}
      subtitle="Money MRM paid a referrer against the referral they earned."
      onClose={onClose}
      onSubmit={save}
      size="wide"
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-success" disabled={saving}>
            {saving ? 'Saving…' : payout ? 'Save payout' : `Record ${amount > 0 ? money(net) : 'payout'}`}
          </button>
        </>
      )}
    >
      <div className="rf-split">
        <div className="rf-form">
          <FormError message={formError} />
          <Field label="Paid to" htmlFor="rf-pay-ref" error={errors.referrer}>
            <div className="rf-ref-pick" id="rf-pay-ref" role="radiogroup">
              {referrers.map((x) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={form.referrer === x.name}
                  key={x.key}
                  className={`rf-ref-opt${form.referrer === x.name ? ' on' : ''}`}
                  onClick={() => pickReferrer(x.name)}
                  disabled={!!payout && payout.referrer !== x.name}
                >
                  <span className="rf-avatar sm" style={{ '--hue': hueOf(x.name) }}>{initials(x.name)}</span>
                  <span className="rf-ref-opt-name">{x.name}</span>
                  <span className={`rf-ref-opt-due${dueOf(x) > 0.005 ? ' owing' : ''}`}>{money(dueOf(x))} due</span>
                </button>
              ))}
              {!referrers.length && <p className="rf-muted">No referrers yet. Add a referral deal first.</p>}
            </div>
          </Field>

          <div className="rf-row">
            <Field label="Amount settled (₹)" htmlFor="rf-amount" error={errors.amount}>
              <div className="rf-affix pre">
                <span>₹</span>
                <input id="rf-amount" className="rf-input" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={(e) => update({ amount: e.target.value })} />
              </div>
              {due > 0.005 && (
                <div className="rf-chips">
                  <button type="button" className="rf-chip" onClick={() => update({ amount: String(due), advance: false })}>Full due {money(due)}</button>
                  <button type="button" className="rf-chip" onClick={() => update({ amount: String(r2(due / 2)), advance: false })}>Half</button>
                </div>
              )}
            </Field>
            <Field label="Paid on" htmlFor="rf-date" error={errors.date}>
              <input id="rf-date" className="rf-input" type="date" max={today()} value={form.date} onChange={(e) => update({ date: e.target.value })} />
            </Field>
          </div>

          <div className="rf-row">
            <Field label="TDS rate" htmlFor="rf-tdsrate" hint="Section 194H. The default comes from the referrer’s details.">
              <div className="rf-affix">
                <input id="rf-tdsrate" className="rf-input" type="number" min="0" max="100" step="0.01" value={form.tdsRate} onChange={(e) => update({ tdsRate: e.target.value })} />
                <span>%</span>
              </div>
              <div className="rf-chips">
                {[0, 2, 5, 10].map((t) => (
                  <button type="button" key={t} className={`rf-chip${Number(form.tdsRate) === t ? ' on' : ''}`} onClick={() => update({ tdsRate: String(t) })}>{t ? `${t}%` : 'No TDS'}</button>
                ))}
              </div>
            </Field>
            <Field label="TDS deducted (₹)" htmlFor="rf-tds" error={errors.tds}>
              <div className="rf-affix pre">
                <span>₹</span>
                <input id="rf-tds" className="rf-input" type="number" min="0" step="0.01" value={form.tds} onChange={(e) => update({ tds: e.target.value })} />
              </div>
            </Field>
          </div>

          <Field label="Paid by">
            <div className="rf-seg" role="radiogroup">
              {MODES.map((m) => (
                <button type="button" role="radio" aria-checked={form.mode === m.id} key={m.id} className={form.mode === m.id ? 'on' : ''} onClick={() => update({ mode: m.id })}>{m.label}</button>
              ))}
            </div>
          </Field>

          <div className="rf-row">
            <Field label={mode.ref} htmlFor="rf-refno">
              <input id="rf-refno" className="rf-input" value={form.reference} onChange={(e) => update({ reference: e.target.value })} placeholder="Optional" autoComplete="off" />
            </Field>
            <Field label="Note" htmlFor="rf-pay-note">
              <input id="rf-pay-note" className="rf-input" value={form.note} onChange={(e) => update({ note: e.target.value })} placeholder="Optional" />
            </Field>
          </div>

          {over && (
            <label className="rf-check">
              <input type="checkbox" checked={form.advance} onChange={(e) => update({ advance: e.target.checked })} />
              <span><b>Advance.</b> Pay {money(amount - due)} more than earned so far; it is set off against referral earned later.</span>
            </label>
          )}
        </div>

        <aside className="rf-aside">
          <div className="rf-aside-title">Settlement</div>
          {r ? (
            <>
              <div className="rf-preview-kv"><span>Earned, all time</span><b>{money(r.earnedAll)}</b></div>
              <div className="rf-preview-kv"><span>Paid before{payout ? ' (excl. this)' : ''}</span><b>{money(r2(r.earnedAll - due))}</b></div>
              <div className="rf-preview-kv strong"><span>Still to pay</span><b className="rf-due owing">{money(due)}</b></div>
              <hr />
              <div className="rf-preview-kv"><span>This payout</span><b>{money(amount)}</b></div>
              <div className="rf-preview-kv"><span>Less TDS</span><b>− {money(tds)}</b></div>
              <div className="rf-preview-kv strong"><span>Net to {r.name}</span><b className="rf-paid">{money(net)}</b></div>
              <hr />
              <div className="rf-preview-kv"><span>Balance after</span><b className={after < -0.005 ? 'rf-bad' : ''}>{after < -0.005 ? `${money(-after)} advance` : money(after)}</b></div>

              {(p.upi || p.accountNo) && (
                <>
                  <div className="rf-aside-title spaced">Pay to</div>
                  {p.upi && (
                    <button type="button" className="rf-copy" onClick={() => copy(p.upi, 'UPI ID')}>
                      <span><small>UPI</small>{p.upi}</span><Icon name="copy" size={14} />
                    </button>
                  )}
                  {p.accountNo && (
                    <button type="button" className="rf-copy" onClick={() => copy(`${p.accountName}\n${p.accountNo}\n${p.ifsc}\n${p.bankName}`, 'Bank details')}>
                      <span><small>{p.bankName || 'Bank'}{p.ifsc ? ` · ${p.ifsc}` : ''}</small>{p.accountName && `${p.accountName} · `}{p.accountNo}</span><Icon name="copy" size={14} />
                    </button>
                  )}
                </>
              )}
              {payout && <p className="rf-muted small">Recorded {dateName(payout.date)}{payout.createdByEmail ? ` by ${payout.createdByEmail}` : ''}.</p>}
            </>
          ) : <p className="rf-muted">Choose a referrer to see what they are owed.</p>}
        </aside>
      </div>
    </Modal>
  );
}

// ---- Referrer profile -------------------------------------------------------

const PROFILE = [
  ['phone', 'Phone', 'tel', '+91 98xxxxxxx'],
  ['email', 'Email', 'email', 'name@example.com'],
  ['pan', 'PAN', 'text', 'ABCDE1234F'],
  ['upi', 'UPI ID', 'text', 'name@okhdfcbank'],
  ['accountName', 'Account holder', 'text', ''],
  ['accountNo', 'Account no.', 'text', ''],
  ['ifsc', 'IFSC', 'text', 'HDFC0001234'],
  ['bankName', 'Bank', 'text', ''],
];

export function ReferrerModal({ referrer, onClose, onSaved }) {
  const { showToast } = useApp();
  const [form, setForm] = useState(() => ({ name: referrer.name, ...referrer.profile, tdsRate: String(referrer.profile?.tdsRate || 0) }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Enter the referrer’s name'); return; }
    setSaving(true);
    try {
      await referralApi.saveReferrer(referrer.key, form);
      showToast(`${form.name.trim()} saved`);
      onSaved(form.name.trim().replace(/\s+/g, ' ').toLowerCase());
    } catch (err) {
      setError(errorOf(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Referrer details"
      subtitle="Contact, PAN and where to send their payouts."
      onClose={onClose}
      onSubmit={save}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      )}
    >
      <div className="rf-form">
        <FormError message={error} />
        <div className="rf-row">
          <Field label="Name" htmlFor="rf-p-name" hint={form.name.trim() !== referrer.name ? 'Renames them on every deal and payout.' : null}>
            <input id="rf-p-name" className="rf-input" value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Default TDS rate" htmlFor="rf-p-tds">
            <div className="rf-affix">
              <input id="rf-p-tds" className="rf-input" type="number" min="0" max="100" step="0.01" value={form.tdsRate} onChange={set('tdsRate')} />
              <span>%</span>
            </div>
          </Field>
        </div>
        <div className="rf-grid2">
          {PROFILE.map(([k, label, type, ph]) => (
            <Field key={k} label={label} htmlFor={`rf-p-${k}`}>
              <input id={`rf-p-${k}`} className="rf-input" type={type} value={form[k] || ''} onChange={set(k)} placeholder={ph} autoComplete="off" />
            </Field>
          ))}
        </div>
        <Field label="Note" htmlFor="rf-p-note">
          <input id="rf-p-note" className="rf-input" value={form.note || ''} onChange={set('note')} placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}
