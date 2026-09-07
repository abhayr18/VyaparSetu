/**
 * Credit balance integrity — the money tests.
 *
 * `customers.credit_balance` is the number the vendor reads out loud when a
 * customer asks "how much do I owe?". Everything here asserts that number, and
 * the ledger behind it, against what a vendor would compute on paper.
 *
 * Two independent code paths write to credit_balance today:
 *
 *   transactionService.createTransaction  → books each udhar sale as it happens
 *   billModel.create                      → books the bill's remaining_amount
 *
 * Since a bill generated from transactions carries the *same* remaining amount
 * those transactions already booked, the debt is counted twice. These tests
 * define the intended contract instead: a transaction books the debt when the
 * sale happens, and consolidating those transactions into a bill only relabels
 * debt that already exists.
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
  paise,
} from '../helpers/testDb.js';

afterAll(cleanupDbs);

const TODAY = '2026-08-25';

/** A customer, a vegetable, and a clean slate. */
async function scenario() {
  const ctx = await freshDb();
  const customer = makeCustomer(ctx, { name: 'Abhay' });
  const vegetable = makeVegetable(ctx, { name: 'Onion', rate: 30 });
  return { ctx, customer, vegetable };
}

/** 10 kg of onions @ ₹30 on full credit → ₹300 base + 8% = ₹324 owed. */
function creditSale(ctx, customer, vegetable, overrides = {}) {
  return ctx.transactionService.createTransaction({
    customer_id: customer.id,
    vegetable_id: vegetable.id,
    weight: 10,
    rate: 30,
    payment_type: 'Credit',
    transaction_date: TODAY,
    ...overrides,
  });
}

describe('a single udhar transaction', () => {
  it('books exactly the unpaid amount against the customer', async () => {
    const { ctx, customer, vegetable } = await scenario();

    const res = await creditSale(ctx, customer, vegetable);
    expect(res.success).toBe(true);
    expect(res.data.final_amount).toBe(324);
    expect(res.data.remaining_amount).toBe(324);

    expect(creditBalance(ctx, customer.id)).toBe(324);
  });

  it('writes one ledger row that reconciles with the balance', async () => {
    const { ctx, customer, vegetable } = await scenario();
    await creditSale(ctx, customer, vegetable);

    const rows = ledgerRows(ctx, customer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].transaction_type).toBe('CREDIT_ADDED');
    expect(paise(rows[0].amount)).toBe(324);
    expect(paise(rows[0].balance_after_transaction)).toBe(324);

    expect(ledgerSum(ctx, customer.id)).toBe(creditBalance(ctx, customer.id));
  });

  it('books nothing when the customer pays in full', async () => {
    const { ctx, customer, vegetable } = await scenario();

    const res = await creditSale(ctx, customer, vegetable, { payment_type: 'Paid' });
    expect(res.success).toBe(true);
    expect(res.data.paid_amount).toBe(324);
    expect(res.data.remaining_amount).toBe(0);

    expect(creditBalance(ctx, customer.id)).toBe(0);
    expect(ledgerRows(ctx, customer.id)).toHaveLength(0);
  });

  it('books only the shortfall on a partial payment', async () => {
    const { ctx, customer, vegetable } = await scenario();

    const res = await creditSale(ctx, customer, vegetable, {
      payment_type: 'Partial',
      paid_amount: 100,
    });
    expect(res.success).toBe(true);
    expect(res.data.paid_amount).toBe(100);
    expect(res.data.remaining_amount).toBe(224);

    expect(creditBalance(ctx, customer.id)).toBe(224);
    expect(ledgerSum(ctx, customer.id)).toBe(224);
  });

  it('accumulates across several sales in a day', async () => {
    const { ctx, customer, vegetable } = await scenario();

    await creditSale(ctx, customer, vegetable);
    await creditSale(ctx, customer, vegetable, { weight: 5, rate: 25 }); // 125 + 8% = 135

    expect(creditBalance(ctx, customer.id)).toBe(459);
    expect(ledgerRows(ctx, customer.id)).toHaveLength(2);
    expect(ledgerSum(ctx, customer.id)).toBe(459);
  });
});

describe('generating a bill from transactions', () => {
  it('does not double the debt the transactions already booked', async () => {
    const { ctx, customer, vegetable } = await scenario();

    await creditSale(ctx, customer, vegetable);
    const before = creditBalance(ctx, customer.id);
    expect(before).toBe(324);

    const bill = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      date: TODAY,
    });
    expect(bill.success).toBe(true);
    expect(paise(bill.data.remaining_amount)).toBe(324);

    // Consolidating existing debt into a bill must not create new debt.
    expect(creditBalance(ctx, customer.id)).toBe(324);
  });

  it('keeps the ledger reconciled with the balance after consolidation', async () => {
    const { ctx, customer, vegetable } = await scenario();
    await creditSale(ctx, customer, vegetable);

    await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      date: TODAY,
    });

    expect(ledgerSum(ctx, customer.id)).toBe(creditBalance(ctx, customer.id));
  });

  it('refuses to bill the same day twice', async () => {
    const { ctx, customer, vegetable } = await scenario();
    await creditSale(ctx, customer, vegetable);

    const first = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      date: TODAY,
    });
    expect(first.success).toBe(true);

    const second = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      date: TODAY,
    });
    expect(second.success).toBe(false);

    // A double-click on "Generate Bill" must not inflate what the customer owes.
    expect(creditBalance(ctx, customer.id)).toBe(324);
  });

  it('bills only transactions that have not been billed yet', async () => {
    const { ctx, customer, vegetable } = await scenario();

    await creditSale(ctx, customer, vegetable); // 324
    await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      date: TODAY,
    });

    // A late sale arrives after the first bill was cut.
    await creditSale(ctx, customer, vegetable, { weight: 5, rate: 25 }); // 135
    expect(creditBalance(ctx, customer.id)).toBe(459);

    const second = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      date: TODAY,
    });
    expect(second.success).toBe(true);
    expect(paise(second.data.remaining_amount)).toBe(135);

    expect(creditBalance(ctx, customer.id)).toBe(459);
    expect(ledgerSum(ctx, customer.id)).toBe(459);
  });

  it('carries the customer-facing totals from the transactions', async () => {
    const { ctx, customer, vegetable } = await scenario();
    await creditSale(ctx, customer, vegetable);
    await creditSale(ctx, customer, vegetable, { weight: 5, rate: 25 });

    const bill = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      date: TODAY,
    });

    expect(paise(bill.data.subtotal)).toBe(425); // 300 + 125
    expect(paise(bill.data.commission_amount)).toBe(34); // 24 + 10
    expect(paise(bill.data.final_amount)).toBe(459);
    // Consolidates multiple transactions of the same vegetable on the same day into 1 item
    expect(bill.data.items).toHaveLength(1);
    expect(bill.data.items[0].quantity).toBe(15);
    expect(paise(bill.data.items[0].total)).toBe(425);
  });

  it('fails clearly when there is nothing to bill', async () => {
    const { ctx, customer } = await scenario();

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      date: TODAY,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
    expect(creditBalance(ctx, customer.id)).toBe(0);
  });
});

describe('deleting a transaction', () => {
  it('refunds the credit it booked', async () => {
    const { ctx, customer, vegetable } = await scenario();

    const created = await creditSale(ctx, customer, vegetable);
    expect(creditBalance(ctx, customer.id)).toBe(324);

    const del = await ctx.transactionService.deleteTransaction(created.data.id);
    expect(del.success).toBe(true);

    // The sale never happened, so the customer owes nothing.
    expect(creditBalance(ctx, customer.id)).toBe(0);
  });

  it('leaves the ledger reconciled after a refund', async () => {
    const { ctx, customer, vegetable } = await scenario();

    const a = await creditSale(ctx, customer, vegetable); // 324
    await creditSale(ctx, customer, vegetable, { weight: 5, rate: 25 }); // 135
    expect(creditBalance(ctx, customer.id)).toBe(459);

    await ctx.transactionService.deleteTransaction(a.data.id);

    expect(creditBalance(ctx, customer.id)).toBe(135);
    expect(ledgerSum(ctx, customer.id)).toBe(135);
  });

  it('refunds nothing for a transaction that was paid in full', async () => {
    const { ctx, customer, vegetable } = await scenario();

    const created = await creditSale(ctx, customer, vegetable, { payment_type: 'Paid' });
    expect(creditBalance(ctx, customer.id)).toBe(0);

    await ctx.transactionService.deleteTransaction(created.data.id);
    expect(creditBalance(ctx, customer.id)).toBe(0);
  });

  it('refunds only the unpaid part of a partial payment', async () => {
    const { ctx, customer, vegetable } = await scenario();

    const created = await creditSale(ctx, customer, vegetable, {
      payment_type: 'Partial',
      paid_amount: 100,
    });
    expect(creditBalance(ctx, customer.id)).toBe(224);

    await ctx.transactionService.deleteTransaction(created.data.id);
    expect(creditBalance(ctx, customer.id)).toBe(0);
  });

  it('will not silently strand a bill by deleting a transaction it contains', async () => {
    const { ctx, customer, vegetable } = await scenario();

    const created = await creditSale(ctx, customer, vegetable);
    await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      date: TODAY,
    });

    const del = await ctx.transactionService.deleteTransaction(created.data.id);

    // Either refuse, or reverse the bill too — but never leave a bill whose
    // totals no longer match the transactions behind it.
    if (del.success) {
      expect(ledgerSum(ctx, customer.id)).toBe(creditBalance(ctx, customer.id));
      expect(creditBalance(ctx, customer.id)).toBe(0);
    } else {
      expect(del.error).toBeTruthy();
      expect(creditBalance(ctx, customer.id)).toBe(324);
    }
  });

  it('reports a missing transaction instead of pretending to delete it', async () => {
    const { ctx } = await scenario();
    const res = await ctx.transactionService.deleteTransaction(999999);
    expect(res.success).toBe(false);
  });
});

describe('commission rate', () => {
  it('uses the shop-wide rate from settings, not a client-supplied one', async () => {
    const { ctx, customer, vegetable } = await scenario();

    // The browser has no business setting the commission the shop charges.
    // Under fraction semantics this payload produced ₹2,400 of commission on
    // ₹300 of onions.
    const res = await creditSale(ctx, customer, vegetable, { commission_rate: 800 });
    expect(res.success).toBe(true);
    expect(res.data.commission_amount).toBe(24);
    expect(res.data.final_amount).toBe(324);
  });

  it('honours a changed shop commission rate', async () => {
    const { ctx, customer, vegetable } = await scenario();
    ctx.settingsModel.setSetting('commission_rate', '5');

    const res = await creditSale(ctx, customer, vegetable);
    expect(res.success).toBe(true);
    expect(res.data.commission_amount).toBe(15); // 300 * 5%
    expect(res.data.final_amount).toBe(315);
    expect(creditBalance(ctx, customer.id)).toBe(315);
  });

  it('supports a zero commission rate', async () => {
    const { ctx, customer, vegetable } = await scenario();
    ctx.settingsModel.setSetting('commission_rate', '0');

    const res = await creditSale(ctx, customer, vegetable);
    expect(res.success).toBe(true);
    expect(res.data.commission_amount).toBe(0);
    expect(res.data.final_amount).toBe(300);
  });

  it('stores the rate in the same percentage unit bills use', async () => {
    const { ctx, customer, vegetable } = await scenario();
    const res = await creditSale(ctx, customer, vegetable);

    expect(paise(res.data.commission_rate)).toBe(8);
  });
});

describe('input validation', () => {
  it('rejects an unknown customer', async () => {
    const { ctx, vegetable } = await scenario();
    const res = await ctx.transactionService.createTransaction({
      customer_id: 999999,
      vegetable_id: vegetable.id,
      weight: 10,
      rate: 30,
    });
    expect(res.success).toBe(false);
  });

  it('rejects an unknown vegetable', async () => {
    const { ctx, customer } = await scenario();
    const res = await ctx.transactionService.createTransaction({
      customer_id: customer.id,
      vegetable_id: 999999,
      weight: 10,
      rate: 30,
    });
    expect(res.success).toBe(false);
  });

  it('rejects a non-positive weight', async () => {
    const { ctx, customer, vegetable } = await scenario();
    for (const weight of [0, -5, 'abc', null]) {
      const res = await creditSale(ctx, customer, vegetable, { weight });
      expect(res.success).toBe(false);
    }
    expect(creditBalance(ctx, customer.id)).toBe(0);
  });

  it('rejects a negative rate', async () => {
    const { ctx, customer, vegetable } = await scenario();
    const res = await creditSale(ctx, customer, vegetable, { rate: -30 });
    expect(res.success).toBe(false);
    expect(creditBalance(ctx, customer.id)).toBe(0);
  });

  it('leaves no partial write behind when validation fails', async () => {
    const { ctx, customer, vegetable } = await scenario();
    await creditSale(ctx, customer, vegetable, { weight: -1 });

    expect(ctx.transactionModel.findAll({ customerId: customer.id })).toHaveLength(0);
    expect(ledgerRows(ctx, customer.id)).toHaveLength(0);
    expect(creditBalance(ctx, customer.id)).toBe(0);
  });
});
