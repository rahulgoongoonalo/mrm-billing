import React, { useEffect, useRef, useState } from 'react';
import { COMPANY, COMPANY_LIST, switchCompany } from '../company';
import Icon from './Icon';

// The company's logo on a white tile (both logos are drawn for a light
// background), sized by the tile class.
const markSrc = (c) => `${process.env.PUBLIC_URL}/${c.mark}`;
function CompanyMark({ company, className = '' }) {
  return (
    <span className={`company-mark ${className}`} data-company={company.key}>
      <img src={markSrc(company)} alt={company.name} />
    </span>
  );
}

// Picks which company's portal this tab shows. Switching reloads the app on
// the other company's data, so the two never mix on screen.
//
//   sidebar - the brand block at the top of the sidebar opens a menu
//   login   - a two-way toggle above the sign-in form
function CompanySwitcher({ variant = 'sidebar', subtitle }) {
  const [open, setOpen] = useState(false);
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

  if (variant === 'login') {
    return (
      <div className="company-toggle" role="radiogroup" aria-label="Company">
        {COMPANY_LIST.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={c.key === COMPANY.key}
            className={`company-toggle-opt${c.key === COMPANY.key ? ' is-current' : ''}`}
            data-company={c.key}
            onClick={() => switchCompany(c.key)}
          >
            {c.brand}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="company-switch" ref={ref}>
      <button
        type="button"
        className={`company-switch-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch company"
      >
        <CompanyMark company={COMPANY} className="company-mark-lg" />
        <div className="sidebar-brand">
          <strong>{COMPANY.appName}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <Icon name="chevronDown" size={16} className="company-switch-chev" />
      </button>

      {open && (
        <div className="company-pop" role="menu" aria-label="Switch company">
          <div className="company-pop-head">Switch company</div>
          {COMPANY_LIST.map((c) => {
            const current = c.key === COMPANY.key;
            return (
              <button
                key={c.key}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                className={`company-pop-opt${current ? ' is-current' : ''}`}
                data-company={c.key}
                onClick={() => (current ? setOpen(false) : switchCompany(c.key))}
              >
                <CompanyMark company={c} />
                <span className="company-pop-text">
                  <b>{c.name}</b>
                  <small>{c.appName}</small>
                </span>
                {current && <Icon name="check" size={16} />}
              </button>
            );
          })}
          <p className="company-pop-note">Each company has its own clients, entries and reports.</p>
        </div>
      )}
    </div>
  );
}

export default CompanySwitcher;
