import React, { useState, useEffect, useMemo } from 'react';

const r = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

const emptyRow = { date: '', receivedGbp: '', gbpToInrRate: '', receivedInr: '' };

function PRSDetailModal({ title, entries = [], commissionRate, onSave, onClose, isFormReadOnly, fallbackGbp, fallbackRate, fallbackAmount }) {
  const [rows, setRows] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (entries.length > 0) {
      setRows(entries.map(e => ({
        date: e.date || '',
        receivedGbp: e.receivedGbp ?? '',
        gbpToInrRate: e.gbpToInrRate ?? '',
        receivedInr: e.receivedInr ?? '',
      })));
      setIsEditing(false);
    } else if ((fallbackGbp && parseFloat(fallbackGbp) > 0) || (fallbackAmount && parseFloat(fallbackAmount) > 0)) {
      // Pre-populate first row with existing DB values
      setRows([{
        date: '',
        receivedGbp: fallbackGbp || '',
        gbpToInrRate: fallbackRate || '',
        receivedInr: fallbackAmount || '',
      }]);
      setIsEditing(true);
    } else {
      setRows([{ ...emptyRow }]);
      setIsEditing(true);
    }
  }, [entries, fallbackGbp, fallbackRate, fallbackAmount]);

  const rate = (parseFloat(commissionRate) || 0) / 100;

  const computed = useMemo(() => {
    return rows.map(row => {
      const gbp = parseFloat(row.receivedGbp) || 0;
      const convRate = parseFloat(row.gbpToInrRate) || 0;
      const manualInr = parseFloat(row.receivedInr) || 0;
      // Use manual INR if provided, otherwise calculate from GBP * Rate
      const receivedInr = manualInr || r(gbp * convRate);
      const commission = r(receivedInr * rate);
      return { receivedInr, commission };
    });
  }, [rows, rate]);

  const totals = useMemo(() => {
    let totalGbp = 0, totalInr = 0, totalCommission = 0;
    rows.forEach((row, i) => {
      totalGbp += parseFloat(row.receivedGbp) || 0;
      totalInr += computed[i]?.receivedInr || 0;
      totalCommission += computed[i]?.commission || 0;
    });
    return {
      totalGbp: r(totalGbp),
      totalInr: r(totalInr),
      totalCommission: r(totalCommission),
    };
  }, [rows, computed]);

  // When GBP or Rate changes, auto-update receivedInr if user hasn't manually set it
  const handleChange = (index, field, value) => {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      // If GBP or Rate changed, recalculate INR (clear manual override)
      if (field === 'receivedGbp' || field === 'gbpToInrRate') {
        const gbp = parseFloat(field === 'receivedGbp' ? value : next[index].receivedGbp) || 0;
        const convRate = parseFloat(field === 'gbpToInrRate' ? value : next[index].gbpToInrRate) || 0;
        if (gbp && convRate) {
          next[index].receivedInr = r(gbp * convRate);
        }
      }
      return next;
    });
  };

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
      receivedGbp: parseFloat(row.receivedGbp) || 0,
      gbpToInrRate: parseFloat(row.gbpToInrRate) || 0,
      receivedInr: computed[i].receivedInr,
      commission: computed[i].commission,
    }));
    onSave(data, totals.totalInr, totals.totalCommission);
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
            <span>Commission Rate: <strong>{commissionRate || 0}%</strong></span>
            <span>Commission is auto-calculated on Received Royalty Amount (INR)</span>
          </div>

          <div className="royalty-detail-table-wrapper">
            <table className="royalty-detail-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Date of Royalty Received</th>
                  <th>Received Royalty (GBP)</th>
                  <th>GBP to INR Rate</th>
                  <th>Received Royalty Amount (INR)</th>
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
                        <div className="detail-input-prefix">
                          <span>£</span>
                          <input
                            type="number"
                            value={row.receivedGbp}
                            onChange={(e) => handleChange(i, 'receivedGbp', e.target.value)}
                            placeholder="0.00"
                            className="detail-input"
                            step="0.01"
                          />
                        </div>
                      ) : (
                        <span className="detail-value amount">£ {(parseFloat(row.receivedGbp) || 0).toFixed(2)}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className="detail-input-prefix">
                          <span>£→₹</span>
                          <input
                            type="number"
                            value={row.gbpToInrRate}
                            onChange={(e) => handleChange(i, 'gbpToInrRate', e.target.value)}
                            placeholder="0.00"
                            className="detail-input"
                            step="0.01"
                          />
                        </div>
                      ) : (
                        <span className="detail-value amount">{(parseFloat(row.gbpToInrRate) || 0).toFixed(2)}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className="detail-input-prefix">
                          <span>₹</span>
                          <input
                            type="number"
                            value={row.receivedInr !== '' && row.receivedInr !== undefined ? row.receivedInr : (computed[i]?.receivedInr || '')}
                            onChange={(e) => handleChange(i, 'receivedInr', e.target.value)}
                            placeholder={computed[i]?.receivedInr?.toFixed(2) || '0.00'}
                            className="detail-input"
                            step="0.01"
                          />
                        </div>
                      ) : (
                        <span className="detail-value amount">₹ {computed[i]?.receivedInr?.toFixed(2) || '0.00'}</span>
                      )}
                    </td>
                    <td>
                      <span className="detail-value computed">₹ {computed[i]?.commission?.toFixed(2) || '0.00'}</span>
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
                  <td colSpan={2}><strong>TOTAL</strong></td>
                  <td><strong className="computed">£ {totals.totalGbp.toFixed(2)}</strong></td>
                  <td></td>
                  <td><strong className="computed">₹ {totals.totalInr.toFixed(2)}</strong></td>
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

export default PRSDetailModal;
