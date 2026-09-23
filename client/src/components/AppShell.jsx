import React, { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { NAV_IDS, DEFAULT_VIEW, REPORT_VIEWS, getNavItem } from '../navigation';
import useHashRoute from '../hooks/useHashRoute';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import DataEntryPage from './DataEntryPage';
import EntriesPage from './EntriesPage';
import ExportPage from './ExportPage';
import SettingsPage from './SettingsPage';
import ReportsPanel from './ReportsPanel';
import Toast from './Toast';
import Modals from './Modals';

function AppShell() {
  const { closeModal } = useApp();
  const [view, navigate] = useHashRoute(NAV_IDS, DEFAULT_VIEW);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navItem = getNavItem(view);

  // Moving to another page closes the drawer and any modal opened from the
  // page being left, so nothing is stranded over the new one.
  useEffect(() => {
    setSidebarOpen(false);
    closeModal();
    document.querySelector('.app-content')?.scrollTo({ top: 0 });
  }, [view, closeModal]);

  return (
    <div className="app-shell">
      <Sidebar
        activeView={view}
        onNavigate={navigate}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="app-main">
        <TopBar
          navItem={navItem}
          onOpenSidebar={() => setSidebarOpen(true)}
          onNavigate={navigate}
        />

        <main className="app-content">
          {view === 'data-entry' && <DataEntryPage />}
          {view === 'entries' && <EntriesPage />}
          {view === 'export' && <ExportPage />}
          {view === 'settings' && <SettingsPage />}
          {REPORT_VIEWS.includes(view) && (
            <ReportsPanel embedded activeReport={view} onNavigate={navigate} />
          )}
        </main>
      </div>

      <Toast />
      <Modals />
    </div>
  );
}

export default AppShell;
