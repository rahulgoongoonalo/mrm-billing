import React, { useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import ClientFormModal from './ClientFormModal';

// Remove Client Modal
function RemoveClientModal({ onClose }) {
  const { clients, removeClient } = useApp();
  const [loading, setLoading] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter(client =>
      (client.name || '').toLowerCase().includes(term) ||
      (client.clientId || '').toLowerCase().includes(term) ||
      (client.type || '').toLowerCase().includes(term) ||
      (client.phone || '').toLowerCase().includes(term) ||
      (client.email || '').toLowerCase().includes(term)
    );
  }, [clients, searchTerm]);

  const handleRemove = async (clientId, name) => {
    if (window.confirm(`Remove ${name} (${clientId})?`)) {
      setLoading(clientId);
      try {
        await removeClient(clientId);
      } catch (error) {
        // Error handled in context
      } finally {
        setLoading(null);
      }
    }
  };

  return (
    <div className="modal">
      <div className="modal-header">
        <h3>Remove Client</h3>
        <button className="modal-close" onClick={onClose}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div className="modal-body">
        {clients.length === 0 ? (
          <div className="empty-state">
            <p>No clients to remove</p>
          </div>
        ) : (
          <>
          <div className="client-search" style={{ marginBottom: 8 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input
              type="text"
              placeholder="Search by name, MRM ID, type, phone or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 2px 12px' }}>
            {searchTerm.trim()
              ? `${filteredClients.length} of ${clients.length} clients match`
              : `${clients.length} clients`}
          </div>
          {filteredClients.length === 0 ? (
            <div className="empty-state">
              <p>No clients match &ldquo;{searchTerm.trim()}&rdquo;</p>
            </div>
          ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {filteredClients.map(client => (
              <div
                key={client.clientId}
                style={{
                  padding: '14px 16px',
                  background: 'var(--bg-input)',
                  borderRadius: 10,
                  marginBottom: 10,
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{client.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--accent-blue)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {client.clientId}
                    </span>
                    {' • '}{client.type}
                  </div>
                </div>
                <button
                  className="btn btn-danger"
                  style={{ padding: '8px 16px', fontSize: 12 }}
                  onClick={() => handleRemove(client.clientId, client.name)}
                  disabled={loading === client.clientId}
                >
                  {loading === client.clientId ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
          )}
          </>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// Modals are for actions taken on top of a page. Anything you navigate *to*
// - settings, entries, export, the reports - is a page in the sidebar.
function Modals() {
  const { activeModal, closeModal } = useApp();

  if (!activeModal) return null;
  if (activeModal === 'addClient') return <ClientFormModal onClose={closeModal} />;

  return (
    <div className="modal-overlay show" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      {activeModal === 'removeClient' && <RemoveClientModal onClose={closeModal} />}
    </div>
  );
}

export default Modals;
