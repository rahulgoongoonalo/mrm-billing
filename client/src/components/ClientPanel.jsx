import React, { useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';

function ClientPanel() {
  const { clients, selectedClient, selectClient, currentMonth, billingEntries, clientsLoading } = useApp();
  const [searchTerm, setSearchTerm] = useState('');

  // Filter clients based on search
  const filteredClients = useMemo(() => {
    if (!searchTerm) return clients;
    const term = searchTerm.toLowerCase();
    return clients.filter(client =>
      client.name.toLowerCase().includes(term) ||
      client.clientId.toLowerCase().includes(term)
    );
  }, [clients, searchTerm]);

  // Determine entry status for each client
  const getClientStatus = (clientId) => {
    const key = `${clientId}_${currentMonth}`;
    const entry = billingEntries[key];
    if (!entry) return null;
    return entry.status || entry.invoiceStatus;
  };

  return (
    <aside className="client-panel">
      <div className="client-panel-header">
        <h3>Select Client</h3>
        <div className="client-search">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input
            type="text"
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <div className="client-list">
        {clientsLoading ? (
          <div className="empty-state">
            <p>Loading clients...</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="empty-state">
            <h3>No clients found</h3>
            <p>Try adjusting your search or add a new client</p>
          </div>
        ) : (
          filteredClients.map(client => {
            const status = getClientStatus(client.clientId);
            return (
              <div
                key={client.clientId}
                className={`client-item ${selectedClient?.clientId === client.clientId ? 'selected' : ''} ${status === 'draft' ? 'has-draft' : ''} ${status === 'submitted' ? 'has-submitted' : ''}`}
                onClick={() => selectClient(client)}
              >
                <div className="client-name">{client.name}</div>
                <div className="client-type">{client.type} • {client.commissionRate ?? (client.fee * 100).toFixed(0)}% Commission</div>
                <div className="client-id">{client.clientId}</div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

export default ClientPanel;
