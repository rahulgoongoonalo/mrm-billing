import React, { useState, useEffect, useMemo } from 'react';

const r = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

// A commission typed for the month, shared across the lines in proportion to
// their amounts (the last line takes the rounding) - the same split the server
// stores when the commission was typed on the main form.
const shareOut = (amounts, typed) => {
  const total = amounts.reduce((t, a) => t + a, 0);
  let given = 0;
  return amounts.map((a, i) => {
    const share = i === amounts.length - 1 ? r(typed - given) : r(total ? typed * (a / total) : 0);
    given = r(given + share);
    return share;
  });
};

const emptyRow = { commission: '', date: '', emailDate: '', receivedAmount: '', tdsDeduction: '' };

function RoyaltyDetailModal({ title, entries = [], commissionRate, typedCommission, onSave, onClose, isFormReadOnly, fallbackAmount }) {
  // commissionRate is the client master's rate for this society.
  // typedCommission is set when this month's commission is unlocked (typed by
  // hand instead of calculated); each line's commission is then typed here.
  const typed = typedCommission == null ? null : (parseFloat(typedCommission) || 0);
  const [unlocked, setUnlocked] = useState(typed != null);
  const [rows, setRows] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (entries.length > 0) {
      const loaded = entries.map(e => ({
        date: e.date || '',
        emailDate: e.emailDate || '',
        receivedAmount: e.receivedAmount ?? '',
        tdsDeduction: e.tdsDeduction ?? '',
        commission: e.commission ?? '',
      }));
      if (typed != null) {
        const saved = r(loaded.reduce((t, l) => t + (parseFloat(l.commission) || 0), 0));
        if (saved !== r(typed)) {
          const shares = shareOut(entries.map((e) => Number(e.receivedAmount) || 0), typed);
          loaded.forEach((l, i) => { l.commission = shares[i]; });
        }
      }
      setRows(loaded);
      setIsEditing(false);
    } else if (fallbackAmount && parseFloat(fallbackAmount) > 0) {
      // Pre-populate first row with existing amount from DB
      setRows([{ date: '', emailDate: '', receivedAmount: fallbackAmount, tdsDeduction: '', commission: typed != null ? typed : '' }]);
      setIsEditing(true);
    } else {
      setRows([{ ...emptyRow }]);
      setIsEditing(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, fallbackAmount]);

  const rate = (parseFloat(commissionRate) || 0) / 100;

  const computed = useMemo(() => {
    return rows.map(row => {
      const received = parseFloat(row.receivedAmount) || 0;
      const tds = parseFloat(row.tdsDeduction) || 0;
      const afterTds = r(received - tds);
      const commission = unlocked ? r(parseFloat(row.commission) || 0) : r(received * rate);
      return { afterTds, commission, received };
    });
  }, [rows, rate, unlocked]);

  const totals = useMemo(() => {
    let totalReceived = 0, totalTds = 0, totalAfterTds = 0, totalCommission = 0;
    rows.forEach((row, i) => {
      totalReceived += parseFloat(row.receivedAmount) || 0;
      totalTds += parseFloat(row.tdsDeduction) || 0;
      totalAfterTds += computed[i]?.afterTds || 0;
      totalCommission += computed[i]?.commission || 0;
    });
    return {
      totalReceived: r(totalReceived),
      totalTds: r(totalTds),
      totalAfterTds: r(totalAfterTds),
      totalCommission: r(totalCommission),
    };
  }, [rows, computed]);

  const handleChange = (index, field, value) => {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Unlock: each line's commission becomes typeable, starting from what the
  // rate gives now. Lock: back to the client master rate.
  const unlock = () => {
    setRows((prev) => prev.map((row, i) => ({ ...row, commission: computed[i]?.commission ?? 0 })));
    setUnlocked(true);
  };
  const lock = () => setUnlocked(false);

  const addRow = () => {
    setRows(prev => [...prev, { ...emptyRow }]);
  };

  const removeRow = (index) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const data = rows.map((row, i) => ({
      date: row.date,
      emailDate: row.emailDate,
      receivedAmount: parseFloat(row.receivedAmount) || 0,
      tdsDeduction: parseFloat(row.tdsDeduction) || 0,
      afterTdsAmount: computed[i].afterTds,
      commission: computed[i].commission,
    }));
    onSave(data, totals.totalReceived, totals.totalCommission, unlocked ? totals.totalCommission : null);
    setIsEditing(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal royalty-detail-modal">
        <div className="modal-header">
          <h3>{title} — Royalty Details</h3>
          <button className="modal-close" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="royalty-detail-info">
            {unlocked ? (
              <span>Commission <strong className="unlocked-text">unlocked</strong> for this month &middot; Client Master rate is {parseFloat(commissionRate) || 0}%</span>
            ) : (
              <span>Commission Rate: <strong>{parseFloat(commissionRate) || 0}%</strong></span>
            )}
            {isEditing && !isFormReadOnly ? (
              <button type="button" className={`commission-lock-btn${unlocked ? ' is-unlocked' : ''}`} onClick={unlocked ? lock : unlock}>
                {unlocked ? `Lock (back to ${parseFloat(commissionRate) || 0}%)` : 'Unlock commission for this month'}
              </button>
            ) : (
              <span>{unlocked ? 'Commission typed by hand on each line' : 'Commission is auto-calculated on Received Royalty Amount'}</span>
            )}
          </div>

          <div className="royalty-detail-table-wrapper">
            <table className="royalty-detail-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Date of Royalty Received</th>
                  <th>Email Received</th>
                  <th>Received Royalty Amount</th>
                  <th>TDS Deduction</th>
                  <th>After TDS Received Royalty</th>
                  <th>Commission</th>
                  {isEditing && <th style={{ width: 50 }}></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="row-num">{i + 1}</td>
                    <td>
                      {isEditing ? (
                        <input
                          type="date"
                          value={row.date}
                          onChange={(e) => handleChange(i, 'date', e.target.value)}
                          className="detail-input"
                        />
                      ) : (
                        <span className="detail-value">{row.date ? new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="date"
                          value={row.emailDate}
                          onChange={(e) => handleChange(i, 'emailDate', e.target.value)}
                          className="detail-input"
                        />
                      ) : (
                        <span className="detail-value">{row.emailDate ? new Date(row.emailDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className="detail-input-prefix">
                          <span>₹</span>
                          <input
                            type="number"
                            value={row.receivedAmount}
                            onChange={(e) => handleChange(i, 'receivedAmount', e.target.value)}
                            placeholder="0.00"
                            className="detail-input"
                            step="0.01"
                          />
                        </div>
                      ) : (
                        <span className="detail-value amount">₹ {(parseFloat(row.receivedAmount) || 0).toFixed(2)}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className="detail-input-prefix">
                          <span>₹</span>
                          <input
                            type="number"
                            value={row.tdsDeduction}
                            onChange={(e) => handleChange(i, 'tdsDeduction', e.target.value)}
                            placeholder="0.00"
                            className="detail-input"
                            step="0.01"
                          />
                        </div>
                      ) : (
                        <span className="detail-value amount">₹ {(parseFloat(row.tdsDeduction) || 0).toFixed(2)}</span>
                      )}
                    </td>
                    <td>
                      <span className="detail-value computed">₹ {computed[i]?.afterTds?.toFixed(2) || '0.00'}</span>
                    </td>
                    <td>
                      {isEditing && unlocked ? (
                        <div className="detail-input-prefix commission-unlocked">
                          <span>₹</span>
                          <input
                            type="number"
                            min="0"
                            value={row.commission ?? ''}
                            onChange={(e) => handleChange(i, 'commission', e.target.value)}
                            placeholder="0.00"
                            className="detail-input"
                            step="0.01"
                          />
                        </div>
                      ) : (
                        <span className="detail-value computed">₹ {computed[i]?.commission?.toFixed(2) || '0.00'}</span>
                      )}
                    </td>
                    {isEditing && (
                      <td>
                        {rows.length > 1 && (
                          <button className="detail-remove-btn" onClick={() => removeRow(i)} title="Remove row">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td colSpan={3}><strong>TOTAL</strong></td>
                  <td><strong className="computed">₹ {totals.totalReceived.toFixed(2)}</strong></td>
                  <td><strong className="computed">₹ {totals.totalTds.toFixed(2)}</strong></td>
                  <td><strong className="computed">₹ {totals.totalAfterTds.toFixed(2)}</strong></td>
                  <td><strong className="computed">₹ {totals.totalCommission.toFixed(2)}</strong></td>
                  {isEditing && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>

          {isEditing && (
            <button className="detail-add-btn" onClick={addRow}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Row
            </button>
          )}
        </div>

        <div className="modal-footer">
          {isEditing ? (
            <>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-success" onClick={handleSave}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Save
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
              {!isFormReadOnly && (
                <button className="btn btn-warning" onClick={handleEdit}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default RoyaltyDetailModal;
