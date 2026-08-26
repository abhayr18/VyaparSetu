const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const { DB_PATH, reloadDb, serialize, backupTo } = require('../database/db');
const logger = require('../utils/logger');

// Repo-root backups/ by default; the packaged app overrides this to a writable
// per-user dir, since a program installed under Program Files cannot write beside
// its own files.
const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.resolve(__dirname, '../../backups');

// Ensure backups directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
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
 * Creates a local backup of the current SQLite database.
 * @returns {Promise<object>} Metadata of the created backup
 */
async function createBackup() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error('Database file does not exist to backup.');
  }

  // Format filename and set full destination path
  const filename = generateBackupFilename();
  const destPath = path.join(BACKUP_DIR, filename);

  // If a backup with this name already exists, wait a second to avoid overwrite
  if (fs.existsSync(destPath)) {
    await new Promise((resolve) => setTimeout(resolve, 1050));
    return createBackup();
  }

  // Online backup API rather than a byte copy of DB_PATH. Under WAL the most
  // recent commits live in the -wal sidecar, so fs.readFileSync(DB_PATH) would
  // capture a stale database missing the latest sales. backup() folds the WAL in
  // and writes one self-contained file.
  await backupTo(destPath);
  logger.info(`Backup created successfully at: ${destPath}`);

  const stats = fs.statSync(destPath);
  return {
    filename,
    size: stats.size,
    createdAt: stats.mtime.toISOString(),
  };
}

/**
 * Lists all backups in the history folder.
 * @returns {Promise<Array>} List of backup metadata
 */
async function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BACKUP_DIR);
  const backups = files
    .filter((file) => file.startsWith('backup-') && file.endsWith('.db'))
    .map((file) => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      return {
        filename: file,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
      };
    });

  // Sort backups by creation time descending (newest first)
  return backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Restores the database from a backup file in the backups folder.
 * Creates a safety backup of the current state before overwriting.
 * If the restore fails, it reverts to the safety backup.
 * @param {string} filename The backup file name to restore from
 */
async function restoreBackup(filename) {
  // Path traversal guard
  if (!filename || typeof filename !== 'string') {
    throw new Error('Invalid backup filename.');
  }

  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Access denied: Invalid backup filename format.');
  }

  const targetPath = path.join(BACKUP_DIR, filename);
  
  // Verify the target file resolves inside the backups directory
  const relative = path.relative(BACKUP_DIR, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Access denied: Restoring files outside backup folder is forbidden.');
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Backup file ${filename} does not exist.`);
  }

  if (!fs.existsSync(DB_PATH)) {
    throw new Error('Current database file not found. Cannot perform safety backup.');
  }

  // 1. Create a safety backup first
  logger.info('Creating safety backup prior to database restore...');
  // A consistent snapshot of the live database (WAL folded in) to roll back to if
  // the restore fails. serialize() is WAL-safe where a raw file read would not be.
  const safetyBackupBuffer = serialize();
  const safetyInfo = await createBackup();
  const safetyFilename = safetyInfo.filename;
  logger.info(`Safety backup created at name: ${safetyFilename}`);

  // 2. Read selected backup file contents
  const selectedBackupBuffer = fs.readFileSync(targetPath);

  try {
    // 3. Try to restore DB. reloadDb owns the on-disk replacement (atomic
    // temp-write + rename, and clears the stale -wal/-shm sidecars), so there is
    // no separate fs.writeFileSync here — writing DB_PATH ourselves while the old
    // -wal still sat beside it would splice two databases together.
    logger.info(`Starting restore from backup file: ${filename}`);
    reloadDb(selectedBackupBuffer);
    logger.info('Database restored successfully from backup.');
    return {
      success: true,
      restoredFile: filename,
      safetyBackup: safetyFilename,
    };
  } catch (err) {
    logger.error('Database restore failed. Attempting fail-safe rollback to safety backup...', err);
    try {
      // Revert to the pre-restore snapshot.
      reloadDb(safetyBackupBuffer);
      logger.info('Database successfully reverted to safety state.');
    } catch (rollbackErr) {
      logger.error('CRITICAL: Rollback to safety backup failed!', rollbackErr);
    }
    throw new Error(`Restore failed: ${err.message}. Database has been kept safe.`);
  }
}

/**
 * Returns metadata of the latest local backup file.
 * @returns {Promise<object|null>} Latest backup info or null if none
 */
async function getLatestBackupStatus() {
  const backups = await listBackups();
  return backups.length > 0 ? backups[0] : null;
}

/**
 * Checks internet connectivity using a DNS lookup.
 * @returns {Promise<boolean>} True if online, false if offline
 */
async function checkInternetStatus() {
  try {
    // Attempt lookup of google.com to test DNS resolution
    await dns.lookup('google.com');
    return true;
  } catch (err) {
    logger.warn('Internet status check: Offline or DNS lookup failed.');
    return false;
  }
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
  getLatestBackupStatus,
  checkInternetStatus,
  BACKUP_DIR,
};
