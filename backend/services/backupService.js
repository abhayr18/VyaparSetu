/**
 * Local & Cloud Auto-Backup Service
 * Handles WAL-safe SQLite snapshots, cloud folder auto-detection (Google Drive, OneDrive),
 * custom destination mirroring, backup history listing, buffer verification,
 * and fail-safe transactional restorations.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const dns = require('dns').promises;
const crypto = require('crypto');
const os = require('os');
const { DB_PATH, reloadDb, serialize, backupTo, checkpoint, execGet, execRun } = require('../database/db');
const logger = require('../utils/logger');

// Repo-root backups/ by default; the packaged app overrides this to a writable
// per-user dir, since a program installed under Program Files cannot write beside
// its own files.
const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.resolve(__dirname, '../../backups');

// Ensure default backups directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Reads setting value from SQLite settings table
 */
function getSetting(key) {
  try {
    const row = execGet('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : null;
  } catch (err) {
    logger.warn(`Could not read setting '${key}': ${err.message}`);
    return null;
  }
}

/**
 * Writes setting value to SQLite settings table
 */
function setSetting(key, value) {
  try {
    execRun(`
      INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?
    `, [key, value, value]);
  } catch (err) {
    logger.warn(`Could not set setting '${key}': ${err.message}`);
  }
}

/**
 * Scans standard Windows drive letters and user profile paths for Google Drive & OneDrive
 * @returns {Array<{ provider: string, path: string, exists: boolean }>}
 */
function detectCloudFolders() {
  const userProfile = process.env.USERPROFILE || os.homedir();
  const candidates = [];

  // 1. Scan drive letters (G:, F:, H:, I:, D:, E:) for Google Drive for Desktop
  const driveLetters = ['G', 'F', 'H', 'I', 'D', 'E'];
  for (const letter of driveLetters) {
    const root = `${letter}:\\`;
    const myDrive = path.join(root, 'My Drive');
    const googleDrive = path.join(root, 'Google Drive');
    if (fs.existsSync(myDrive)) {
      candidates.push({
        provider: `Google Drive (${letter}: Drive)`,
        path: path.join(myDrive, 'VyapaarSetu_Backups'),
        exists: true,
      });
      break;
    } else if (fs.existsSync(googleDrive)) {
      candidates.push({
        provider: `Google Drive (${letter}: Drive)`,
        path: path.join(googleDrive, 'VyapaarSetu_Backups'),
        exists: true,
      });
      break;
    }
  }

  // 2. Scan User Profile for Google Drive
  const userGooglePaths = [
    path.join(userProfile, 'Google Drive'),
    path.join(userProfile, 'My Drive'),
    path.join(userProfile, 'GoogleDrive'),
  ];
  for (const ugp of userGooglePaths) {
    if (fs.existsSync(ugp)) {
      candidates.push({
        provider: 'Google Drive',
        path: path.join(ugp, 'VyapaarSetu_Backups'),
        exists: true,
      });
      break;
    }
  }

  // 3. Scan Microsoft OneDrive
  const oneDriveEnv = process.env.OneDrive || process.env.OneDriveCommercial;
  if (oneDriveEnv && fs.existsSync(oneDriveEnv)) {
    candidates.push({ provider: 'Microsoft OneDrive', path: path.join(oneDriveEnv, 'VyapaarSetu_Backups'), exists: true });
  } else {
    const oneDriveUser = path.join(userProfile, 'OneDrive');
    if (fs.existsSync(oneDriveUser)) {
      candidates.push({ provider: 'Microsoft OneDrive', path: path.join(oneDriveUser, 'VyapaarSetu_Backups'), exists: true });
    }
  }

  return candidates;
}

/**
 * Retrieves the current auto-backup configuration
 */
function getBackupConfig() {
  const customDir = getSetting('custom_backup_folder')?.trim() || '';
  const autoBackupEnabled = getSetting('auto_backup_enabled') !== '0';
  const lastAutoBackup = getSetting('last_cloud_sync') || getSetting('last_backup_sync') || null;
  const isDirty = getSetting('db_dirty') === '1';
  const detected = detectCloudFolders();

  const activeDir = (customDir && fs.existsSync(customDir)) ? customDir : BACKUP_DIR;

  return {
    defaultDir: BACKUP_DIR,
    customDir,
    activeDir,
    autoBackupEnabled,
    detectedCloudPaths: detected,
    lastAutoBackup,
    isDirty,
  };
}

/**
 * Saves the auto-backup directory configuration
 */
function saveBackupConfig({ customDir, autoBackupEnabled }) {
  if (customDir !== undefined) {
    const trimmed = (customDir || '').trim();
    if (trimmed) {
      // Ensure target directory exists
      if (!fs.existsSync(trimmed)) {
        fs.mkdirSync(trimmed, { recursive: true });
      }
    }
    setSetting('custom_backup_folder', trimmed);
  }

  if (autoBackupEnabled !== undefined) {
    setSetting('auto_backup_enabled', autoBackupEnabled ? '1' : '0');
  }

  return getBackupConfig();
}

/**
 * Validates SQLite magic header bytes ('SQLite format 3')
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function isValidSqliteBuffer(buffer) {
  if (!buffer || buffer.length < 100) return false;
  const header = buffer.subarray(0, 16).toString();
  return header.includes('SQLite format 3');
}

/**
 * Flushes all uncommitted WAL transactions into the main .db file.
 * Must be executed before copying, hashing, or restoring the SQLite database.
 */
function checkpointDatabase() {
  try {
    checkpoint();
  } catch (err) {
    logger.warn(`[DB] WAL Checkpoint warning: ${err.message}`);
  }
}

/**
 * Formats a Date object into backup-YYYY-MM-DD-HH-mm-ss.db
 */
function generateBackupFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `backup-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.db`;
}

/**
 * Cleans up old historical snapshots in a target folder, retaining the latest N backups
 */
function rotateBackups(folderPath, maxKeep = 30) {
  try {
    if (!fs.existsSync(folderPath)) return;
    const files = fs.readdirSync(folderPath)
      .filter((f) => f.startsWith('backup-') && (f.endsWith('.db') || f.endsWith('.sqlite')))
      .map((f) => ({
        name: f,
        fullPath: path.join(folderPath, f),
        mtime: fs.statSync(path.join(folderPath, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > maxKeep) {
      const toDelete = files.slice(maxKeep);
      for (const item of toDelete) {
        try {
          fs.unlinkSync(item.fullPath);
          logger.info(`Rotated old backup: ${item.name}`);
        } catch (_) {}
      }
    }
  } catch (err) {
    logger.warn(`Backup rotation warning for ${folderPath}: ${err.message}`);
  }
}

/**
 * Creates a local backup of the current SQLite database.
 * @returns {Promise<object>} Metadata of the created backup
 */
async function createBackup() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error('Database file does not exist to backup.');
  }

  // 1. Flush WAL
  checkpointDatabase();

  // Format filename and set full destination path
  const filename = generateBackupFilename();
  const destPath = path.join(BACKUP_DIR, filename);

  // If a backup with this name already exists, wait a second to avoid overwrite
  if (fs.existsSync(destPath)) {
    await new Promise((resolve) => setTimeout(resolve, 1050));
    return createBackup();
  }

  try {
    await backupTo(destPath);
  } catch (err) {
    logger.warn(`Native backupTo failed, falling back to file copy after checkpoint: ${err.message}`);
    checkpointDatabase();
    fs.copyFileSync(DB_PATH, destPath);
  }
  logger.info(`Backup created successfully at: ${destPath}`);

  // Maintain canonical latest file
  const latestLocal = path.join(BACKUP_DIR, 'vyapaarsetu-latest.db');
  try { fs.copyFileSync(destPath, latestLocal); } catch (_) {}

  // Mirror to custom cloud folder if configured
  const customDir = getSetting('custom_backup_folder')?.trim();
  if (customDir && fs.existsSync(customDir) && path.resolve(customDir) !== path.resolve(BACKUP_DIR)) {
    try {
      const customDest = path.join(customDir, filename);
      const customLatest = path.join(customDir, 'vyapaarsetu-latest.db');
      fs.copyFileSync(destPath, customDest);
      fs.copyFileSync(destPath, customLatest);
      rotateBackups(customDir, 30);
      logger.info(`Mirrored backup to custom folder: ${customDest}`);
    } catch (mirrorErr) {
      logger.warn(`Could not mirror backup to custom folder: ${mirrorErr.message}`);
    }
  }

  rotateBackups(BACKUP_DIR, 30);

  const stats = fs.statSync(destPath);
  setSetting('last_cloud_sync', new Date().toISOString());
  setSetting('db_dirty', '0');

  return {
    filename,
    size: stats.size,
    createdAt: stats.mtime.toISOString(),
  };
}

/**
 * Executes automatic background sync to local and cloud/custom destinations
 */
async function performAutoSync() {
  const isEnabled = getSetting('auto_backup_enabled') !== '0';
  if (!isEnabled) {
    return { success: true, skipped: true, reason: 'Auto-backup disabled by user' };
  }

  const result = await createBackup();
  logger.info(`[AutoSync] ✓ Backup snapshot successfully created (${result.filename})`);
  return {
    success: true,
    data: result,
  };
}

/**
 * Lists all backups from the default and custom history folders.
 * @returns {Promise<Array>} List of backup metadata
 */
async function listBackups() {
  const seen = new Map();

  const scanFolder = (folderPath, isCustom = false) => {
    if (!fs.existsSync(folderPath)) return;
    try {
      const files = fs.readdirSync(folderPath);
      for (const file of files) {
        if (file.startsWith('backup-') && (file.endsWith('.db') || file.endsWith('.sqlite'))) {
          const filePath = path.join(folderPath, file);
          try {
            const stats = fs.statSync(filePath);
            if (!seen.has(file) || isCustom) {
              seen.set(file, {
                filename: file,
                size: stats.size,
                createdAt: stats.mtime.toISOString(),
                location: isCustom ? 'Cloud / Custom Folder' : 'Local App Storage',
                filePath,
              });
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  };

  scanFolder(BACKUP_DIR, false);

  const customDir = getSetting('custom_backup_folder')?.trim();
  if (customDir && fs.existsSync(customDir) && path.resolve(customDir) !== path.resolve(BACKUP_DIR)) {
    scanFolder(customDir, true);
  }

  return Array.from(seen.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Restores the database from a backup file.
 * Checks default folder and custom cloud folder.
 * Creates a safety backup of current state before overwriting.
 * @param {string} filename The backup file name to restore from
 */
async function restoreBackup(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Invalid backup filename.');
  }

  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Access denied: Invalid backup filename format.');
  }

  let targetPath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(targetPath)) {
    const customDir = getSetting('custom_backup_folder')?.trim();
    if (customDir && fs.existsSync(customDir)) {
      const customCandidate = path.join(customDir, filename);
      if (fs.existsSync(customCandidate)) {
        targetPath = customCandidate;
      }
    }
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Backup file ${filename} does not exist.`);
  }

  if (!fs.existsSync(DB_PATH)) {
    throw new Error('Current database file not found. Cannot perform safety backup.');
  }

  const selectedBackupBuffer = fs.readFileSync(targetPath);
  if (!isValidSqliteBuffer(selectedBackupBuffer)) {
    throw new Error('Target file is not a valid SQLite database.');
  }

  // 1. Create a safety backup first
  logger.info('Creating safety backup prior to database restore...');
  const safetyBackupBuffer = serialize();
  const safetyInfo = await createBackup();
  const safetyFilename = safetyInfo.filename;
  logger.info(`Safety backup created at name: ${safetyFilename}`);

  try {
    // 2. Flush WAL & reload DB
    checkpointDatabase();
    logger.info(`Starting restore from backup file: ${filename}`);
    reloadDb(selectedBackupBuffer);
    checkpointDatabase();
    logger.info('Database restored successfully from backup.');
    return {
      success: true,
      restoredFile: filename,
      safetyBackup: safetyFilename,
    };
  } catch (err) {
    logger.error('Database restore failed. Attempting fail-safe rollback to safety backup...', err);
    try {
      reloadDb(safetyBackupBuffer);
      checkpointDatabase();
      logger.info('Database successfully reverted to safety state.');
    } catch (rollbackErr) {
      logger.error('CRITICAL: Rollback to safety backup failed!', rollbackErr);
    }
    throw new Error(`Restore failed: ${err.message}. Database has been kept safe.`);
  }
}

/**
 * Returns metadata of the latest backup file.
 * @returns {Promise<object|null>} Latest backup info or null if none
 */
async function getLatestBackupStatus() {
  const backups = await listBackups();
  return backups.length > 0 ? backups[0] : null;
}

/**
 * Checks internet connectivity without DNS spam
 * @returns {Promise<boolean>} True if online, false if offline
 */
function checkInternetStatus() {
  return new Promise((resolve) => {
    const req = http.get('http://clients3.google.com/generate_204', (res) => {
      resolve(res.statusCode === 204);
      res.resume();
    });
    req.setTimeout(3500, () => {
      req.destroy();
      dns.lookup('google.com')
        .then(() => resolve(true))
        .catch(() => resolve(false));
    });
    req.on('error', () => {
      dns.lookup('google.com')
        .then(() => resolve(true))
        .catch(() => resolve(false));
    });
  });
}

/**
 * Restores the database from a raw Buffer (e.g. uploaded/imported .db file).
 */
async function restoreFromBuffer(buffer, originalName = 'imported.db') {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid database file data provided.');
  }

  if (!isValidSqliteBuffer(buffer)) {
    throw new Error('Uploaded file is not a valid SQLite database format.');
  }

  if (!fs.existsSync(DB_PATH)) {
    throw new Error('Current database file not found. Cannot perform safety backup.');
  }

  // 1. Create a safety backup first
  logger.info('Creating safety backup prior to database import...');
  const safetyBackupBuffer = serialize();
  const safetyInfo = await createBackup();
  const safetyFilename = safetyInfo.filename;
  logger.info(`Safety backup created at name: ${safetyFilename}`);

  // 2. Save the imported file to the backup directory for record-keeping
  const importedFilename = generateBackupFilename(new Date()).replace('backup-', 'backup-imported-');
  const importedDestPath = path.join(BACKUP_DIR, importedFilename);
  try {
    fs.writeFileSync(importedDestPath, buffer);
  } catch (saveErr) {
    logger.warn(`Could not save imported copy to BACKUP_DIR: ${saveErr.message}`);
  }

  try {
    // 3. Flush WAL & reload DB
    checkpointDatabase();
    logger.info(`Starting restore from imported buffer (${buffer.length} bytes)...`);
    reloadDb(buffer);
    checkpointDatabase();
    logger.info('Database restored successfully from imported file.');
    return {
      success: true,
      restoredFile: importedFilename,
      originalName,
      safetyBackup: safetyFilename,
    };
  } catch (err) {
    logger.error('Database restore from buffer failed. Attempting fail-safe rollback to safety backup...', err);
    try {
      reloadDb(safetyBackupBuffer);
      checkpointDatabase();
      logger.info('Database successfully reverted to safety state.');
    } catch (rollbackErr) {
      logger.error('CRITICAL: Rollback to safety backup failed!', rollbackErr);
    }
    throw new Error(`Restore failed: ${err.message}. Database has been kept safe.`);
  }
}

/**
 * Gets absolute path for a specific backup file.
 */
function getBackupFilePath(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Invalid backup filename.');
  }
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Access denied: Invalid backup filename format.');
  }
  let targetPath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(targetPath)) {
    const customDir = getSetting('custom_backup_folder')?.trim();
    if (customDir && fs.existsSync(customDir)) {
      const candidate = path.join(customDir, filename);
      if (fs.existsSync(candidate)) {
        targetPath = candidate;
      }
    }
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Backup file ${filename} does not exist.`);
  }
  return targetPath;
}

/**
 * Creates a fresh snapshot and returns its absolute path for instant export.
 */
async function exportCurrentSnapshot() {
  const backupInfo = await createBackup();
  const filePath = path.join(BACKUP_DIR, backupInfo.filename);
  return {
    filePath,
    filename: backupInfo.filename,
    size: backupInfo.size,
  };
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
  restoreFromBuffer,
  getBackupFilePath,
  exportCurrentSnapshot,
  getLatestBackupStatus,
  checkInternetStatus,
  isValidSqliteBuffer,
  checkpointDatabase,
  generateBackupFilename,
  detectCloudFolders,
  getBackupConfig,
  saveBackupConfig,
  performAutoSync,
  BACKUP_DIR,
};
