/**
 * Schema contract tests.
 *
 * Two jobs:
 *
 *  1. Assert the columns the money fixes depend on. A transaction cannot reverse
 *     its own ledger entry without credit_transactions.transaction_id, and bill
 *     generation cannot be idempotent without transactions.bill_id. Both are
 *     missing today, which is *why* delete-refund and double-billing are broken
 *     rather than merely buggy.
 *
 *  2. Lock the schema shape so the better-sqlite3 migration is verifiable. These
 *     tests pass on sql.js today and must still pass after the engine swap — if
 *     one goes red, the migration changed the data model, not just the driver.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { freshDb, cleanupDbs } from './helpers/testDb.js';

afterAll(cleanupDbs);

/** Column names of a table, via PRAGMA. */
function columns(ctx, table) {
  const res = ctx.raw.exec(`PRAGMA table_info(${table})`);
  if (!res.length) return [];
  const nameIdx = res[0].columns.indexOf('name');
  return res[0].values.map((row) => row[nameIdx]);
}

/** Full PRAGMA row for one column, or undefined. */
function column(ctx, table, name) {
  const res = ctx.raw.exec(`PRAGMA table_info(${table})`);
  if (!res.length) return undefined;
  const { columns: cols, values } = res[0];
  const row = values.find((r) => r[cols.indexOf('name')] === name);
  return row ? Object.fromEntries(cols.map((c, i) => [c, row[i]])) : undefined;
}

function tables(ctx) {
  const res = ctx.raw.exec(`SELECT name FROM sqlite_master WHERE type = 'table'`);
  return res.length ? res[0].values.map((r) => r[0]) : [];
}

describe('tables exist after initialization', () => {
  it('creates every table the app queries', async () => {
    const ctx = await freshDb();
    const found = tables(ctx);

    for (const t of [
      'settings',
      'audit_log',
      'customers',
      'vegetables',
      'bills',
      'bill_items',
      'credit_transactions',
      'transactions',
    ]) {
      expect(found, `missing table: ${t}`).toContain(t);
    }
  });

  it('seeds the settings the app reads at runtime', async () => {
    const ctx = await freshDb();
    for (const key of ['commission_rate', 'language', 'default_payment_mode']) {
      expect(ctx.settingsModel.getSetting(key), `missing setting: ${key}`).toBeTruthy();
    }
  });

  it('is safe to initialize twice', async () => {
    const ctx = await freshDb();
    ctx.customerModel.create({ name: 'Abhay', mobile: '9800000001', address: '', notes: '' });

    // Re-running init must not drop tables or wipe rows. database/init.js
    // currently has a DROP TABLE path that fires on a failed column probe.
    await ctx.initializeDatabase();

    expect(ctx.customerModel.findAll()).toHaveLength(1);
  });
});

describe('columns the money fixes require', () => {
  it('links a ledger row back to the transaction that created it', async () => {
    const ctx = await freshDb();

    // Without this, deleteTransaction has no way to find the CREDIT_ADDED row it
    // must reverse, so deleting an udhar sale leaves the debt standing.
    expect(columns(ctx, 'credit_transactions')).toContain('transaction_id');
  });

  it('marks a transaction as consolidated into a bill', async () => {
    const ctx = await freshDb();

    // Without this, generateBillFromTransactions re-reads the same transactions
    // every time it runs, so a double-click bills the customer twice.
    expect(columns(ctx, 'transactions')).toContain('bill_id');
  });

  it('keeps the schema version so migrations stop being guesswork', async () => {
    const ctx = await freshDb();

    // init.js probes for columns with try/catch and swallows failures. A recorded
    // version is what lets a migration be applied exactly once, in order.
    expect(tables(ctx)).toContain('schema_version');
  });
});

describe('money columns', () => {
  it('stores commission_rate in the same unit on bills and transactions', async () => {
    const ctx = await freshDb();

    const billRate = column(ctx, 'bills', 'commission_rate');
    const txRate = column(ctx, 'transactions', 'commission_rate');

    // 8.0 on bills vs 0.08 on transactions is the mismatch that charges 800%.
    expect(Number(txRate.dflt_value)).toBe(Number(billRate.dflt_value));
  });

  it('defaults credit_balance to zero', async () => {
    const ctx = await freshDb();
    expect(Number(column(ctx, 'customers', 'credit_balance').dflt_value)).toBe(0);
  });

  it('requires an amount and a resulting balance on every ledger row', async () => {
    const ctx = await freshDb();
    expect(column(ctx, 'credit_transactions', 'amount').notnull).toBe(1);
    expect(column(ctx, 'credit_transactions', 'balance_after_transaction').notnull).toBe(1);
  });
});

describe('constraints the app relies on', () => {
  it('keeps mobile numbers unique so a customer cannot be duplicated', async () => {
    const ctx = await freshDb();
    ctx.customerModel.create({ name: 'Abhay', mobile: '9800000002', address: '', notes: '' });

    // customerModel.create reactivates a matching row rather than inserting, so
    // going through the model must not produce a second customer.
    ctx.customerModel.create({ name: 'Someone Else', mobile: '9800000002', address: '', notes: '' });
    expect(ctx.customerModel.findAll()).toHaveLength(1);
  });

  it('keeps bill numbers unique', async () => {
    const ctx = await freshDb();
    expect(() => {
      ctx.raw.run(
        `INSERT INTO bills (bill_number, customer_id, date, subtotal, commission_amount, final_amount, payment_type, payment_status)
         VALUES ('DUP-1', 1, '2026-08-25', 100, 8, 108, 'Credit', 'Credit')`
      );
      ctx.raw.run(
        `INSERT INTO bills (bill_number, customer_id, date, subtotal, commission_amount, final_amount, payment_type, payment_status)
         VALUES ('DUP-1', 1, '2026-08-25', 100, 8, 108, 'Credit', 'Credit')`
      );
    }).toThrow();
  });

  it('soft-deletes customers so historical bills still render a name', async () => {
    const ctx = await freshDb();
    const c = ctx.customerModel.create({
      name: 'Abhay',
      mobile: '9800000003',
      address: '',
      notes: '',
    });

    ctx.customerModel.remove(c.id);

    expect(ctx.customerModel.findAll()).toHaveLength(0); // hidden from pickers
    expect(ctx.customerModel.findById(c.id)).toBeTruthy(); // still joinable
    expect(columns(ctx, 'customers')).toContain('is_deleted');
  });

  it('soft-deletes vegetables for the same reason', async () => {
    const ctx = await freshDb();
    const v = ctx.vegetableModel.create({
      name: 'Onion',
      rate: 30,
      unit: 'kg',
      search_keywords: '',
      notes: '',
    });

    ctx.vegetableModel.remove(v.id);

    expect(ctx.vegetableModel.findAll()).toHaveLength(0);
    expect(ctx.vegetableModel.findById(v.id)).toBeTruthy();
  });

  it('indexes transactions by customer and date, the hot query path', async () => {
    const ctx = await freshDb();
    const res = ctx.raw.exec(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'transactions'`
    );
    const names = res.length ? res[0].values.map((r) => r[0]) : [];
    expect(names).toContain('idx_transactions_customer_date');
  });
});
