import { describe, it, expect, afterAll } from 'vitest';
import {
  freshDb,
  cleanupDbs,
  makeCustomer,
  makeVegetable,
} from '../helpers/testDb.js';

afterAll(cleanupDbs);

describe('Udhar Discount & Payment Undo', () => {
  it('applies discount to customer udhar without adding to today_recovered', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx, { name: 'Ramesh' });
    // Set opening balance of ₹5,000
    await ctx.creditService.recordOpeningBalance({ customer_id: customer.id, amount: 5000 });
    
    // Check initial summary recovery
    const initialSummary = ctx.creditModel.getSummary();
    expect(initialSummary.today_recovered).toBe(0);

    // Apply ₹500 discount
    const discountRes = await ctx.creditService.recordDiscount({
      customer_id: customer.id,
      amount: 500,
      note: 'Festival discount'
    });

    expect(discountRes.success).toBe(true);
    expect(discountRes.data.balance_after_transaction).toBe(4500);

    // Customer balance must be 4500
    const updatedCust = ctx.customerModel.findById(customer.id);
    expect(updatedCust.credit_balance).toBe(4500);

    // CRITICAL INVARIANT: discount must NOT increase today_recovered
    const summaryAfter = ctx.creditModel.getSummary();
    expect(summaryAfter.today_recovered).toBe(0);

    // Ledger mismatch must be zero
    const mismatches = ctx.creditModel.findBalanceMismatches();
    expect(mismatches).toEqual([]);
  });

  it('collects payment, increases today_recovered, and undoing it restores balance and resets today_recovered', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx, { name: 'Suresh' });
    await ctx.creditService.recordOpeningBalance({ customer_id: customer.id, amount: 3000 });

    // Collect ₹1,000 payment
    const payRes = await ctx.creditService.collectPayment({
      customer_id: customer.id,
      amount: 1000,
      payment_mode: 'Cash',
      note: 'Partial cash payment'
    });
    expect(payRes.success).toBe(true);

    // Summary today_recovered should be 1000
    let summary = ctx.creditModel.getSummary();
    expect(summary.today_recovered).toBe(1000);

    // Customer balance should be 2000
    let cust = ctx.customerModel.findById(customer.id);
    expect(cust.credit_balance).toBe(2000);

    // Find the payment transaction
    const txs = ctx.creditModel.getCustomerTransactions(customer.id);
    const payTx = txs.find(t => t.transaction_type === 'PAYMENT_RECEIVED');
    expect(payTx).toBeDefined();
    expect(payTx.amount).toBe(1000);

    // Undo the payment
    const undoRes = await ctx.creditService.undoPayment(payTx.id);
    expect(undoRes.success).toBe(true);
    expect(undoRes.data.balance_after_transaction).toBe(3000);

    // Customer balance should be restored to 3000
    cust = ctx.customerModel.findById(customer.id);
    expect(cust.credit_balance).toBe(3000);

    // Today recovered should be 0 again
    summary = ctx.creditModel.getSummary();
    expect(summary.today_recovered).toBe(0);

    // No ledger drift
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('undos a discount cleanly and restores balance', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx, { name: 'Mahesh' });
    await ctx.creditService.recordOpeningBalance({ customer_id: customer.id, amount: 2000 });

    // Apply ₹200 discount
    await ctx.creditService.recordDiscount({
      customer_id: customer.id,
      amount: 200,
      note: 'Special discount'
    });

    let cust = ctx.customerModel.findById(customer.id);
    expect(cust.credit_balance).toBe(1800);

    const txs = ctx.creditModel.getCustomerTransactions(customer.id);
    const discTx = txs.find(t => t.transaction_type === 'DISCOUNT');
    expect(discTx).toBeDefined();

    // Undo the discount
    const undoRes = await ctx.creditService.undoPayment(discTx.id);
    expect(undoRes.success).toBe(true);

    cust = ctx.customerModel.findById(customer.id);
    expect(cust.credit_balance).toBe(2000);
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });
});
