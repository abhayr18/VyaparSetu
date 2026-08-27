/**
 * Bills that cover a period, not a day.
 *
 * A customer who bought vegetables on five days used to be handed five bills. The
 * vendor wants one sheet showing each day's purchases, a grand total, and what is
 * still outstanding — which is how the notebook they are replacing worked.
 *
 * The load-bearing property is that widening the window changes *what is on the bill*
 * and nothing about the money. Credit was already booked when each sale was entered,
 * so a range bill must consolidate five days of debt while moving the balance by
 * exactly zero. If it books again, the customer is charged twice for a week of
 * vegetables and the passbook stops agreeing with the balance — the failure this
 * whole seam exists to prevent.
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

const DAYS = ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24'];

/**
 * A customer who bought 10kg of onions on each of five consecutive days, all on credit.
 * ₹300 of goods + 8% = ₹324 a day, ₹1620 across the week.
 */
async function weekOfCreditSales() {
  const ctx = await freshDb();
  const customer = makeCustomer(ctx, { name: 'Abhay' });
  const vegetable = makeVegetable(ctx, { name: 'Onion', rate: 30 });

  for (const date of DAYS) {
    const res = await ctx.transactionService.createTransaction({
      customer_id: customer.id,
      vegetable_id: vegetable.id,
      weight: 10,
      rate: 30,
      payment_type: 'Credit',
      transaction_date: date,
    });
    expect(res.success).toBe(true);
  }

  return { ctx, customer, vegetable };
}

describe('consolidating a period into one bill', () => {
  it('produces a single bill covering every day in the range', async () => {
    const { ctx, customer } = await weekOfCreditSales();

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[4],
    });

    expect(res.success).toBe(true);
    expect(ctx.billModel.findAll()).toHaveLength(1);
    expect(res.data.period_start).toBe(DAYS[0]);
    expect(res.data.period_end).toBe(DAYS[4]);
    // Dated the day the period closes, so every date-keyed report places it in one period.
    expect(res.data.date).toBe(DAYS[4]);
    expect(res.data.items).toHaveLength(5);
  });

  it('carries each line’s own day, so the bill can be read datewise', async () => {
    const { ctx, customer } = await weekOfCreditSales();

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[4],
    });

    expect(res.data.items.map((i) => i.item_date)).toEqual(DAYS);
  });

  it('totals to the sum of the transactions it consolidated', async () => {
    const { ctx, customer } = await weekOfCreditSales();

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[4],
    });

    expect(paise(res.data.subtotal)).toBe(1500);      // 5 × ₹300 of goods
    expect(paise(res.data.commission_amount)).toBe(120); // 5 × ₹24
    expect(paise(res.data.final_amount)).toBe(1620);
    expect(paise(res.data.remaining_amount)).toBe(1620);
    expect(res.data.payment_status).toBe('Credit');

    // The bill's own arithmetic has to close, or the customer's copy contradicts itself.
    expect(paise(res.data.subtotal + res.data.commission_amount)).toBe(paise(res.data.final_amount));
  });

  it('does not move the customer’s balance — the sales already booked it', async () => {
    const { ctx, customer } = await weekOfCreditSales();

    const before = creditBalance(ctx, customer.id);
    expect(before).toBe(1620);
    const rowsBefore = ledgerRows(ctx, customer.id).length;

    await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[4],
    });

    // Not one paisa, and not one extra ledger row. Booking again here would charge a
    // week of vegetables twice.
    expect(creditBalance(ctx, customer.id)).toBe(before);
    expect(ledgerRows(ctx, customer.id)).toHaveLength(rowsBefore);
    expect(ledgerSum(ctx, customer.id)).toBe(before);
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('relabels every day’s ledger row with the bill, not just the closing day’s', async () => {
    const { ctx, customer } = await weekOfCreditSales();

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[4],
    });

    // The passbook has to point at the bill for all five days. Keyed on a single date
    // this would have stamped one row and orphaned four.
    const rows = ledgerRows(ctx, customer.id);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.bill_id).toBe(res.data.id);
    }
  });

  it('claims the transactions, so a second run finds nothing', async () => {
    const { ctx, customer } = await weekOfCreditSales();

    await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[4],
    });
    const second = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[4],
    });

    expect(second.success).toBe(false);
    expect(second.error).toMatch(/already been billed/i);
    expect(ctx.billModel.findAll()).toHaveLength(1);
    expect(creditBalance(ctx, customer.id)).toBe(1620);
  });

  it('skips days already covered by a daily bill', async () => {
    const { ctx, customer } = await weekOfCreditSales();

    // Day one was billed on the day, the old way.
    const daily = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      date: DAYS[0],
    });
    expect(daily.success).toBe(true);
    expect(daily.data.period_start).toBe(null);
    expect(daily.data.items).toHaveLength(1);

    const range = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[4],
    });

    // Four days left, not five. Re-billing day one would double it on the customer's sheet.
    expect(range.success).toBe(true);
    expect(range.data.items).toHaveLength(4);
    expect(range.data.items.map((i) => i.item_date)).toEqual(DAYS.slice(1));
    expect(paise(range.data.final_amount)).toBe(1296);
    expect(creditBalance(ctx, customer.id)).toBe(1620);
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('ignores transactions outside the window', async () => {
    const { ctx, customer } = await weekOfCreditSales();

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[1],
      endDate: DAYS[2],
    });

    expect(res.data.items.map((i) => i.item_date)).toEqual([DAYS[1], DAYS[2]]);
    expect(paise(res.data.final_amount)).toBe(648);

    // The three untouched days are still unbilled and still billable.
    const rest = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[4],
    });
    expect(rest.success).toBe(true);
    expect(rest.data.items).toHaveLength(3);
  });

  it('handles a range that is one day wide', async () => {
    const { ctx, customer } = await weekOfCreditSales();

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[2],
      endDate: DAYS[2],
    });

    expect(res.success).toBe(true);
    expect(res.data.items).toHaveLength(1);
    expect(res.data.period_start).toBe(DAYS[2]);
    expect(res.data.period_end).toBe(DAYS[2]);
  });

  it('records a mixed-payment period as Partial', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);
    const vegetable = makeVegetable(ctx, { name: 'Onion', rate: 30 });

    await ctx.transactionService.createTransaction({
      customer_id: customer.id, vegetable_id: vegetable.id, weight: 10, rate: 30,
      payment_type: 'Credit', transaction_date: DAYS[0],
    });
    await ctx.transactionService.createTransaction({
      customer_id: customer.id, vegetable_id: vegetable.id, weight: 10, rate: 30,
      payment_type: 'Paid', payment_mode: 'Cash', transaction_date: DAYS[1],
    });

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[1],
    });

    expect(res.data.payment_status).toBe('Partial');
    expect(paise(res.data.paid_amount)).toBe(324);
    expect(paise(res.data.remaining_amount)).toBe(324);
    expect(paise(res.data.final_amount)).toBe(648);
  });
});

describe('what a range bill refuses', () => {
  const bad = [
    ['a start date that is not a date', { startDate: 'last week', endDate: DAYS[4] }],
    ['a day that does not exist', { startDate: '2026-02-31', endDate: DAYS[4] }],
    ['a start after the end', { startDate: DAYS[4], endDate: DAYS[0] }],
    ['a half-supplied range', { startDate: DAYS[0] }],
    ['a range spanning years', { startDate: '2020-01-01', endDate: '2026-08-24' }],
  ];

  it.each(bad)('refuses %s', async (_label, range) => {
    const { ctx, customer } = await weekOfCreditSales();

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      ...range,
    });

    expect(res.success).toBe(false);
    expect(ctx.billModel.findAll()).toHaveLength(0);
    // Nothing was claimed, so the week is still billable.
    expect(creditBalance(ctx, customer.id)).toBe(1620);
  });

  it('refuses a period with no transactions in it', async () => {
    const { ctx, customer } = await weekOfCreditSales();

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no transactions/i);
  });
});

describe('deleting a range bill', () => {
  it('returns every day to unbilled and reverses nothing', async () => {
    const { ctx, customer } = await weekOfCreditSales();

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[4],
    });

    ctx.billModel.remove(res.data.id);

    // The sales still happened and the debt is still owed — only the sheet is gone.
    expect(creditBalance(ctx, customer.id)).toBe(1620);
    expect(ledgerSum(ctx, customer.id)).toBe(1620);
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);

    // And the week can be re-billed, which is the reason a vendor deletes a bill.
    const again = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[4],
    });
    expect(again.success).toBe(true);
    expect(again.data.items).toHaveLength(5);
    expect(creditBalance(ctx, customer.id)).toBe(1620);
  });
});

describe('the single-day path is untouched', () => {
  it('still bills one day, with no period recorded', async () => {
    const { ctx, customer } = await weekOfCreditSales();

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      date: DAYS[2],
    });

    expect(res.success).toBe(true);
    expect(res.data.date).toBe(DAYS[2]);
    // NULL is what tells the printed bill to show one date rather than a period.
    expect(res.data.period_start).toBe(null);
    expect(res.data.period_end).toBe(null);
    expect(res.data.items).toHaveLength(1);
    expect(paise(res.data.final_amount)).toBe(324);
    expect(creditBalance(ctx, customer.id)).toBe(1620);
  });
});

describe('a period that straddles a commission rate change', () => {
  it('records the rate actually charged rather than one of the two', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx);
    const vegetable = makeVegetable(ctx, { name: 'Onion', rate: 30 });

    // ₹300 at 8% = ₹24.
    await ctx.transactionService.createTransaction({
      customer_id: customer.id, vegetable_id: vegetable.id, weight: 10, rate: 30,
      payment_type: 'Credit', transaction_date: DAYS[0],
    });
    // The vendor drops the rate mid-week. ₹300 at 4% = ₹12.
    ctx.settingsModel.setSetting('commission_rate', '4');
    await ctx.transactionService.createTransaction({
      customer_id: customer.id, vegetable_id: vegetable.id, weight: 10, rate: 30,
      payment_type: 'Credit', transaction_date: DAYS[1],
    });

    const res = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      startDate: DAYS[0],
      endDate: DAYS[1],
    });

    // ₹36 of commission on ₹600 of goods is 6% — true of the bill, though of neither day.
    expect(paise(res.data.commission_amount)).toBe(36);
    expect(res.data.commission_rate).toBe(6);
    expect(paise(res.data.final_amount)).toBe(636);
    // Whatever the rate column says, the amounts are what the customer owes.
    expect(paise(res.data.subtotal + res.data.commission_amount)).toBe(paise(res.data.final_amount));
    expect(creditBalance(ctx, customer.id)).toBe(636);
  });
});
