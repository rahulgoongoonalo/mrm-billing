import React from 'react';
import { useApp } from '../contexts/AppContext';
import { buildClientMasterCsv, downloadCsv } from '../utils/clientProfile';
import { MONTH_LABELS } from '../utils/format';
import Icon from './Icon';

function ExportPage() {
  const { billingEntries, clients, showToast, settings } = useApp();
  const entries = Object.values(billingEntries);
  const { financialYear } = settings;
  const today = new Date().toISOString().split('T')[0];

  const exportAllData = () => {
    let csv = 'Client ID,Client Name,Month,Year,Commission Rate,IPRS,PRS,Sound Exchange,ISAMRA,ASCAP,PPL,MLC,Total Commission,Monthly Outstanding,Total Outstanding,Status\n';

    entries.forEach((e) => {
      csv += `${e.clientId},"${e.clientName}","${MONTH_LABELS[e.month]}",${e.year},${e.commissionRate || 0}%,${e.iprsAmount || 0},${e.prsAmount || 0},${e.soundExchangeAmount || 0},${e.isamraAmount || 0},${e.ascapAmount || 0},${e.pplAmount || 0},${e.mlcAmount || 0},${e.totalCommission || 0},${e.monthlyOutstanding || 0},${e.totalOutstanding || 0},${e.status}\n`;
    });

    downloadCsv(csv, `MRM_Royalty_Accounting_Export_${today}.csv`);
    showToast('Data exported successfully!');
  };

  const exportClients = () => {
    downloadCsv(buildClientMasterCsv(clients), `MRM_Clients_Export_${today}.csv`);
    showToast('Clients exported successfully!');
  };

  return (
    <div className="export-grid">
      <button className="export-card" onClick={exportAllData}>
        <span className="export-card-icon"><Icon name="file-text" size={22} /></span>
        <span className="export-card-text">
          <strong>Royalty Accounting Data</strong>
          <span>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} for
            FY {financialYear.startYear}&ndash;{financialYear.endYear}, one row per client and month.
          </span>
        </span>
        <span className="export-card-action">CSV</span>
      </button>

      <button className="export-card" onClick={exportClients}>
        <span className="export-card-icon"><Icon name="users" size={22} /></span>
        <span className="export-card-text">
          <strong>Client List</strong>
          <span>
            {clients.length} clients with type, societies, rates, GST ID and contact details.
          </span>
        </span>
        <span className="export-card-action">CSV</span>
      </button>
    </div>
  );
}

export default ExportPage;
