import React, { useState } from 'react';
import { useApp } from '../contexts/AppContext';

function SettingsPage() {
  const { settings, updateFinancialYear } = useApp();
  const [fyStart, setFyStart] = useState(settings.financialYear.startYear);
  const [loading, setLoading] = useState(false);

  const dirty = parseInt(fyStart, 10) !== settings.financialYear.startYear;

  const handleSave = async () => {
    if (!dirty) return;
    setLoading(true);
    try {
      await updateFinancialYear(parseInt(fyStart, 10));
    } catch (error) {
      // Error is surfaced as a toast by the context.
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-card page-card--narrow">
      <div className="page-card-header">
        <h2>Financial Year</h2>
        <p>
          Every screen in the app - entries, reports and exports - shows data for
          the selected financial year.
        </p>
      </div>
      <div className="page-card-body">
        <div className="input-group">
          <label htmlFor="fy-start">Financial year start</label>
          <select
            id="fy-start"
            value={fyStart}
            onChange={(e) => setFyStart(e.target.value)}
          >
            {Array.from({ length: 13 }, (_, i) => 2023 + i).map((year) => (
              <option key={year} value={year}>FY {year}-{year + 1}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="page-card-footer">
        <button
          className="btn btn-secondary"
          onClick={() => setFyStart(settings.financialYear.startYear)}
          disabled={!dirty || loading}
        >
          Reset
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!dirty || loading}
        >
          {loading ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

export default SettingsPage;
