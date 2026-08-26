/**
 * The upgrade path.
 *
 * Every other test in this suite starts from a brand-new database, which means
 * none of them can catch a migration bug: a new database is already in the current
 * shape, so every migration correctly finds nothing to do. The upgrade an actual
 * shop PC performs — old file, new code — is the one case the rest of the suite is
 * structurally blind to, and it is where the destructive `DROP TABLE bills` lived.
 *
 * It bit immediately, too. The first boot against the real database failed with
 * "no such column: bill_id": the baseline block created an index over a column
 * that migration 7 had not added yet. `CREATE TABLE IF NOT EXISTS` had quietly
 * left the old table in place, so the baseline's column list was aspiration, and
 * `CREATE INDEX` is the one statement that does not tolerate the gap. Hence the
 * schema-convergence assertion below: it compares the migrated shape against a
 * fresh one column by column and index by index, rather than trusting that a
 * successful boot means the shapes agree.
 *
 * Two old shapes are tested, because they fail differently:
 *
 *   - SHIPPED is the schema read out of the actual database that failed to boot.
 *     It is what a shop PC upgrading today really holds, so it is the shape that
 *     decides whether this release is safe to install.
 *   - OLDEST is the earliest shape the migrations claim to handle. Nobody may
 *     still be running it, but it is the only fixture that exercises migrations
 *     2–4 at all; without it those three are dead code that nothing ever runs.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { freshDb, legacyDb, cleanupDbs } from '../helpers/testDb.js';

afterAll(cleanupDbs);

/**
 * The schema read verbatim out of `database/vyapaarsetu.db` before Phase 0 ran.
 * The trailing column clauses on `transactions` are where the old try/catch
 * `ALTER TABLE` probes landed — real installs carry that shape, so the fixture
 * keeps it rather than tidying it into the column list.
 *
 * Missing, and therefore what the migrations must add: `transactions.bill_id`,
 * `credit_transactions.transaction_id`, `schema_version`. `commission_rate` is
 * still the fraction 0.08.
 */
const SHIPPED_SCHEMA = `
  CREATE TABLE settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mobile TEXT NOT NULL UNIQUE,
    address TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    credit_balance REAL DEFAULT 0.0,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE vegetables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    rate REAL NOT NULL DEFAULT 0.0,
    unit TEXT NOT NULL DEFAULT 'kg',
    search_keywords TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    subtotal REAL NOT NULL,
    discount_type TEXT DEFAULT 'fixed',
    discount_value REAL DEFAULT 0.0,
    discount_amount REAL DEFAULT 0.0,
    commission_rate REAL DEFAULT 8.0,
    commission_amount REAL NOT NULL,
    hamali_amount REAL DEFAULT 0.0,
    transport_amount REAL DEFAULT 0.0,
    final_amount REAL NOT NULL,
    paid_amount REAL DEFAULT 0.0,
    remaining_amount REAL DEFAULT 0.0,
    payment_type TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );
  CREATE TABLE bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL,
    vegetable_id INTEGER NOT NULL,
    vegetable_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    rate REAL NOT NULL,
    total REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bill_id) REFERENCES bills(id),
    FOREIGN KEY(vegetable_id) REFERENCES vegetables(id)
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    vegetable_id INTEGER NOT NULL,
    vegetable_name_snapshot TEXT NOT NULL,
    weight REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'kg',
    rate REAL NOT NULL,
    base_amount REAL NOT NULL,
    commission_rate REAL NOT NULL DEFAULT 0.08,
    commission_amount REAL NOT NULL,
    final_amount REAL NOT NULL,
    transaction_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, payment_type TEXT DEFAULT 'Credit', payment_mode TEXT DEFAULT 'Credit', paid_amount REAL DEFAULT 0.0, remaining_amount REAL DEFAULT 0.0,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(vegetable_id) REFERENCES vegetables(id)
  );
  CREATE INDEX idx_transactions_customer_date ON transactions(customer_id, transaction_date);
  CREATE INDEX idx_transactions_date ON transactions(transaction_date);
  CREATE TABLE credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    bill_id INTEGER,
    transaction_type TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_mode TEXT NOT NULL,
    note TEXT,
    balance_after_transaction REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(bill_id) REFERENCES bills(id)
  );
`;

/**
 * The earliest shape, before the try/catch ALTERs ever ran: no `is_deleted` on
 * customers or vegetables, no money columns on `bills`, no payment columns on
 * `transactions`. This is the fixture that puts migrations 2–4 under test.
 */
const OLDEST_SCHEMA = `
  CREATE TABLE settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mobile TEXT NOT NULL UNIQUE,
    address TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    credit_balance REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE vegetables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    rate REAL NOT NULL DEFAULT 0.0,
    unit TEXT NOT NULL DEFAULT 'kg',
    search_keywords TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    commission_amount REAL NOT NULL,
    final_amount REAL NOT NULL,
    payment_type TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );
  CREATE TABLE bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL,
    vegetable_id INTEGER NOT NULL,
    vegetable_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    rate REAL NOT NULL,
    total REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bill_id) REFERENCES bills(id),
    FOREIGN KEY(vegetable_id) REFERENCES vegetables(id)
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    vegetable_id INTEGER NOT NULL,
    vegetable_name_snapshot TEXT NOT NULL,
    weight REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'kg',
    rate REAL NOT NULL,
    base_amount REAL NOT NULL,
    commission_rate REAL NOT NULL DEFAULT 0.08,
    commission_amount REAL NOT NULL,
    final_amount REAL NOT NULL,
    transaction_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(vegetable_id) REFERENCES vegetables(id)
  );
  CREATE INDEX idx_transactions_customer_date ON transactions(customer_id, transaction_date);
  CREATE INDEX idx_transactions_date ON transactions(transaction_date);
  CREATE TABLE credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    bill_id INTEGER,
    transaction_type TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_mode TEXT NOT NULL,
    note TEXT,
    balance_after_transaction REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(bill_id) REFERENCES bills(id)
  );
`;

/**
 * A day of trading recorded by the old code: fraction commission rates, one
 * customer owing ₹324 with a passbook that agrees, one paid-up customer with a
 * bill. `bills` is the one table whose columns differ between the two fixtures,
 * so its INSERT is supplied per shape.
 */
const dataFor = (billsInsert) => `
  INSERT INTO settings (key, value) VALUES ('commission_rate', '8');
  INSERT INTO customers (id, name, mobile, credit_balance)
    VALUES (1, 'Abhay', '9000000001', 324.0), (2, 'Sunil', '9000000002', 0.0);
  INSERT INTO vegetables (id, name, rate) VALUES (1, 'Onion', 30.0);
  ${billsInsert}
  INSERT INTO bill_items (bill_id, vegetable_id, vegetable_name, quantity, rate, total)
    VALUES (1, 1, 'Onion', 1, 100.0, 100.0);
  INSERT INTO transactions (id, customer_id, vegetable_id, vegetable_name_snapshot,
                            weight, unit, rate, base_amount, commission_rate,
                            commission_amount, final_amount, transaction_date)
    VALUES (1, 1, 1, 'Onion', 10, 'kg', 30.0, 300.0, 0.08, 24.0, 324.0, '2026-01-01');
  INSERT INTO credit_transactions (customer_id, transaction_type, amount,
                                   payment_mode, note, balance_after_transaction)
    VALUES (1, 'CREDIT_ADDED', 324.0, 'Credit', 'Onion 10kg', 324.0);
`;

const FIXTURES = [
  {
    label: 'the shape shipped to shops',
    sql:
      SHIPPED_SCHEMA +
      dataFor(`INSERT INTO bills (id, bill_number, customer_id, date, subtotal,
                                  commission_amount, final_amount, payment_type, payment_status)
               VALUES (1, 'BILL-20260101-0001', 2, '2026-01-01', 100.0, 8.0, 108.0, 'Cash', 'Paid');`),
  },
  {
    label: 'the oldest shape the migrations claim to handle',
    sql:
      OLDEST_SCHEMA +
      dataFor(`INSERT INTO bills (id, bill_number, customer_id, date,
                                  commission_amount, final_amount, payment_type, payment_status)
               VALUES (1, 'BILL-20260101-0001', 2, '2026-01-01', 8.0, 108.0, 'Cash', 'Paid');`),
  },
];

// ─── Schema comparison helpers ───────────────────────────────────────────────

function tableNames(ctx) {
  const res = ctx.raw.exec(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`
  );
  return res.length ? res[0].values.map((r) => r[0]) : [];
}

/** Column name → declared type, for one table. */
function columns(ctx, table) {
  const res = ctx.raw.exec(`PRAGMA table_info(${table})`);
  if (!res.length) return {};
  const { columns: cols, values } = res[0];
  const out = {};
  for (const row of values) {
    const col = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
    out[col.name] = col.type;
  }
  return out;
}

function indexNames(ctx) {
  const res = ctx.raw.exec(
    `SELECT name FROM sqlite_master
     WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`
  );
  return res.length ? res[0].values.map((r) => r[0]) : [];
}

function scalar(ctx, sql) {
  const res = ctx.raw.exec(sql);
  return res.length && res[0].values.length ? res[0].values[0][0] : null;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe.each(FIXTURES)('upgrading from $label', ({ sql }) => {
  it('boots at all', async () => {
    const ctx = await legacyDb(sql);
    expect(scalar(ctx, 'SELECT COALESCE(MAX(version), 0) FROM schema_version')).toBe(8);
  });

  it('arrives at the same schema as a database created fresh', async () => {
    const migrated = await legacyDb(sql);
    const migratedTables = tableNames(migrated);
    const migratedIndexes = indexNames(migrated);
    const migratedColumns = Object.fromEntries(
      migratedTables.map((tbl) => [tbl, columns(migrated, tbl)])
    );

    // freshDb() rebinds the app to a different database, so everything needed
    // from the migrated one is read above, before the switch.
    const fresh = await freshDb();

    expect(migratedTables).toEqual(tableNames(fresh));
    expect(migratedIndexes).toEqual(indexNames(fresh));
    for (const table of tableNames(fresh)) {
      expect(migratedColumns[table], `columns of ${table}`).toEqual(columns(fresh, table));
    }
  });

  it('keeps every row — no migration drops the vendor’s history', async () => {
    const ctx = await legacyDb(sql);

    expect(scalar(ctx, 'SELECT COUNT(*) FROM customers')).toBe(2);
    expect(scalar(ctx, 'SELECT COUNT(*) FROM vegetables')).toBe(1);
    expect(scalar(ctx, 'SELECT COUNT(*) FROM bills')).toBe(1);
    expect(scalar(ctx, 'SELECT COUNT(*) FROM bill_items')).toBe(1);
    expect(scalar(ctx, 'SELECT COUNT(*) FROM transactions')).toBe(1);
    expect(scalar(ctx, 'SELECT COUNT(*) FROM credit_transactions')).toBe(1);

    // Migration 8 rescales to paise, but the amount owed is unchanged: ₹324 → 32400,
    // now a whole integer rather than a float.
    expect(scalar(ctx, 'SELECT credit_balance FROM customers WHERE id = 1')).toBe(32400);
    expect(scalar(ctx, 'SELECT typeof(credit_balance) FROM customers WHERE id = 1')).toBe('integer');
    // Row identity survives the table rebuild in migration 5.
    expect(scalar(ctx, 'SELECT bill_number FROM bills WHERE id = 1')).toBe('BILL-20260101-0001');
    expect(scalar(ctx, 'SELECT customer_id FROM bills WHERE id = 1')).toBe(2);
  });

  it('converts the commission rate to a percentage without changing what was charged', async () => {
    const ctx = await legacyDb(sql);

    expect(scalar(ctx, 'SELECT commission_rate FROM transactions WHERE id = 1')).toBe(8);
    // ₹24 on ₹300 of goods is 8% either way — the unit was wrong, the money was not.
    // The amounts are paise now: ₹24 → 2400, ₹324 → 32400.
    expect(scalar(ctx, 'SELECT commission_amount FROM transactions WHERE id = 1')).toBe(2400);
    expect(scalar(ctx, 'SELECT final_amount FROM transactions WHERE id = 1')).toBe(32400);
  });

  it('leaves the passbook reconciled with the balance', async () => {
    const ctx = await legacyDb(sql);
    // The upgrade must not itself create the drift the dashboard warns about.
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('is usable afterwards — a sale on migrated data still books correctly', async () => {
    const ctx = await legacyDb(sql);

    const res = await ctx.transactionService.createTransaction({
      customer_id: 1,
      vegetable_id: 1,
      weight: 10,
      rate: 30,
      payment_type: 'Credit',
      transaction_date: '2026-01-02',
    });
    expect(res.success).toBe(true);

    // ₹324 already owed, plus ₹324 from this sale at the percentage rate → ₹648, in paise.
    expect(scalar(ctx, 'SELECT credit_balance FROM customers WHERE id = 1')).toBe(64800);
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('is idempotent — a second boot applies nothing and changes nothing', async () => {
    const ctx = await legacyDb(sql);
    const versionRows = scalar(ctx, 'SELECT COUNT(*) FROM schema_version');

    await ctx.initializeDatabase();

    expect(scalar(ctx, 'SELECT COUNT(*) FROM schema_version')).toBe(versionRows);
    expect(scalar(ctx, 'SELECT COUNT(*) FROM transactions')).toBe(1);
    expect(scalar(ctx, 'SELECT credit_balance FROM customers WHERE id = 1')).toBe(32400);
    // Rates are already percentages and amounts already paise; a second pass must not
    // multiply either one again.
    expect(scalar(ctx, 'SELECT commission_rate FROM transactions WHERE id = 1')).toBe(8);
  });

  it('enforces foreign keys once the upgrade is done', async () => {
    const ctx = await legacyDb(sql);
    // Migrations deliberately run with the pragma off — the table rebuild in
    // migration 5 needs it. It has to come back on before the app serves traffic.
    expect(scalar(ctx, 'PRAGMA foreign_keys')).toBe(1);
  });
});

describe('what the upgrade must not overwrite', () => {
  it('keeps a commission rate the vendor had already changed', async () => {
    const ctx = await legacyDb(
      SHIPPED_SCHEMA + `INSERT INTO settings (key, value) VALUES ('commission_rate', '6.5');`
    );
    // seedSettings uses INSERT OR IGNORE, so a configured rate must survive the
    // upgrade. Resetting it to the 8% default would silently change what the shop
    // charges on its next sale.
    expect(scalar(ctx, `SELECT value FROM settings WHERE key = 'commission_rate'`)).toBe('6.5');
  });

  it('still seeds the settings an old database never had', async () => {
    const ctx = await legacyDb(SHIPPED_SCHEMA);
    // An empty settings table on an old install must come out fully populated,
    // or the app reads undefined for a rate it needs.
    expect(scalar(ctx, `SELECT value FROM settings WHERE key = 'commission_rate'`)).toBe('8');
    expect(scalar(ctx, `SELECT COUNT(*) FROM settings WHERE key = 'default_payment_mode'`)).toBe(1);
  });
});
