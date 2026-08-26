/**
 * useLicense Hook
 * Fetches this machine's activation status on mount and exposes an activate()
 * mutation. Modeled on useHealth (fetch + loading/error) and useSettings (a
 * separate submitting/error pair for the mutation).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { licenseApi } from '../services/apiService';

export function useLicense() {
  const [machineId, setMachineId] = useState('');
  const [activated, setActivated] = useState(false);
  const [customerName, setCustomerName] = useState(null);
  const [expiry, setExpiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const applyStatus = useCallback((data = {}) => {
    setMachineId(data.machineId || '');
    setActivated(!!data.activated);
    setCustomerName(data.customerName || null);
    setExpiry(data.expiry || null);
  }, []);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await licenseApi.getStatus();
      applyStatus(response?.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  const activate = useCallback(
    async (licenseKey) => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const response = await licenseApi.activate(licenseKey);
        applyStatus(response?.data);
        return true;
      } catch (err) {
        setSubmitError(err.message);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [applyStatus]
  );

  // Guard against React 19 StrictMode's double effect invocation: the GET is
  // idempotent, but this avoids a duplicate in-flight request on mount.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchStatus();
  }, [fetchStatus]);

  return {
    machineId,
    activated,
    customerName,
    expiry,
    loading,
    error,
    submitting,
    submitError,
    activate,
    refetch: fetchStatus,
  };
}
