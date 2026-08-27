/**
 * Opening balance — the notebook migration.
 *
 * Every vendor buying this product already has customers, and those customers already
 * owe money. Until now the only way to record that was to invent a bill, which put
 * revenue and commission that never happened into the sales reports the vendor uses
 * to price their own business. So the requirement is precise: the opening balance must
 * move the customer's outstanding *without* creating a bill.
 *
 * Two things therefore have to hold, and they pull in opposite directions. The balance
 * must move (or the feature does nothing), and nothing that counts sales may see it
 * (or the vendor's own numbers lie to them).
 */

import { describe, it, expect, afterAll } from 'vitest';
import {
  freshDb,
  cleanupDbs,
  makeCustomer,
  makeVegetable,
  creditBalance,
  ledgerRows,
  ledgerSum,
} from '../helpers/testDb.js';

afterAll(cleanupDbs);

const TODAY = '2026-08-25';

describe('recording an opening balance', () => {
  it('moves the customer’s outstanding to the figure from the notebook', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx, { name: 'Abhay' });

    const res = await ctx.creditService.recordOpeningBalance({
      customer_id: customer.id,
      amount: 12500.5,
      note: 'Carried from notebook page 14',
    });

    expect(res.success).toBe(true);
    expect(creditBalance(ctx, customer.id)).toBe(12500.5);
  });

  it('writes exactly one ledger row, and no bill', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);

    await ctx.creditService.recordOpeningBalance({ customer_id: customer.id, amount: 5000 });

    const rows = ledgerRows(ctx, customer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].transaction_type).toBe('OPENING_BALANCE');
    expect(rows[0].amount).toBe(5000);
    expect(rows[0].balance_after_transaction).toBe(5000);
    expect(rows[0].bill_id).toBe(null);

    // The whole point of the feature. A fake bill here would show up in the bills
    // list, the sales report and the commission report as money the shop earned.
    expect(ctx.billModel.findAll()).toHaveLength(0);
  });

  it('leaves the passbook reconciled with the balance', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);

    await ctx.creditService.recordOpeningBalance({ customer_id: customer.id, amount: 5000 });

    expect(ledgerSum(ctx, customer.id)).toBe(creditBalance(ctx, customer.id));
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('is not counted as today’s business', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);

    await ctx.creditService.recordOpeningBalance({ customer_id: customer.id, amount: 5000 });

    // Migrated debt is not credit the shop extended today. Counting it would tell the
    // vendor they gave out ₹5000 of udhar on a day they gave out none.
    const summary = ctx.creditModel.getSummary();
    expect(summary.today_added).toBe(0);
    // It is still owed, though, so the outstanding total must include it.
    expect(summary.total_outstanding).toBe(5000);
  });

  it('adds to a balance the customer has already built up', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);
    const vegetable = makeVegetable(ctx, { name: 'Onion', rate: 30 });

    // A vendor who enters a sale before remembering the notebook figure must not be
    // blocked — that is the ordinary way this gets used.
    await ctx.transactionService.createTransaction({
      customer_id: customer.id,
      vegetable_id: vegetable.id,
      weight: 10,
      rate: 30,
      payment_type: 'Credit',
      transaction_date: TODAY,
    });
    const res = await ctx.creditService.recordOpeningBalance({
      customer_id: customer.id,
      amount: 5000,
    });

    expect(res.success).toBe(true);
    expect(creditBalance(ctx, customer.id)).toBe(5324);
    expect(ledgerSum(ctx, customer.id)).toBe(5324);
  });
});

describe('what an opening balance refuses', () => {
  it('refuses a second one for the same customer', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);

    await ctx.creditService.recordOpeningBalance({ customer_id: customer.id, amount: 5000 });
    const second = await ctx.creditService.recordOpeningBalance({
      customer_id: customer.id,
      amount: 5000,
    });

    // Two opening balances would double the migrated debt and leave no way to tell
    // which figure the notebook actually held.
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/already has an opening balance/i);
    expect(creditBalance(ctx, customer.id)).toBe(5000);
    expect(ledgerRows(ctx, customer.id)).toHaveLength(1);
  });

  it('refuses zero and negative amounts', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);

    for (const amount of [0, -1, -5000]) {
      const res = await ctx.creditService.recordOpeningBalance({
        customer_id: customer.id,
        amount,
      });
      expect(res.success, `amount ${amount} should be refused`).toBe(false);
    }
    expect(creditBalance(ctx, customer.id)).toBe(0);
    expect(ledgerRows(ctx, customer.id)).toHaveLength(0);
  });

  it('refuses a non-numeric amount', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);

    const res = await ctx.creditService.recordOpeningBalance({
      customer_id: customer.id,
      amount: 'five thousand',
    });
    expect(res.success).toBe(false);
    expect(creditBalance(ctx, customer.id)).toBe(0);
  });

  it('refuses a customer that does not exist', async () => {
    const ctx = await freshDb();
    const res = await ctx.creditService.recordOpeningBalance({ customer_id: 9999, amount: 5000 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });
});

describe('correcting an opening balance', () => {
  it('goes through an adjustment, which reconciles', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);

    await ctx.creditService.recordOpeningBalance({ customer_id: customer.id, amount: 5000 });
    // The notebook said ₹4500, not ₹5000.
    const fix = await ctx.creditService.adjustCredit({
      customer_id: customer.id,
      amount: -500,
      note: 'Opening balance corrected',
    });

    expect(fix.success).toBe(true);
    expect(creditBalance(ctx, customer.id)).toBe(4500);
    expect(ledgerSum(ctx, customer.id)).toBe(4500);
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });
});

describe('the ledger the vendor reads', () => {
  it('shows the opening balance as the oldest entry, however late it was entered', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);
    const vegetable = makeVegetable(ctx, { name: 'Onion', rate: 30 });

    // Entered the wrong way round on purpose: the sale first, the notebook figure after.
    await ctx.transactionService.createTransaction({
      customer_id: customer.id,
      vegetable_id: vegetable.id,
      weight: 10,
      rate: 30,
      payment_type: 'Credit',
      transaction_date: TODAY,
    });
    await ctx.creditService.recordOpeningBalance({ customer_id: customer.id, amount: 5000 });

    // The listing is newest-first, so the opening balance belongs at the end — that is
    // where a reader looking for "what they owed to begin with" will look.
    const history = ctx.creditModel.getCustomerTransactions(customer.id);
    expect(history).toHaveLength(2);
    expect(history[history.length - 1].transaction_type).toBe('OPENING_BALANCE');
  });

  it('keeps totalCredit − totalRecovered exactly on outstanding', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);
    const vegetable = makeVegetable(ctx, { name: 'Onion', rate: 30 });

    await ctx.creditService.recordOpeningBalance({ customer_id: customer.id, amount: 5000 });
    await ctx.transactionService.createTransaction({
      customer_id: customer.id,
      vegetable_id: vegetable.id,
      weight: 10,
      rate: 30,
      payment_type: 'Credit',
      transaction_date: TODAY,
    });
    await ctx.creditService.collectPayment({
      customer_id: customer.id,
      amount: 1000,
      payment_mode: 'Cash',
    });

    const ledger = ctx.customerModel.getLedger(customer.id);

    // These three numbers are printed next to each other and a customer will do the
    // subtraction. If the opening balance were missing from totalCredit, the ledger
    // would appear to prove the vendor was overcharging by ₹5000.
    expect(ledger.summary.totalCredit).toBe(5324);
    expect(ledger.summary.totalRecovered).toBe(1000);
    expect(ledger.summary.totalCredit - ledger.summary.totalRecovered).toBe(
      ledger.summary.outstanding
    );
    expect(ledger.summary.outstanding).toBe(4324);
  });
});

describe('adding a customer who already owes money', () => {
  it('records the balance in the same breath as the customer', async () => {
    const ctx = await freshDb();
    const customerService = ctx.requireApp('services/customerService.js');

    const created = customerService.createCustomer({
      name: 'Notebook Customer',
      mobile: '9876500001',
      opening_balance: 7500,
    });

    expect(Number(created.credit_balance)).toBe(7500);
    expect(creditBalance(ctx, created.id)).toBe(7500);

    const rows = ledgerRows(ctx, created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].transaction_type).toBe('OPENING_BALANCE');
    expect(ctx.billModel.findAll()).toHaveLength(0);
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('leaves a customer added without one at zero', async () => {
    const ctx = await freshDb();
    const customerService = ctx.requireApp('services/customerService.js');

    for (const opening_balance of [undefined, '', 0, '0']) {
      const created = customerService.createCustomer({
        name: 'Fresh Customer',
        mobile: String(9876500100 + [undefined, '', 0, '0'].indexOf(opening_balance)),
        opening_balance,
      });
      expect(Number(created.credit_balance), `opening_balance ${opening_balance}`).toBe(0);
      expect(ledgerRows(ctx, created.id)).toHaveLength(0);
    }
  });

  it('creates nothing at all when the opening balance is rejected', async () => {
    const ctx = await freshDb();
    const customerService = ctx.requireApp('services/customerService.js');

    expect(() =>
      customerService.createCustomer({
        name: 'Bad Balance',
        mobile: '9876500002',
        opening_balance: -500,
      })
    ).toThrow(/Opening balance/i);

    // A half-created customer is worse than none: the vendor would have to find and
    // delete a row they did not know was written.
    expect(ctx.customerModel.findByMobile('9876500002')).toBe(null);
  });

  it('refuses to re-open a customer who was already opened once', async () => {
    const ctx = await freshDb();
    const customerService = ctx.requireApp('services/customerService.js');

    const first = customerService.createCustomer({
      name: 'Returning Customer',
      mobile: '9876500003',
      opening_balance: 5000,
    });
    // Paid up, then removed — customerModel.create reactivates rather than duplicating,
    // so re-adding them lands back on the same row and the same ledger history.
    await ctx.creditService.collectPayment({
      customer_id: first.id,
      amount: 5000,
      payment_mode: 'Cash',
    });
    ctx.customerModel.remove(first.id);

    expect(() =>
      customerService.createCustomer({
        name: 'Returning Customer',
        mobile: '9876500003',
        opening_balance: 3000,
      })
    ).toThrow(/already has an opening balance/i);

    // The rollback must have undone the reactivation too, not left it half-applied.
    expect(creditBalance(ctx, first.id)).toBe(0);
    expect(ledgerRows(ctx, first.id)).toHaveLength(2);
  });
});
