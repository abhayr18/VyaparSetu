/**
 * Google Drive Backup Service
 * Implements Google Drive API OAuth 2.0 authentication, local token storage,
 * backup upload streaming, history listing, and safe database restorations.
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { DB_PATH, reloadDb } = require('../database/db');
const backupService = require('./backupService');
const logger = require('../utils/logger');

const TOKENS_PATH = path.resolve(__dirname, '../../database/drive_tokens.json');

// Initialize the Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Auto-save refreshed tokens back to disk when the client issues them
oauth2Client.on('tokens', (tokens) => {
  logger.info('Google OAuth access token refreshed automatically.');
  saveTokens(tokens);
});

/**
 * Saves and merges newly fetched/refreshed tokens to local disk.
 */
function saveTokens(tokens) {
  let current = {};
  if (fs.existsSync(TOKENS_PATH)) {
    try {
      current = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
    } catch (err) {
      /* ignore read errors */
    }
  }
  
  // Merge to preserve refresh_token which is only returned on first authorization
  const merged = { ...current, ...tokens };
  
  const dir = path.dirname(TOKENS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(merged, null, 2), 'utf8');
  oauth2Client.setCredentials(merged);
  return merged;
}

/**
 * Loads credentials from local storage disk.
 */
function loadTokens() {
  if (fs.existsSync(TOKENS_PATH)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
      oauth2Client.setCredentials(tokens);
      return tokens;
    } catch (err) {
      logger.error('Failed to parse locally stored Google tokens:', err);
    }
  }
  return null;
}

/**
 * Generates the authorization consent URL.
 */
function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });
}

/**
 * Processes authorization code to retrieve tokens.
 */
async function handleCallback(code) {
  if (!code) throw new Error('Authorization code required.');
  const { tokens } = await oauth2Client.getToken(code);
  saveTokens(tokens);
  logger.info('Google Drive successfully authenticated and tokens stored.');
  return tokens;
}

/**
 * Disconnects the linked Google account by deleting stored tokens.
 */
async function disconnectDrive() {
  if (fs.existsSync(TOKENS_PATH)) {
    fs.unlinkSync(TOKENS_PATH);
  }
  oauth2Client.setCredentials(null);
  logger.info('Google Drive disconnected.');
  return { success: true };
}

/**
 * Checks if the Google Drive service has active credentials.
 */
async function getDriveStatus() {
  const tokens = loadTokens();
  return {
    connected: !!tokens,
  };
}

/**
 * Retrieves the ID of the 'MandaiMitra_Backups' folder on user's Drive.
 * Creates it if it doesn't already exist.
 */
async function getOrCreateFolder(drive) {
  const response = await drive.files.list({
    q: "name = 'MandaiMitra_Backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  logger.info("Creating folder 'MandaiMitra_Backups' in Google Drive...");
  const folderMetadata = {
    name: 'MandaiMitra_Backups',
    mimeType: 'application/vnd.google-apps.folder',
  };

  const folder = await drive.files.create({
    resource: folderMetadata,
    fields: 'id',
  });

  return folder.data.id;
}

/**
 * Uploads a local database snapshot file to Google Drive.
 */
async function uploadBackupToDrive() {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error('Google Drive is not connected. Please authenticate first.');
  }

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const folderId = await getOrCreateFolder(drive);

  if (!fs.existsSync(DB_PATH)) {
    throw new Error('Local SQLite database file not found. Cannot perform upload.');
  }

  // Format backup filename
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const filename = `backup-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.db`;

  const fileMetadata = {
    name: filename,
    parents: [folderId],
  };

  const media = {
    mimeType: 'application/octet-stream',
    body: fs.createReadStream(DB_PATH),
  };

  logger.info(`Uploading current database to Drive as: ${filename}`);
  const response = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, name, size, createdTime',
  });

  logger.info(`Database snapshot uploaded successfully. Drive File ID: ${response.data.id}`);

  return {
    id: response.data.id,
    filename: response.data.name,
    size: Number(response.data.size || 0),
    createdAt: response.data.createdTime,
  };
}

/**
 * Lists backups stored in the 'MandaiMitra_Backups' folder on Drive.
 */
async function listDriveBackups() {
  const tokens = loadTokens();
  if (!tokens) return [];

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  let folderId;
  try {
    folderId = await getOrCreateFolder(drive);
  } catch (err) {
    logger.error('Failed to locate/create Google Drive parent folder:', err);
    return [];
  }

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, size, createdTime)',
    orderBy: 'createdTime desc',
  });

  return (response.data.files || []).map((file) => ({
    id: file.id,
    filename: file.name,
    size: Number(file.size || 0),
    createdAt: file.createdTime,
  }));
}

/**
 * Downloads a backup file from Google Drive and restores it.
 * Performs a local safety backup first. Reverts on failure.
 */
async function restoreFromDrive(driveFileId) {
  if (!driveFileId) {
    throw new Error('Google Drive file ID is required for restore.');
  }

  const tokens = loadTokens();
  if (!tokens) {
    throw new Error('Google Drive is not connected. Please authenticate first.');
  }

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // 1. Trigger local safety backup first
  logger.info('Creating local safety backup prior to Google Drive restoration...');
  const safetyBackupBuffer = fs.readFileSync(DB_PATH);
  const safetyInfo = await backupService.createBackup();
  const safetyFilename = safetyInfo.filename;

  // 2. Define temp file path to download content securely
  const tempDownloadPath = path.join(backupService.BACKUP_DIR, 'temp_drive_download.db');
  
  try {
    // 3. Stream download from Drive to temp file
    logger.info(`Downloading file ID: ${driveFileId} from Drive...`);
    const destStream = fs.createWriteStream(tempDownloadPath);
    
    const driveRes = await drive.files.get(
      { fileId: driveFileId, alt: 'media' },
      { responseType: 'stream' }
    );

    await new Promise((resolve, reject) => {
      driveRes.data
        .on('error', reject)
        .pipe(destStream)
        .on('error', reject)
        .on('finish', resolve);
    });

    logger.info('Google Drive backup file downloaded successfully to temp path.');

    // 4. Overwrite active database with downloaded content
    const downloadedBuffer = fs.readFileSync(tempDownloadPath);
    fs.writeFileSync(DB_PATH, downloadedBuffer);
    reloadDb(downloadedBuffer);

    // Clean up temp file
    if (fs.existsSync(tempDownloadPath)) {
      fs.unlinkSync(tempDownloadPath);
    }

    logger.info('Google Drive restore completed successfully.');
    return {
      success: true,
      restoredId: driveFileId,
      safetyBackup: safetyFilename,
    };
  } catch (err) {
    logger.error('Google Drive restore failed. Reverting database to safety state...', err);
    
    // Clean up temp file
    if (fs.existsSync(tempDownloadPath)) {
      try { fs.unlinkSync(tempDownloadPath); } catch (e) {}
    }

    // Revert files and memory connections
    try {
      fs.writeFileSync(DB_PATH, safetyBackupBuffer);
      reloadDb(safetyBackupBuffer);
      logger.info('Successfully reverted database to local safety backup.');
    } catch (rollbackErr) {
      logger.error('CRITICAL: Rollback to safety backup failed during Drive restore recovery!', rollbackErr);
    }
    
    throw new Error(`Drive restore failed: ${err.message}. Database has been kept safe.`);
  }
}

module.exports = {
  getAuthUrl,
  handleCallback,
  disconnectDrive,
  getDriveStatus,
  uploadBackupToDrive,
  listDriveBackups,
  restoreFromDrive,
  TOKENS_PATH,
};
