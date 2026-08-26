/**
 * The runtime reconciliation check.
 *
 * The money tests prove the invariant holds for the paths they exercise. This
 * covers the check that watches for it in production: `credit_balance` must equal
 * the sum of the passbook, and the dashboard has to say so when it does not.
 *
 * A monitor is only worth having if it fails when the thing it watches fails, so
 * these tests corrupt a balance behind the service layer's back — writing raw SQL
 * the way a future bug or a hand-edited database would — and assert the check
 * notices. The quiet-on-a-healthy-ledger case matters just as much: a warning the
 * vendor sees every morning is a warning they stop reading.
 */

import { describe, it, expect, afterAll } from 'vitest';
import {
  freshDb,
  cleanupDbs,
  makeCustomer,
  makeVegetable,
} from '../helpers/testDb.js';

afterAll(cleanupDbs);

const TODAY = '2026-08-25';

/** A shop with two customers, one owing ₹324 from an udhar sale. */
async function shopWithSales() {
  const ctx = await freshDb();
  const owing = makeCustomer(ctx, { name: 'Abhay' });
  const settled = makeCustomer(ctx, { name: 'Sunil' });
  const vegetable = makeVegetable(ctx, { name: 'Onion', rate: 30 });

  await ctx.transactionService.createTransaction({
    customer_id: owing.id,
    vegetable_id: vegetable.id,
    weight: 10,
    rate: 30,
    payment_type: 'Credit',
    transaction_date: TODAY,
  });

  return { ctx, owing, settled, vegetable };
}

describe('creditModel.findBalanceMismatches', () => {
  it('finds nothing on a healthy ledger', async () => {
    const { ctx } = await shopWithSales();
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('stays quiet for a customer with no ledger rows at all', async () => {
    const ctx = await freshDb();
    makeCustomer(ctx, { name: 'Walk-in' });
    // Balance 0, passbook empty — those agree, and a new customer must not
    // light up the dashboard.
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('reports a balance that drifted above its passbook', async () => {
    const { ctx, owing } = await shopWithSales();
    ctx.raw.run('UPDATE customers SET credit_balance = 40000 WHERE id = ?', [owing.id]);

    const mismatches = ctx.creditModel.findBalanceMismatches();
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].id).toBe(owing.id);
    expect(mismatches[0].name).toBe('Abhay');
    expect(mismatches[0].stored_balance).toBe(400);
    expect(mismatches[0].ledger_balance).toBe(324);
    expect(mismatches[0].difference).toBe(76);
  });

  it('reports a ledger row that was never reflected in the balance', async () => {
    const { ctx, owing } = await shopWithSales();
    ctx.raw.run(
      `INSERT INTO credit_transactions
         (customer_id, transaction_type, amount, payment_mode, note, balance_after_transaction)
       VALUES (?, 'PAYMENT_RECEIVED', 10000, 'Cash', 'lost payment', 22400)`,
      [owing.id]
    );

    const mismatches = ctx.creditModel.findBalanceMismatches();
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].ledger_balance).toBe(224);
    expect(mismatches[0].stored_balance).toBe(324);
    expect(mismatches[0].difference).toBe(100);
  });

  it('counts a signed adjustment the way the passbook reads it', async () => {
    const { ctx, owing } = await shopWithSales();
    await ctx.creditService.adjustCredit({ customer_id: owing.id, amount: -24 });
    // ₹324 owed, ₹24 written off — balance and passbook must both say ₹300.
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('catches a one-paise drift — the smallest unit that can exist', async () => {
    const { ctx, owing } = await shopWithSales();
    // 32401 paise is ₹324.01; the ledger sums to 32400. One paise apart is now a
    // real, exact difference — there is no sub-paise float noise left to tolerate.
    ctx.raw.run('UPDATE customers SET credit_balance = 32401 WHERE id = ?', [owing.id]);

    const mismatches = ctx.creditModel.findBalanceMismatches();
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].difference).toBe(0.01);
  });

  it('ignores soft-deleted customers', async () => {
    const { ctx, owing } = await shopWithSales();
    ctx.raw.run('UPDATE customers SET credit_balance = 99900 WHERE id = ?', [owing.id]);
    expect(ctx.creditModel.findBalanceMismatches()).toHaveLength(1);

    ctx.customerModel.remove(owing.id);
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('orders the worst drift first', async () => {
    const { ctx, owing, settled } = await shopWithSales();
    ctx.raw.run('UPDATE customers SET credit_balance = 33000 WHERE id = ?', [owing.id]);   // off by ₹6
    ctx.raw.run('UPDATE customers SET credit_balance = 5000 WHERE id = ?', [settled.id]);  // off by ₹50

    const mismatches = ctx.creditModel.findBalanceMismatches();
    expect(mismatches.map((m) => m.id)).toEqual([settled.id, owing.id]);
  });
});

describe('the dashboard surfaces the check', () => {
  /**
   * getDashboardSummary also reports backup age and internet reachability, and the
   * latter is a live DNS lookup. A test that reaches the network is slow when it
   * works and flaky when it does not, so both are stubbed — what is under test
   * here is only that the reconciliation result reaches the payload.
   */
  function dashboardWithoutNetwork(ctx) {
    const backupService = ctx.requireApp('services/backupService.js');
    backupService.getLatestBackupStatus = async () => null;
    backupService.checkInternetStatus = async () => false;
    return ctx.requireApp('services/dashboardService.js');
  }

  it('reports ok on a healthy ledger', async () => {
    const { ctx } = await shopWithSales();
    const dashboardService = dashboardWithoutNetwork(ctx);

    const summary = await dashboardService.getDashboardSummary();
    expect(summary.ledgerCheck.ok).toBe(true);
    expect(summary.ledgerCheck.mismatchCount).toBe(0);
    expect(summary.ledgerCheck.mismatches).toEqual([]);
  });

  it('reports the drift, with the customer named', async () => {
    const { ctx, owing } = await shopWithSales();
    ctx.raw.run('UPDATE customers SET credit_balance = 40000 WHERE id = ?', [owing.id]);
    const dashboardService = dashboardWithoutNetwork(ctx);

    const summary = await dashboardService.getDashboardSummary();
    expect(summary.ledgerCheck.ok).toBe(false);
    expect(summary.ledgerCheck.mismatchCount).toBe(1);
    expect(summary.ledgerCheck.mismatches[0].name).toBe('Abhay');
    expect(summary.ledgerCheck.mismatches[0].difference).toBe(76);
  });
});
