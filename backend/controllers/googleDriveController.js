/**
 * Google Drive Controller
 * Exposes API endpoints for authorization generation, callback handling,
 * connection status check, backup uploads, listing, unlinking, and restoring.
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
 * GET /api/drive/oauth-callback
 * Google OAuth redirect destination. Saves code token and redirects back to React client.
 */
async function handleCallback(req, res, next) {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('Authorization code missing in callback.');
    }
    
    await driveService.handleCallback(code);
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/backup?drive_connected=true`);
  } catch (err) {
    next(err);
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
 * POST /api/drive/backup
 */
async function backup(req, res, next) {
  try {
    const data = await driveService.uploadBackupToDrive();
    res.status(201).json({
      success: true,
      message: 'Database backup uploaded to Google Drive successfully.',
      data,
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
    const { fileId } = req.body;
    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: 'Google Drive file ID is required for restore.',
      });
    }

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
  backup,
  listBackups,
  restore,
  disconnect,
};
