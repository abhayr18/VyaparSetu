/**
 * Ledger integrity — the udhar passbook.
 *
 * `credit_transactions` is the audit trail behind `customers.credit_balance`.
 * When a customer disputes a figure, the vendor reads this list back to them, so
 * replaying it must land exactly on the stored balance. Two things break that
 * today:
 *
 *   - recordAdjustment stores Math.abs(amount), so a −₹500 write-off is recorded
 *     as +₹500 and the passbook no longer replays to the balance.
 *   - customerModel.getLedger's summary counts only CREDIT_ADDED and
 *     PAYMENT_RECEIVED, so adjustments vanish from the totals the vendor reads.
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

/** A customer who already owes ₹324 from one udhar sale. */
async function customerOwing324() {
  const ctx = await freshDb();
  const customer = makeCustomer(ctx, { name: 'Abhay' });
  const vegetable = makeVegetable(ctx, { name: 'Onion', rate: 30 });

  await ctx.transactionService.createTransaction({
    customer_id: customer.id,
    vegetable_id: vegetable.id,
    weight: 10,
    rate: 30,
    payment_type: 'Credit',
    transaction_date: TODAY,
  });

  return { ctx, customer, vegetable };
}

describe('collecting a payment', () => {
  it('reduces the balance by the amount paid', async () => {
    const { ctx, customer } = await customerOwing324();

    const res = await ctx.creditService.collectPayment({
      customer_id: customer.id,
      amount: 124,
      payment_mode: 'Cash',
    });
    expect(res.success).toBe(true);

    expect(creditBalance(ctx, customer.id)).toBe(200);
  });

  it('records the payment so the passbook replays to the balance', async () => {
    const { ctx, customer } = await customerOwing324();
    await ctx.creditService.collectPayment({
      customer_id: customer.id,
      amount: 124,
      payment_mode: 'Cash',
    });

    const rows = ledgerRows(ctx, customer.id);
    expect(rows).toHaveLength(2);
    expect(rows[1].transaction_type).toBe('PAYMENT_RECEIVED');
    expect(paise(rows[1].amount)).toBe(124);
    expect(paise(rows[1].balance_after_transaction)).toBe(200);

    expect(ledgerSum(ctx, customer.id)).toBe(200);
  });

  it('settles the account exactly on a full payment', async () => {
    const { ctx, customer } = await customerOwing324();
    const res = await ctx.creditService.collectPayment({
      customer_id: customer.id,
      amount: 324,
      payment_mode: 'UPI',
    });
    expect(res.success).toBe(true);

    expect(creditBalance(ctx, customer.id)).toBe(0);
    expect(ledgerSum(ctx, customer.id)).toBe(0);
  });

  it('refuses to overpay past the outstanding balance', async () => {
    const { ctx, customer } = await customerOwing324();
    const res = await ctx.creditService.collectPayment({
      customer_id: customer.id,
      amount: 500,
      payment_mode: 'Cash',
    });
    expect(res.success).toBe(false);

    expect(creditBalance(ctx, customer.id)).toBe(324);
    expect(ledgerRows(ctx, customer.id)).toHaveLength(1);
  });

  it('rejects a zero or negative payment', async () => {
    const { ctx, customer } = await customerOwing324();
    for (const amount of [0, -100]) {
      const res = await ctx.creditService.collectPayment({
        customer_id: customer.id,
        amount,
        payment_mode: 'Cash',
      });
      expect(res.success).toBe(false);
    }
    expect(creditBalance(ctx, customer.id)).toBe(324);
  });

  it('rejects an unrecognised payment mode', async () => {
    const { ctx, customer } = await customerOwing324();
    const res = await ctx.creditService.collectPayment({
      customer_id: customer.id,
      amount: 100,
      payment_mode: 'Bitcoin',
    });
    expect(res.success).toBe(false);
    expect(creditBalance(ctx, customer.id)).toBe(324);
  });
});

describe('adjusting a balance by hand', () => {
  it('applies a positive adjustment', async () => {
    const { ctx, customer } = await customerOwing324();

    const res = await ctx.creditService.adjustCredit({
      customer_id: customer.id,
      amount: 100,
      note: 'Missed entry',
    });
    expect(res.success).toBe(true);

    expect(creditBalance(ctx, customer.id)).toBe(424);
  });

  it('applies a negative adjustment as a write-off', async () => {
    const { ctx, customer } = await customerOwing324();

    const res = await ctx.creditService.adjustCredit({
      customer_id: customer.id,
      amount: -24,
      note: 'Rounded off',
    });
    expect(res.success).toBe(true);

    expect(creditBalance(ctx, customer.id)).toBe(300);
  });

  it('records a negative adjustment with its sign intact', async () => {
    const { ctx, customer } = await customerOwing324();
    await ctx.creditService.adjustCredit({
      customer_id: customer.id,
      amount: -24,
      note: 'Rounded off',
    });

    const rows = ledgerRows(ctx, customer.id);
    const adjustment = rows.find((r) => r.transaction_type === 'CREDIT_ADJUSTMENT');

    // Math.abs() here turns a ₹24 write-off into a ₹24 charge in the passbook.
    expect(paise(adjustment.amount)).toBe(-24);
    expect(ledgerSum(ctx, customer.id)).toBe(300);
  });

  it('refuses an adjustment that would push the balance negative', async () => {
    const { ctx, customer } = await customerOwing324();
    const res = await ctx.creditService.adjustCredit({
      customer_id: customer.id,
      amount: -1000,
    });
    expect(res.success).toBe(false);
    expect(creditBalance(ctx, customer.id)).toBe(324);
  });

  it('rejects a zero adjustment', async () => {
    const { ctx, customer } = await customerOwing324();
    const res = await ctx.creditService.adjustCredit({ customer_id: customer.id, amount: 0 });
    expect(res.success).toBe(false);
  });
});

describe('the passbook reconciles through a full day', () => {
  it('replays to the stored balance after sales, a payment and an adjustment', async () => {
    const { ctx, customer, vegetable } = await customerOwing324();

    // Second sale: 5 kg @ ₹25 = ₹125 + 8% = ₹135  → owes 459
    await ctx.transactionService.createTransaction({
      customer_id: customer.id,
      vegetable_id: vegetable.id,
      weight: 5,
      rate: 25,
      payment_type: 'Credit',
      transaction_date: TODAY,
    });
    // Third sale, half paid: ₹100 base + 8% = ₹108, pays ₹58 → owes 509
    await ctx.transactionService.createTransaction({
      customer_id: customer.id,
      vegetable_id: vegetable.id,
      weight: 10,
      rate: 10,
      payment_type: 'Partial',
      paid_amount: 58,
      transaction_date: TODAY,
    });

    expect(creditBalance(ctx, customer.id)).toBe(509);

    await ctx.creditService.collectPayment({
      customer_id: customer.id,
      amount: 200,
      payment_mode: 'Cash',
    });
    await ctx.creditService.adjustCredit({ customer_id: customer.id, amount: -9 });

    expect(creditBalance(ctx, customer.id)).toBe(300);
    expect(ledgerSum(ctx, customer.id)).toBe(300);
  });

  it("keeps every row's balance_after_transaction consistent with the running total", async () => {
    const { ctx, customer } = await customerOwing324();
    await ctx.creditService.collectPayment({
      customer_id: customer.id,
      amount: 100,
      payment_mode: 'Cash',
    });
    await ctx.creditService.adjustCredit({ customer_id: customer.id, amount: 50 });

    let running = 0;
    for (const row of ledgerRows(ctx, customer.id)) {
      const amt = Number(row.amount) || 0;
      running += row.transaction_type === 'PAYMENT_RECEIVED' ? -amt : amt;
      expect(paise(row.balance_after_transaction)).toBe(paise(running));
    }
  });
});

describe('the ledger a vendor actually reads (customerModel.getLedger)', () => {
  it('reports outstanding equal to the stored balance', async () => {
    const { ctx, customer } = await customerOwing324();
    const ledger = ctx.customerModel.getLedger(customer.id);

    expect(ledger.summary.outstanding).toBe(creditBalance(ctx, customer.id));
  });

  it('has a summary that accounts for adjustments too', async () => {
    const { ctx, customer } = await customerOwing324();
    await ctx.creditService.collectPayment({
      customer_id: customer.id,
      amount: 100,
      payment_mode: 'Cash',
    });
    await ctx.creditService.adjustCredit({ customer_id: customer.id, amount: -24 });

    const { summary } = ctx.customerModel.getLedger(customer.id);

    // totalCredit − totalRecovered must land on outstanding, or the vendor sees a
    // summary that contradicts the balance printed beside it.
    expect(paise(summary.totalCredit - summary.totalRecovered)).toBe(summary.outstanding);
  });

  it('returns null for a customer who does not exist', async () => {
    const { ctx } = await customerOwing324();
    expect(ctx.customerModel.getLedger(999999)).toBeNull();
  });
});
