import { useState, useEffect, useCallback } from 'react';
import { backupApi } from '../services/apiService';

export default function useBackup() {
  const [backups, setBackups] = useState([]);
  const [lastBackup, setLastBackup] = useState(null);
  const [internetOnline, setInternetOnline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchBackups = useCallback(async () => {
    try {
      const response = await backupApi.listBackups();
      if (response && response.success) {
        setBackups(response.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch backup history:', err);
    }
  }, []);

  const fetchLastBackupStatus = useCallback(async () => {
    try {
      const response = await backupApi.getLastBackupStatus();
      if (response && response.success) {
        setLastBackup(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch last backup status:', err);
    }
  }, []);

  const fetchInternetStatus = useCallback(async () => {
    try {
      const response = await backupApi.getInternetStatus();
      if (response && response.success) {
        setInternetOnline(response.data.online);
      }
    } catch (err) {
      console.error('Failed to check internet status:', err);
      setInternetOnline(false);
    }
  }, []);

  const createLocalBackup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await backupApi.createLocalBackup();
      if (response && response.success) {
        await Promise.all([fetchBackups(), fetchLastBackupStatus()]);
        return response.data;
      }
      throw new Error(response.message || 'Backup failed');
    } catch (err) {
      setError(err.message || 'Backup failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchBackups, fetchLastBackupStatus]);

  const restoreBackup = useCallback(async (filename) => {
    setLoading(true);
    setError(null);
    try {
      const response = await backupApi.restoreBackup(filename);
      if (response && response.success) {
        await Promise.all([fetchBackups(), fetchLastBackupStatus()]);
        return response.data;
      }
      throw new Error(response.message || 'Restore failed');
    } catch (err) {
      setError(err.message || 'Restore failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchBackups, fetchLastBackupStatus]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchBackups(),
        fetchLastBackupStatus(),
        fetchInternetStatus()
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchBackups, fetchLastBackupStatus, fetchInternetStatus]);

  useEffect(() => {
    refreshAll();
    // Periodically check internet status every 30 seconds
    const interval = setInterval(fetchInternetStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshAll, fetchInternetStatus]);

  return {
    backups,
    lastBackup,
    internetOnline,
    loading,
    error,
    createLocalBackup,
    restoreBackup,
    refreshAll,
  };
}
