import { useState, useCallback, useEffect, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { royaltyApi } from '../services/api';

const initialFormState = {
  // Configurable Rates
  commissionRate: '',
  gstRate: '18',
  royaltyType: 'IPRS + PRS',

  // Royalty Amounts
  iprsAmount: '',
  prsGbp: '',
  gbpToInrRate: '',
  prsAmount: '',
  soundExchangeAmount: '',
  isamraAmount: '',
  ascapAmount: '',
  pplAmount: '',

  // GST & Invoice Inputs
  currentMonthGstBase: '',
  previousOutstandingGstBase: '',

  // Receipts & TDS
  currentMonthReceipt: '',
  currentMonthTds: '',
  previousMonthReceipt: '',
  previousMonthTds: '',

  // Outstanding (auto-populated)
  previousMonthOutstanding: '',
};

export function useBillingForm() {
  const { selectedClient, currentMonth, currentEntry, settings, saveEntry, deleteEntry } = useApp();
  const [formData, setFormData] = useState(initialFormState);
  const [isDirty, setIsDirty] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Load entry data when currentEntry, selectedClient, or currentMonth changes
  useEffect(() => {
    if (currentEntry) {
      setFormData({
        commissionRate: currentEntry.commissionRate ?? '',
        gstRate: currentEntry.gstRate ?? '18',
        royaltyType: currentEntry.royaltyType || 'IPRS + PRS',
        iprsAmount: currentEntry.iprsAmount || '',
        prsGbp: currentEntry.prsGbp || '',
        gbpToInrRate: currentEntry.gbpToInrRate || '',
        prsAmount: currentEntry.prsAmount || '',
        soundExchangeAmount: currentEntry.soundExchangeAmount || '',
        isamraAmount: currentEntry.isamraAmount || '',
        ascapAmount: currentEntry.ascapAmount || '',
        pplAmount: currentEntry.pplAmount || '',
        currentMonthGstBase: currentEntry.currentMonthGstBase || '',
        previousOutstandingGstBase: currentEntry.previousOutstandingGstBase || '',
        currentMonthReceipt: currentEntry.currentMonthReceipt || '',
        currentMonthTds: currentEntry.currentMonthTds || '',
        previousMonthReceipt: currentEntry.previousMonthReceipt || '',
        previousMonthTds: currentEntry.previousMonthTds || '',
        previousMonthOutstanding: currentEntry.previousMonthOutstanding || '',
      });
      setIsDirty(false);
      setIsReadOnly(currentEntry.status === 'submitted');
    } else {
      // Auto-populate commissionRate from client
      const clientRate = selectedClient?.commissionRate || (selectedClient?.fee ? selectedClient.fee * 100 : '');
      setFormData({
        ...initialFormState,
        commissionRate: clientRate || '',
      });
      setIsDirty(false);
      setIsReadOnly(false);

      // Auto-fetch previous month's total outstanding for carry-forward
      if (selectedClient && currentMonth) {
        const fy = settings.financialYear?.startYear;
        royaltyApi.getPreviousOutstanding(selectedClient.clientId, currentMonth, fy)
          .then(res => {
            const prevOutstanding = res.data.totalOutstanding;
            if (prevOutstanding) {
              setFormData(prev => ({ ...prev, previousMonthOutstanding: prevOutstanding }));
            }
          })
          .catch(() => {});
      }
    }
  }, [currentEntry, selectedClient, currentMonth, settings.financialYear]);

  // Enable editing for submitted entries
  const enableEdit = useCallback(() => {
    setIsReadOnly(false);
  }, []);

  // Round to 2 decimal places (matches backend)
  const r = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

  // Calculate all derived values (mirrors the backend business logic)
  const calculations = useMemo(() => {
    const commissionRate = parseFloat(formData.commissionRate) || 0;
    const gstRate = parseFloat(formData.gstRate) || 18;
    const rate = commissionRate / 100;
    const gstMultiplier = gstRate / 100;

    const iprsAmount = parseFloat(formData.iprsAmount) || 0;
    const prsAmount = parseFloat(formData.prsAmount) || 0;
    const soundExchangeAmount = parseFloat(formData.soundExchangeAmount) || 0;
    const isamraAmount = parseFloat(formData.isamraAmount) || 0;
    const ascapAmount = parseFloat(formData.ascapAmount) || 0;
    const pplAmount = parseFloat(formData.pplAmount) || 0;

    // 1. Commission Calculation
    const iprsCommission = r(iprsAmount * rate);
    const prsCommission = r(prsAmount * rate);
    const soundExchangeCommission = r(soundExchangeAmount * rate);
    const isamraCommission = r(isamraAmount * rate);
    const ascapCommission = r(ascapAmount * rate);
    const pplCommission = r(pplAmount * rate);
    const totalCommission = r(iprsCommission + prsCommission + soundExchangeCommission +
      isamraCommission + ascapCommission + pplCommission);

    // 2. GST Calculation
    const currentMonthGstBase = parseFloat(formData.currentMonthGstBase) || 0;
    const previousOutstandingGstBase = parseFloat(formData.previousOutstandingGstBase) || 0;

    const currentMonthGst = r(currentMonthGstBase * gstMultiplier);
    const currentMonthInvoiceTotal = r(currentMonthGstBase + currentMonthGst);

    const previousOutstandingGst = r(previousOutstandingGstBase * gstMultiplier);
    const previousOutstandingInvoiceTotal = r(previousOutstandingGstBase + previousOutstandingGst);

    // 3. Pending Amounts
    const invoicePendingCurrentMonth = r(totalCommission - currentMonthGstBase);

    const previousMonthOutstanding = parseFloat(formData.previousMonthOutstanding) || 0;
    const previousInvoicePending = r(previousMonthOutstanding - previousOutstandingGstBase);

    // 4. Monthly Outstanding
    const currentMonthReceipt = parseFloat(formData.currentMonthReceipt) || 0;
    const currentMonthTds = parseFloat(formData.currentMonthTds) || 0;

    const monthlyOutstanding = r(
      invoicePendingCurrentMonth +
      currentMonthInvoiceTotal -
      currentMonthReceipt -
      currentMonthTds
    );

    // 5. Final Total Outstanding
    const previousMonthReceipt = parseFloat(formData.previousMonthReceipt) || 0;
    const previousMonthTds = parseFloat(formData.previousMonthTds) || 0;

    const totalOutstanding = r(
      previousInvoicePending +
      previousOutstandingInvoiceTotal -
      previousMonthReceipt -
      previousMonthTds +
      monthlyOutstanding
    );

    return {
      iprsCommission,
      prsCommission,
      soundExchangeCommission,
      isamraCommission,
      ascapCommission,
      pplCommission,
      totalCommission,
      currentMonthGst,
      currentMonthInvoiceTotal,
      previousOutstandingGst,
      previousOutstandingInvoiceTotal,
      invoicePendingCurrentMonth,
      previousInvoicePending,
      monthlyOutstanding,
      totalOutstanding,
    };
  }, [formData]);

  // Update field
  const updateField = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  // Handle input change with linked PRS fields
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };

      // Linked PRS fields: any 2 of (prsGbp, gbpToInrRate, prsAmount) determine the 3rd
      if (name === 'prsGbp' || name === 'gbpToInrRate') {
        const gbp = parseFloat(name === 'prsGbp' ? value : next.prsGbp) || 0;
        const rate = parseFloat(name === 'gbpToInrRate' ? value : next.gbpToInrRate) || 0;
        if (gbp && rate) {
          next.prsAmount = Math.round((gbp * rate + Number.EPSILON) * 100) / 100;
        }
      } else if (name === 'prsAmount') {
        const gbp = parseFloat(next.prsGbp) || 0;
        const rate = parseFloat(next.gbpToInrRate) || 0;
        const inr = parseFloat(value) || 0;
        if (gbp && inr && !rate) {
          next.gbpToInrRate = Math.round((inr / gbp + Number.EPSILON) * 100) / 100;
        } else if (rate && inr && !gbp) {
          next.prsGbp = Math.round((inr / rate + Number.EPSILON) * 100) / 100;
        } else if (gbp && inr) {
          next.gbpToInrRate = Math.round((inr / gbp + Number.EPSILON) * 100) / 100;
        }
      }

      return next;
    });
    setIsDirty(true);
  }, []);

  // Clear form
  const clearForm = useCallback(() => {
    setFormData(initialFormState);
    setIsDirty(false);
    setIsReadOnly(false);
  }, []);

  // Build entry data from form
  const buildEntryData = useCallback(() => ({
    clientId: selectedClient.clientId,
    month: currentMonth,
    commissionRate: parseFloat(formData.commissionRate) || 0,
    gstRate: parseFloat(formData.gstRate) || 18,
    royaltyType: formData.royaltyType,
    iprsAmount: parseFloat(formData.iprsAmount) || 0,
    prsGbp: parseFloat(formData.prsGbp) || 0,
    gbpToInrRate: parseFloat(formData.gbpToInrRate) || 0,
    prsAmount: parseFloat(formData.prsAmount) || 0,
    soundExchangeAmount: parseFloat(formData.soundExchangeAmount) || 0,
    isamraAmount: parseFloat(formData.isamraAmount) || 0,
    ascapAmount: parseFloat(formData.ascapAmount) || 0,
    pplAmount: parseFloat(formData.pplAmount) || 0,
    currentMonthGstBase: parseFloat(formData.currentMonthGstBase) || 0,
    previousOutstandingGstBase: parseFloat(formData.previousOutstandingGstBase) || 0,
    currentMonthReceipt: parseFloat(formData.currentMonthReceipt) || 0,
    currentMonthTds: parseFloat(formData.currentMonthTds) || 0,
    previousMonthReceipt: parseFloat(formData.previousMonthReceipt) || 0,
    previousMonthTds: parseFloat(formData.previousMonthTds) || 0,
    previousMonthOutstanding: parseFloat(formData.previousMonthOutstanding) || 0,
  }), [selectedClient, currentMonth, formData]);

  // Save as draft
  const handleSaveAsDraft = useCallback(async () => {
    if (!selectedClient) throw new Error('Please select a client first');
    await saveEntry(buildEntryData(), 'draft');
    setIsDirty(false);
  }, [selectedClient, buildEntryData, saveEntry]);

  // Submit entry
  const handleSubmit = useCallback(async () => {
    if (!selectedClient) throw new Error('Please select a client first');
    await saveEntry(buildEntryData(), 'submitted');
    setIsDirty(false);
    setIsReadOnly(true);
  }, [selectedClient, buildEntryData, saveEntry]);

  // Delete entry
  const handleDelete = useCallback(async () => {
    if (!selectedClient) throw new Error('Please select a client first');
    await deleteEntry(selectedClient.clientId, currentMonth);
    clearForm();
  }, [selectedClient, currentMonth, deleteEntry, clearForm]);

  return {
    formData,
    calculations,
    isDirty,
    handleInputChange,
    updateField,
    clearForm,
    handleSaveAsDraft,
    handleSubmit,
    handleDelete,
    status: currentEntry?.status || null,
    isReadOnly,
    enableEdit,
  };
}

export default useBillingForm;
