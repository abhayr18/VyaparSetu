/**
 * useBills Hook
 * Manages state and CRUD operations for bills.
 * Integrates offline-first fuzzy search via Fuse.js.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { billsApi } from '../services/apiService';
import { applyFuzzyFilter } from '../utils/fuzzySearch';

export function useBills() {
  const [allBills, setAllBills] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await billsApi.getAll();
      setAllBills(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Frontend fuzzy search on loaded bills list (instant offline filtering)
  const bills = useMemo(() => {
    if (!searchQuery.trim()) return allBills;
    return applyFuzzyFilter(allBills, searchQuery, ['bill_number', 'customer_name', 'notes']);
  }, [allBills, searchQuery]);

  async function createBill(data) {
    try {
      const res = await billsApi.create(data);
      await fetchAll();
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function updateBill(id, data) {
    try {
      const res = await billsApi.update(id, data);
      await fetchAll();
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function deleteBill(id) {
    try {
      await billsApi.remove(id);
      await fetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return {
    bills,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    fetchAll,
    createBill,
    updateBill,
    deleteBill,
  };
}
