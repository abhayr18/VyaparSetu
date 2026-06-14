/**
 * Backup Controller
 * Exposes API handlers for local backups, listing backups, restores, status checking, and internet status.
 */

const backupService = require('../services/backupService');

/**
 * POST /api/backup/local
 * Creates a local manual backup of the current database.
 */
async function createLocalBackup(req, res, next) {
  try {
    const backupInfo = await backupService.createBackup();
    res.status(201).json({
      success: true,
      message: 'Backup created successfully.',
      data: backupInfo,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/backup/list
 * Returns the history list of all local backups.
 */
async function listBackups(req, res, next) {
  try {
    const backups = await backupService.listBackups();
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
 * POST /api/backup/restore
 * Restores the SQLite database from a selected local backup.
 */
async function restoreBackup(req, res, next) {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({
        success: false,
        message: 'Filename is required for restore.',
      });
    }

    const restoreInfo = await backupService.restoreBackup(filename);
    res.status(200).json({
      success: true,
      message: 'Database restored successfully.',
      data: restoreInfo,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/backup/status
 * Returns the timestamp and info of the most recent local backup.
 */
async function getBackupStatus(req, res, next) {
  try {
    const latest = await backupService.getLatestBackupStatus();
    res.status(200).json({
      success: true,
      data: latest,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/backup/internet-status
 * Detects whether the server has active internet connectivity.
 */
async function checkInternetStatus(req, res, next) {
  try {
    const online = await backupService.checkInternetStatus();
    res.status(200).json({
      success: true,
      data: {
        online,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createLocalBackup,
  listBackups,
  restoreBackup,
  getBackupStatus,
  checkInternetStatus,
};
