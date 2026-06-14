/**
 * useVegetables Hook
 * Manages all vegetable state: list, debounced search, loading, CRUD.
 * Module 3: Uses frontend fuzzy search (Fuse.js) + normalization.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { vegetablesApi } from '../services/apiService';
import { applyFuzzyFilter } from '../utils/fuzzySearch';

export function useVegetables() {
  const [allVegetables, setAllVegetables] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [searchQuery, setSearchQuery]     = useState('');

  // ─── Fetch all vegetables from backend ───────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await vegetablesApi.getAll();
      setAllVegetables(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Frontend fuzzy filtering (instant, offline) ──────────────────────────
  // Searches name AND search_keywords with fuzzy + normalization.
  // e.g. typing "shev" shows शेवगा; "kaanda" shows कांदा
  const vegetables = useMemo(() => {
    if (!searchQuery.trim()) return allVegetables;
    return applyFuzzyFilter(allVegetables, searchQuery, ['name', 'search_keywords']);
  }, [allVegetables, searchQuery]);

  // ─── CRUD Operations ──────────────────────────────────────────────────────
  async function createVegetable(data) {
    try {
      await vegetablesApi.create(data);
      await fetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function updateVegetable(id, data) {
    try {
      await vegetablesApi.update(id, data);
      await fetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function deleteVegetable(id) {
    try {
      await vegetablesApi.remove(id);
      await fetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return {
    vegetables, loading, error,
    searchQuery, setSearchQuery,
    fetchAll,
    createVegetable, updateVegetable, deleteVegetable,
  };
}
