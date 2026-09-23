import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider } from './contexts/AppContext';
import AppShell from './components/AppShell';
import AuthModal from './components/AuthModal';
import Footer from './components/Footer';
import './styles/App.css';

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
    return (
      <>
        <AuthModal />
        <Footer variant="floating" />
      </>
    );
  }

  // Only load AppProvider after authentication
  return (
    <AppProvider>
      <AppShell />
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
