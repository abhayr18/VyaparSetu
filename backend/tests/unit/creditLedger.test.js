/**
 * The ledger's signs, in one place.
 *
 * Whether a row adds to what a customer owes or subtracts from it used to be
 * hardcoded in three independent places — the reconciliation query, the ledger
 * summary the vendor reads, and the test harness's own replay — each with a silent
 * `ELSE 0` for anything it did not recognise. That is a quiet failure by design: add
 * a fourth row type and the balance moves while all three totals ignore it, so a
 * customer's passbook stops adding up to the figure they are being asked to pay.
 *
 * `utils/creditLedger` is now the single definition, generating both the SQL and the
 * JS. These tests are about that guarantee, not about arithmetic: the point is that
 * the two forms cannot disagree, and that an unknown type is treated as unknown
 * rather than as zero-that-looks-deliberate.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  freshDb,
  cleanupDbs,
  makeCustomer,
  makeVegetable,
  creditBalance,
  ledgerSum,
} from '../helpers/testDb.js';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ledger = require(path.join(APP_ROOT, 'utils/creditLedger.js'));

afterAll(cleanupDbs);

describe('signOf', () => {
  it('adds debt for a credit sale, an adjustment and an opening balance', () => {
    expect(ledger.signOf('CREDIT_ADDED')).toBe(1);
    expect(ledger.signOf('CREDIT_ADJUSTMENT')).toBe(1);
    expect(ledger.signOf('OPENING_BALANCE')).toBe(1);
  });

  it('subtracts debt for a payment', () => {
    expect(ledger.signOf('PAYMENT_RECEIVED')).toBe(-1);
  });

  it('returns 0 for a type it does not know', () => {
    // Zero is the only honest answer — but it is also why the SQL and the JS must
    // come from the same table, so a new type is missing from both or neither.
    expect(ledger.signOf('SOMETHING_NEW')).toBe(0);
    expect(ledger.signOf(undefined)).toBe(0);
    expect(ledger.signOf(null)).toBe(0);
  });
});

describe('signedAmount', () => {
  it('applies the sign to the amount', () => {
    expect(ledger.signedAmount('CREDIT_ADDED', 324)).toBe(324);
    expect(ledger.signedAmount('PAYMENT_RECEIVED', 124)).toBe(-124);
    expect(ledger.signedAmount('OPENING_BALANCE', 5000)).toBe(5000);
  });

  it('reads a non-numeric amount as 0 rather than NaN', () => {
    // A single NaN would poison the whole replay and the reconciliation check would
    // report every customer as drifted.
    expect(ledger.signedAmount('CREDIT_ADDED', undefined)).toBe(0);
    expect(ledger.signedAmount('CREDIT_ADDED', 'abc')).toBe(0);
  });

  it('keeps a stored negative adjustment negative', () => {
    // recordAdjustment stores a signed amount; a write-off is a negative CREDIT_ADJUSTMENT.
    // An earlier bug stored Math.abs, which turned every write-off into a charge.
    expect(ledger.signedAmount('CREDIT_ADJUSTMENT', -500)).toBe(-500);
  });
});

describe('replay', () => {
  it('nets the whole passbook', () => {
    expect(
      ledger.replay([
        { transaction_type: 'OPENING_BALANCE', amount: 5000 },
        { transaction_type: 'CREDIT_ADDED', amount: 324 },
        { transaction_type: 'PAYMENT_RECEIVED', amount: 1000 },
        { transaction_type: 'CREDIT_ADJUSTMENT', amount: -24 },
      ])
    ).toBe(4300);
  });

  it('is 0 for no rows and for a non-array', () => {
    expect(ledger.replay([])).toBe(0);
    expect(ledger.replay(undefined)).toBe(0);
  });
});

describe('splitSigned', () => {
  it('separates what was added from what came back, by sign not by type name', () => {
    const { totalCredit, totalRecovered } = ledger.splitSigned([
      { transaction_type: 'OPENING_BALANCE', amount: 5000 },
      { transaction_type: 'CREDIT_ADDED', amount: 324 },
      { transaction_type: 'PAYMENT_RECEIVED', amount: 1000 },
      { transaction_type: 'CREDIT_ADJUSTMENT', amount: -24 },
    ]);

    // A negative adjustment reduces what is owed, so it belongs with the recoveries
    // even though its type is a credit type. The vendor reads these two figures side
    // by side and subtracts one from the other.
    expect(totalCredit).toBe(5324);
    expect(totalRecovered).toBe(1024);
    expect(totalCredit - totalRecovered).toBe(ledger.replay([
      { transaction_type: 'OPENING_BALANCE', amount: 5000 },
      { transaction_type: 'CREDIT_ADDED', amount: 324 },
      { transaction_type: 'PAYMENT_RECEIVED', amount: 1000 },
      { transaction_type: 'CREDIT_ADJUSTMENT', amount: -24 },
    ]));
  });
});

describe('signedAmountSql', () => {
  it('names every type the JS knows, so neither form can quietly lag the other', () => {
    const sql = ledger.signedAmountSql('ct');
    for (const type of ledger.LEDGER_TYPES) {
      expect(sql, `SQL must handle ${type}`).toContain(type);
    }
  });

  it('negates exactly the types the JS negates', () => {
    const sql = ledger.signedAmountSql('ct');
    for (const type of ledger.LEDGER_TYPES) {
      const clause = new RegExp(`transaction_type = '${type}' THEN (-?)ct\\.amount`);
      const match = clause.exec(sql);
      expect(match, `no clause for ${type}`).toBeTruthy();
      const negatedInSql = match[1] === '-';
      expect(negatedInSql, `${type} sign disagrees between SQL and JS`).toBe(
        ledger.signOf(type) < 0
      );
    }
  });

  it('refuses an alias that is not a plain identifier', () => {
    // The alias is interpolated, not bound, so it is the one injection surface here.
    expect(() => ledger.signedAmountSql('ct; DROP TABLE customers; --')).toThrow(/Unsafe SQL alias/);
    expect(() => ledger.signedAmountSql('')).toThrow(/Unsafe SQL alias/);
  });
});

describe('the SQL and the JS agree against a real database', () => {
  it('reconciles a customer holding all four row types', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx, { name: 'Abhay' });
    const vegetable = makeVegetable(ctx, { name: 'Onion', rate: 30 });

    // Opening balance from the notebook, then a sale, then a payment, then a write-off.
    await ctx.creditService.recordOpeningBalance({ customer_id: customer.id, amount: 5000 });
    await ctx.transactionService.createTransaction({
      customer_id: customer.id,
      vegetable_id: vegetable.id,
      weight: 10,
      rate: 30,
      payment_type: 'Credit',
      transaction_date: '2026-08-25',
    });
    await ctx.creditService.collectPayment({
      customer_id: customer.id,
      amount: 1000,
      payment_mode: 'Cash',
    });
    await ctx.creditService.adjustCredit({ customer_id: customer.id, amount: -24 });

    // ₹5000 + ₹324 − ₹1000 − ₹24
    expect(creditBalance(ctx, customer.id)).toBe(4300);
    // The JS replay agrees with the stored balance...
    expect(ledgerSum(ctx, customer.id)).toBe(4300);
    // ...and so does the SQL, which is what the dashboard warns from.
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('reports the drift when the balance is edited behind the ledger', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);
    await ctx.creditService.recordOpeningBalance({ customer_id: customer.id, amount: 5000 });

    // Simulate the corruption the check exists to catch: the balance moves without a
    // ledger row. If the SQL dropped OPENING_BALANCE it would compare 5000 against 0
    // and report drift here even before this edit — so this asserts the check is live
    // on the new type, not merely quiet.
    ctx.raw.run(`UPDATE customers SET credit_balance = 600000 WHERE id = ?`, [customer.id]);

    const mismatches = ctx.creditModel.findBalanceMismatches();
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].id).toBe(customer.id);
  });
});
