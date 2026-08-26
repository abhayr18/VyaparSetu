/**
 * VyapaarSetu Backend — Entry Point
 * Bootstraps Express server, middleware, routes, static SPA, and SQLite database.
 *
 * Runs two ways:
 *   - `node server.js` / `npm start` — boots immediately on PORT (dev + standalone).
 *   - required by the Electron main process — which calls startServer({ port })
 *     itself, so this module must NOT auto-boot when merely imported.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./database/init');
const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler } = require('./middleware/errorHandler');
const router = require('./routes/index');
const licenseService = require('./services/licenseService');
const logger = require('./utils/logger');

const app = express();

// The built React SPA. Overridable so the packaged app can point at its bundled
// copy; defaults to the sibling frontend/dist for a plain `npm start`.
const FRONTEND_DIST = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.join(__dirname, '../frontend/dist');

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ─── Licensing ──────────────────────────────────────────────────────────────
// Activation endpoints must stay reachable while the app is locked, so they mount
// AHEAD of the guard. Everything else under /api requires an activated license.
// Scoped to /api, so the SPA, its static assets, and the history fallback below
// are never blocked — a locked app still loads and can render the activation gate.
app.use('/api/license', require('./routes/licenseRoutes'));
app.use('/api', function licenseGuard(req, res, next) {
  if (req.path === '/health') return next(); // liveness probe stays open
  if (licenseService.isActivated()) return next();
  return res.status(403).json({
    success: false,
    message: 'App not activated',
    code: 'LICENSE_REQUIRED',
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', router);

// ─── Static SPA ───────────────────────────────────────────────────────────────
// Serve the built frontend from the same origin as the API, so one process on one
// port serves both. In dev (Vite owns 5173) frontend/dist may be absent — harmless:
// the static middleware finds nothing and the fallback hands back to the 404.
app.use(express.static(FRONTEND_DIST));

// SPA history fallback: a non-/api GET that matched no static file is a client-side
// route (BrowserRouter), so return index.html and let React route it. /api misses
// fall through to the JSON 404 below rather than being masked by HTML.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) next();
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start: Initialize DB then listen ─────────────────────────────────────────
/**
 * Initialize the database, then start listening.
 * @param {object} [opts]
 * @param {number} [opts.port] Port to bind. 0 lets the OS assign a free port —
 *   the packaged app uses this and reads the chosen port back from the result.
 * @returns {Promise<{ server: import('http').Server, port: number }>}
 */
async function startServer({ port } = {}) {
  const requestedPort = port != null ? port : process.env.PORT || 5000;
  await initializeDatabase();

  return new Promise((resolve, reject) => {
    const server = app.listen(requestedPort, () => {
      const actualPort = server.address().port;
      logger.info(`VyapaarSetu backend running on http://localhost:${actualPort}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      resolve({ server, port: actualPort });
    });
    server.on('error', reject);
  });
}

// Boot immediately only when run directly (node server.js / npm start). When the
// Electron main process requires this module, it calls startServer() itself.
if (require.main === module) {
  startServer().catch((err) => {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { app, startServer };
