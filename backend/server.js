/**
 * VyapaarSetu Backend — Entry Point
 * Bootstraps Express server, middleware, routes, and SQLite database.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./database/init');
const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler } = require('./middleware/errorHandler');
const router = require('./routes/index');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', router);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Bootstrap: Initialize DB then Start Server ───────────────────────────────
async function bootstrap() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      logger.info(`VyapaarSetu backend running on http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

bootstrap();

module.exports = app;
