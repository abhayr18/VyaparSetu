/**
 * BackupPage — MyBillBook Data & Sync-style
 * Status KPI cards + section cards for Local / Drive backup
 */

import { useState, useEffect } from 'react';
import useBackup from '../hooks/useBackup';
import useGoogleDrive from '../hooks/useGoogleDrive';
import { useTranslation } from '../hooks/useTranslation';
import {
  HistoryIcon, GlobeIcon, AlertIcon, CloudIcon,
  CheckIcon, SaveIcon, KeyIcon, UploadIcon, PlugIcon, FolderIcon
} from '../components/Icons';

export default function BackupPage() {
  const { t } = useTranslation();
  const {
    backups, lastBackup, internetOnline,
    loading: localBackupLoading, error: apiError,
    createLocalBackup, restoreBackup, refreshAll: refreshLocal,
  } = useBackup();

  const {
    connected: driveConnected, driveBackups,
    loading: driveLoading, error: driveError, success: driveSuccess,
    setSuccess: setDriveSuccess, setError: setDriveError,
    connectDrive, disconnectDrive, backupToDrive, restoreFromDrive, refreshAll: refreshDrive,
  } = useGoogleDrive();

  const [notice, setNotice]           = useState(null);
  const [localLoading, setLocalLoading] = useState(false);

  const showNotice = (message, isError = false) => {
    setNotice({ text: message, error: isError });
    setDriveSuccess(null); setDriveError(null);
    setTimeout(() => setNotice(null), 6000);
  };

  useEffect(() => {
    if (driveSuccess) { const t = setTimeout(() => setDriveSuccess(null), 6000); return () => clearTimeout(t); }
  }, [driveSuccess, setDriveSuccess]);

  useEffect(() => {
    if (driveError) { const t = setTimeout(() => setDriveError(null), 6000); return () => clearTimeout(t); }
  }, [driveError, setDriveError]);

  const handleCreateBackup = async () => {
    setLocalLoading(true);
    try { const d = await createLocalBackup(); showNotice(`${t('backup.backupSuccess')} (${d.filename})`); }
    catch (err) { showNotice(`${t('backup.backupFailed')}: ${err.message}`, true); }
    finally { setLocalLoading(false); }
  };

  const handleRestore = async (filename) => {
    if (!window.confirm(t('backup.confirmRestore'))) return;
    setLocalLoading(true);
    try { const d = await restoreBackup(filename); showNotice(`${t('backup.restoreSuccess')} Safety backup: ${d.safetyBackup}`); }
    catch (err) { showNotice(`${t('backup.restoreFailed')}: ${err.message}`, true); }
    finally { setLocalLoading(false); }
  };

  const handleBackupToDrive = async () => {
    setLocalLoading(true);
    try { const d = await backupToDrive(); await refreshLocal(); showNotice(`${t('backup.backupSuccess')} (${d.filename})`); }
    catch (err) { showNotice(`${t('backup.backupFailed')}: ${err.message}`, true); }
    finally { setLocalLoading(false); }
  };

  const handleRestoreFromDrive = async (fileId) => {
    if (!window.confirm(t('backup.confirmRestoreDrive'))) return;
    setLocalLoading(true);
    try { const d = await restoreFromDrive(fileId); await refreshLocal(); showNotice(`${t('backup.restoreSuccess')} Safety backup: ${d.safetyBackup}`); }
    catch (err) { showNotice(`${t('backup.restoreFailed')}: ${err.message}`, true); }
    finally { setLocalLoading(false); }
  };

  const handleRefreshAll = async () => {
    setLocalLoading(true);
    try { await refreshLocal(); if (internetOnline && driveConnected) await refreshDrive(); }
    catch (err) { console.error('Failed to refresh backups:', err); }
    finally { setLocalLoading(false); }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const isProcessing = localBackupLoading || driveLoading || localLoading;
  const activeError   = apiError || driveError || (notice?.error ? notice.text : null);
  const activeSuccess = driveSuccess || (notice && !notice.error ? notice.text : null);
  const lastDriveFile = driveBackups.length > 0 ? driveBackups[0] : null;

  return (
    <div style={{ animation: 'pageIn 0.2s ease' }}>
      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="page-header-bar">
        <div>
          <h1 className="page-title">{t('backup.title')}</h1>
          <p className="page-desc">{t('backup.subtitle')}</p>
        </div>
        <button className="btn btn-outline" onClick={handleRefreshAll} disabled={isProcessing} id="refresh-backup-btn">
          ↻ {t('dashboard.refreshStatus')}
        </button>
      </div>

      {/* ── Status KPI Cards ──────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
        {/* Internet */}
        <div className="kpi-card">
          <div className={`kpi-icon-box${internetOnline ? ' kpi-icon-green' : ' kpi-icon-red'}`}>
            {internetOnline ? <GlobeIcon style={{ width: '20px', height: '20px' }} /> : <AlertIcon style={{ width: '20px', height: '20px' }} />}
          </div>
          <div className="kpi-content">
            <div className="kpi-value" style={{ fontSize: '1rem' }}>
              {internetOnline === null ? t('dashboard.checking') : internetOnline ? t('backup.online') : t('backup.offline')}
            </div>
            <div className="kpi-label">{t('backup.internetStatus')}</div>
          </div>
        </div>

        {/* Last Local Backup */}
        <div className="kpi-card">
          <div className={`kpi-icon-box${lastBackup ? ' kpi-icon-teal' : ' kpi-icon-orange'}`}>
            <SaveIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              {lastBackup ? new Date(lastBackup.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : t('common.noData')}
            </div>
            <div className="kpi-label">{t('backup.lastBackup')}</div>
          </div>
        </div>

        {/* Drive Status */}
        <div className="kpi-card">
          <div className={`kpi-icon-box${driveConnected ? ' kpi-icon-green' : ' kpi-icon-blue'}`}>
            <CloudIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value" style={{ fontSize: '1rem' }}>
              {driveConnected ? t('backup.connected') : t('backup.disconnected')}
            </div>
            <div className="kpi-label">{t('backup.googleDrive')}</div>
          </div>
        </div>

        {/* Total Local Backups */}
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-purple">
            <FolderIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{backups.length}</div>
            <div className="kpi-label">Local Backups</div>
          </div>
        </div>
      </div>

      {/* ── Notification Banner ───────────────────────────────────────────── */}
      {(activeError || activeSuccess) && (
        <div style={{
          background: activeError ? 'var(--color-error-bg)' : 'var(--color-success-bg)',
          color: activeError ? 'var(--color-error)' : 'var(--color-success)',
          padding: '10px 16px', borderRadius: 'var(--border-radius-sm)',
          marginBottom: 20, fontWeight: 500,
          border: `1px solid ${activeError ? 'var(--color-error)' : 'var(--color-success)'}20`,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem',
        }}>
          {activeError ? <AlertIcon style={{ flexShrink: 0 }} /> : <CheckIcon style={{ flexShrink: 0 }} />}
          {activeError || activeSuccess}
        </div>
      )}

      {/* ── Local Backup Section ──────────────────────────────────────────── */}
      <div className="backup-section">
        <div className="backup-section-header">
          <div className="backup-section-title">
            <FolderIcon style={{ color: 'var(--color-primary)', width: '16px', height: '16px' }} />
            Local Backup
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            <span>{t('backup.lastBackup')}:</span>
            <span id="last-backup-time" style={{ fontWeight: 600 }}>{lastBackup ? formatDateTime(lastBackup.createdAt) : '—'}</span>
          </div>
        </div>
        <div className="backup-section-body">
          <p style={{ margin: '0 0 16px 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Create a local backup of all your data. Backups are stored in the <code style={{ background: 'var(--color-bg)', padding: '2px 6px', borderRadius: 4 }}>/backups</code> folder.
          </p>
          <button id="create-local-backup-btn" className="btn btn-primary" onClick={handleCreateBackup} disabled={isProcessing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {isProcessing && localBackupLoading
              ? <><span className="spinner" style={{ width: 13, height: 13 }} /> {t('backup.loading')}</>
              : <><SaveIcon style={{ width: '15px', height: '15px' }} /> {t('backup.createLocal')}</>}
          </button>
        </div>

        {/* Local Backup History */}
        {backups.length > 0 && (
          <div>
            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t('backup.history')}
              </span>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="table-th">{t('backup.filename')}</th>
                    <th className="table-th">{t('backup.createdAt')}</th>
                    <th className="table-th">{t('backup.fileSize')}</th>
                    <th className="table-th" style={{ textAlign: 'right' }}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map(bk => (
                    <tr className="table-row" key={bk.filename}>
                      <td className="table-cell" style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{bk.filename}</td>
                      <td className="table-cell" style={{ fontSize: '0.82rem' }}>{formatDateTime(bk.createdAt)}</td>
                      <td className="table-cell" style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{formatBytes(bk.size)}</td>
                      <td className="table-cell" style={{ textAlign: 'right' }}>
                        <button className="btn btn-outline" style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)', padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => handleRestore(bk.filename)} disabled={isProcessing}>
                          <HistoryIcon style={{ width: '13px', height: '13px' }} /> {t('backup.restore')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Google Drive Section ──────────────────────────────────────────── */}
      <div className="backup-section">
        <div className="backup-section-header">
          <div className="backup-section-title">
            <CloudIcon style={{ color: '#4285f4', width: '16px', height: '16px' }} />
            {t('backup.googleDrive')}
          </div>
          {driveConnected && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', background: 'var(--color-success-bg)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
              {t('backup.connected')}
            </span>
          )}
        </div>
        <div className="backup-section-body">
          {driveConnected && lastDriveFile && (
            <p style={{ margin: '0 0 14px 0', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
              {t('backup.lastDriveBackup')}: <strong>{formatDateTime(lastDriveFile.createdAt)}</strong>
            </p>
          )}
          <p style={{ margin: '0 0 16px 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {driveConnected
              ? 'Backups are stored in your "MandaiMitra_Backups" Google Drive folder.'
              : 'Link your Google account to enable secure cloud backups and restore data from anywhere.'}
          </p>

          {!internetOnline ? (
            <div style={{ padding: '10px 14px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: 'var(--border-radius-sm)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertIcon style={{ flexShrink: 0 }} /> {t('backup.offlineWarning') || 'Google Drive is unavailable while offline.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {!driveConnected ? (
                <button className="btn btn-primary" onClick={connectDrive} disabled={isProcessing}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <KeyIcon style={{ width: '15px', height: '15px' }} /> {t('backup.connectDrive')}
                </button>
              ) : (
                <>
                  <button className="btn btn-primary" onClick={handleBackupToDrive} disabled={isProcessing}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {isProcessing && driveLoading
                      ? <><span className="spinner" style={{ width: 13, height: 13 }} /> {t('backup.loading')}</>
                      : <><UploadIcon style={{ width: '15px', height: '15px' }} /> {t('backup.driveBackup')}</>}
                  </button>
                  <button className="btn btn-outline" onClick={disconnectDrive} disabled={isProcessing}
                    style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <PlugIcon style={{ width: '15px', height: '15px' }} /> {t('backup.disconnectDrive')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Drive History */}
        {driveConnected && driveBackups.length > 0 && (
          <div>
            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t('backup.driveHistory')}
              </span>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="table-th">{t('backup.filename')}</th>
                    <th className="table-th">{t('backup.createdAt')}</th>
                    <th className="table-th">{t('backup.fileSize')}</th>
                    <th className="table-th" style={{ textAlign: 'right' }}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {driveBackups.map(file => (
                    <tr className="table-row" key={file.id}>
                      <td className="table-cell" style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{file.filename}</td>
                      <td className="table-cell" style={{ fontSize: '0.82rem' }}>{formatDateTime(file.createdAt)}</td>
                      <td className="table-cell" style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{formatBytes(file.size)}</td>
                      <td className="table-cell" style={{ textAlign: 'right' }}>
                        <button className="btn btn-outline" style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)', padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => handleRestoreFromDrive(file.id)} disabled={isProcessing}>
                          <HistoryIcon style={{ width: '13px', height: '13px' }} /> {t('backup.restoreFromDrive')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
