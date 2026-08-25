/**
 * Ordered schema migrations.
 *
 * Replaces the previous approach, which probed for a column with
 * `try { SELECT col } catch { ALTER TABLE }` and — if the probe for
 * `bills.subtotal` failed — ran `DROP TABLE bills`. That silently destroyed
 * every bill on the shop PC the first time an older database met newer code.
 *
 * The rules here:
 *
 *   1. Nothing is ever dropped. A migration adds, backfills, or rebuilds while
 *      copying rows across.
 *   2. Every migration is guarded so running it against a database that already
 *      has the shape is a no-op. A brand-new database gets the correct schema
 *      straight from the baseline in init.js, then walks this list finding
 *      nothing to do. One code path serves both new and legacy databases.
 *   3. Applied versions are recorded in `schema_version`, so each runs at most
 *      once and the database can state which version it is.
 *
 * Adding a migration: append an entry with the next version number. Never edit
 * or renumber a released one — an installed shop PC has already recorded it.
 */

const logger = require('../utils/logger');

/**
 * The schema version that `init.js`'s CREATE TABLE block produces. Databases
 * predating the migration system are stamped at this version, since that block
 * has always been the starting shape.
 */
const BASELINE_VERSION = 1;

// ─── Introspection helpers ───────────────────────────────────────────────────

/** PRAGMA table_info for a table, keyed by column name. `{}` if absent. */
function columnInfo(db, table) {
  const res = db.exec(`PRAGMA table_info(${table})`);
  if (!res.length) return {};
  const { columns, values } = res[0];
  const out = {};
  for (const row of values) {
    const col = Object.fromEntries(columns.map((c, i) => [c, row[i]]));
    out[col.name] = col;
  }
  return out;
}

function hasColumn(db, table, column) {
  return Object.prototype.hasOwnProperty.call(columnInfo(db, table), column);
}

function tableExists(db, table) {
  const res = db.exec(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
  return res.length > 0;
}

/** Adds a column only if it is missing, so the call is safe to repeat. */
function addColumnIfMissing(db, table, column, definition) {
  if (!tableExists(db, table) || hasColumn(db, table, column)) return false;
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  logger.info(`  + ${table}.${column}`);
  return true;
}

/** First value of the first row, or null. */
function scalar(db, sql, params = []) {
  const res = db.exec(sql, params);
  return res.length && res[0].values.length ? res[0].values[0][0] : null;
}

// ─── The migrations ──────────────────────────────────────────────────────────

const MIGRATIONS = [
  {
    version: 2,
    name: 'bills-add-missing-money-columns',
    /**
     * The columns the old init.js would DROP the whole bills table to obtain.
     * Adding them with defaults preserves the vendor's billing history instead.
     */
    up(db) {
      addColumnIfMissing(db, 'bills', 'subtotal', 'REAL NOT NULL DEFAULT 0.0');
      addColumnIfMissing(db, 'bills', 'discount_type', "TEXT DEFAULT 'fixed'");
      addColumnIfMissing(db, 'bills', 'discount_value', 'REAL DEFAULT 0.0');
      addColumnIfMissing(db, 'bills', 'discount_amount', 'REAL DEFAULT 0.0');
      addColumnIfMissing(db, 'bills', 'commission_rate', 'REAL DEFAULT 8.0');
      addColumnIfMissing(db, 'bills', 'hamali_amount', 'REAL DEFAULT 0.0');
      addColumnIfMissing(db, 'bills', 'transport_amount', 'REAL DEFAULT 0.0');
      addColumnIfMissing(db, 'bills', 'paid_amount', 'REAL DEFAULT 0.0');
      addColumnIfMissing(db, 'bills', 'remaining_amount', 'REAL DEFAULT 0.0');
    },
  },

  {
    version: 3,
    name: 'transactions-add-payment-columns',
    up(db) {
      addColumnIfMissing(db, 'transactions', 'payment_type', "TEXT DEFAULT 'Credit'");
      addColumnIfMissing(db, 'transactions', 'payment_mode', "TEXT DEFAULT 'Credit'");
      addColumnIfMissing(db, 'transactions', 'paid_amount', 'REAL DEFAULT 0.0');
      addColumnIfMissing(db, 'transactions', 'remaining_amount', 'REAL DEFAULT 0.0');
    },
  },

  {
    version: 4,
    name: 'add-soft-delete-flags',
    up(db) {
      addColumnIfMissing(db, 'customers', 'is_deleted', 'INTEGER DEFAULT 0');
      addColumnIfMissing(db, 'vegetables', 'is_deleted', 'INTEGER DEFAULT 0');
    },
  },

  {
    version: 5,
    name: 'transactions-commission-rate-as-percentage',
    /**
     * `bills.commission_rate` has always held a percentage (8.0) while
     * `transactions.commission_rate` held a fraction (0.08), and
     * `settings.commission_rate` holds '8'. Three of the four sites — including
     * the one the vendor sees in Settings — mean percentage, so percentage wins
     * and this column converts.
     *
     * SQLite cannot alter a column default, so the table is rebuilt with rows
     * copied across. Stored `commission_amount` values stay as they are: a row
     * written as base × 0.08 is already 8% of base, so relabelling the rate as
     * 8 leaves the row internally consistent.
     */
    up(db) {
      const info = columnInfo(db, 'transactions');
      if (!info.commission_rate) return;

      const defaultValue = Number(info.commission_rate.dflt_value);
      const alreadyPercentage = defaultValue === 8;

      const fractionRows = Number(
        scalar(db, `SELECT COUNT(*) FROM transactions WHERE commission_rate > 0 AND commission_rate < 1`)
      );
      if (alreadyPercentage && fractionRows === 0) return;

      // Rows charged at a literal 8.0 under fraction semantics were billed 800%
      // commission. Converting the column cannot repair those amounts, so say so
      // rather than let the figure pass as correct.
      const overcharged = Number(
        scalar(
          db,
          `SELECT COUNT(*) FROM transactions
            WHERE commission_rate >= 1
              AND commission_amount > base_amount`
        )
      );
      if (overcharged > 0) {
        logger.warn(
          `  ! ${overcharged} transaction(s) have commission greater than the goods ` +
            `themselves — charged under the 800% bug. Their stored amounts are left ` +
            `untouched; review and re-enter them.`
        );
      }

      db.run(`
        CREATE TABLE transactions_migration_5 (
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
          created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(customer_id)  REFERENCES customers(id),
          FOREIGN KEY(vegetable_id) REFERENCES vegetables(id)
        )
      `);

      db.run(`
        INSERT INTO transactions_migration_5
          (id, customer_id, vegetable_id, vegetable_name_snapshot, weight, unit, rate,
           base_amount, commission_rate, commission_amount, final_amount,
           payment_type, payment_mode, paid_amount, remaining_amount,
           transaction_date, created_at, updated_at)
        SELECT
           id, customer_id, vegetable_id, vegetable_name_snapshot, weight, unit, rate,
           base_amount,
           CASE WHEN commission_rate > 0 AND commission_rate < 1
                THEN commission_rate * 100
                ELSE commission_rate
           END,
           commission_amount, final_amount,
           payment_type, payment_mode, paid_amount, remaining_amount,
           transaction_date, created_at, updated_at
        FROM transactions
      `);

      db.run('DROP TABLE transactions');
      db.run('ALTER TABLE transactions_migration_5 RENAME TO transactions');

      // Indexes belong to the dropped table and must be recreated.
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_transactions_customer_date
        ON transactions(customer_id, transaction_date)
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date)`);

      logger.info(`  ~ transactions.commission_rate converted to percentage (${fractionRows} row(s))`);
    },
  },

  {
    version: 6,
    name: 'link-ledger-rows-to-transactions',
    /**
     * Without this, deleteTransaction cannot find the CREDIT_ADDED row it wrote,
     * so deleting an udhar sale removed the sale and left the debt standing.
     */
    up(db) {
      addColumnIfMissing(db, 'credit_transactions', 'transaction_id', 'INTEGER REFERENCES transactions(id)');
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_credit_transactions_transaction
        ON credit_transactions(transaction_id)
      `);
    },
  },

  {
    version: 7,
    name: 'mark-transactions-consolidated-into-a-bill',
    /**
     * NULL means the sale has not been billed yet. Bill generation claims only
     * NULL rows, which is what stops a second click from billing the same day's
     * sales twice.
     */
    up(db) {
      addColumnIfMissing(db, 'transactions', 'bill_id', 'INTEGER REFERENCES bills(id)');
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_transactions_bill
        ON transactions(bill_id)
      `);
    },
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────────

function createVersionTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      name       TEXT     NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/** Highest recorded version, or 0 if the table is empty. */
function currentVersion(db) {
  return Number(scalar(db, 'SELECT COALESCE(MAX(version), 0) FROM schema_version')) || 0;
}

function stamp(db, version, name) {
  db.run(`INSERT OR IGNORE INTO schema_version (version, name) VALUES (?, ?)`, [version, name]);
}

/**
 * Applies every migration newer than the recorded version, in order.
 *
 * Each migration runs inside its own transaction: a failure rolls that migration
 * back and leaves the version unstamped, so the next boot retries it rather than
 * running the remaining migrations against a half-changed schema.
 *
 * @returns {number[]} versions applied during this call
 */
function runMigrations(db) {
  createVersionTable(db);

  if (currentVersion(db) === 0) {
    stamp(db, BASELINE_VERSION, 'baseline');
  }

  const from = currentVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > from).sort((a, b) => a.version - b.version);
  const applied = [];

  for (const migration of pending) {
    // A rebuild cannot run inside a transaction while foreign keys are enforced,
    // because the DROP + RENAME would be checked against rows mid-copy.
    db.run('PRAGMA foreign_keys = OFF');
    db.run('BEGIN TRANSACTION');
    try {
      migration.up(db);
      stamp(db, migration.version, migration.name);
      db.run('COMMIT');
      applied.push(migration.version);
      logger.info(`Migration ${migration.version} applied: ${migration.name}`);
    } catch (err) {
      db.run('ROLLBACK');
      logger.error(`Migration ${migration.version} (${migration.name}) failed: ${err.message}`);
      throw err;
    } finally {
      db.run('PRAGMA foreign_keys = ON');
    }
  }

  return applied;
}

module.exports = {
  BASELINE_VERSION,
  MIGRATIONS,
  runMigrations,
  currentVersion,
  columnInfo,
  hasColumn,
  tableExists,
};
