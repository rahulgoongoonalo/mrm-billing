import React, { useEffect, useState } from 'react';
import Icon from '../Icon';
import { money, dateName, monthName, modeLabel, initials, hueOf, dealStatus } from './shared';
import { exportStatement } from './referralExport';

// One referrer, all time: what they earned, what they were paid, the running
// balance, their clients and how to pay them.
export default function ReferrerDrawer({
  referrer: r, deals, dealStats, periodLabel, onClose, onPay, onEditProfile, onNewDeal, onEditPayout, onDeletePayout,
}) {
  const [tab, setTab] = useState('ledger');
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('.rf-overlay') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const p = r.profile || {};
  const myDeals = deals.filter((d) => d.referrer === r.name);
  const pct = r.earnedAll > 0 ? Math.min(100, (r.paidAll / r.earnedAll) * 100) : 0;
  const ledger = [...r.ledger].reverse();
  const details = [
    ['Phone', p.phone], ['Email', p.email], ['PAN', p.pan], ['UPI', p.upi],
    ['Account holder', p.accountName], ['Account no.', p.accountNo], ['IFSC', p.ifsc], ['Bank', p.bankName],
    ['Default TDS', `${p.tdsRate || 0}%`], ['Note', p.note],
  ];

  return (
    <div className="rf-drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="rf-drawer" role="dialog" aria-modal="true" aria-label={`${r.name}, referrer`}>
        <header className="rf-drawer-head">
          <span className="rf-avatar lg" style={{ '--hue': hueOf(r.name) }}>{initials(r.name)}</span>
          <div className="rf-drawer-title">
            <h3>{r.name}</h3>
            <div className="rf-contact">
              {p.phone && <a href={`tel:${p.phone}`}><Icon name="phone" size={13} />{p.phone}</a>}
              {p.email && <a href={`mailto:${p.email}`}><Icon name="mail" size={13} />{p.email}</a>}
              {!p.phone && !p.email && <button type="button" className="rf-link" onClick={onEditProfile}>Add contact and bank details</button>}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>

        <div className="rf-drawer-kpis">
          <div><span>Earned, all time</span><b className="rf-earned">{money(r.earnedAll)}</b></div>
          <div><span>Paid{r.tdsAll ? ` (TDS ${money(r.tdsAll)})` : ''}</span><b className="rf-paid">{money(r.paidAll)}</b></div>
          <div><span>Still to pay</span><b className={r.due > 0.005 ? 'rf-due owing' : r.due < -0.005 ? 'rf-bad' : 'rf-due'}>{r.due < -0.005 ? `${money(-r.due)} adv.` : money(r.due)}</b></div>
        </div>
        <div className="rf-progress" title={`${Math.round(pct)}% paid`}><i style={{ width: `${pct}%` }} /></div>
        <div className="rf-drawer-meta">
          {Math.round(pct)}% settled · {r.payouts} payout{r.payouts === 1 ? '' : 's'}{r.lastPaidOn ? `, last on ${dateName(r.lastPaidOn)}` : ''}
        </div>

        <div className="rf-drawer-actions">
          <button type="button" className="btn btn-success btn-sm" onClick={onPay}><Icon name="wallet" size={15} />Record payout</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportStatement(r)}><Icon name="download" size={15} />Statement PDF</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onNewDeal}><Icon name="plus" size={15} />New deal</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onEditProfile}><Icon name="edit" size={15} />Details</button>
        </div>

        <div className="rf-tabs small" role="tablist">
          {[['ledger', 'Ledger', r.ledger.length], ['clients', 'Clients', myDeals.length], ['details', 'Payment details']].map(([k, l, n]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}{n !== undefined && <span className="rf-count">{n}</span>}
            </button>
          ))}
        </div>

        <div className="rf-drawer-body">
          {tab === 'ledger' && (ledger.length ? (
            <table className="rf-ledger">
              <thead><tr><th>When</th><th>Particulars</th><th className="num">Amount</th><th className="num">Balance</th><th /></tr></thead>
              <tbody>
                {ledger.map((l, i) => (
                  <tr key={l.payoutId || `${l.clientId}-${l.order}-${i}`} className={l.kind}>
                    <td className="rf-nowrap">{l.kind === 'earned' ? l.label : dateName(l.date)}</td>
                    <td>
                      {l.kind === 'earned' ? (
                        <><b>{l.clientName}</b><div className="rf-sub">{l.rate}% of {money(l.received)} received</div></>
                      ) : (
                        <><b>Payout · {modeLabel(l.mode)}</b><div className="rf-sub">{[l.reference, l.tds ? `TDS ${money(l.tds)}, net ${money(l.net)}` : '', l.note].filter(Boolean).join(' · ') || '—'}</div></>
                      )}
                    </td>
                    <td className={`num ${l.kind === 'earned' ? 'rf-earned' : 'rf-paid'}`}>{l.kind === 'earned' ? '+' : '−'}{money(l.amount)}</td>
                    <td className="num rf-mono-num">{money(l.balance)}</td>
                    <td className="num">
                      {l.kind === 'paid' && (
                        <span className="rf-icon-btns">
                          <button type="button" className="rf-icon-btn" onClick={() => onEditPayout(l.payoutId)} aria-label="Edit payout"><Icon name="edit" size={14} /></button>
                          <button type="button" className="rf-icon-btn danger" onClick={() => onDeletePayout(l.payoutId)} aria-label="Delete payout"><Icon name="trash" size={14} /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="rf-empty small">Nothing earned or paid yet. Referral appears here once a referred client’s payment is recorded.</div>)}

          {tab === 'clients' && (
            <>
              {r.byClient.length > 0 && (
                <>
                  <div className="rf-aside-title">Earned in {periodLabel}</div>
                  <table className="rf-ledger">
                    <thead><tr><th>Client</th><th className="num">Payments</th><th className="num">Received</th><th className="num">Referral</th></tr></thead>
                    <tbody>
                      {r.byClient.map((c) => (
                        <tr key={c.clientId}>
                          <td><b>{c.clientName}</b> <span className="rf-mono">{c.clientId}</span></td>
                          <td className="num">{c.payments}</td>
                          <td className="num">{money(c.received)}</td>
                          <td className="num rf-earned">{money(c.earned)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              <div className="rf-aside-title spaced">Deals</div>
              {myDeals.map((d) => {
                const s = dealStatus(d);
                const st = dealStats?.[d._id];
                return (
                  <div className="rf-deal-line" key={d._id}>
                    <div><b>{d.clientName}</b> <span className="rf-mono">{d.clientId}</span><div className="rf-sub">{d.rate}% · {monthName(d.fromMonth)} – {d.toMonth ? monthName(d.toMonth) : 'open'}</div></div>
                    <div className="num"><span className={`rf-status ${s.id}`}>{s.label}</span><div className="rf-sub">{money(st?.earnedAll || 0)} earned</div></div>
                  </div>
                );
              })}
            </>
          )}

          {tab === 'details' && (
            <>
              <dl className="rf-dl">
                {details.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v || <span className="rf-muted">—</span>}</dd></React.Fragment>)}
              </dl>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onEditProfile}><Icon name="edit" size={15} />Edit details</button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
