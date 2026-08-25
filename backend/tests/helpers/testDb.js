/**
 * Test database harness.
 *
 * Two constraints shape this file.
 *
 * 1. `database/db.js` resolves DB_PATH once, at module load time:
 *
 *        const DB_PATH = path.resolve(process.env.DB_PATH || './database/vyapaarsetu.db');
 *
 *    So a test cannot just set process.env.DB_PATH and call into the app — by then
 *    the path is baked in and the test writes to the real shop database. That is
 *    exactly what backend/tests/transactionTest.js does today.
 *
 * 2. The app is CommonJS. Loading it with `await import()` under Vitest puts it in
 *    a *different* module registry than the `require()` calls inside the app's own
 *    files, so `init.js` initializes one copy of db.js while the test holds another
 *    — and the test's copy throws "Database not initialized".
 *
 * freshDb() resolves both: it points DB_PATH at a new temp file, purges the app's
 * entries from the CommonJS cache, and re-requires everything through a single
 * createRequire instance so the test and the app share one db.js.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const tempDirs = [];

/** Drops the app's own modules from the require cache, leaving node_modules warm. */
function purgeAppModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(APP_ROOT) && !key.includes('node_modules')) {
      delete require.cache[key];
    }
  }
}

/**
 * Creates an isolated, schema-initialized database and returns the app modules
 * bound to it. Call this in each test that touches the database.
 *
 * @returns {Promise<object>} models, services and raw db handles for this test
 */
export async function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyapaarsetu-test-'));
  tempDirs.push(dir);

  // Order matters: env first, then cache purge, then require.
  process.env.DB_PATH = path.join(dir, 'test.db');
  purgeAppModules();

  const { initializeDatabase } = require('../../database/init.js');
  await initializeDatabase();

  const db = require('../../database/db.js');

  // A regression that silently reconnected to the real shop database would make
  // every assertion below meaningless, so fail loudly instead.
  if (!db.DB_PATH.includes('vyapaarsetu-test-')) {
    throw new Error(
      `Test harness escaped the temp directory — refusing to run against ${db.DB_PATH}`
    );
  }

  return {
    dbPath: db.DB_PATH,
    db,
    raw: db.getDb(),
    // Exposed so tests can assert that re-running init is non-destructive.
    initializeDatabase,
    customerModel: require('../../models/customerModel.js'),
    vegetableModel: require('../../models/vegetableModel.js'),
    billModel: require('../../models/billModel.js'),
    billItemModel: require('../../models/billItemModel.js'),
    creditModel: require('../../models/creditModel.js'),
    transactionModel: require('../../models/transactionModel.js'),
    settingsModel: require('../../models/settingsModel.js'),
    transactionService: require('../../services/transactionService.js'),
    billService: require('../../services/billService.js'),
    creditService: require('../../services/creditService.js'),
    settingsService: require('../../services/settingsService.js'),
  };
}

/** Deletes every temp database this file created. Call from afterAll. */
export function cleanupDbs() {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can still hold the handle; a stray temp dir is harmless.
    }
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

let mobileSeq = 0;

/** Creates a customer with a guaranteed-unique mobile (the column is UNIQUE). */
export function makeCustomer(ctx, overrides = {}) {
  mobileSeq += 1;
  return ctx.customerModel.create({
    name: `Test Customer ${mobileSeq}`,
    mobile: String(9000000000 + mobileSeq),
    address: 'APMC Market',
    notes: '',
    ...overrides,
  });
}

let vegSeq = 0;

/** Creates a vegetable with a guaranteed-unique name (the column is UNIQUE). */
export function makeVegetable(ctx, overrides = {}) {
  vegSeq += 1;
  return ctx.vegetableModel.create({
    name: `Test Vegetable ${vegSeq}`,
    rate: 30,
    unit: 'kg',
    search_keywords: '',
    notes: '',
    ...overrides,
  });
}

// ─── Reading money state ─────────────────────────────────────────────────────

/** Reads customers.credit_balance directly, bypassing all service-layer math. */
export function creditBalance(ctx, customerId) {
  const res = ctx.raw.exec('SELECT credit_balance FROM customers WHERE id = ?', [customerId]);
  return res.length ? Number(res[0].values[0][0]) : 0;
}

/** All credit_transactions rows for a customer, oldest first. */
export function ledgerRows(ctx, customerId) {
  const res = ctx.raw.exec(
    `SELECT id, transaction_type, amount, balance_after_transaction, note, bill_id
     FROM credit_transactions WHERE customer_id = ? ORDER BY id ASC`,
    [customerId]
  );
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

/**
 * Replays the ledger the way a vendor reading a passbook would: credits add to
 * what is owed, payments subtract. The total must equal credit_balance. When the
 * two disagree, one of them is lying to the vendor and neither can be trusted —
 * which is why this is the invariant every money test ends on.
 */
export function ledgerSum(ctx, customerId) {
  return paise(
    ledgerRows(ctx, customerId).reduce((acc, row) => {
      const amt = Number(row.amount) || 0;
      if (row.transaction_type === 'CREDIT_ADDED') return acc + amt;
      if (row.transaction_type === 'PAYMENT_RECEIVED') return acc - amt;
      if (row.transaction_type === 'CREDIT_ADJUSTMENT') return acc + amt;
      return acc;
    }, 0)
  );
}

/** Rounds to paise so REAL-column float noise can't fail an otherwise-correct test. */
export function paise(n) {
  return Math.round(Number(n) * 100) / 100;
}
