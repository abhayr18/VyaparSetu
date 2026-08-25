/**
 * Database Initialization
 *
 * Two stages, in order:
 *
 *   1. The baseline schema below, created with CREATE TABLE IF NOT EXISTS. This
 *      is the shape a brand-new database is born with, and it is the single
 *      readable definition of the data model.
 *   2. Ordered migrations from ./migrations.js, which bring a database created by
 *      an older version up to the current shape. On a new database they find
 *      nothing to do.
 *
 * Safe to call repeatedly. Nothing here drops a table — the previous version of
 * this file ran `DROP TABLE bills` when a column probe failed, which erased the
 * vendor's billing history the first time old data met new code.
 *
 * One rule follows from the ordering, and breaking it stops the app from booting:
 * **the baseline may only reference columns from the oldest shape the migrations
 * start from.** `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table, so
 * against an older database the baseline's column list is aspiration, not fact —
 * those columns do not exist until the migrations below run. `CREATE INDEX` is not
 * so forgiving: an index over a column a migration has not added yet raises "no
 * such column" and the boot fails. So an index over a migration-added column is
 * created *by that migration*, next to the `ALTER TABLE` that adds it.
 */

const { initDb, saveDb } = require('./db');
const { runMigrations, currentVersion } = require('./migrations');
const logger = require('../utils/logger');

/**
 * Creates the baseline schema.
 *
 * Table order matters: a table is created after the tables it references, so the
 * foreign keys resolve cleanly.
 */
function createBaselineSchema(db) {
  // ─── Application Settings ──────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      key         TEXT    NOT NULL UNIQUE,
      value       TEXT    NOT NULL,
      description TEXT,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ─── Audit Log ─────────────────────────────────────────────────────────────
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

  // ─── Module 1: Customers ───────────────────────────────────────────────────
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

  // ─── Module 2: Vegetables ──────────────────────────────────────────────────
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

  // ─── Module 3: Billing ─────────────────────────────────────────────────────
  // commission_rate is a percentage (8.0 means 8%), matching what Settings shows.
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

  // ─── Module 5: Customer Vegetable Transactions ─────────────────────────────
  // Created before credit_transactions because ledger rows point back at these.
  //
  // commission_rate is a percentage, the same unit as bills.commission_rate.
  // bill_id is NULL until the day's sales are consolidated into a bill; that is
  // what makes bill generation idempotent.
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id             INTEGER NOT NULL,
      vegetable_id            INTEGER NOT NULL,
      vegetable_name_snapshot TEXT    NOT NULL,
      weight                  REAL    NOT NULL,
      unit                    TEXT    NOT NULL DEFAULT 'kg',
      rate                    REAL    NOT NULL,
      base_amount             REAL    NOT NULL,
      commission_rate         REAL    NOT NULL DEFAULT 8.0,
      commission_amount       REAL    NOT NULL,
      final_amount            REAL    NOT NULL,
      payment_type            TEXT    DEFAULT 'Credit',
      payment_mode            TEXT    DEFAULT 'Credit',
      paid_amount             REAL    DEFAULT 0.0,
      remaining_amount        REAL    DEFAULT 0.0,
      transaction_date        TEXT    NOT NULL,
      bill_id                 INTEGER,
      created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id)  REFERENCES customers(id),
      FOREIGN KEY(vegetable_id) REFERENCES vegetables(id),
      FOREIGN KEY(bill_id)      REFERENCES bills(id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_transactions_customer_date
    ON transactions(customer_id, transaction_date)
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date)`);
  // No index on transactions(bill_id) here — see the note below on why an index
  // over a migration-added column belongs to its migration.

  // ─── Module 4: Credit Transactions (the udhar passbook) ────────────────────
  // transaction_id links a ledger row to the sale that created it, so deleting
  // the sale can reverse exactly the debt it booked.
  db.run(`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id                         INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id                INTEGER NOT NULL,
      bill_id                    INTEGER,
      transaction_id             INTEGER,
      transaction_type           TEXT    NOT NULL,
      amount                     REAL    NOT NULL,
      payment_mode               TEXT    NOT NULL,
      note                       TEXT,
      balance_after_transaction  REAL    NOT NULL,
      created_at                 DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id)    REFERENCES customers(id),
      FOREIGN KEY(bill_id)        REFERENCES bills(id),
      FOREIGN KEY(transaction_id) REFERENCES transactions(id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_credit_transactions_customer
    ON credit_transactions(customer_id)
  `);
  // idx_credit_transactions_transaction is created by migration 6, alongside the
  // column it indexes.
}

/**
 * Inserts the settings the app reads at runtime, leaving any the vendor has
 * already changed alone.
 */
function seedSettings(db) {
  const seedData = [
    ['language', 'en', 'UI display language (en or mr)'],
    ['app_version', '1.0.0', 'Application version'],
    ['vendor_name', '', 'Vendor / Shop name'],
    ['owner_name', '', 'Owner name'],
    ['mobile_number', '', 'Mobile number'],
    ['address', '', 'Business address'],
    ['commission_rate', '8', 'Commission percentage rate'],
    ['default_payment_mode', 'Cash', 'Default payment type mode'],
  ];

  for (const [key, value, description] of seedData) {
    db.run(`INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)`, [
      key,
      value,
      description,
    ]);
  }
}

/**
 * Brings the database to the current schema. Called once at boot.
 */
async function initializeDatabase() {
  const db = await initDb();

  try {
    createBaselineSchema(db);
    runMigrations(db);
    seedSettings(db);

    saveDb();

    logger.info(`Database initialized successfully (schema version ${currentVersion(db)})`);
  } catch (err) {
    logger.error(`Database initialization failed: ${err.message}`);
    throw err;
  }
}

module.exports = { initializeDatabase };
