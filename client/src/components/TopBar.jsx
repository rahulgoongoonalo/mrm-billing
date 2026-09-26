import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import Icon from './Icon';

const FY_YEARS = Array.from({ length: 13 }, (_, i) => 2023 + i);

// Switches the financial year in place, from a floating picker, so the page
// underneath - the selected client, search, month and form - stays put.
function FyPicker() {
  const { settings, updateFinancialYear } = useApp();
  const { financialYear } = settings;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = async (year) => {
    if (saving) return;
    if (year === financialYear.startYear) { setOpen(false); return; }
    setSaving(year);
    try {
      await updateFinancialYear(year);
      setOpen(false);
    } catch (error) {
      // Error is surfaced as a toast by the context.
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="topbar-fy-wrap" ref={ref}>
      <button
        className={`topbar-fy${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change financial year"
      >
        <Icon name="calendar" size={16} />
        <span>FY {financialYear.startYear}&ndash;{financialYear.endYear}</span>
      </button>

      {open && (
        <div className="fy-pop" role="listbox" aria-label="Financial year">
          <div className="fy-pop-head">
            <b>Financial Year</b>
            <span>Switches every screen; you stay on this page.</span>
          </div>
          <div className="fy-pop-grid">
            {FY_YEARS.map((year) => {
              const current = year === financialYear.startYear;
              return (
                <button
                  key={year}
                  role="option"
                  aria-selected={current}
                  className={`fy-pop-opt${current ? ' is-current' : ''}`}
                  onClick={() => pick(year)}
                  disabled={!!saving}
                >
                  {saving === year ? 'Loading…' : `${year}–${String(year + 1).slice(-2)}`}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TopBar({ navItem, onOpenSidebar }) {
  return (
    <header className="app-topbar">
      <button className="topbar-menu" onClick={onOpenSidebar} aria-label="Open navigation">
        <Icon name="menu" size={20} />
      </button>

      <div className="topbar-title">
        <h1>{navItem.title}</h1>
        <p>{navItem.subtitle}</p>
      </div>

      <FyPicker />
    </header>
  );
}

export default TopBar;
