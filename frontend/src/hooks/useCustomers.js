/**
 * useCustomers Hook
 * Manages all customer state: list, search, loading, errors, CRUD operations.
 * Module 3: Uses frontend fuzzy search (Fuse.js) — no extra network calls for search.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { customersApi } from '../services/apiService';
import { applyFuzzyFilter } from '../utils/fuzzySearch';

export function useCustomers() {
  const [allCustomers, setAllCustomers] = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [searchQuery, setSearchQuery]   = useState('');

  // ─── Fetch all customers once from backend ────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await customersApi.getAll();
      setAllCustomers(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Frontend fuzzy filtering (instant, offline) ──────────────────────────
  // Searches name, mobile, and address with fuzzy matching + normalization.
  const customers = useMemo(() => {
    if (!searchQuery.trim()) return allCustomers;
    return applyFuzzyFilter(allCustomers, searchQuery, ['name', 'mobile', 'address']);
  }, [allCustomers, searchQuery]);

  // ─── CRUD Operations ──────────────────────────────────────────────────────

  async function createCustomer(data) {
    try {
      await customersApi.create(data);
      await fetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function updateCustomer(id, data) {
    try {
      await customersApi.update(id, data);
      await fetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function deleteCustomer(id) {
    try {
      await customersApi.remove(id);
      await fetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return {
    customers,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    fetchAll,
    createCustomer,
    updateCustomer,
    deleteCustomer,
  };
}
