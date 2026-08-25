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
 * Connection-level settings that do NOT survive the handle being reopened.
 *
 * sql.js's export() closes the SQLite connection and reopens it from the
 * serialized bytes. PRAGMA foreign_keys is per-connection and defaults to OFF,
 * so without re-applying it here the pragma set in initDb() would last only
 * until the first saveDb() — after which orphan bill_items, transactions and
 * credit_transactions rows would all insert cleanly for the rest of the process.
 */
function applyConnectionPragmas(handle) {
  handle.run('PRAGMA foreign_keys = ON;');
}

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

  applyConnectionPragmas(db);
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
 * Depth of the current transaction() nesting. Zero means no transaction is open.
 *
 * SQLite has no nested BEGIN, but the call graph does nest — a service opens a
 * transaction and then calls models that each want their own. Counting depth lets
 * the inner calls join the outer transaction instead of failing on a second
 * BEGIN.
 */
let txDepth = 0;

/**
 * Runs `fn` inside a single database transaction, committing once it returns and
 * rolling back if it throws. Nested calls join the outermost transaction.
 *
 * Money operations must use this. Creating an udhar sale writes three rows — the
 * transaction, the customer's balance, the ledger entry — and a failure between
 * them leaves the vendor's books stating two different balances.
 *
 * The write to disk happens once, on the outermost commit, rather than after each
 * statement.
 *
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function transaction(fn) {
  const handle = getDb();

  if (txDepth > 0) {
    // Already inside a transaction — join it, and let the outermost frame decide
    // whether the whole thing commits.
    return fn();
  }

  txDepth += 1;
  handle.run('BEGIN TRANSACTION');
  try {
    const result = fn();
    handle.run('COMMIT');
    txDepth -= 1;
    // Deferred by saveDb() while the transaction was open; do it now, once.
    saveDb();
    return result;
  } catch (err) {
    try {
      handle.run('ROLLBACK');
    } catch (rollbackErr) {
      logger.error(`Rollback failed: ${rollbackErr.message}`);
    }
    txDepth -= 1;
    throw err;
  }
}

/** True while a transaction() is open. */
function inTransaction() {
  return txDepth > 0;
}

/**
 * Persists the in-memory database to disk.
 * Call this after every INSERT / UPDATE / DELETE operation.
 *
 * Inside transaction() this is a no-op: export() would serialize a database with
 * an open transaction, and the point of the transaction is that a half-finished
 * write never reaches the disk. transaction() saves once on commit.
 */
function saveDb() {
  if (!db) return;
  if (txDepth > 0) return;

  // export() closes and reopens the connection, dropping the pragmas with it.
  const data = db.export();
  applyConnectionPragmas(db);

  const buffer = Buffer.from(data);

  // Ensure directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write to a sibling temp file and rename over the target. A plain
  // writeFileSync truncates first, so a power cut mid-write — on a shop PC with
  // no UPS, mid-market-day — would leave an unopenable database. rename is
  // atomic within a filesystem, so the old file stays intact until the new one
  // is complete.
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, buffer);
  fs.renameSync(tempPath, DB_PATH);
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
  applyConnectionPragmas(db);
  // The restored database has no transaction open, whatever the old handle was
  // in the middle of.
  txDepth = 0;
  logger.info('Database instance reloaded successfully from buffer.');
  
  // Persist it immediately to disk
  saveDb();
  return db;
}

module.exports = { initDb, getDb, saveDb, reloadDb, transaction, inTransaction, DB_PATH };
