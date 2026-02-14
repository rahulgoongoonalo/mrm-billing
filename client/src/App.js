import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider, useApp } from './contexts/AppContext';
import Header from './components/Header';
import MonthTabs from './components/MonthTabs';
import Legend from './components/Legend';
import ClientPanel from './components/ClientPanel';
import BillingForm from './components/BillingForm';
import Toast from './components/Toast';
import Modals from './components/Modals';
import ReportsPanel from './components/ReportsPanel';
import AuthModal from './components/AuthModal';
import './styles/App.css';

function AuthenticatedApp() {
  const { activeModal, closeModal } = useApp();

  return (
    <>
      <div className="container">
        <Header />
        <MonthTabs />
        <Legend />
        <div className="content-grid">
          <ClientPanel />
          <BillingForm />
        </div>
        <Toast />
        <Modals />
      </div>
      {activeModal === 'reports' && <ReportsPanel onClose={closeModal} />}
    </>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // Show auth modal if not authenticated
  if (!isAuthenticated) {
    return <AuthModal />;
  }

  // Only load AppProvider after authentication
  return (
    <AppProvider>
      <AuthenticatedApp />
    </AppProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
