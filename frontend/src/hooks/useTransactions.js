import { useState, useEffect, useCallback } from 'react';
import { transactionApi, customersApi, vegetablesApi } from '../services/apiService';

function getLocalDateString(dateObj = new Date()) {
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterdayDateString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
}

export function useTransactions() {
  const [customers, setCustomers] = useState([]);
  const [vegetables, setVegetables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Active customer & date filtering for history
  const [activeCustomerId, setActiveCustomerId] = useState(null);
  const [dateFilterType, setDateFilterType] = useState('today'); // 'today', 'yesterday', 'specific', 'range'
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [startDate, setStartDate] = useState(getLocalDateString());
  const [endDate, setEndDate] = useState(getLocalDateString());

  // Purchase History state
  const [dailyData, setDailyData] = useState({
    summary: { total_transactions: 0, total_weight: 0, total_base_amount: 0, total_commission: 0, total_final_amount: 0 },
    transactions: []
  });
  const [historyLoading, setHistoryLoading] = useState(false);

  // Initial load of customers and vegetables masters
  const loadMasterData = useCallback(async () => {
    try {
      const [resCust, resVeg] = await Promise.all([
        customersApi.getAll(),
        vegetablesApi.getAll()
      ]);
      if (resCust?.success) setCustomers(resCust.data || []);
      if (resVeg?.success) setVegetables(resVeg.data || []);
    } catch (err) {
      console.error('Failed to load customers/vegetables master data:', err);
    }
  }, []);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  // Fetch daily/range customer transactions
  const fetchCustomerHistory = useCallback(async (customerId, filterType, sDate, eDate, specDate) => {
    if (!customerId) {
      setDailyData({
        summary: { total_transactions: 0, total_weight: 0, total_base_amount: 0, total_commission: 0, total_final_amount: 0 },
        transactions: []
      });
      return;
    }

    setHistoryLoading(true);
    try {
      let targetDate = specDate || getLocalDateString();
      if (filterType === 'today') {
        targetDate = getLocalDateString();
      } else if (filterType === 'yesterday') {
        targetDate = getYesterdayDateString();
      }

      if (filterType === 'range') {
        const resRange = await transactionApi.getCustomerRange(customerId, sDate, eDate);
        if (resRange?.success) {
          const list = resRange.data || [];
          const totalWeight = list.reduce((acc, t) => acc + Number(t.weight || 0), 0);
          const totalBase = list.reduce((acc, t) => acc + Number(t.base_amount || 0), 0);
          const totalComm = list.reduce((acc, t) => acc + Number(t.commission_amount || 0), 0);
          const totalFinal = list.reduce((acc, t) => acc + Number(t.final_amount || 0), 0);

          setDailyData({
            summary: {
              total_transactions: list.length,
              total_weight: Math.round(totalWeight * 100) / 100,
              total_base_amount: Math.round(totalBase * 100) / 100,
              total_commission: Math.round(totalComm * 100) / 100,
              total_final_amount: Math.round(totalFinal * 100) / 100
            },
            transactions: list
          });
        }
      } else {
        const resDaily = await transactionApi.getCustomerDaily(customerId, targetDate);
        if (resDaily?.success) {
          setDailyData({
            summary: resDaily.data.summary,
            transactions: resDaily.data.transactions || []
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch customer history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomerHistory(activeCustomerId, dateFilterType, startDate, endDate, selectedDate);
  }, [activeCustomerId, dateFilterType, startDate, endDate, selectedDate, fetchCustomerHistory]);

  // Create a new transaction
  async function createTransaction(payload) {
    setLoading(true);
    setError(null);
    try {
      const res = await transactionApi.create(payload);
      if (res?.success) {
        setToastMessage({ text: 'saveSuccess', type: 'success' });
        // Automatically refresh history if the transaction belongs to the active customer
        if (activeCustomerId === Number(payload.customer_id)) {
          fetchCustomerHistory(activeCustomerId, dateFilterType, startDate, endDate, selectedDate);
        }
        return { success: true, data: res.data };
      }
      setError(res?.error || 'Transaction save failed');
      return { success: false, error: res?.error };
    } catch (err) {
      const msg = err.message || 'Failed to save transaction';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }

  // Generate consolidated bill from transactions
  async function generateBill(customerId, date) {
    setLoading(true);
    setError(null);
    try {
      const res = await transactionApi.generateBill({ customerId, date });
      if (res?.success) {
        setToastMessage({ text: 'billGeneratedSuccess', type: 'success' });
        return { success: true, data: res.data };
      }
      setError(res?.error || 'Failed to generate bill');
      return { success: false, error: res?.error };
    } catch (err) {
      const msg = err.message || 'Failed to generate bill';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }

  // Delete transaction
  async function deleteTransaction(id) {

    setLoading(true);
    try {
      const res = await transactionApi.remove(id);
      if (res?.success) {
        setToastMessage({ text: 'deleteSuccess', type: 'success' });
        if (activeCustomerId) {
          fetchCustomerHistory(activeCustomerId, dateFilterType, startDate, endDate, selectedDate);
        }
        return { success: true };
      }
      return { success: false, error: res?.error };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }

  return {
    customers,
    vegetables,
    loading,
    error,
    toastMessage,
    setToastMessage,
    activeCustomerId,
    setActiveCustomerId,
    dateFilterType,
    setDateFilterType,
    selectedDate,
    setSelectedDate,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dailyData,
    historyLoading,
    createTransaction,
    generateBill,
    deleteTransaction,
    refreshHistory: () => fetchCustomerHistory(activeCustomerId, dateFilterType, startDate, endDate, selectedDate)
  };
}

