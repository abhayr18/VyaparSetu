/**
 * VyapaarSetu — Electron main process.
 *
 * Runs the existing Express backend in-process and points a BrowserWindow at it,
 * so one program on one origin serves both the API and the built React SPA — no
 * terminal, no browser tab.
 *
 * Writable data (database, backups, Drive tokens) is routed to a per-user folder
 * via app.getPath('userData') — %APPDATA%/VyapaarSetu on Windows — because once the
 * app is installed under Program Files, its own directory is read-only to it.
 */

const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Single-instance: a second launch focuses the running window rather than starting
// a second server against the same database file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow = null;

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  /**
   * Point the backend at writable, per-user locations, make sure those folders
   * exist, then start Express. Runs before requiring the backend because db.js
   * reads DB_PATH at module load. Returns the OS-assigned port.
   */
  async function startBackend() {
    const userData = app.getPath('userData'); // %APPDATA%/VyapaarSetu
    process.env.NODE_ENV = process.env.NODE_ENV || 'production';
    process.env.DB_PATH = path.join(userData, 'data', 'vyapaarsetu.db');
    process.env.BACKUP_DIR = path.join(userData, 'backups');
    process.env.DRIVE_TOKENS_PATH = path.join(userData, 'drive_tokens.json');
    process.env.FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

    // better-sqlite3 creates the file but not its parent directory.
    fs.mkdirSync(path.dirname(process.env.DB_PATH), { recursive: true });
    fs.mkdirSync(process.env.BACKUP_DIR, { recursive: true });

    const { startServer } = require('../backend/server.js');
    const { port } = await startServer({ port: 0 }); // 0 → OS picks a free port
    return port;
  }

  function createWindow(port) {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 940,
      minHeight: 600,
      show: false,
      backgroundColor: '#ffffff',
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    mainWindow.removeMenu(); // no default menu bar in the shipped app

    // WhatsApp share links, Google OAuth, etc. open in the system browser rather
    // than hijacking or spawning windows inside the app.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    mainWindow.loadURL(`http://localhost:${port}/`);
    mainWindow.once('ready-to-show', () => mainWindow.show());
  }

  app.whenReady().then(async () => {
    try {
      const port = await startBackend();
      createWindow(port);
    } catch (err) {
      dialog.showErrorBox(
        'VyapaarSetu failed to start',
        `The application could not start its local server.\n\n${
          err && err.stack ? err.stack : String(err)
        }`
      );
      app.quit();
    }
  });

  // Single-window desktop app: closing the window exits (Windows-centric target).
  app.on('window-all-closed', () => {
    app.quit();
  });
}
