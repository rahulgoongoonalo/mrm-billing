import React from 'react';
import { useApp } from '../contexts/AppContext';
import Icon from './Icon';

function TopBar({ navItem, onOpenSidebar, onNavigate }) {
  const { settings } = useApp();
  const { financialYear } = settings;

  return (
    <header className="app-topbar">
      <button className="topbar-menu" onClick={onOpenSidebar} aria-label="Open navigation">
        <Icon name="menu" size={20} />
      </button>

      <div className="topbar-title">
        <h1>{navItem.title}</h1>
        <p>{navItem.subtitle}</p>
      </div>

      <button
        className="topbar-fy"
        onClick={() => onNavigate('settings')}
        title="Change financial year in Settings"
      >
        <Icon name="calendar" size={16} />
        <span>FY {financialYear.startYear}&ndash;{financialYear.endYear}</span>
      </button>
    </header>
  );
}

export default TopBar;
