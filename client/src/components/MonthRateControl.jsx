import React, { useState } from 'react';

// The commission rate line at the top of the IPRS / PRS detail popups.
//
// Shows the client master's rate, and lets this one month use a different rate
// for this society without touching the client master or any other month.
// `value` is the month's rate as typed ('' = use the client master).
function MonthRateControl({ defaultRate, value, onChange, editable, error }) {
  const [open, setOpen] = useState(false);
  const hasOverride = value !== '' && value != null;
  const showInput = editable && (open || hasOverride);

  return (
    <div className="month-rate">
      <div className="month-rate-line">
        <span>
          Commission Rate: <strong>{hasOverride ? (parseFloat(value) || 0) : (defaultRate || 0)}%</strong>
          {hasOverride
            ? <span className="month-rate-note"> for this month only &middot; Client Master rate is {defaultRate || 0}%</span>
            : <span className="month-rate-note"> from Client Master</span>}
        </span>
        {editable && !showInput && (
          <button type="button" className="month-rate-btn" onClick={() => setOpen(true)}>
            Use a different rate for this month
          </button>
        )}
      </div>

      {showInput && (
        <div className="month-rate-edit">
          <label htmlFor="month-rate-input">Rate for this month only</label>
          <div className="detail-input-prefix month-rate-input">
            <span>%</span>
            <input
              id="month-rate-input"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={value ?? ''}
              placeholder={String(defaultRate || 0)}
              onChange={(e) => onChange(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className="detail-input"
              autoFocus={open && !hasOverride}
            />
          </div>
          <button
            type="button"
            className="month-rate-btn"
            onClick={() => { onChange(''); setOpen(false); }}
          >
            Use Client Master rate ({defaultRate || 0}%)
          </button>
          <span className="month-rate-hint">Other months keep the Client Master rate.</span>
        </div>
      )}
      {error && <div className="cf-error">{error}</div>}
    </div>
  );
}

/** '' when blank, otherwise an error message if the rate is not 0-100. */
export function monthRateError(value) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  return Number.isNaN(n) || n < 0 || n > 100 ? 'Enter a rate between 0 and 100' : '';
}

export default MonthRateControl;
