import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import { referralApi } from '../services/api';
import Icon from './Icon';
import TrendChart from './referrals/TrendChart';
import ReferrerDrawer from './referrals/ReferrerDrawer';
import {
  DealModal, ChangeRateModal, PayoutModal, ReferrerModal, useConfirm,
} from './referrals/ReferralModals';
import { exportWorkbook } from './referrals/referralExport';
import {
  thisMonth, monthName, dateName, errorOf, money, modeLabel, initials, hueOf, dealStatus, r2,
} from './referrals/shared';

// Referrals: people who brought a client to MRM earn a share of what that
// client pays. A deal sets the referrer, the rate and the month it starts;
// the referral on every payment from then on is worked out from the entries.
// Nothing here changes what a client owes.

const STATUS_FILTERS = [['all', 'All'], ['on', 'Active'], ['ending', 'Ending'], ['later', 'Upcoming'], ['off', 'Ended']];

function Kpi({ label, value, sub, accent, icon, children }) {
  return (
    <div className="rf-kpi" style={{ '--accent': accent }}>
      <div className="rf-kpi-top">
        <span className="rf-kpi-label">{label}</span>
        <span className="rf-kpi-icon"><Icon name={icon} size={16} /></span>
      </div>
      <div className="rf-kpi-value">{value}</div>
      {children}
      <div className="rf-kpi-sub">{sub}</div>
    </div>
  );
}

function Search({ value, onChange, placeholder }) {
  return (
    <label className="rf-search">
      <Icon name="search" size={15} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search"><Icon name="close" size={14} /></button>}
    </label>
  );
}

function ReferralsPage() {
  const { clients, settings, showToast } = useApp();
  const fy = settings?.financialYear?.startYear;
  const [confirm, confirmEl] = useConfirm();

  const [period, setPeriod] = useState('fy');
  const [custom, setCustom] = useState(() => ({ from: fy ? `${fy}-04` : thisMonth(), to: thisMonth() }));
  const range = useMemo(() => {
    if (period === 'month') return { from: thisMonth(), to: thisMonth() };
    if (period === 'fy' && fy) return { from: `${fy}-04`, to: `${fy + 1}-03` };
    if (period === 'custom') return custom.from && custom.to && custom.to >= custom.from ? custom : null;
    return {};
  }, [period, fy, custom]);

  const [summary, setSummary] = useState(null);
  const [deals, setDeals] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState('overview');
  const [drawer, setDrawer] = useState(null);         // referrer key
  const [dealModal, setDealModal] = useState(null);   // { deal?, presetReferrer? }
  const [rateModal, setRateModal] = useState(null);   // deal
  const [payModal, setPayModal] = useState(null);     // { payout?, referrer? }
  const [profileModal, setProfileModal] = useState(null); // referrer

  const [refSearch, setRefSearch] = useState('');
  const [dealSearch, setDealSearch] = useState('');
  const [dealFilter, setDealFilter] = useState('all');
  const [paySearch, setPaySearch] = useState('');
  const [payReferrer, setPayReferrer] = useState('');

  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    try {
      const [s, d, p] = await Promise.all([referralApi.summary(range), referralApi.deals(), referralApi.payouts()]);
      setSummary(s.data);
      setDeals(d.data);
      setPayouts(p.data);
      setError(null);
    } catch (err) {
      setError(errorOf(err));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const current = thisMonth();
  const referrerNames = useMemo(() => [...new Set(deals.map((d) => d.referrer))].sort((a, b) => a.localeCompare(b)), [deals]);
  const periodLabel = !range || period === 'all' ? 'all time'
    : `${monthName(range.from)}${range.to !== range.from ? ` – ${monthName(range.to)}` : ''}`;

  // ---- Actions ----

  const endDeal = async (d) => {
    // Ends with this month: payments already recorded on it keep their referral.
    const lastMonth = current < d.fromMonth ? d.fromMonth : current;
    const ok = await confirm({
      title: 'End this deal?',
      message: <>{d.referrer} stops earning on <b>{d.clientName}</b> after <b>{monthName(lastMonth)}</b>. Referral already earned stays and is still owed.</>,
      confirmLabel: 'End deal',
    });
    if (!ok) return;
    try {
      await referralApi.updateDeal(d._id, { toMonth: lastMonth });
      showToast('Deal ended');
      load();
    } catch (err) { showToast(errorOf(err), 'error'); }
  };

  const deleteDeal = async (d) => {
    const earned = summary?.dealStats?.[d._id]?.earnedAll || 0;
    const ok = await confirm({
      title: 'Delete this deal?',
      message: (
        <>
          {d.referrer}&rsquo;s deal on <b>{d.clientName}</b> is removed{earned ? <>, with the <b>{money(earned)}</b> referral it earned</> : ''}.
          {' '}If the deal was real and has stopped, use <b>End</b> instead.
        </>
      ),
      confirmLabel: 'Delete deal',
      danger: true,
    });
    if (!ok) return;
    try {
      await referralApi.deleteDeal(d._id);
      showToast('Deal deleted');
      load();
    } catch (err) { showToast(errorOf(err), 'error'); }
  };

  const deletePayout = async (p) => {
    const ok = await confirm({
      title: 'Delete this payout?',
      message: <>The <b>{money(p.amount)}</b> payout to {p.referrer} on {dateName(p.date)} is removed and goes back to still to pay.</>,
      confirmLabel: 'Delete payout',
      danger: true,
    });
    if (!ok) return;
    try {
      await referralApi.deletePayout(p._id);
      showToast('Payout deleted');
      load();
    } catch (err) { showToast(errorOf(err), 'error'); }
  };
  const payoutById = (id) => payouts.find((p) => p._id === id);

  const exportAll = () => {
    try {
      exportWorkbook({ summary, deals, payouts, periodLabel });
    } catch (err) {
      showToast('Could not build the Excel file', 'error');
    }
  };

  // ---- Derived lists ----

  const referrers = useMemo(() => summary?.referrers || [], [summary]);
  const shownReferrers = useMemo(() => {
    const q = refSearch.trim().toLowerCase();
    return q ? referrers.filter((r) => r.name.toLowerCase().includes(q)
      || r.byClient.some((c) => c.clientName.toLowerCase().includes(q))
      || deals.some((d) => d.referrer === r.name && d.clientName.toLowerCase().includes(q))) : referrers;
  }, [referrers, refSearch, deals]);

  const dealCounts = useMemo(() => {
    const c = { all: deals.length, on: 0, ending: 0, later: 0, off: 0 };
    deals.forEach((d) => { c[dealStatus(d, current).id] += 1; });
    return c;
  }, [deals, current]);
  const shownDeals = useMemo(() => {
    const q = dealSearch.trim().toLowerCase();
    return deals.filter((d) => (dealFilter === 'all' || dealStatus(d, current).id === dealFilter)
      && (!q || d.clientName.toLowerCase().includes(q) || d.clientId.toLowerCase().includes(q) || d.referrer.toLowerCase().includes(q)));
  }, [deals, dealSearch, dealFilter, current]);

  const shownPayouts = useMemo(() => {
    const q = paySearch.trim().toLowerCase();
    return payouts.filter((p) => (!payReferrer || p.referrer === payReferrer)
      && (!q || [p.referrer, p.reference, p.note, modeLabel(p.mode)].some((v) => String(v || '').toLowerCase().includes(q))));
  }, [payouts, paySearch, payReferrer]);
  const payTotals = shownPayouts.reduce((t, p) => ({ amount: r2(t.amount + p.amount), tds: r2(t.tds + (p.tds || 0)) }), { amount: 0, tds: 0 });

  const topClients = useMemo(() => {
    const m = new Map();
    referrers.forEach((r) => r.byClient.forEach((c) => {
      const k = `${r.key}|${c.clientId}`;
      m.set(k, { ...c, referrer: r.name });
    }));
    return [...m.values()].sort((a, b) => b.earned - a.earned).slice(0, 6);
  }, [referrers]);
  const owed = referrers.filter((r) => r.due > 0.005);

  // ---- Render ----

  if (error && !summary) {
    return (
      <div className="rf-empty-page">
        <Icon name="alert" size={28} />
        <h3>Could not load referrals</h3>
        <p>{error}</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={load}><Icon name="refresh" size={15} />Try again</button>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="rf-page">
        <div className="rf-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="rf-kpi rf-skel" />)}</div>
        <div className="rf-card rf-skel tall" />
      </div>
    );
  }

  const t = summary.totals;
  const settledPct = t.earnedAll > 0 ? Math.min(100, (t.paidAll / t.earnedAll) * 100) : 0;
  const effRate = t.received > 0 ? (t.earned / t.received) * 100 : 0;
  const drawerRef = drawer && referrers.find((r) => r.key === drawer);
  const noDeals = !deals.length;

  return (
    <div className={`rf-page${loading ? ' is-loading' : ''}`}>
      {/* Toolbar */}
      <div className="rf-toolbar">
        <div className="rf-seg" role="tablist" aria-label="Period">
          {[['month', 'This month'], ['fy', fy ? `FY ${fy}-${String(fy + 1).slice(2)}` : 'This FY'], ['all', 'All time'], ['custom', 'Custom']].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={period === k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="rf-custom">
            <input type="month" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From month" />
            <span>to</span>
            <input type="month" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To month" />
            {!range && <span className="rf-bad small">End month is before the start</span>}
          </div>
        )}
        <div className="rf-toolbar-actions">
          <button type="button" className="rf-icon-btn" onClick={load} aria-label="Refresh" title="Refresh"><Icon name="refresh" size={15} className={loading ? 'rf-spin' : ''} /></button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportAll} disabled={noDeals}><Icon name="download" size={15} />Excel</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPayModal({})} disabled={noDeals}><Icon name="wallet" size={15} />Record payout</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setDealModal({})}><Icon name="plus" size={15} />New deal</button>
        </div>
      </div>
      {error && <div className="rf-form-error"><Icon name="alert" size={16} /><span>{error}</span></div>}

      {noDeals ? (
        <div className="rf-card rf-onboard">
          <div className="rf-onboard-icon"><Icon name="share" size={26} /></div>
          <h2>Track who brings clients to MRM</h2>
          <p>Add a referral deal and the referrer&rsquo;s share is worked out from every payment that client makes. Record payouts as you pay them, and the balance keeps itself.</p>
          <ol className="rf-steps">
            <li><b>1</b><span><strong>Add a deal</strong>Client, referrer, rate and the month it starts.</span></li>
            <li><b>2</b><span><strong>Enter payments as usual</strong>Receipts on the client&rsquo;s entries earn referral automatically.</span></li>
            <li><b>3</b><span><strong>Pay and record</strong>With TDS, mode and reference. Download a statement any time.</span></li>
          </ol>
          <button type="button" className="btn btn-primary" onClick={() => setDealModal({})}><Icon name="plus" size={16} />Add the first deal</button>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="rf-kpis">
            <Kpi label="Payments from referred clients" value={money(t.received)} sub={periodLabel} accent="var(--accent-blue)" icon="credit-card" />
            <Kpi label="Referral earned" value={money(t.earned)} sub={`${periodLabel}${effRate ? ` · ${effRate.toFixed(1)}% of payments` : ''}`} accent="var(--accent-purple)" icon="percent" />
            <Kpi label="Paid to referrers" value={money(t.paid)} sub={`${periodLabel}${t.tds ? ` · TDS ${money(t.tds)}` : ''}`} accent="var(--accent-green)" icon="wallet" />
            <Kpi label="Still to pay" value={money(t.due)} sub={`all time · ${t.owed} of ${t.referrers} referrer${t.referrers === 1 ? '' : 's'} owed`} accent="var(--accent-orange)" icon="alert">
              <div className="rf-progress" title={`${Math.round(settledPct)}% of all referral earned has been paid`}><i style={{ width: `${settledPct}%` }} /></div>
              <div className="rf-kpi-note">{money(t.paidAll)} paid of {money(t.earnedAll)} earned</div>
            </Kpi>
          </div>

          {/* Tabs */}
          <div className="rf-tabs" role="tablist">
            {[
              ['overview', 'Overview'],
              ['referrers', 'Referrers', referrers.length],
              ['deals', 'Deals', deals.length],
              ['payouts', 'Payouts', payouts.length],
            ].map(([k, l, n]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}{n !== undefined && <span className="rf-count">{n}</span>}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="rf-overview">
              <section className="rf-card rf-span2">
                <div className="rf-card-head">
                  <div><h2>Earned vs paid</h2><p>Referral earned on payments recorded each month, and payouts made, {periodLabel}.</p></div>
                </div>
                <div className="rf-card-pad"><TrendChart months={summary.months} /></div>
              </section>

              <section className="rf-card">
                <div className="rf-card-head">
                  <div><h2>To pay</h2><p>Referrers with a balance, all time.</p></div>
                </div>
                {owed.length ? (
                  <ul className="rf-owed">
                    {owed.map((r) => (
                      <li key={r.key}>
                        <button type="button" className="rf-owed-who" onClick={() => setDrawer(r.key)}>
                          <span className="rf-avatar sm" style={{ '--hue': hueOf(r.name) }}>{initials(r.name)}</span>
                          <span><b>{r.name}</b><small>{r.lastPaidOn ? `Last paid ${dateName(r.lastPaidOn)}` : 'Never paid'}</small></span>
                        </button>
                        <span className="rf-due owing">{money(r.due)}</span>
                        <button type="button" className="btn btn-success btn-sm" onClick={() => setPayModal({ referrer: r.name })}>Pay</button>
                      </li>
                    ))}
                  </ul>
                ) : <div className="rf-empty small"><Icon name="wallet" size={18} />Everyone is paid up.</div>}
              </section>

              <section className="rf-card rf-span2">
                <div className="rf-card-head"><div><h2>Top referred clients</h2><p>By referral earned, {periodLabel}.</p></div></div>
                {topClients.length ? (
                  <div className="rf-table-wrap">
                    <table className="rf-table">
                      <thead><tr><th>Client</th><th>Referrer</th><th className="num">Payments</th><th className="num">Received</th><th className="num">Referral</th></tr></thead>
                      <tbody>
                        {topClients.map((c) => (
                          <tr key={`${c.referrer}-${c.clientId}`}>
                            <td><b>{c.clientName}</b> <span className="rf-mono">{c.clientId}</span></td>
                            <td>{c.referrer}</td>
                            <td className="num">{c.payments}</td>
                            <td className="num">{money(c.received)}</td>
                            <td className="num rf-earned">{money(c.earned)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="rf-empty small">No payments from referred clients in {periodLabel}.</div>}
              </section>

              <section className="rf-card">
                <div className="rf-card-head"><div><h2>Recent payouts</h2><p>Latest money paid out.</p></div></div>
                {payouts.length ? (
                  <ul className="rf-recent">
                    {payouts.slice(0, 5).map((p) => (
                      <li key={p._id}>
                        <span><b>{p.referrer}</b><small>{dateName(p.date)} · {modeLabel(p.mode)}{p.reference ? ` · ${p.reference}` : ''}</small></span>
                        <span className="rf-paid">{money(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <div className="rf-empty small">No payouts yet.</div>}
                {payouts.length > 5 && <button type="button" className="rf-link pad" onClick={() => setTab('payouts')}>See all {payouts.length} payouts<Icon name="chevron-right" size={14} /></button>}
              </section>
            </div>
          )}

          {tab === 'referrers' && (
            <section>
              <div className="rf-filterbar">
                <Search value={refSearch} onChange={setRefSearch} placeholder="Search referrer or client…" />
              </div>
              {shownReferrers.length ? (
                <div className="rf-ref-grid">
                  {shownReferrers.map((r) => {
                    const pct = r.earnedAll > 0 ? Math.min(100, (r.paidAll / r.earnedAll) * 100) : 0;
                    return (
                      <article key={r.key} className="rf-ref-card" onClick={() => setDrawer(r.key)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setDrawer(r.key)}>
                        <header>
                          <span className="rf-avatar" style={{ '--hue': hueOf(r.name) }}>{initials(r.name)}</span>
                          <div>
                            <h3>{r.name}</h3>
                            <small>{r.clients} client{r.clients === 1 ? '' : 's'} · {r.activeDeals} active deal{r.activeDeals === 1 ? '' : 's'}{r.profile.phone ? ` · ${r.profile.phone}` : ''}</small>
                          </div>
                          <Icon name="chevron-right" size={16} className="rf-card-chev" />
                        </header>
                        <div className="rf-ref-stats">
                          <div><span>Received</span><b>{money(r.received)}</b></div>
                          <div><span>Earned</span><b className="rf-earned">{money(r.earned)}</b></div>
                          <div><span>Paid</span><b className="rf-paid">{money(r.paid)}</b></div>
                        </div>
                        <div className="rf-ref-due">
                          <div>
                            <span>Still to pay, all time</span>
                            <b className={r.due > 0.005 ? 'rf-due owing' : r.due < -0.005 ? 'rf-bad' : 'rf-due'}>{r.due < -0.005 ? `${money(-r.due)} advance` : money(r.due)}</b>
                          </div>
                          <button type="button" className="btn btn-success btn-sm" onClick={(e) => { e.stopPropagation(); setPayModal({ referrer: r.name }); }}>
                            <Icon name="wallet" size={14} />Pay
                          </button>
                        </div>
                        <div className="rf-progress"><i style={{ width: `${pct}%` }} /></div>
                        <footer>{Math.round(pct)}% settled · {r.lastPaidOn ? `last paid ${dateName(r.lastPaidOn)}` : 'not paid yet'}</footer>
                      </article>
                    );
                  })}
                </div>
              ) : <div className="rf-card rf-empty">No referrer matches “{refSearch}”.</div>}
            </section>
          )}

          {tab === 'deals' && (
            <section className="rf-card">
              <div className="rf-filterbar in-card">
                <Search value={dealSearch} onChange={setDealSearch} placeholder="Search client, ID or referrer…" />
                <div className="rf-seg small">
                  {STATUS_FILTERS.map(([k, l]) => (
                    <button key={k} type="button" className={dealFilter === k ? 'on' : ''} onClick={() => setDealFilter(k)}>{l} <span className="rf-count">{dealCounts[k]}</span></button>
                  ))}
                </div>
              </div>
              {shownDeals.length ? (
                <div className="rf-table-wrap">
                  <table className="rf-table">
                    <thead>
                      <tr><th>Client</th><th>Referred by</th><th className="num">Rate</th><th>Period</th><th className="num">Earned so far</th><th>Last payment</th><th>Status</th><th /></tr>
                    </thead>
                    <tbody>
                      {shownDeals.map((d) => {
                        const s = dealStatus(d, current);
                        const st = summary.dealStats?.[d._id];
                        const running = s.id === 'on';
                        return (
                          <tr key={d._id}>
                            <td><b>{d.clientName}</b> <span className="rf-mono">{d.clientId}</span>{d.note && <div className="rf-sub">{d.note}</div>}</td>
                            <td>
                              <button type="button" className="rf-who" onClick={() => setDrawer(referrers.find((r) => r.name === d.referrer)?.key || null)}>
                                <span className="rf-dot" style={{ background: hueOf(d.referrer) }} />{d.referrer}
                              </button>
                            </td>
                            <td className="num"><span className="rf-rate">{d.rate}%</span></td>
                            <td className="rf-nowrap">{monthName(d.fromMonth)} – {d.toMonth ? monthName(d.toMonth) : <span className="rf-muted">open</span>}</td>
                            <td className="num">
                              <span className="rf-earned">{money(st?.earnedAll || 0)}</span>
                              {st?.payments ? <div className="rf-sub">on {money(st.receivedAll)}</div> : null}
                            </td>
                            <td className="rf-nowrap">{st?.lastPayment ? monthName(st.lastPayment) : <span className="rf-muted">—</span>}</td>
                            <td><span className={`rf-status ${s.id}`}>{s.label}</span></td>
                            <td className="num">
                              <span className="rf-icon-btns">
                                <button type="button" className="rf-icon-btn" onClick={() => setDealModal({ deal: d })} title="Edit" aria-label="Edit deal"><Icon name="edit" size={14} /></button>
                                {(running || s.id === 'ending') && <button type="button" className="rf-icon-btn" onClick={() => setRateModal(d)} title="Change rate from a month" aria-label="Change rate"><Icon name="repeat" size={14} /></button>}
                                {running && <button type="button" className="rf-icon-btn warn" onClick={() => endDeal(d)} title="End deal" aria-label="End deal"><Icon name="stop" size={14} /></button>}
                                <button type="button" className="rf-icon-btn danger" onClick={() => deleteDeal(d)} title="Delete" aria-label="Delete deal"><Icon name="trash" size={14} /></button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <div className="rf-empty">No deals match.</div>}
            </section>
          )}

          {tab === 'payouts' && (
            <section className="rf-card">
              <div className="rf-filterbar in-card">
                <Search value={paySearch} onChange={setPaySearch} placeholder="Search reference, note or mode…" />
                <select className="rf-select" value={payReferrer} onChange={(e) => setPayReferrer(e.target.value)} aria-label="Referrer">
                  <option value="">All referrers</option>
                  {referrerNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {shownPayouts.length ? (
                <div className="rf-table-wrap">
                  <table className="rf-table">
                    <thead>
                      <tr><th>Paid on</th><th>Referrer</th><th className="num">Settled</th><th className="num">TDS</th><th className="num">Net paid</th><th>Mode</th><th>Reference / note</th><th /></tr>
                    </thead>
                    <tbody>
                      {shownPayouts.map((p) => (
                        <tr key={p._id}>
                          <td className="rf-nowrap">{dateName(p.date)}</td>
                          <td><span className="rf-dot" style={{ background: hueOf(p.referrer) }} />{p.referrer}</td>
                          <td className="num">{money(p.amount)}</td>
                          <td className="num">{p.tds ? money(p.tds) : <span className="rf-muted">—</span>}</td>
                          <td className="num rf-paid">{money(p.amount - (p.tds || 0))}</td>
                          <td><span className="rf-pill">{modeLabel(p.mode)}</span></td>
                          <td>{p.reference && <span className="rf-mono plain">{p.reference}</span>}{p.note && <div className="rf-sub">{p.note}</div>}{!p.reference && !p.note && <span className="rf-muted">—</span>}</td>
                          <td className="num">
                            <span className="rf-icon-btns">
                              <button type="button" className="rf-icon-btn" onClick={() => setPayModal({ payout: p })} aria-label="Edit payout" title="Edit"><Icon name="edit" size={14} /></button>
                              <button type="button" className="rf-icon-btn danger" onClick={() => deletePayout(p)} aria-label="Delete payout" title="Delete"><Icon name="trash" size={14} /></button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>{shownPayouts.length} payout{shownPayouts.length === 1 ? '' : 's'}</td>
                        <td className="num">{money(payTotals.amount)}</td>
                        <td className="num">{money(payTotals.tds)}</td>
                        <td className="num rf-paid">{money(payTotals.amount - payTotals.tds)}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="rf-empty">
                  {payouts.length ? 'No payouts match.' : 'No payouts recorded yet.'}
                  {!payouts.length && <button type="button" className="btn btn-success btn-sm" onClick={() => setPayModal({})}><Icon name="wallet" size={14} />Record the first payout</button>}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {drawerRef && (
        <ReferrerDrawer
          referrer={drawerRef}
          deals={deals}
          dealStats={summary.dealStats}
          periodLabel={periodLabel}
          onClose={() => setDrawer(null)}
          onPay={() => setPayModal({ referrer: drawerRef.name })}
          onEditProfile={() => setProfileModal(drawerRef)}
          onNewDeal={() => setDealModal({ presetReferrer: drawerRef.name })}
          onEditPayout={(id) => payoutById(id) && setPayModal({ payout: payoutById(id) })}
          onDeletePayout={(id) => payoutById(id) && deletePayout(payoutById(id))}
        />
      )}
      {dealModal && (
        <DealModal
          deal={dealModal.deal || null}
          presetReferrer={dealModal.presetReferrer}
          clients={clients}
          deals={deals}
          referrers={referrerNames}
          onClose={() => setDealModal(null)}
          onSaved={() => { setDealModal(null); load(); }}
        />
      )}
      {rateModal && (
        <ChangeRateModal deal={rateModal} onClose={() => setRateModal(null)} onSaved={() => { setRateModal(null); load(); }} />
      )}
      {payModal && (
        <PayoutModal
          payout={payModal.payout || null}
          referrer={payModal.referrer}
          referrers={referrers}
          onClose={() => setPayModal(null)}
          onSaved={() => { setPayModal(null); load(); }}
        />
      )}
      {profileModal && (
        <ReferrerModal
          referrer={profileModal}
          onClose={() => setProfileModal(null)}
          onSaved={(key) => {
            setProfileModal(null);
            setDrawer(key);
            load();
          }}
        />
      )}
      {confirmEl}
    </div>
  );
}

export default ReferralsPage;
