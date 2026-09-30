import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { clientMailApi } from '../services/api';
import ClientFormModal from './ClientFormModal';

// Mailing a client, one step at a time. Nothing is sent until the last step,
// and every earlier step can be gone back to:
//
//   1. Check    - the client master must be complete (email, phone...)
//   2. Details  - fill in the letter and recipients
//   3. Preview  - the mail exactly as it will go
//   4. Sent     - the outcome
//
// There is one letter, so the wizard never asks which.
//
// Mails carry no attachments: the client opens (and downloads) the statement
// from the Balance build-up / Full record links in the mail.

const STEPS = ['Client check', 'Details', 'Preview', 'Sent'];
const SENT = STEPS.length - 1;

const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

function MailWizard({ clientId, month, year, onClose }) {
  const { clients, showToast } = useApp();

  const [step, setStep] = useState(0);
  const [info, setInfo] = useState(null);          // GET /check
  const [loadError, setLoadError] = useState('');
  const [checking, setChecking] = useState(false);
  const [editingClient, setEditingClient] = useState(false);

  const [type, setType] = useState('');
  const [values, setValues] = useState({});        // { [type]: { field: value } }
  const [subjects, setSubjects] = useState({});    // { [type]: subject }
  const [cc, setCc] = useState('');

  const [preview, setPreview] = useState(null);    // POST /preview
  const [busy, setBusy] = useState('');
  const [stepError, setStepError] = useState('');
  const [result, setResult] = useState(null);      // { ok, message, log }
  const pressedOnBackdrop = useRef(false);

  // ---- step 1: check -------------------------------------------------------
  const runCheck = useCallback(async (keepState) => {
    setChecking(true);
    setLoadError('');
    try {
      const { data } = await clientMailApi.check(clientId);
      setInfo(data);
      // A re-check that changes nothing on screen looks like a dead button, so say what it found.
      if (keepState) {
        const bad = data.checks.filter((c) => !c.ok).length;
        showToast(bad ? `${bad} item${bad === 1 ? '' : 's'} still need fixing` : 'All client details are complete', bad ? 'warning' : 'success');
      }
      if (!keepState) {
        setType(data.types[0]?.key || '');
        setCc(data.defaultCc || '');
        setValues(Object.fromEntries(data.types.map((t) => [t.key, Object.fromEntries(t.fields.map((f) => [f.key, f.value ?? '']))])));
        setSubjects(Object.fromEntries(data.types.map((t) => [t.key, t.subject])));
      }
    } catch (err) {
      setLoadError(errorText(err, 'Could not check this client.'));
    } finally {
      setChecking(false);
    }
  }, [clientId, showToast]);

  useEffect(() => { runCheck(false); }, [runCheck]);

  // Close on Escape, unless the client editor is open on top.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !editingClient) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editingClient]);

  const typeDef = useMemo(() => info?.types.find((t) => t.key === type), [info, type]);
  const typeValues = values[type] || {};
  const missing = typeDef ? typeDef.fields.filter((f) => String(typeValues[f.key] ?? '').trim() === '') : [];

  const body = () => ({
    type,
    values: typeValues,
    subject: subjects[type],
    cc,
    month,
    year,
  });

  const go = (to) => { setStepError(''); setStep(to); };

  // ---- step 2 -> 3 --------------------------------------------------------
  const loadPreview = async () => {
    if (missing.length) { setStepError(`Fill in: ${missing.map((f) => f.label).join(', ')}`); return; }
    setBusy('preview');
    setStepError('');
    try {
      const { data } = await clientMailApi.preview(clientId, body());
      setPreview(data);
      setStep(2);
    } catch (err) {
      setStepError(errorText(err, 'Could not build the preview.'));
    } finally {
      setBusy('');
    }
  };

  // ---- step 3 -> 4 --------------------------------------------------------
  const send = async () => {
    setBusy('send');
    setStepError('');
    try {
      const { data } = await clientMailApi.send(clientId, body());
      setResult({ ok: true, log: data.log });
      showToast(data.log.isTest ? 'Test mail sent' : 'Mail sent to client');
    } catch (err) {
      setResult({ ok: false, message: errorText(err, 'The mail could not be sent.') });
    } finally {
      setBusy('');
      setStep(SENT);
    }
  };

  const setField = (key, value) => setValues((v) => ({ ...v, [type]: { ...v[type], [key]: value } }));

  const client = info?.client;
  const recipients = preview?.recipients || info?.recipients;
  const editableClient = clients.find((c) => c.clientId === clientId);

  // ---- rendering -------------------------------------------------------------
  const modeBanner = recipients && (recipients.blocked ? (
    <div className="mw-banner danger">
      <b>Sending is switched off.</b> {recipients.blocked} You can still walk through and preview the mail.
    </div>
  ) : recipients.isTest ? (
    <div className="mw-banner warn">
      <b>Test mode.</b> Mail goes to <code>{recipients.to.join(', ')}</code> instead of the client, marked [TEST].
      {recipients.intendedTo.length > 0 && <> In live mode it would go to <code>{recipients.intendedTo.join(', ')}</code>.</>}
    </div>
  ) : (
    <div className="mw-banner live">
      <b>Live.</b> This mail will be sent to the client at <code>{recipients.to.join(', ')}</code>.
    </div>
  ));

  const stepCheck = () => (
    <>
      <p className="mw-lead">
        Before anything is sent, the client record must be complete. Fix anything marked in red, then check again.
      </p>
      <ul className="mw-checks">
        {info.checks.map((c) => (
          <li key={c.key} className={c.ok ? 'ok' : 'bad'}>
            <span className="mw-tick" aria-hidden="true">{c.ok ? '✓' : '✕'}</span>
            <span className="mw-check-label">{c.label}</span>
            <span className="mw-check-value">
              {c.value || <em>missing</em>}
              {!c.ok && c.hint && <small>{c.hint}</small>}
            </span>
          </li>
        ))}
      </ul>
      <div className="mw-inline-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => setEditingClient(true)} disabled={!editableClient}>
          Edit client details
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => runCheck(true)}
          disabled={checking}
          title="Reload this client's details from Client Master and check them again"
        >
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>
      {info.history.length > 0 && (
        <div className="mw-history">
          <div className="mw-sub">Recent mail to this client</div>
          {info.history.map((h, i) => (
            <div key={i} className={`mw-history-row ${h.ok ? '' : 'failed'}`}>
              <span>{new Date(h.sentAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span className="mw-history-subject">{h.subject || '(no subject)'}</span>
              <span>{h.ok ? (h.isTest ? 'Test' : 'Sent') : 'Failed'}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const stepDetails = () => (
    <>
      <div className="mw-sub">Letter details</div>
      <div className="mw-grid">
        {typeDef.fields.map((f) => (
          <div key={f.key} className="input-group">
            <label htmlFor={`mw-${f.key}`}>{f.label}</label>
            <input
              id={`mw-${f.key}`}
              type={f.kind === 'date' ? 'date' : f.kind === 'amount' ? 'number' : 'text'}
              step={f.kind === 'amount' ? '0.01' : undefined}
              value={typeValues[f.key] ?? ''}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="mw-sub">Recipients</div>
      <div className="mw-grid">
        <div className="input-group">
          <label>To (from client master)</label>
          <input type="text" value={client.email || ''} disabled />
        </div>
        <div className="input-group">
          <label htmlFor="mw-cc">CC</label>
          <input id="mw-cc" type="text" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="name@example.com, …" />
        </div>
        <div className="input-group mw-wide">
          <label htmlFor="mw-subject">Subject</label>
          <input
            id="mw-subject"
            type="text"
            value={subjects[type] || ''}
            onChange={(e) => setSubjects((s) => ({ ...s, [type]: e.target.value }))}
          />
        </div>
      </div>

      <p className="mw-hint">
        No files are attached. The client opens and downloads the statement from the
        <b> Balance build-up</b> and <b>Full record</b> links in the mail.
      </p>
    </>
  );

  const stepPreview = () => (
    <>
      {modeBanner}
      <dl className="mw-envelope">
        <div><dt>To</dt><dd>{preview.recipients.to.join(', ') || <em>nobody - sending is off</em>}</dd></div>
        {preview.recipients.cc.length > 0 && <div><dt>CC</dt><dd>{preview.recipients.cc.join(', ')}</dd></div>}
        <div><dt>Subject</dt><dd><b>{preview.subject}</b></dd></div>
        {preview.statementLinks && (
          <div>
            <dt>Statement</dt>
            <dd className="mw-links">
              <a href={preview.statementLinks.outstanding} target="_blank" rel="noopener noreferrer">Balance build-up ↗</a>
              <a href={preview.statementLinks.full} target="_blank" rel="noopener noreferrer">Full record ↗</a>
            </dd>
          </div>
        )}
      </dl>
      <iframe className="mw-mail" title="Mail preview" srcDoc={preview.html} sandbox="allow-popups allow-popups-to-escape-sandbox" />
    </>
  );

  const stepResult = () => (result.ok ? (
    <div className="mw-result ok">
      <div className="mw-result-icon">✓</div>
      <h4>{result.log.isTest ? 'Test mail sent' : 'Mail sent'}</h4>
      <p>
        <b>{result.log.subject}</b><br />
        to {result.log.to}{result.log.cc ? `, cc ${result.log.cc}` : ''}
      </p>
      {result.log.isTest && <p className="mw-hint">Test mode is on, so the client did not receive it.</p>}
    </div>
  ) : (
    <div className="mw-result bad">
      <div className="mw-result-icon">!</div>
      <h4>Not sent</h4>
      <p>{result.message}</p>
      <p className="mw-hint">Nothing reached the client. Go back to fix it, or try again.</p>
    </div>
  ));

  // ---- footer buttons per step ----------------------------------------------
  const footer = () => {
    const back = (to) => <button className="btn btn-secondary" onClick={() => go(to)} disabled={!!busy}>← Back</button>;
    const skip = <button className="btn btn-secondary mw-skip" onClick={onClose}>Don&rsquo;t send</button>;
    switch (step) {
      case 0: return (<>{skip}<button className="btn btn-primary" onClick={() => go(1)} disabled={!info?.ready || !typeDef}>Next: fill details →</button></>);
      case 1: return (<>{skip}{back(0)}<button className="btn btn-primary" onClick={loadPreview} disabled={busy === 'preview'}>{busy === 'preview' ? 'Building preview…' : 'Next: preview →'}</button></>);
      case 2: return (
        <>{skip}{back(1)}
          <button className="btn btn-success" onClick={send} disabled={busy === 'send' || !!preview?.recipients.blocked}>
            {busy === 'send' ? 'Sending…' : preview?.recipients.isTest ? 'Send test mail' : `Send to ${client.name}`}
          </button>
        </>
      );
      default: return result?.ok
        ? <button className="btn btn-primary" onClick={onClose}>Done</button>
        : (<>{skip}{back(2)}<button className="btn btn-primary" onClick={send} disabled={busy === 'send'}>Try again</button></>);
    }
  };

  return (
    // Only a click that starts and ends on the backdrop closes the wizard: selecting
    // text and letting go outside the box must not throw the work away.
    <div
      className="modal-overlay show"
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (pressedOnBackdrop.current && e.target === e.currentTarget && !busy) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div className="modal mw" role="dialog" aria-label="Send mail to client">
        <div className="modal-header">
          <div>
            <h3>Send mail to {client?.name || clientId}?</h3>
            <div className="mw-subtitle">{clientId}{client?.email ? ` · ${client.email}` : ''}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <ol className="mw-steps">
          {STEPS.map((label, i) => {
            // Earlier steps can be clicked to go back; nothing after the send.
            const canJump = i < step && step < SENT;
            return (
              <li key={label} className={i === step ? 'current' : i < step ? 'done' : ''}>
                <button type="button" disabled={!canJump || !!busy} onClick={() => go(i)}>
                  <span className="mw-dot">{i < step ? '✓' : i + 1}</span>{label}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="modal-body">
          {!info && !loadError && <div className="mw-loading">Checking client…</div>}
          {loadError && <div className="mw-banner danger">{loadError}</div>}
          {info && step < 2 && modeBanner}
          {info && step === 0 && stepCheck()}
          {info && step === 1 && typeDef && stepDetails()}
          {info && step === 2 && preview && stepPreview()}
          {step === SENT && result && stepResult()}
          {stepError && <div className="mw-banner danger mw-error">{stepError}</div>}
        </div>

        <div className="modal-footer mw-footer">{footer()}</div>
      </div>

      {editingClient && editableClient && (
        <ClientFormModal
          client={editableClient}
          onClose={() => { setEditingClient(false); runCheck(true); }}
        />
      )}
    </div>
  );
}

export default MailWizard;
