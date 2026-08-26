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

// --- File logging -----------------------------------------------------------
// A packaged GUI app has no console, so console output is lost — including on a
// client's machine where we can't attach a terminal. Everything important is
// mirrored to <userData>/logs/main.log so failures are diagnosable after the
// fact. Written defensively: logging must never crash the app.
let logStream = null;
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    if (!logStream) {
      const dir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(dir, { recursive: true });
      logStream = fs.createWriteStream(path.join(dir, 'main.log'), { flags: 'a' });
    }
    logStream.write(line);
  } catch {
    /* ignore logging failures */
  }
  try {
    process.stdout.write(line);
  } catch {
    /* no console attached */
  }
}

process.on('uncaughtException', (err) => {
  log(`uncaughtException: ${err && err.stack ? err.stack : String(err)}`);
});

// Disable GPU hardware acceleration. On some Windows GPUs/drivers the compositor
// never presents a first frame, so 'ready-to-show' never fires and the window
// stays hidden even though the app is running (4 live processes, no window).
// Software compositing is more than enough for this CRUD UI and is far more
// robust across the varied client machines this now ships to.
app.disableHardwareAcceleration();

// Single-instance: a second launch reveals the running window rather than
// starting a second server against the same database file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow = null;

  app.on('second-instance', () => {
    log('second-instance: revealing existing window');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
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
    process.env.LICENSE_PATH = path.join(userData, 'license.json');
    process.env.FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

    // better-sqlite3 creates the file but not its parent directory.
    fs.mkdirSync(path.dirname(process.env.DB_PATH), { recursive: true });
    fs.mkdirSync(process.env.BACKUP_DIR, { recursive: true });

    log(`starting backend; userData=${userData}`);
    const { startServer } = require('../backend/server.js');
    const { port } = await startServer({ port: 0 }); // 0 → OS picks a free port
    log(`backend started on http://localhost:${port}`);
    return port;
  }

  function createWindow(port) {
    log('creating window');
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

    // Reveal the window exactly once. Normally this happens on 'ready-to-show'
    // (first frame painted); the fallback timer guarantees the window still
    // appears if that frame never comes, so the app is never running-but-invisible.
    let shown = false;
    const reveal = (why) => {
      if (shown || !mainWindow) return;
      shown = true;
      log(`showing window (${why})`);
      mainWindow.show();
      mainWindow.focus();
    };

    mainWindow.once('ready-to-show', () => reveal('ready-to-show'));
    const fallbackTimer = setTimeout(() => reveal('fallback-timeout'), 4000);

    mainWindow.webContents.on('did-finish-load', () => log('renderer: did-finish-load'));
    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) =>
      log(`renderer: did-fail-load code=${code} desc="${desc}" url=${url}`)
    );
    mainWindow.webContents.on('render-process-gone', (_e, details) =>
      log(`renderer: render-process-gone ${JSON.stringify(details)}`)
    );

    // WhatsApp share links, Google OAuth, etc. open in the system browser rather
    // than hijacking or spawning windows inside the app.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
      clearTimeout(fallbackTimer);
      mainWindow = null;
    });

    const url = `http://localhost:${port}/`;
    log(`loading ${url}`);
    mainWindow.loadURL(url);
  }

  app.whenReady().then(async () => {
    log(`app ready; electron=${process.versions.electron} node=${process.versions.node}`);
    try {
      const port = await startBackend();
      createWindow(port);
    } catch (err) {
      const msg = err && err.stack ? err.stack : String(err);
      log(`FATAL: ${msg}`);
      dialog.showErrorBox(
        'VyapaarSetu failed to start',
        `The application could not start its local server.\n\n${msg}`
      );
      app.quit();
    }
  });

  // Single-window desktop app: closing the window exits (Windows-centric target).
  app.on('window-all-closed', () => {
    log('window-all-closed; quitting');
    app.quit();
  });
}
