import { describe, it, expect, afterAll } from 'vitest';
import {
  freshDb,
  cleanupDbs,
  makeCustomer,
  makeVegetable,
  creditBalance,
} from '../helpers/testDb.js';

afterAll(cleanupDbs);

describe('Transaction Edit and Delete Workflows', () => {
  it('allows editing an unbilled transaction and adjusts customer credit balance correctly', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Suresh Patil', opening_balance: 0 });
    const veg1 = makeVegetable(ctx, { name: 'कांदा', rate: 20, unit: 'kg' });
    const veg2 = makeVegetable(ctx, { name: 'बटाटा', rate: 30, unit: 'kg' });

    // 1. Create initial transaction: 10 kg @ ₹20 = Base ₹200 + 8% Comm (₹16) = Final ₹216 (Credit)
    const createRes = await ctx.transactionService.createTransaction({
      customer_id: cust.id,
      vegetable_id: veg1.id,
      weight: 10,
      rate: 20,
      payment_type: 'Credit',
      transaction_date: '2026-08-29',
    });

    expect(createRes.success).toBe(true);
    const txId = createRes.data.id;

    // Check customer credit balance
    expect(creditBalance(ctx, cust.id)).toBe(216);

    // 2. Edit the transaction: change to 5 kg of veg2 (बटाटा) @ ₹30 = Base ₹150 + 8% Comm (₹12) = Final ₹162
    const updateRes = await ctx.transactionService.updateTransaction(txId, {
      customer_id: cust.id,
      vegetable_id: veg2.id,
      weight: 5,
      rate: 30,
      payment_type: 'Credit',
      transaction_date: '2026-08-29',
    });

    expect(updateRes.success).toBe(true);
    expect(updateRes.data.weight).toBe(5);
    expect(updateRes.data.rate).toBe(30);
    expect(updateRes.data.final_amount).toBe(162);
    expect(updateRes.data.vegetable_name_snapshot).toBe('बटाटा');

    // Check customer balance adjusted from ₹216 down to ₹162
    expect(creditBalance(ctx, cust.id)).toBe(162);

    // 3. Edit transaction to Paid (cash): credit balance should drop to 0
    const updatePaidRes = await ctx.transactionService.updateTransaction(txId, {
      customer_id: cust.id,
      vegetable_id: veg2.id,
      weight: 5,
      rate: 30,
      payment_type: 'Paid',
      payment_mode: 'Cash',
      transaction_date: '2026-08-29',
    });

    expect(updatePaidRes.success).toBe(true);
    expect(updatePaidRes.data.remaining_amount).toBe(0);
    expect(creditBalance(ctx, cust.id)).toBe(0);
  });

  it('blocks editing a transaction that is already part of a generated bill', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Ramesh Jadhav', opening_balance: 0 });
    const veg = makeVegetable(ctx, { name: 'टोमॅटो', rate: 25, unit: 'kg' });

    const createRes = await ctx.transactionService.createTransaction({
      customer_id: cust.id,
      vegetable_id: veg.id,
      weight: 10,
      rate: 25,
      payment_type: 'Credit',
      transaction_date: '2026-08-29',
    });

    expect(createRes.success).toBe(true);
    const txId = createRes.data.id;

    // Generate bill
    const billRes = await ctx.transactionService.generateBillFromTransactions({
      customerId: cust.id,
      date: '2026-08-29',
    });
    expect(billRes.success).toBe(true);

    // Attempt to edit billed transaction
    const editRes = await ctx.transactionService.updateTransaction(txId, {
      customer_id: cust.id,
      vegetable_id: veg.id,
      weight: 20,
      rate: 25,
    });

    expect(editRes.success).toBe(false);
    expect(editRes.error).toContain('part of a generated bill');
  });

  it('allows deleting an unbilled transaction and reverses debt', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Dattatray Shinde', opening_balance: 0 });
    const veg = makeVegetable(ctx, { name: 'कोबी', rate: 15, unit: 'kg' });

    const createRes = await ctx.transactionService.createTransaction({
      customer_id: cust.id,
      vegetable_id: veg.id,
      weight: 20,
      rate: 15,
      payment_type: 'Credit',
      transaction_date: '2026-08-29',
    });

    const txId = createRes.data.id;
    expect(creditBalance(ctx, cust.id)).toBe(324); // 20 * 15 = 300 + 8% (24) = 324

    // Delete transaction
    const deleteRes = await ctx.transactionService.deleteTransaction(txId);
    expect(deleteRes.success).toBe(true);

    expect(creditBalance(ctx, cust.id)).toBe(0);

    const checkTx = ctx.transactionModel.findById(txId);
    expect(checkTx).toBeNull();
  });
});
