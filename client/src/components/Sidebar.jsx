import React from 'react';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { NAV_GROUPS } from '../navigation';
import Icon from './Icon';
import Footer from './Footer';

function Sidebar({ activeView, onNavigate, open, onClose }) {
  const { settings } = useApp();
  const { user, logout } = useAuth();
  const { financialYear } = settings;

  return (
    <>
      <div
        className={`sidebar-scrim ${open ? 'show' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`app-sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="app-sidebar-header">
          <div className="logo-icon sidebar-logo">MRM</div>
          <div className="sidebar-brand">
            <strong>MRM Billing</strong>
            <span>FY {financialYear.startYear}&ndash;{financialYear.endYear}</span>
          </div>
          <button className="sidebar-close" onClick={onClose} aria-label="Close navigation">
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="app-sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div className="nav-section" key={group.title}>
              <div className="nav-section-title">{group.title}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                  onClick={() => onNavigate(item.id)}
                  aria-current={activeView === item.id ? 'page' : undefined}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{(user?.name || '?').charAt(0).toUpperCase()}</div>
            <div className="sidebar-user-text">
              <strong>{user?.name}</strong>
              <span>{user?.role === 'admin' ? 'Admin' : 'Team member'}</span>
            </div>
          </div>
          <button className="nav-item sidebar-logout" onClick={logout}>
            <Icon name="logout" />
            <span>Logout</span>
          </button>
          <Footer variant="sidebar" />
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
