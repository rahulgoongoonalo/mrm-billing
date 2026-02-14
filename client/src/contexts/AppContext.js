import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { clientApi, royaltyApi, settingsApi } from '../services/api';

// Initial state
const initialState = {
  // Clients
  clients: [],
  selectedClient: null,
  clientsLoading: false,
  clientsError: null,

  // Royalty Accounting
  currentMonth: 'apr',
  billingEntries: {},
  currentEntry: null,
  billingLoading: false,
  billingError: null,

  // Settings
  settings: {
    financialYear: { startYear: 2025, endYear: 2026 },
  },
  settingsLoading: false,

  // UI State
  toast: { show: false, message: '', type: 'success' },
  activeModal: null,
};

// Action types
const ActionTypes = {
  SET_CLIENTS: 'SET_CLIENTS',
  SET_SELECTED_CLIENT: 'SET_SELECTED_CLIENT',
  SET_CLIENTS_LOADING: 'SET_CLIENTS_LOADING',
  SET_CLIENTS_ERROR: 'SET_CLIENTS_ERROR',
  ADD_CLIENT: 'ADD_CLIENT',
  UPDATE_CLIENT: 'UPDATE_CLIENT',
  REMOVE_CLIENT: 'REMOVE_CLIENT',

  SET_CURRENT_MONTH: 'SET_CURRENT_MONTH',
  SET_BILLING_ENTRIES: 'SET_BILLING_ENTRIES',
  SET_CURRENT_ENTRY: 'SET_CURRENT_ENTRY',
  UPDATE_ENTRY: 'UPDATE_ENTRY',
  DELETE_ENTRY: 'DELETE_ENTRY',
  SET_BILLING_LOADING: 'SET_BILLING_LOADING',
  SET_BILLING_ERROR: 'SET_BILLING_ERROR',

  SET_SETTINGS: 'SET_SETTINGS',
  UPDATE_SETTING: 'UPDATE_SETTING',
  SET_SETTINGS_LOADING: 'SET_SETTINGS_LOADING',

  SHOW_TOAST: 'SHOW_TOAST',
  HIDE_TOAST: 'HIDE_TOAST',
  SET_ACTIVE_MODAL: 'SET_ACTIVE_MODAL',
};

// Reducer
function appReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_CLIENTS:
      return { ...state, clients: [...action.payload].sort((a, b) => (parseInt(a.clientId?.match(/(\d+)/)?.[1], 10) || 0) - (parseInt(b.clientId?.match(/(\d+)/)?.[1], 10) || 0)), clientsLoading: false };
    case ActionTypes.SET_SELECTED_CLIENT:
      return { ...state, selectedClient: action.payload };
    case ActionTypes.SET_CLIENTS_LOADING:
      return { ...state, clientsLoading: action.payload };
    case ActionTypes.SET_CLIENTS_ERROR:
      return { ...state, clientsError: action.payload, clientsLoading: false };
    case ActionTypes.ADD_CLIENT:
      return { ...state, clients: [...state.clients, action.payload].sort((a, b) => (parseInt(a.clientId?.match(/(\d+)/)?.[1], 10) || 0) - (parseInt(b.clientId?.match(/(\d+)/)?.[1], 10) || 0)) };
    case ActionTypes.UPDATE_CLIENT:
      return {
        ...state,
        clients: state.clients.map(c => c.clientId === action.payload.clientId ? action.payload : c),
      };
    case ActionTypes.REMOVE_CLIENT: {
      const removedId = action.payload;
      const cleanedEntries = { ...state.billingEntries };
      Object.keys(cleanedEntries).forEach(key => {
        if (key.startsWith(removedId + '_')) delete cleanedEntries[key];
      });
      return {
        ...state,
        clients: state.clients.filter(c => c.clientId !== removedId),
        billingEntries: cleanedEntries,
        selectedClient: state.selectedClient?.clientId === removedId ? null : state.selectedClient,
        currentEntry: state.currentEntry?.clientId === removedId ? null : state.currentEntry,
      };
    }

    case ActionTypes.SET_CURRENT_MONTH:
      return { ...state, currentMonth: action.payload };
    case ActionTypes.SET_BILLING_ENTRIES:
      return { ...state, billingEntries: action.payload, billingLoading: false };
    case ActionTypes.SET_CURRENT_ENTRY:
      return { ...state, currentEntry: action.payload };
    case ActionTypes.UPDATE_ENTRY:
      return {
        ...state,
        billingEntries: {
          ...state.billingEntries,
          [action.payload.key]: action.payload.entry,
        },
      };
    case ActionTypes.DELETE_ENTRY: {
      const newEntries = { ...state.billingEntries };
      delete newEntries[action.payload];
      return { ...state, billingEntries: newEntries };
    }
    case ActionTypes.SET_BILLING_LOADING:
      return { ...state, billingLoading: action.payload };
    case ActionTypes.SET_BILLING_ERROR:
      return { ...state, billingError: action.payload, billingLoading: false };

    case ActionTypes.SET_SETTINGS:
      return { ...state, settings: { ...state.settings, ...action.payload }, settingsLoading: false };
    case ActionTypes.UPDATE_SETTING:
      return { ...state, settings: { ...state.settings, [action.payload.key]: action.payload.value } };
    case ActionTypes.SET_SETTINGS_LOADING:
      return { ...state, settingsLoading: action.payload };

    case ActionTypes.SHOW_TOAST:
      return { ...state, toast: { show: true, ...action.payload } };
    case ActionTypes.HIDE_TOAST:
      return { ...state, toast: { ...state.toast, show: false } };
    case ActionTypes.SET_ACTIVE_MODAL:
      return { ...state, activeModal: action.payload };

    default:
      return state;
  }
}

// Create context
const AppContext = createContext(null);

// Provider component
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Helper to show toast
  const showToast = useCallback((message, type = 'success') => {
    dispatch({ type: ActionTypes.SHOW_TOAST, payload: { message, type } });
    setTimeout(() => {
      dispatch({ type: ActionTypes.HIDE_TOAST });
    }, 3000);
  }, []);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load settings
        dispatch({ type: ActionTypes.SET_SETTINGS_LOADING, payload: true });
        const settingsRes = await settingsApi.getAll();
        dispatch({ type: ActionTypes.SET_SETTINGS, payload: settingsRes.data });

        // Load clients
        dispatch({ type: ActionTypes.SET_CLIENTS_LOADING, payload: true });
        const clientsRes = await clientApi.getAll();
        dispatch({ type: ActionTypes.SET_CLIENTS, payload: clientsRes.data });

        // Load royalty accounting entries for current FY
        dispatch({ type: ActionTypes.SET_BILLING_LOADING, payload: true });
        const fy = settingsRes.data.financialYear?.startYear || 2025;
        const entriesRes = await royaltyApi.getAll({ financialYear: fy });
        const entriesMap = entriesRes.data.reduce((acc, entry) => {
          const key = `${entry.clientId}_${entry.month}`;
          acc[key] = entry;
          return acc;
        }, {});
        dispatch({ type: ActionTypes.SET_BILLING_ENTRIES, payload: entriesMap });
      } catch (error) {
        console.error('Error loading initial data:', error);
        showToast('Error loading data. Please refresh.', 'error');
      }
    };

    loadInitialData();
  }, [showToast]);

  // Client actions
  const fetchClients = useCallback(async (search = '') => {
    dispatch({ type: ActionTypes.SET_CLIENTS_LOADING, payload: true });
    try {
      const res = await clientApi.getAll(search);
      dispatch({ type: ActionTypes.SET_CLIENTS, payload: res.data });
    } catch (error) {
      dispatch({ type: ActionTypes.SET_CLIENTS_ERROR, payload: error.message });
      showToast('Error fetching clients', 'error');
    }
  }, [showToast]);

  const selectClient = useCallback((client) => {
    dispatch({ type: ActionTypes.SET_SELECTED_CLIENT, payload: client });
    if (client) {
      const key = `${client.clientId}_${state.currentMonth}`;
      dispatch({ type: ActionTypes.SET_CURRENT_ENTRY, payload: state.billingEntries[key] || null });
    }
  }, [state.currentMonth, state.billingEntries]);

  const addClient = useCallback(async (clientData) => {
    try {
      const res = await clientApi.create(clientData);
      dispatch({ type: ActionTypes.ADD_CLIENT, payload: res.data });
      showToast('Client added successfully!');
      return res.data;
    } catch (error) {
      showToast(error.response?.data?.message || 'Error adding client', 'error');
      throw error;
    }
  }, [showToast]);

  const updateClient = useCallback(async (clientId, clientData) => {
    try {
      const res = await clientApi.update(clientId, clientData);
      dispatch({ type: ActionTypes.UPDATE_CLIENT, payload: res.data });
      showToast('Client updated successfully!');
      return res.data;
    } catch (error) {
      showToast(error.response?.data?.message || 'Error updating client', 'error');
      throw error;
    }
  }, [showToast]);

  const removeClient = useCallback(async (clientId, permanent = false) => {
    try {
      await clientApi.delete(clientId, permanent);
      dispatch({ type: ActionTypes.REMOVE_CLIENT, payload: clientId });
      showToast(permanent ? 'Client deleted permanently' : 'Client deactivated');
    } catch (error) {
      showToast(error.response?.data?.message || 'Error removing client', 'error');
      throw error;
    }
  }, [showToast]);

  // Month actions
  const setCurrentMonth = useCallback((month) => {
    dispatch({ type: ActionTypes.SET_CURRENT_MONTH, payload: month });
    if (state.selectedClient) {
      const key = `${state.selectedClient.clientId}_${month}`;
      dispatch({ type: ActionTypes.SET_CURRENT_ENTRY, payload: state.billingEntries[key] || null });
    }
  }, [state.selectedClient, state.billingEntries]);

  // Entry actions
  const saveEntry = useCallback(async (entryData, status = 'draft') => {
    try {
      const res = await royaltyApi.saveEntry({ ...entryData, status });
      const responseData = res.data;

      // Handle new response format: { entry, cascadedEntries }
      const savedEntry = responseData.entry || responseData;
      const key = `${entryData.clientId}_${entryData.month}`;
      dispatch({ type: ActionTypes.UPDATE_ENTRY, payload: { key, entry: savedEntry } });
      dispatch({ type: ActionTypes.SET_CURRENT_ENTRY, payload: savedEntry });

      // Update any cascaded entries in the store
      if (responseData.cascadedEntries && responseData.cascadedEntries.length > 0) {
        responseData.cascadedEntries.forEach(cascadedEntry => {
          const cascadedKey = `${cascadedEntry.clientId}_${cascadedEntry.month}`;
          dispatch({ type: ActionTypes.UPDATE_ENTRY, payload: { key: cascadedKey, entry: cascadedEntry } });
        });
      }

      // Sync commissionRate back to client if it changed
      const client = state.clients.find(c => c.clientId === entryData.clientId);
      if (client && entryData.commissionRate !== undefined && entryData.commissionRate !== client.commissionRate) {
        try {
          const updatedClient = await clientApi.update(entryData.clientId, { commissionRate: entryData.commissionRate });
          dispatch({ type: ActionTypes.UPDATE_CLIENT, payload: updatedClient.data });
        } catch (err) {
          console.error('Failed to sync commission rate to client:', err);
        }
      }

      showToast(status === 'draft' ? 'Draft saved!' : 'Entry submitted!');
      return savedEntry;
    } catch (error) {
      showToast(error.response?.data?.message || 'Error saving entry', 'error');
      throw error;
    }
  }, [showToast, state.clients]);

  const deleteEntry = useCallback(async (clientId, month) => {
    try {
      await royaltyApi.deleteEntry(clientId, month);
      const key = `${clientId}_${month}`;
      dispatch({ type: ActionTypes.DELETE_ENTRY, payload: key });
      dispatch({ type: ActionTypes.SET_CURRENT_ENTRY, payload: null });
      showToast('Entry deleted!');
    } catch (error) {
      showToast(error.response?.data?.message || 'Error deleting entry', 'error');
      throw error;
    }
  }, [showToast]);

  // Settings actions
  const updateFinancialYear = useCallback(async (startYear) => {
    try {
      await settingsApi.updateFinancialYear(startYear);
      dispatch({
        type: ActionTypes.UPDATE_SETTING,
        payload: { key: 'financialYear', value: { startYear, endYear: startYear + 1 } },
      });
      showToast(`Financial year updated to FY ${startYear}-${startYear + 1}`);
    } catch (error) {
      showToast('Error updating financial year', 'error');
      throw error;
    }
  }, [showToast]);

  // Modal actions
  const openModal = useCallback((modalName) => {
    dispatch({ type: ActionTypes.SET_ACTIVE_MODAL, payload: modalName });
  }, []);

  const closeModal = useCallback(() => {
    dispatch({ type: ActionTypes.SET_ACTIVE_MODAL, payload: null });
  }, []);

  const value = {
    ...state,
    fetchClients,
    selectClient,
    addClient,
    updateClient,
    removeClient,
    setCurrentMonth,
    saveEntry,
    deleteEntry,
    updateFinancialYear,
    showToast,
    openModal,
    closeModal,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// Custom hook
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

export default AppContext;
