import React, { useState } from 'react';
import { useApp } from '../contexts/AppContext';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

const monthLabels = {
  apr: 'April', may: 'May', jun: 'June', jul: 'July',
  aug: 'August', sep: 'September', oct: 'October', nov: 'November',
  dec: 'December', jan: 'January', feb: 'February', mar: 'March',
};

// Add Client Modal
function AddClientModal({ onClose }) {
  const { addClient, showToast } = useApp();
  const [formData, setFormData] = useState({
    clientId: '',
    name: '',
    type: 'Composer',
    fee: '0.15',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.clientId || !formData.name) {
      showToast('Please fill in all required fields', 'warning');
      return;
    }

    setLoading(true);
    try {
      const fee = parseFloat(formData.fee);
      await addClient({
        ...formData,
        fee,
        commissionRate: fee * 100,
      });
      onClose();
    } catch (error) {
      // Error is handled in context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal-header">
        <h3>Add New Client</h3>
        <button className="modal-close" onClick={onClose}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="input-group" style={{ marginBottom: 16 }}>
            <label>Client ID *</label>
            <input
              type="text"
              value={formData.clientId}
              onChange={(e) => setFormData({ ...formData, clientId: e.target.value.toUpperCase() })}
              placeholder="e.g., MRM001"
              required
            />
          </div>
          <div className="input-group" style={{ marginBottom: 16 }}>
            <label>Client Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Full name"
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="input-group">
              <label>Client Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="Composer">Composer</option>
                <option value="Lyricist">Lyricist</option>
                <option value="Singer">Singer</option>
                <option value="Music Director">Music Director</option>
                <option value="Publisher">Publisher</option>
                <option value="Producer">Producer</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="input-group">
              <label>Service Fee (%)</label>
              <select
                value={formData.fee}
                onChange={(e) => setFormData({ ...formData, fee: e.target.value })}
              >
                <option value="0.05">5%</option>
                <option value="0.07">7%</option>
                <option value="0.10">10%</option>
                <option value="0.12">12%</option>
                <option value="0.15">15%</option>
                <option value="0.17">17%</option>
                <option value="0.20">20%</option>
                <option value="0.25">25%</option>
                <option value="0.27">27%</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-success" disabled={loading}>
            {loading ? 'Adding...' : 'Add Client'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Remove Client Modal
function RemoveClientModal({ onClose }) {
  const { clients, removeClient } = useApp();
  const [loading, setLoading] = useState(null);

  const handleRemove = async (clientId) => {
    if (window.confirm('Are you sure you want to remove this client?')) {
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
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {clients.map(client => (
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
                  onClick={() => handleRemove(client.clientId)}
                  disabled={loading === client.clientId}
                >
                  {loading === client.clientId ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// Settings Modal
function SettingsModal({ onClose }) {
  const { settings, updateFinancialYear } = useApp();
  const [fyStart, setFyStart] = useState(settings.financialYear.startYear);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      if (fyStart !== settings.financialYear.startYear) {
        await updateFinancialYear(parseInt(fyStart));
      }
      onClose();
    } catch (error) {
      // Error handled in context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal-header">
        <h3>Settings</h3>
        <button className="modal-close" onClick={onClose}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div className="modal-body">
        <div className="input-group" style={{ marginBottom: 16 }}>
          <label>Financial Year Start</label>
          <select value={fyStart} onChange={(e) => setFyStart(e.target.value)}>
            {[2023, 2024, 2025, 2026, 2027, 2028].map(year => (
              <option key={year} value={year}>FY {year}-{year + 1}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// View Entries Modal
function ViewEntriesModal({ onClose }) {
  const { billingEntries } = useApp();
  const entries = Object.values(billingEntries);

  return (
    <div className="modal" style={{ maxWidth: 800 }}>
      <div className="modal-header">
        <h3>All Royalty Accounting Entries</h3>
        <button className="modal-close" onClick={onClose}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div className="modal-body">
        {entries.length === 0 ? (
          <div className="empty-state">
            <h3>No Entries Yet</h3>
            <p>Start by selecting a client and entering royalty accounting data</p>
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {entries.map((entry, index) => (
              <div
                key={index}
                style={{
                  padding: 16,
                  background: 'var(--bg-input)',
                  borderRadius: 10,
                  marginBottom: 12,
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontWeight: 600 }}>{entry.clientName}</span>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: entry.status === 'submitted' ? 'rgba(146, 208, 80, 0.2)' : 'rgba(240, 160, 64, 0.2)',
                      color: entry.status === 'submitted' ? 'var(--accent-green)' : 'var(--accent-orange)',
                    }}
                  >
                    {entry.status || 'draft'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Month: <strong style={{ color: 'var(--text-primary)' }}>{monthLabels[entry.month]} {entry.year}</strong>
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Commission: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(entry.totalCommission)}</strong>
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Monthly O/S: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(entry.monthlyOutstanding)}</strong>
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Total O/S: <strong style={{ color: 'var(--accent-blue)' }}>{formatCurrency(entry.totalOutstanding)}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// Export Modal
function ExportModal({ onClose }) {
  const { billingEntries, clients, showToast } = useApp();
  const entries = Object.values(billingEntries);

  const exportAllData = () => {
    let csv = 'Client ID,Client Name,Month,Year,Commission Rate,IPRS,PRS,Sound Exchange,ISAMRA,ASCAP,PPL,Total Commission,Monthly Outstanding,Total Outstanding,Status\n';

    entries.forEach(e => {
      csv += `${e.clientId},"${e.clientName}","${monthLabels[e.month]}",${e.year},${e.commissionRate || 0}%,${e.iprsAmount || 0},${e.prsAmount || 0},${e.soundExchangeAmount || 0},${e.isamraAmount || 0},${e.ascapAmount || 0},${e.pplAmount || 0},${e.totalCommission || 0},${e.monthlyOutstanding || 0},${e.totalOutstanding || 0},${e.status}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MRM_Royalty_Accounting_Export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Data exported successfully!');
  };

  const exportClients = () => {
    let csv = 'Client ID,Client Name,Type,Service Fee\n';

    clients.forEach(client => {
      csv += `${client.clientId},"${client.name}","${client.type}",${(client.fee * 100).toFixed(0)}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MRM_Clients_Export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Clients exported successfully!');
  };

  return (
    <div className="modal">
      <div className="modal-header">
        <h3>Export Data</h3>
        <button className="modal-close" onClick={onClose}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div className="modal-body">
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
          Choose what data you want to export as CSV file.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            className="btn btn-secondary"
            style={{ justifyContent: 'flex-start', padding: '16px 20px' }}
            onClick={exportAllData}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600 }}>Export All Royalty Accounting Data</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{entries.length} entries</div>
            </div>
          </button>
          <button
            className="btn btn-secondary"
            style={{ justifyContent: 'flex-start', padding: '16px 20px' }}
            onClick={exportClients}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600 }}>Export Client List</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{clients.length} clients</div>
            </div>
          </button>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// Main Modals Component
function Modals() {
  const { activeModal, closeModal } = useApp();

  if (!activeModal || activeModal === 'reports') return null;

  return (
    <div className="modal-overlay show" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      {activeModal === 'addClient' && <AddClientModal onClose={closeModal} />}
      {activeModal === 'removeClient' && <RemoveClientModal onClose={closeModal} />}
      {activeModal === 'settings' && <SettingsModal onClose={closeModal} />}
      {activeModal === 'viewEntries' && <ViewEntriesModal onClose={closeModal} />}
      {activeModal === 'export' && <ExportModal onClose={closeModal} />}
    </div>
  );
}

export default Modals;
