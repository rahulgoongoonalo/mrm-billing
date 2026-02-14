import React from 'react';
import { useApp } from '../contexts/AppContext';
import { useBillingForm } from '../hooks/useBillingForm';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
};

const monthLabels = {
  apr: 'April', may: 'May', jun: 'June', jul: 'July',
  aug: 'August', sep: 'September', oct: 'October', nov: 'November',
  dec: 'December', jan: 'January', feb: 'February', mar: 'March',
};

function BillingForm() {
  const { selectedClient, currentMonth, settings, showToast } = useApp();
  const {
    formData,
    calculations,
    handleInputChange,
    clearForm,
    handleSaveAsDraft,
    handleSubmit,
    handleDelete,
    status,
    isReadOnly,
    enableEdit,
  } = useBillingForm();

  const { financialYear } = settings;
  const year = ['jan', 'feb', 'mar'].includes(currentMonth)
    ? financialYear.endYear
    : financialYear.startYear;
  const monthLabel = `${monthLabels[currentMonth]} ${year}`;

  const onSaveDraft = async () => {
    try { await handleSaveAsDraft(); } catch (error) { showToast(error.message, 'error'); }
  };

  const onSubmit = async () => {
    try { await handleSubmit(); } catch (error) { showToast(error.message, 'error'); }
  };

  const onClear = async () => {
    if (!selectedClient) { showToast('Please select a client first', 'warning'); return; }
    if (window.confirm('Are you sure you want to clear all form data?')) {
      try {
        if (status) { await handleDelete(); } else { clearForm(); }
        showToast('Form cleared!');
      } catch (error) { showToast(error.message, 'error'); }
    }
  };

  if (!selectedClient) {
    return (
      <main className="data-form">
        <div className="empty-state" style={{ padding: '80px 20px' }}>
          <h3>Select a Client</h3>
          <p>Choose a client from the panel on the left to begin entering royalty accounting data</p>
        </div>
      </main>
    );
  }

  return (
    <main className="data-form">
      {/* Form Header */}
      <div className="form-header">
        <div className="form-header-info">
          <h2>
            {selectedClient.name}
            {status && (
              <span className={`status-indicator ${status === 'submitted' ? 'submitted' : 'draft'}`}>
                <span className="dot"></span>
                {status === 'submitted' ? 'Submitted' : 'Draft'}
              </span>
            )}
          </h2>
          <span>{selectedClient.clientId} • Commission Rate: {formData.commissionRate || 0}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isReadOnly && (
            <button className="btn btn-warning" onClick={enableEdit}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              Edit Entry
            </button>
          )}
          <div className="month-badge">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            {monthLabel}
          </div>
        </div>
      </div>

      <div className="form-body">
        {/* Configurable Rates Section */}
        <div className="section">
          <div className="section-header">
            <div className="section-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="5" x2="5" y2="19"></line>
                <circle cx="6.5" cy="6.5" r="2.5"></circle>
                <circle cx="17.5" cy="17.5" r="2.5"></circle>
              </svg>
            </div>
            <div>
              <div className="section-title">Configurable Rates</div>
              <div className="section-subtitle">Set commission rate and GST rate for this client</div>
            </div>
          </div>
          <div className="input-grid">
            <div className="input-group">
              <label>Commission Rate (%)</label>
              <div className="input-prefix">
                <span>%</span>
                <input
                  type="number"
                  name="commissionRate"
                  value={formData.commissionRate}
                  onChange={handleInputChange}
                  placeholder="0"
                  step="0.01"
                  disabled={isReadOnly}
                />
              </div>
            </div>
            <div className="input-group">
              <label>GST Rate (%)</label>
              <div className="input-prefix">
                <span>%</span>
                <input
                  type="number"
                  name="gstRate"
                  value={formData.gstRate}
                  onChange={handleInputChange}
                  placeholder="18"
                  step="0.01"
                  disabled={isReadOnly}
                />
              </div>
            </div>
            <div className="input-group">
              <label>Royalty Type</label>
              <input
                type="text"
                name="royaltyType"
                value={formData.royaltyType}
                onChange={handleInputChange}
                placeholder="IPRS + PRS"
                disabled={isReadOnly}
              />
            </div>
          </div>
        </div>

        {/* Royalty Amounts Section */}
        <div className="section">
          <div className="section-header">
            <div className="section-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
            <div>
              <div className="section-title">Royalty Amounts</div>
              <div className="section-subtitle">Enter royalty amounts from various sources</div>
            </div>
          </div>
          <div className="input-grid">
            <div className="input-group">
              <label>IPRS Amount</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="iprsAmount" value={formData.iprsAmount} onChange={handleInputChange} placeholder="0.00" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group">
              <label>PRS (GBP)</label>
              <div className="input-prefix"><span>&pound;</span>
                <input type="number" name="prsGbp" value={formData.prsGbp} onChange={handleInputChange} placeholder="0.00" step="0.01" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group">
              <label>GBP to INR Rate</label>
              <div className="input-prefix"><span>&pound;&rarr;&#8377;</span>
                <input type="number" name="gbpToInrRate" value={formData.gbpToInrRate} onChange={handleInputChange} placeholder="0.00" step="0.01" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group">
              <label>PRS Amount (INR)</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="prsAmount" value={formData.prsAmount} onChange={handleInputChange} placeholder="0.00" step="0.01" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group">
              <label>Sound Exchange Amount</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="soundExchangeAmount" value={formData.soundExchangeAmount} onChange={handleInputChange} placeholder="0.00" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group">
              <label>ISAMRA Amount</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="isamraAmount" value={formData.isamraAmount} onChange={handleInputChange} placeholder="0.00" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group">
              <label>ASCAP Amount</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="ascapAmount" value={formData.ascapAmount} onChange={handleInputChange} placeholder="0.00" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group">
              <label>PPL Amount</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="pplAmount" value={formData.pplAmount} onChange={handleInputChange} placeholder="0.00" disabled={isReadOnly} />
              </div>
            </div>
          </div>
        </div>

        {/* Commission Section (Auto-Calculated) */}
        <div className="section">
          <div className="section-header">
            <div className="section-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
            <div>
              <div className="section-title">Commission Calculation</div>
              <div className="section-subtitle">Auto-calculated at {formData.commissionRate || 0}% commission rate</div>
            </div>
          </div>
          <div className="input-grid">
            <div className="input-group calculated">
              <label>IPRS Commission</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.iprsCommission.toFixed(2)} readOnly />
              </div>
            </div>
            <div className="input-group calculated">
              <label>PRS Commission</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.prsCommission.toFixed(2)} readOnly />
              </div>
            </div>
            <div className="input-group calculated">
              <label>Sound Exchange Commission</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.soundExchangeCommission.toFixed(2)} readOnly />
              </div>
            </div>
            <div className="input-group calculated">
              <label>ISAMRA Commission</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.isamraCommission.toFixed(2)} readOnly />
              </div>
            </div>
            <div className="input-group calculated">
              <label>ASCAP Commission</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.ascapCommission.toFixed(2)} readOnly />
              </div>
            </div>
            <div className="input-group calculated">
              <label>PPL Commission</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.pplCommission.toFixed(2)} readOnly />
              </div>
            </div>
            <div className="input-group calculated" style={{ gridColumn: 'span 2' }}>
              <label>Total Commission</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.totalCommission.toFixed(2)} readOnly style={{ fontWeight: 700 }} />
              </div>
            </div>
          </div>
        </div>

        {/* GST & Invoice Section */}
        <div className="section">
          <div className="section-header">
            <div className="section-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            </div>
            <div>
              <div className="section-title">GST & Invoice</div>
              <div className="section-subtitle">Current month and previous outstanding GST calculations</div>
            </div>
          </div>
          <div className="input-grid">
            <div className="input-group">
              <label>Current Month GST Base</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="currentMonthGstBase" value={formData.currentMonthGstBase} onChange={handleInputChange} placeholder="0.00" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group calculated">
              <label>Current Month GST ({formData.gstRate || 18}%)</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.currentMonthGst.toFixed(2)} readOnly />
              </div>
            </div>
            <div className="input-group calculated">
              <label>Current Month Invoice Total</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.currentMonthInvoiceTotal.toFixed(2)} readOnly />
              </div>
            </div>
            <div className="input-group">
              <label>Previous Outstanding GST Base</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="previousOutstandingGstBase" value={formData.previousOutstandingGstBase} onChange={handleInputChange} placeholder="0.00" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group calculated">
              <label>Previous Outstanding GST ({formData.gstRate || 18}%)</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.previousOutstandingGst.toFixed(2)} readOnly />
              </div>
            </div>
            <div className="input-group calculated">
              <label>Previous Outstanding Invoice Total</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.previousOutstandingInvoiceTotal.toFixed(2)} readOnly />
              </div>
            </div>
          </div>
        </div>

        {/* Receipts & TDS Section */}
        <div className="section">
          <div className="section-header">
            <div className="section-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                <line x1="1" y1="10" x2="23" y2="10"></line>
              </svg>
            </div>
            <div>
              <div className="section-title">Receipts & TDS</div>
              <div className="section-subtitle">Current month and previous month payments</div>
            </div>
          </div>
          <div className="input-grid">
            <div className="input-group">
              <label>Current Month Receipt</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="currentMonthReceipt" value={formData.currentMonthReceipt} onChange={handleInputChange} placeholder="0.00" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group">
              <label>Current Month TDS</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="currentMonthTds" value={formData.currentMonthTds} onChange={handleInputChange} placeholder="0.00" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group">
              <label>Previous Month Receipt</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="previousMonthReceipt" value={formData.previousMonthReceipt} onChange={handleInputChange} placeholder="0.00" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group">
              <label>Previous Month TDS</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="previousMonthTds" value={formData.previousMonthTds} onChange={handleInputChange} placeholder="0.00" disabled={isReadOnly} />
              </div>
            </div>
          </div>
        </div>

        {/* Outstanding Tracking Section */}
        <div className="section">
          <div className="section-header">
            <div className="section-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
            <div>
              <div className="section-title">Outstanding Tracking</div>
              <div className="section-subtitle">Auto-calculated outstanding amounts with carry-forward</div>
            </div>
          </div>
          <div className="input-grid">
            <div className="input-group">
              <label>Previous Month Outstanding (Carry-Forward)</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" name="previousMonthOutstanding" value={formData.previousMonthOutstanding} onChange={handleInputChange} placeholder="0.00" disabled={isReadOnly} />
              </div>
            </div>
            <div className="input-group calculated">
              <label>Invoice Pending (Current Month)</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.invoicePendingCurrentMonth.toFixed(2)} readOnly />
              </div>
            </div>
            <div className="input-group calculated">
              <label>Previous Invoice Pending</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.previousInvoicePending.toFixed(2)} readOnly />
              </div>
            </div>
            <div className="input-group calculated">
              <label>Monthly Outstanding</label>
              <div className="input-prefix"><span>&#8377;</span>
                <input type="number" value={calculations.monthlyOutstanding.toFixed(2)} readOnly style={{ fontWeight: 700 }} />
              </div>
            </div>
          </div>
        </div>

        {/* Summary Card */}
        <div className="summary-card">
          <div className="summary-header">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"></line>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
            <h3>Accounting Summary</h3>
          </div>
          <div className="summary-grid">
            <div className="summary-item">
              <div className="label">Total Commission</div>
              <div className="value">{formatCurrency(calculations.totalCommission)}</div>
            </div>
            <div className="summary-item">
              <div className="label">Current Month Invoice</div>
              <div className="value">{formatCurrency(calculations.currentMonthInvoiceTotal)}</div>
            </div>
            <div className="summary-item">
              <div className="label">Monthly Outstanding</div>
              <div className="value">{formatCurrency(calculations.monthlyOutstanding)}</div>
            </div>
            <div className="summary-item">
              <div className="label">Total Outstanding</div>
              <div className="value" style={{ color: calculations.totalOutstanding < 0 ? '#f04040' : '#92d050', fontSize: 18 }}>
                {formatCurrency(calculations.totalOutstanding)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="form-actions">
        {!isReadOnly ? (
          <>
            <button className="btn btn-danger" onClick={onClear}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Clear Form
            </button>
            <button className="btn btn-secondary" onClick={onSaveDraft}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              Save Draft
            </button>
            <button className="btn btn-success" onClick={onSubmit}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Submit Entry
            </button>
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            This entry has been submitted. Click "Edit Entry" above to make changes.
          </span>
        )}
      </div>
    </main>
  );
}

export default BillingForm;
