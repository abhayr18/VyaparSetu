/**
 * Database Initialization
 * Creates all base tables on application startup.
 * This file runs once at boot — safe to call multiple times (uses IF NOT EXISTS).
 */

const { initDb, saveDb } = require('./db');
const logger = require('../utils/logger');

/**
 * Runs all CREATE TABLE statements for the initial schema.
 * Future modules will add their own table definitions here.
 */
async function initializeDatabase() {
  const db = await initDb();

  try {
    // ─── Application Settings ────────────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        key         TEXT    NOT NULL UNIQUE,
        value       TEXT    NOT NULL,
        description TEXT,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── Audit Log (for future use) ──────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        action      TEXT    NOT NULL,
        table_name  TEXT    NOT NULL,
        record_id   INTEGER,
        details     TEXT,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── Module 1: Customers ─────────────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS customers (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        name           TEXT    NOT NULL,
        mobile         TEXT    NOT NULL UNIQUE,
        address        TEXT    DEFAULT '',
        notes          TEXT    DEFAULT '',
        credit_balance REAL    DEFAULT 0.0,
        is_deleted     INTEGER DEFAULT 0,
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── Module 2: Vegetables ────────────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS vegetables (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL UNIQUE,
        rate            REAL    NOT NULL DEFAULT 0.0,
        unit            TEXT    NOT NULL DEFAULT 'kg',
        search_keywords TEXT    DEFAULT '',
        notes           TEXT    DEFAULT '',
        is_deleted      INTEGER DEFAULT 0,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if bills table needs migration (e.g. check if subtotal column exists)
    let needsMigration = false;
    try {
      db.exec("SELECT subtotal FROM bills LIMIT 1");
    } catch (e) {
      needsMigration = true;
    }
    if (needsMigration) {
      logger.info('Migrating billing tables (dropping and recreating with new columns)...');
      db.run('DROP TABLE IF EXISTS bill_items');
      db.run('DROP TABLE IF EXISTS bills');
    }

    // Check for hamali_amount migration separately since it was added later
    try {
      db.exec("SELECT hamali_amount FROM bills LIMIT 1");
    } catch (e) {
      if (!needsMigration) {
        logger.info('Migrating bills table: adding hamali_amount and transport_amount columns...');
        db.run("ALTER TABLE bills ADD COLUMN hamali_amount REAL DEFAULT 0.0");
        db.run("ALTER TABLE bills ADD COLUMN transport_amount REAL DEFAULT 0.0");
      }
    }

    // ─── Module 3: Billing ────────────────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS bills (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_number        TEXT    NOT NULL UNIQUE,
        customer_id        INTEGER NOT NULL,
        date               TEXT    NOT NULL,
        subtotal           REAL    NOT NULL,
        discount_type      TEXT    DEFAULT 'fixed',
        discount_value     REAL    DEFAULT 0.0,
        discount_amount    REAL    DEFAULT 0.0,
        commission_rate    REAL    DEFAULT 8.0,
        commission_amount  REAL    NOT NULL,
        hamali_amount      REAL    DEFAULT 0.0,
        transport_amount   REAL    DEFAULT 0.0,
        final_amount       REAL    NOT NULL,
        paid_amount        REAL    DEFAULT 0.0,
        remaining_amount   REAL    DEFAULT 0.0,
        payment_type       TEXT    NOT NULL,
        payment_status     TEXT    NOT NULL,
        created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES customers(id)
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS bill_items (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id        INTEGER NOT NULL,
        vegetable_id   INTEGER NOT NULL,
        vegetable_name TEXT    NOT NULL,
        quantity       REAL    NOT NULL,
        rate           REAL    NOT NULL,
        total          REAL    NOT NULL,
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(bill_id) REFERENCES bills(id),
        FOREIGN KEY(vegetable_id) REFERENCES vegetables(id)
      )
    `);

    // ─── Module 4: Credit Transactions ────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id                         INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id                INTEGER NOT NULL,
        bill_id                    INTEGER,
        transaction_type           TEXT    NOT NULL,
        amount                     REAL    NOT NULL,
        payment_mode               TEXT    NOT NULL,
        note                       TEXT,
        balance_after_transaction  REAL    NOT NULL,
        created_at                 DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES customers(id),
        FOREIGN KEY(bill_id) REFERENCES bills(id)
      )
    `);

    // ─── Auto-Migration Checks for Soft Delete ───────────────────────────────
    try {
      db.exec("SELECT is_deleted FROM customers LIMIT 1");
    } catch (e) {
      logger.info('Migrating customers table: adding is_deleted column...');
      db.run("ALTER TABLE customers ADD COLUMN is_deleted INTEGER DEFAULT 0");
    }

    try {
      db.exec("SELECT is_deleted FROM vegetables LIMIT 1");
    } catch (e) {
      logger.info('Migrating vegetables table: adding is_deleted column...');
      db.run("ALTER TABLE vegetables ADD COLUMN is_deleted INTEGER DEFAULT 0");
    }

// ─── Seed Default Settings ───────────────────────────────────────────────
    const seedData = [
      ['language', 'en',    'UI display language (en or mr)'],
      ['app_version', '1.0.0', 'Application version'],
      ['vendor_name', '',   'Vendor / Shop name'],
      ['owner_name', '', 'Owner name'],
      ['mobile_number', '', 'Mobile number'],
      ['address', '', 'Business address'],
      ['commission_rate', '8', 'Commission percentage rate'],
      ['default_payment_mode', 'Cash', 'Default payment type mode']
    ];

    for (const [key, value, description] of seedData) {
      db.run(
        `INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)`,
        [key, value, description]
      );
    }

    // Persist to disk after schema creation
    saveDb();

    logger.info('Database initialized successfully');
  } catch (err) {
    logger.error(`Database initialization failed: ${err.message}`);
    throw err;
  }
}

module.exports = { initializeDatabase };
