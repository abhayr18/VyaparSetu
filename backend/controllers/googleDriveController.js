/**
 * Google Drive Controller
 * Exposes API endpoints for OAuth authorization generation, callback handling,
 * auto-backup synchronization, manual sync, listing, unlinking, and restoring.
 */

const driveService = require('../services/googleDriveBackupService');

/**
 * GET /api/drive/auth-url
 */
function getAuthUrl(req, res, next) {
  try {
    const authUrl = driveService.getAuthUrl();
    res.status(200).json({
      success: true,
      authUrl,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/drive/callback or /api/drive/oauth-callback
 * Google OAuth redirect destination. Saves tokens and redirects to the React app.
 */
async function handleCallback(req, res, next) {
  try {
    const { code, error } = req.query;
    if (error) {
      return res.redirect(`/backup?drive_error=${encodeURIComponent(error)}`);
    }
    if (!code) {
      return res.redirect('/backup?drive_error=Authorization%20code%20missing');
    }

    await driveService.handleCallback(code);
    res.redirect('/backup?drive_connected=true');
  } catch (err) {
    res.redirect(`/backup?drive_error=${encodeURIComponent(err.message)}`);
  }
}

/**
 * GET /api/drive/status
 */
async function getStatus(req, res, next) {
  try {
    const status = await driveService.getDriveStatus();
    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/drive/auto-backup
 * Background auto-sync endpoint invoked by the Electron daemon.
 * Skips gracefully if not connected or if database has no changes.
 */
async function autoBackup(req, res, next) {
  try {
    const status = await driveService.getDriveStatus();
    if (!status.connected) {
      return res.status(200).json({ success: false, reason: 'not_connected' });
    }

    const force = !!req.body?.force;
    if (!force && !driveService.isDatabaseDirty()) {
      return res.status(200).json({ success: true, skipped: true, reason: 'no_changes' });
    }

    const data = await driveService.upsertDriveBackup(force);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/drive/backup
 * Manual sync triggered from UI.
 */
async function backup(req, res, next) {
  try {
    const force = req.body?.force !== false;
    const data = await driveService.upsertDriveBackup(force);
    res.status(201).json({
      success: true,
      message: data.skipped ? 'Database unchanged; cloud sync skipped.' : 'Database backup synced to Google Drive successfully.',
      data: data.file,
      skipped: data.skipped,
      reason: data.reason,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/drive/backups
 */
async function listBackups(req, res, next) {
  try {
    const backups = await driveService.listDriveBackups();
    res.status(200).json({
      success: true,
      data: backups,
      count: backups.length,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/drive/restore
 */
async function restore(req, res, next) {
  try {
    const { fileId } = req.body || {};
    const data = await driveService.restoreFromDrive(fileId);
    res.status(200).json({
      success: true,
      message: 'Database restored from Google Drive successfully.',
      data,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/drive/disconnect
 */
async function disconnect(req, res, next) {
  try {
    const result = await driveService.disconnectDrive();
    res.status(200).json({
      success: true,
      message: 'Google Drive disconnected successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAuthUrl,
  handleCallback,
  getStatus,
  autoBackup,
  backup,
  listBackups,
  restore,
  disconnect,
};
