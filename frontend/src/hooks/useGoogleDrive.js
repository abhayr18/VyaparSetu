import { useState, useEffect, useCallback } from 'react';
import { driveApi } from '../services/apiService';

export default function useGoogleDrive() {
  const [connected, setConnected] = useState(false);
  const [driveBackups, setDriveBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await driveApi.getStatus();
      if (res && res.success) {
        setConnected(res.data.connected);
        return res.data.connected;
      }
    } catch (err) {
      console.error('Failed to fetch Drive connection status:', err);
    }
    return false;
  }, []);

  const fetchDriveBackups = useCallback(async () => {
    try {
      const res = await driveApi.listBackups();
      if (res && res.success) {
        setDriveBackups(res.data || []);
      }
    } catch (err) {
      console.error('Failed to list Drive backups:', err);
    }
  }, []);

  const connectDrive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await driveApi.getAuthUrl();
      if (res && res.success && res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        throw new Error('Could not retrieve authentication URL.');
      }
    } catch (err) {
      setError(err.message || 'OAuth initialization failed.');
      setLoading(false);
    }
  }, []);

  const disconnectDrive = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await driveApi.disconnect();
      if (res && res.success) {
        setConnected(false);
        setDriveBackups([]);
        setSuccess('Disconnected from Google Drive successfully.');
      }
    } catch (err) {
      setError(err.message || 'Disconnect failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  const backupToDrive = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await driveApi.backup();
      if (res && res.success) {
        setSuccess(`Backup uploaded to Google Drive successfully: ${res.data.filename}`);
        await fetchDriveBackups();
        return res.data;
      }
      throw new Error(res.message || 'Google Drive backup failed.');
    } catch (err) {
      setError(err.message || 'Upload failed.');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchDriveBackups]);

  const restoreFromDrive = useCallback(async (fileId) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await driveApi.restore(fileId);
      if (res && res.success) {
        setSuccess(`Database restored successfully from Google Drive backup. Local safety backup created: ${res.data.safetyBackup}`);
        return res.data;
      }
      throw new Error(res.message || 'Google Drive restore failed.');
    } catch (err) {
      setError(err.message || 'Google Drive restore failed.');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const isConnected = await fetchStatus();
      if (isConnected) {
        await fetchDriveBackups();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchStatus, fetchDriveBackups]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const isConnected = await fetchStatus();
      if (isConnected) {
        await fetchDriveBackups();
      }
      
      // Check query params for redirected callback success
      const params = new URLSearchParams(window.location.search);
      if (params.get('drive_connected') === 'true') {
        setSuccess('Connected to Google Drive successfully!');
        // Clean query parameters from URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      
      setLoading(false);
    };
    init();
  }, [fetchStatus, fetchDriveBackups]);

  return {
    connected,
    driveBackups,
    loading,
    error,
    success,
    setSuccess,
    setError,
    connectDrive,
    disconnectDrive,
    backupToDrive,
    restoreFromDrive,
    refreshAll,
  };
}
