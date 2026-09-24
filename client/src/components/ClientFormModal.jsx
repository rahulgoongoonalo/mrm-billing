import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { royaltyApi } from '../services/api';
import { PAYMENT_ACCOUNTS } from '../utils/paymentAccounts';
import {
  SOCIETIES,
  SOCIETY_FIELDS,
  DEFAULT_CLIENT_TYPE,
  societyClass,
  normalizeSocieties,
  composeTypeLabel,
  profileOf,
  normalizePhone,
  normalizeEmail,
  normalizeGstId,
  contactErrors,
} from '../utils/clientProfile';

const OTHER_TYPE = '__other__';

const idNumber = (id) => parseInt(String(id).match(/(\d+)/)?.[1], 10) || 0;

const nextClientId = (clients) => `MRM-${clients.reduce((max, c) => Math.max(max, idNumber(c.clientId)), 0) + 1}`;

function Field({ id, label, error, hint, wide, children }) {
  return (
    <div className={`input-group${wide ? ' cf-wide' : ''}${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <div className="cf-error" role="alert">{error}</div> : hint ? <div className="cf-hint">{hint}</div> : null}
    </div>
  );
}

// Add or edit a client. Pass `client` to edit; leave it out to add a new one.
function ClientFormModal({ client, onClose }) {
  const isEdit = !!client;
  const { clients, addClient, updateClient } = useApp();

  const original = useMemo(() => (isEdit ? profileOf(client) : null), [isEdit, client]);

  // Types already in use, Royalty first.
  const typeOptions = useMemo(() => {
    const seen = new Set(clients.map((c) => profileOf(c).clientType).filter(Boolean));
    seen.delete(DEFAULT_CLIENT_TYPE);
    return [DEFAULT_CLIENT_TYPE, ...[...seen].sort((a, b) => a.localeCompare(b))];
  }, [clients]);

  const [form, setForm] = useState(() => ({
    clientId: isEdit ? client.clientId : nextClientId(clients),
    name: client?.name || '',
    clientType: original?.clientType || DEFAULT_CLIENT_TYPE,
    societies: original?.societies || [],
    commissionRate: isEdit ? String(client.commissionRate ?? Math.round((client.fee || 0) * 10000) / 100) : '15',
    commissionMode: client?.commissionMode === 'per-society' ? 'per-society' : 'flat',
    // Kept as strings keyed by society so a half-typed rate does not become NaN.
    societyRates: Object.fromEntries(
      (client?.societyCommissions || []).map(({ society, rate }) => [society, String(rate)])
    ),
    gstRate: String(client?.gstRate ?? 18),
    previousBalance: String(client?.previousBalance ?? 0),
    phone: client?.phone || '',
    email: client?.email || '',
    gstId: client?.gstId || '',
    paymentAccount: client?.paymentAccount || '',
  }));
  const [customType, setCustomType] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paidSocieties, setPaidSocieties] = useState([]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const touch = (field, tidy) => () => {
    setTouched((t) => ({ ...t, [field]: true }));
    if (tidy) setForm((f) => ({ ...f, [field]: tidy(f[field]) }));
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Societies this client has actually been paid from, to suggest any not yet selected.
  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    royaltyApi.getAll({ clientId: client.clientId })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res.data) ? res.data : [];
        setPaidSocieties(Object.entries(SOCIETY_FIELDS)
          .filter(([, { amount }]) => rows.some((e) => (e[amount] || 0) > 0))
          .map(([society]) => society));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isEdit, client]);

  const societies = normalizeSocieties(form.societies);
  const clientType = form.clientType.trim();
  const toggleSociety = (s) => setForm((f) => ({
    ...f,
    societies: f.societies.includes(s) ? f.societies.filter((x) => x !== s) : [...f.societies, s],
  }));
  const addSocieties = (list) => setForm((f) => ({ ...f, societies: [...new Set([...f.societies, ...list])] }));

  // The server keeps a stored label untouched unless the type or societies change.
  const profileUnchanged = isEdit
    && clientType === original.clientType
    && societies.join('|') === original.societies.join('|');
  const label = profileUnchanged ? client.type : composeTypeLabel(clientType, societies);
  const labelChanged = isEdit && label !== client.type;
  const suggestions = paidSocieties.filter((s) => !societies.includes(s));

  const errors = useMemo(() => {
    const e = contactErrors(form);
    if (!isEdit) {
      const id = form.clientId.trim();
      const taken = clients.find((c) => c.clientId.toLowerCase() === id.toLowerCase());
      if (!id) e.clientId = 'Client ID is required';
      else if (taken) e.clientId = `${taken.clientId} already belongs to ${taken.name}`;
    }
    if (!form.name.trim()) e.name = 'Client name is required';
    if (!clientType) e.clientType = 'Choose or type a client type';
    const rate = parseFloat(form.commissionRate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) e.commissionRate = 'Enter a rate between 0 and 100';
    const gst = parseFloat(form.gstRate);
    if (Number.isNaN(gst) || gst < 0 || gst > 100) e.gstRate = 'Enter a rate between 0 and 100';
    if (form.previousBalance !== '' && Number.isNaN(parseFloat(form.previousBalance))) e.previousBalance = 'Enter an amount';
    if (form.commissionMode === 'per-society') {
      if (!societies.length) {
        e.societyRates = 'Pick at least one society to set per-society rates';
      } else {
        const bad = societies.filter((soc) => {
          const v = parseFloat(form.societyRates[soc]);
          return Number.isNaN(v) || v < 0 || v > 100;
        });
        if (bad.length) e.societyRates = `Enter a rate between 0 and 100 for ${bad.join(', ')}`;
      }
    }
    return e;
  }, [form, isEdit, clients, clientType, societies]);
  const shown = (field) => ((submitted || touched[field]) ? errors[field] : '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;

    const commissionRate = parseFloat(form.commissionRate);
    const payload = {
      name: form.name.trim(),
      clientType,
      societies,
      commissionRate,
      commissionMode: form.commissionMode,
      // Only the societies the client actually holds are sent; the server
      // normalises again on save.
      societyCommissions: form.commissionMode === 'per-society'
        ? societies.map((soc) => ({ society: soc, rate: parseFloat(form.societyRates[soc]) }))
        : [],
      gstRate: parseFloat(form.gstRate),
      previousBalance: parseFloat(form.previousBalance) || 0,
      phone: normalizePhone(form.phone),
      email: normalizeEmail(form.email),
      gstId: normalizeGstId(form.gstId),
      paymentAccount: form.paymentAccount,
    };
    setSaving(true);
    try {
      if (isEdit) await updateClient(client.clientId, payload);
      else await addClient({ ...payload, clientId: form.clientId.trim(), fee: commissionRate / 100 });
      onClose();
    } catch (error) {
      // The app context already shows the server's message
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal client-form-modal" role="dialog" aria-modal="true" aria-labelledby="client-form-title">
        <div className="modal-header">
          <div>
            <h3 id="client-form-title">{isEdit ? `Edit Client: ${client.clientId}` : 'Add New Client'}</h3>
            {isEdit && <div className="cf-subtitle">{client.name}</div>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form className="client-form" onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            <section className="cf-section">
              <div className="cf-section-title">Client</div>
              <div className="cf-grid">
                {!isEdit && (
                  <Field id="cf-id" label="Client ID *" error={shown('clientId')} hint="Next free number is filled in">
                    <input
                      id="cf-id"
                      type="text"
                      value={form.clientId}
                      onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value.toUpperCase() }))}
                      onBlur={touch('clientId')}
                      placeholder="MRM-250"
                    />
                  </Field>
                )}
                <Field id="cf-name" label="Client Name *" error={shown('name')} wide={isEdit}>
                  <input id="cf-name" type="text" value={form.name} onChange={set('name')} onBlur={touch('name')} placeholder="Full name" autoFocus={!isEdit} />
                </Field>
              </div>
            </section>

            <section className="cf-section">
              <div className="cf-section-title">Royalty profile</div>
              <div className="cf-grid">
                <Field id="cf-type" label="Client Type" error={shown('clientType')}>
                  {customType ? (
                    <div className="cf-inline">
                      <input
                        id="cf-type"
                        type="text"
                        value={form.clientType}
                        onChange={set('clientType')}
                        onBlur={touch('clientType')}
                        placeholder="e.g. Publisher"
                        autoFocus
                      />
                      <button type="button" className="cf-link" onClick={() => { setCustomType(false); setForm((f) => ({ ...f, clientType: typeOptions.includes(f.clientType.trim()) ? f.clientType.trim() : DEFAULT_CLIENT_TYPE })); }}>
                        List
                      </button>
                    </div>
                  ) : (
                    <select
                      id="cf-type"
                      value={typeOptions.includes(form.clientType) ? form.clientType : DEFAULT_CLIENT_TYPE}
                      onChange={(e) => {
                        if (e.target.value === OTHER_TYPE) { setCustomType(true); setForm((f) => ({ ...f, clientType: '' })); }
                        else setForm((f) => ({ ...f, clientType: e.target.value }));
                      }}
                    >
                      {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                      <option value={OTHER_TYPE}>Other…</option>
                    </select>
                  )}
                </Field>
                <div className="input-group cf-wide">
                  <label id="cf-societies-label">Societies</label>
                  <div className="society-picker" role="group" aria-labelledby="cf-societies-label">
                    {SOCIETIES.map((s) => {
                      const on = societies.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          className={`society-chip ${societyClass(s)}${on ? ' on' : ''}`}
                          aria-pressed={on}
                          onClick={() => toggleSociety(s)}
                        >
                          <span className="dot" aria-hidden="true"></span>{s}
                        </button>
                      );
                    })}
                  </div>
                  {suggestions.length > 0 && (
                    <div className="cf-suggest">
                      Entries show royalty from <strong>{suggestions.join(', ')}</strong>
                      <button type="button" className="cf-link" onClick={() => addSocieties(suggestions)}>
                        {suggestions.length > 1 ? 'Add all' : 'Add'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className={`cf-label-preview${labelChanged ? ' changed' : ''}`}>
                <span>Label on entries &amp; statements</span>
                <strong>{label || '—'}</strong>
                {labelChanged && <em>Was “{client.type}”. Every entry for this client will show the new label.</em>}
              </div>
            </section>

            <section className="cf-section">
              <div className="cf-section-title">Billing</div>
              <div className="cf-grid three">
                <Field id="cf-rate" label="Commission Rate (%)" error={shown('commissionRate')}>
                  <div className="input-prefix">
                    <span>%</span>
                    <input id="cf-rate" type="number" value={form.commissionRate} onChange={set('commissionRate')} onBlur={touch('commissionRate')} min="0" max="100" step="0.01" list="cf-rate-options" />
                    <datalist id="cf-rate-options">
                      {[5, 7, 10, 12, 15, 17, 20, 25, 27].map((r) => <option key={r} value={r} />)}
                    </datalist>
                  </div>
                </Field>
                <Field id="cf-gst" label="GST Rate (%)" error={shown('gstRate')}>
                  <div className="input-prefix">
                    <span>%</span>
                    <input id="cf-gst" type="number" value={form.gstRate} onChange={set('gstRate')} onBlur={touch('gstRate')} min="0" max="100" step="0.01" />
                  </div>
                </Field>
                <Field id="cf-balance" label="Previous Balance" error={shown('previousBalance')}>
                  <div className="input-prefix">
                    <span>&#8377;</span>
                    <input id="cf-balance" type="number" value={form.previousBalance} onChange={set('previousBalance')} onBlur={touch('previousBalance')} />
                  </div>
                </Field>
              </div>
              <div className="cf-mode-row" role="radiogroup" aria-label="Commission structure">
                <button
                  type="button"
                  role="radio"
                  aria-checked={form.commissionMode === 'flat'}
                  className={`cf-mode${form.commissionMode === 'flat' ? ' on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, commissionMode: 'flat' }))}
                >
                  <strong>Same rate for all societies</strong>
                  <span>One commission rate covers every society.</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={form.commissionMode === 'per-society'}
                  className={`cf-mode${form.commissionMode === 'per-society' ? ' on' : ''}`}
                  onClick={() => setForm((f) => ({
                    ...f,
                    commissionMode: 'per-society',
                    // Seed each society with the flat rate so nothing starts blank.
                    societyRates: Object.fromEntries(societies.map((soc) => [
                      soc,
                      f.societyRates[soc] ?? String(f.commissionRate || ''),
                    ])),
                  }))}
                >
                  <strong>Different rate per society</strong>
                  <span>Set a separate rate for each society below.</span>
                </button>
              </div>

              {form.commissionMode === 'per-society' && (
                <div className="cf-society-rates">
                  {societies.length === 0 ? (
                    <div className="cf-hint">Pick the client&rsquo;s societies above, then set a rate for each.</div>
                  ) : (
                    <div className="cf-rate-grid">
                      {societies.map((soc) => (
                        <div className="input-group" key={soc}>
                          <label htmlFor={`cf-rate-${soc}`}>{soc}</label>
                          <div className="input-prefix">
                            <span>%</span>
                            <input
                              id={`cf-rate-${soc}`}
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={form.societyRates[soc] ?? ''}
                              onChange={(e) => setForm((f) => ({
                                ...f,
                                societyRates: { ...f.societyRates, [soc]: e.target.value },
                              }))}
                              onBlur={touch('societyRates')}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {shown('societyRates') && <div className="cf-error">{shown('societyRates')}</div>}
                </div>
              )}

              {isEdit && (
                <div className="cf-hint">
                  Changing the commission rate or structure recalculates every entry for this client,
                  in every financial year.
                </div>
              )}
            </section>

            <section className="cf-section">
              <div className="cf-section-title">Contact &amp; tax</div>
              <div className="cf-grid">
                <Field id="cf-phone" label="Phone No" error={shown('phone')}>
                  <input id="cf-phone" type="tel" value={form.phone} onChange={set('phone')} onBlur={touch('phone', normalizePhone)} placeholder="98XXXXXXXX" />
                </Field>
                <Field id="cf-gstid" label="GST ID" error={shown('gstId')} hint="Optional">
                  <input id="cf-gstid" type="text" value={form.gstId} onChange={(e) => setForm((f) => ({ ...f, gstId: e.target.value.toUpperCase() }))} onBlur={touch('gstId', normalizeGstId)} placeholder="27AAPFU0939F1ZV" maxLength={20} />
                </Field>
                <Field id="cf-email" label="Email" error={shown('email')} hint="Separate several addresses (or phone numbers) with commas" wide>
                  <input id="cf-email" type="text" inputMode="email" value={form.email} onChange={set('email')} onBlur={touch('email', normalizeEmail)} placeholder="name@example.com" />
                </Field>
              </div>
            </section>

            <section className="cf-section">
              <div className="cf-section-title">Payment account</div>
              <div className="cf-hint">The bank details printed on this client&rsquo;s statement.</div>
              <div className="cf-mode-row" role="radiogroup" aria-label="Payment account">
                {PAYMENT_ACCOUNTS.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    role="radio"
                    aria-checked={form.paymentAccount === a.key}
                    className={`cf-mode${form.paymentAccount === a.key ? ' on' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, paymentAccount: f.paymentAccount === a.key ? '' : a.key }))}
                  >
                    <strong>{a.label}</strong>
                    <span>{a.account}<br />{a.bank}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn ${isEdit ? 'btn-primary' : 'btn-success'}`} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ClientFormModal;
