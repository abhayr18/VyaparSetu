/**
 * SQLite Database Connection (via sql.js — pure JavaScript, no native build)
 * Loads the SQLite DB from disk on startup, and persists back to disk on writes.
 *
 * sql.js operates on an in-memory database, so we must:
 *   1. Load the file from disk when the server starts.
 *   2. Save the file back to disk after every write operation.
 *
 * This module provides a thin wrapper that auto-saves after mutations.
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DB_PATH = path.resolve(process.env.DB_PATH || './database/vyapaarsetu.db');

let db = null;
let SQLInstance = null;

/**
 * Initializes and returns the sql.js database instance.
 * Must be called with `await` before any queries.
 */
async function initDb() {
  if (db) return db;

  const SQL = await initSqlJs();
  SQLInstance = SQL;

  // Load existing DB from file or start fresh
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    logger.info(`SQLite loaded from: ${DB_PATH}`);
  } else {
    db = new SQL.Database();
    logger.info(`SQLite created (new): ${DB_PATH}`);
  }

  db.run("PRAGMA foreign_keys = ON;");
  return db;
}

/**
 * Returns the initialized database instance.
 * Throws if initDb() has not been called yet.
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

/**
 * Persists the in-memory database to disk.
 * Call this after every INSERT / UPDATE / DELETE operation.
 */
function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);

  // Ensure directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Replaces the current active database instance with a new one loaded from a file buffer.
 * Automatically saves the new database to disk.
 */
function reloadDb(fileBuffer) {
  if (!SQLInstance) {
    throw new Error('SQLInstance not loaded. Call initDb() first.');
  }

  if (db) {
    try {
      db.close();
      logger.info('Closed previous database instance.');
    } catch (err) {
      logger.error('Error closing database instance:', err);
    }
  }

  db = new SQLInstance.Database(fileBuffer);
  db.run("PRAGMA foreign_keys = ON;");
  logger.info('Database instance reloaded successfully from buffer.');
  
  // Persist it immediately to disk
  saveDb();
  return db;
}

module.exports = { initDb, getDb, saveDb, reloadDb, DB_PATH };
