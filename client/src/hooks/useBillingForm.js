import { useState, useCallback, useEffect, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { royaltyApi } from '../services/api';
import { SOCIETIES, SOCIETY_FIELDS, societyRate, normalizeSocieties } from '../utils/clientProfile';

const initialFormState = {
  // Configurable Rates
  commissionRate: '',
  gstRate: '18',
  royaltyType: '',

  // Royalty Amounts
  iprsAmount: '',
  iprsEntries: [],
  prsGbp: '',
  gbpToInrRate: '',
  prsAmount: '',
  prsEntries: [],
  soundExchangeAmount: '',
  isamraAmount: '',
  ascapAmount: '',
  bmiAmount: '',
  socanAmount: '',
  pplAmount: '',
  mlcAmount: '',
  extraAmount: '',

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
  // True when a previous month exists, so its closing balance owns this entry's
  // carry-forward box and the box is not typed by hand.
  const [carryForwardLocked, setCarryForwardLocked] = useState(false);
  // Set when someone deliberately unlocks the box to seed an opening balance.
  const [carryForwardOverride, setCarryForwardOverride] = useState(false);

  // Load entry data when currentEntry, selectedClient, or currentMonth changes
  useEffect(() => {
    setCarryForwardLocked(false);
    setCarryForwardOverride(false);
    if (currentEntry) {
      setFormData({
        commissionRate: currentEntry.commissionRate ?? '',
        gstRate: currentEntry.gstRate ?? '18',
        royaltyType: selectedClient?.type || currentEntry.royaltyType || '',
        iprsAmount: currentEntry.iprsAmount || '',
        iprsEntries: currentEntry.iprsEntries || [],
        prsGbp: currentEntry.prsGbp || '',
        gbpToInrRate: currentEntry.gbpToInrRate || '',
        prsAmount: currentEntry.prsAmount || '',
        prsEntries: currentEntry.prsEntries || [],
        soundExchangeAmount: currentEntry.soundExchangeAmount || '',
        isamraAmount: currentEntry.isamraAmount || '',
        ascapAmount: currentEntry.ascapAmount || '',
        bmiAmount: currentEntry.bmiAmount || '',
        socanAmount: currentEntry.socanAmount || '',
        pplAmount: currentEntry.pplAmount || '',
        mlcAmount: currentEntry.mlcAmount || '',
        extraAmount: currentEntry.extraAmount || '',
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

      // Show the previous month's real closing balance rather than the copy
      // stored on this entry, which may predate an edit to that month.
      if (selectedClient && currentMonth) {
        const fy = settings.financialYear?.startYear;
        royaltyApi.getPreviousOutstanding(selectedClient.clientId, currentMonth, fy)
          .then((res) => {
            setCarryForwardLocked(!!res.data.exists);
            if (res.data.exists) {
              setFormData((prev) => ({ ...prev, previousMonthOutstanding: res.data.totalOutstanding }));
            }

          })
          .catch(() => {});
      }
    } else {
      // Auto-populate commissionRate and gstRate from client
      const clientRate = selectedClient?.commissionRate || (selectedClient?.fee ? selectedClient.fee * 100 : '');
      const clientGstRate = selectedClient?.gstRate ?? 18;
      setFormData({
        ...initialFormState,
        commissionRate: clientRate || '',
        gstRate: clientGstRate,
        royaltyType: selectedClient?.type || '',
      });
      setIsDirty(false);
      setIsReadOnly(false);

      // Auto-fetch previous month's total outstanding for carry-forward
      if (selectedClient && currentMonth) {
        const fy = settings.financialYear?.startYear;
        royaltyApi.getPreviousOutstanding(selectedClient.clientId, currentMonth, fy)
          .then(res => {
            setCarryForwardLocked(!!res.data.exists);
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

  // Update IPRS entries from modal
  const updateIprsEntries = useCallback((entries, totalAmount) => {
    setFormData(prev => ({
      ...prev,
      iprsEntries: entries,
      iprsAmount: totalAmount,
    }));
    setIsDirty(true);
  }, []);

  // Update PRS entries from modal
  const updatePrsEntries = useCallback((entries, totalAmount) => {
    setFormData(prev => ({
      ...prev,
      prsEntries: entries,
      prsAmount: totalAmount,
    }));
    setIsDirty(true);
  }, []);


  // Round to 2 decimal places (matches backend)
  const r = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

  // Calculate all derived values (mirrors the backend business logic)
  const calculations = useMemo(() => {
    const commissionRate = parseFloat(formData.commissionRate) || 0;
    const gstRate = parseFloat(formData.gstRate) || 18;
    const gstMultiplier = gstRate / 100;

    // 1. Commission Calculation
    //
    // Each society is charged at its own rate. The rate structure belongs to the
    // client record, not the form, so it is read from selectedClient. In flat
    // mode societyRate() returns the single commissionRate for every society,
    // which is what this calculation has always done.
    const rateSource = {
      commissionRate,
      commissionMode: selectedClient?.commissionMode,
      societyCommissions: selectedClient?.societyCommissions,
    };

    const commissions = {};
    let totalCommissionRaw = 0;
    for (const society of SOCIETIES) {
      const { amount, commission } = SOCIETY_FIELDS[society];
      const value = parseFloat(formData[amount]) || 0;
      const earned = r(value * (societyRate(rateSource, society) / 100));
      commissions[commission] = earned;
      totalCommissionRaw += earned;
    }
    const totalCommission = r(totalCommissionRaw);

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

    const extraAmount = parseFloat(formData.extraAmount) || 0;

    const totalOutstanding = r(
      previousInvoicePending +
      previousOutstandingInvoiceTotal -
      previousMonthReceipt -
      previousMonthTds +
      monthlyOutstanding -
      extraAmount
    );

    return {
      ...commissions,
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
  }, [formData, selectedClient]);

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
    financialYear: settings.financialYear?.startYear,
    commissionRate: parseFloat(formData.commissionRate) || 0,
    gstRate: parseFloat(formData.gstRate) || 18,
    royaltyType: formData.royaltyType,
    iprsAmount: parseFloat(formData.iprsAmount) || 0,
    iprsEntries: formData.iprsEntries || [],
    prsGbp: parseFloat(formData.prsGbp) || 0,
    gbpToInrRate: parseFloat(formData.gbpToInrRate) || 0,
    prsAmount: parseFloat(formData.prsAmount) || 0,
    prsEntries: formData.prsEntries || [],
    soundExchangeAmount: parseFloat(formData.soundExchangeAmount) || 0,
    isamraAmount: parseFloat(formData.isamraAmount) || 0,
    ascapAmount: parseFloat(formData.ascapAmount) || 0,
    bmiAmount: parseFloat(formData.bmiAmount) || 0,
    socanAmount: parseFloat(formData.socanAmount) || 0,
    pplAmount: parseFloat(formData.pplAmount) || 0,
    mlcAmount: parseFloat(formData.mlcAmount) || 0,
    extraAmount: parseFloat(formData.extraAmount) || 0,
    currentMonthGstBase: parseFloat(formData.currentMonthGstBase) || 0,
    previousOutstandingGstBase: parseFloat(formData.previousOutstandingGstBase) || 0,
    currentMonthReceipt: parseFloat(formData.currentMonthReceipt) || 0,
    currentMonthTds: parseFloat(formData.currentMonthTds) || 0,
    previousMonthReceipt: parseFloat(formData.previousMonthReceipt) || 0,
    previousMonthTds: parseFloat(formData.previousMonthTds) || 0,
    previousMonthOutstanding: parseFloat(formData.previousMonthOutstanding) || 0,
    overrideCarryForward: carryForwardOverride,
  }), [selectedClient, currentMonth, formData, settings.financialYear, carryForwardOverride]);

  // Save as draft
  const handleSaveAsDraft = useCallback(async () => {
    if (!selectedClient) throw new Error('Please select a client first');
    await saveEntry(buildEntryData(), 'draft');
    setIsDirty(false);
  }, [selectedClient, buildEntryData, saveEntry]);

  // Which societies this client is signed to, and therefore which amount boxes
  // the form should let you fill in.
  //
  // Two cases stop this from being a plain membership test:
  //
  //  - An entry may already hold money in a society the client is no longer
  //    listed under. Locking that box would leave the amount counting towards
  //    commission with no way to correct it, so it stays editable.
  //  - A client with no societies recorded at all leaves every box open. An
  //    incomplete client master must never block the month's work.
  const societyAccess = useMemo(() => {
    const members = new Set(normalizeSocieties(selectedClient?.societies || []));
    const noProfile = members.size === 0;
    const access = {};
    for (const society of SOCIETIES) {
      const { amount } = SOCIETY_FIELDS[society];
      const isMember = members.has(society);
      const strayAmount = !isMember && (parseFloat(formData[amount]) || 0) !== 0;
      access[society] = {
        isMember,
        strayAmount,
        editable: noProfile || isMember || strayAmount,
        required: !noProfile && isMember,
      };
    }
    access.noProfile = noProfile;
    return access;
  }, [selectedClient, formData]);

  // Only the societies the client is signed to have to be filled in - 0 counts
  // as filled, blank does not. A society the client does not belong to is not
  // asked for at all, which is why its box is closed in the form.
  const validateRoyaltyFields = useCallback(() => {
    const missing = SOCIETIES
      .filter((society) => societyAccess[society]?.required)
      .map((society) => ({ society, ...SOCIETY_FIELDS[society] }))
      .filter(({ amount }) => {
        const val = formData[amount];
        return val === '' || val === undefined || val === null;
      });

    if (missing.length > 0) {
      throw new Error(`Please fill in: ${missing.map((f) => f.label).join(', ')}`);
    }
  }, [formData, societyAccess]);

  // Submit entry
  const handleSubmit = useCallback(async () => {
    if (!selectedClient) throw new Error('Please select a client first');
    validateRoyaltyFields();
    await saveEntry(buildEntryData(), 'submitted');
    setIsDirty(false);
    setIsReadOnly(true);
  }, [selectedClient, buildEntryData, saveEntry, validateRoyaltyFields]);

  // Delete entry
  const handleDelete = useCallback(async () => {
    if (!selectedClient) throw new Error('Please select a client first');
    await deleteEntry(selectedClient.clientId, currentMonth);
    clearForm();
  }, [selectedClient, currentMonth, deleteEntry, clearForm]);

  // The rate actually applied to each society, so the form can print it next to
  // the commission it produced.
  const isPerSociety = selectedClient?.commissionMode === 'per-society';
  const rateFor = useCallback((society) => societyRate({
    commissionRate: parseFloat(formData.commissionRate) || 0,
    commissionMode: selectedClient?.commissionMode,
    societyCommissions: selectedClient?.societyCommissions,
  }, society), [formData.commissionRate, selectedClient]);

  return {
    formData,
    calculations,
    isPerSociety,
    rateFor,
    societyAccess,
    carryForwardLocked,
    carryForwardOverride,
    unlockCarryForward: () => setCarryForwardOverride(true),
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
    updateIprsEntries,
    updatePrsEntries,
  };
}

export default useBillingForm;
