// frontend/src/hooks/useCredit.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { creditApi } from '../services/apiService';
import { applyFuzzyFilter } from '../utils/fuzzySearch';

export function useCredit() {
  const [summary, setSummary] = useState({ total_outstanding: 0, today_added: 0, today_recovered: 0 });
  const [allCustomers, setAllCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Active selected customer details
  const [activeCustomerId, setActiveCustomerId] = useState(null);
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await creditApi.getSummary();
      if (res.success) setSummary(res.data);
    } catch (e) {
      console.error('Failed to fetch credit summary:', e.message);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await creditApi.getCustomers();
      if (res.success) setAllCustomers(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async (customerId) => {
    if (!customerId) return;
    setTransactionsLoading(true);
    try {
      const resTrans = await creditApi.getTransactions(customerId);
      const resCust = await creditApi.getCustomerById(customerId);
      if (resTrans.success) setTransactions(resTrans.data || []);
      if (resCust.success) setActiveCustomer(resCust.data);
    } catch (e) {
      console.error('Failed to fetch customer transactions:', e.message);
    } finally {
      setTransactionsLoading(false);
    }
  }, []);

  // Fetch initial summary and customer list
  useEffect(() => {
    fetchSummary();
    fetchCustomers();
  }, [fetchSummary, fetchCustomers]);

  // Refetch transaction logs when active customer changes
  useEffect(() => {
    if (activeCustomerId) {
      fetchTransactions(activeCustomerId);
    } else {
      setActiveCustomer(null);
      setTransactions([]);
    }
  }, [activeCustomerId, fetchTransactions]);

  // Offline fuzzy filtering for customers with outstanding balance
  const customers = useMemo(() => {
    if (!searchQuery.trim()) return allCustomers;
    return applyFuzzyFilter(allCustomers, searchQuery, ['name', 'mobile']);
  }, [allCustomers, searchQuery]);

  // Receive a payment from a customer
  async function collectPayment({ customer_id, amount, payment_mode, note }) {
    try {
      const res = await creditApi.collectPayment({ customer_id, amount, payment_mode, note });
      if (res.success) {
        // Refetch summary and customer list
        await fetchSummary();
        await fetchCustomers();
        // If the updated customer is the current one, reload transactions/balance
        if (activeCustomerId === customer_id) {
          await fetchTransactions(customer_id);
        }
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to submit payment' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Manually adjust credit balance
  async function adjustCredit({ customer_id, amount, note }) {
    try {
      const res = await creditApi.adjustCredit({ customer_id, amount, note });
      if (res.success) {
        await fetchSummary();
        await fetchCustomers();
        if (activeCustomerId === customer_id) {
          await fetchTransactions(customer_id);
        }
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to submit adjustment' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Bring a notebook customer's existing debt onto the ledger. Distinct from
  // adjustCredit: it is refused once the customer already has an opening balance, so a
  // vendor cannot migrate the same figure twice.
  async function recordOpeningBalance({ customer_id, amount, note }) {
    try {
      const res = await creditApi.recordOpeningBalance({ customer_id, amount, note });
      if (res.success) {
        await fetchSummary();
        await fetchCustomers();
        if (activeCustomerId === customer_id) {
          await fetchTransactions(customer_id);
        }
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to save opening balance' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return {
    summary,
    customers,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    activeCustomerId,
    setActiveCustomerId,
    activeCustomer,
    transactions,
    transactionsLoading,
    fetchSummary,
    fetchCustomers,
    fetchTransactions,
    collectPayment,
    adjustCredit,
    recordOpeningBalance
  };
}
