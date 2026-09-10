import { describe, it, expect, afterAll } from 'vitest';
import {
  freshDb,
  cleanupDbs,
  makeCustomer,
  makeVegetable,
  creditBalance,
  ledgerSum,
  ledgerRows,
} from '../helpers/testDb.js';

afterAll(cleanupDbs);

describe('Bill Editing Workflow', () => {
  it('updates an existing bill line items, recalculates totals and adjusts customer credit balance properly', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Ganesh Shinde', mobile: '9876543210' });
    const veg1 = makeVegetable(ctx, { name: 'टोमॅटो', rate: 40 });
    const veg2 = makeVegetable(ctx, { name: 'वांगी', rate: 50 });

    // 1. Create a bill with 1 item: 10 kg of टोमॅटो @ ₹40 = ₹400 + 8% comm = ₹432 (Credit)
    const createRes = await ctx.billService.createNewBill({
      customer_id: cust.id,
      date: '2026-09-07',
      payment_type: 'Credit',
      items: [
        { vegetable_id: veg1.id, quantity: 10, rate: 40, item_date: '2026-09-07' }
      ]
    });

    expect(createRes.success).toBe(true);
    const billId = createRes.data.id;
    expect(createRes.data.subtotal).toBe(400);
    expect(createRes.data.final_amount).toBe(432);
    expect(creditBalance(ctx, cust.id)).toBe(432);
    expect(ledgerSum(ctx, cust.id)).toBe(432);

    // 2. Edit the bill: change quantity to 5 kg of टोमॅटो @ ₹40 (₹200) + add 2 kg of वांगी @ ₹50 (₹100)
    // Subtotal = ₹300, Commission (8%) = ₹24, Final Amount = ₹324
    const updateRes = await ctx.billService.updateExistingBill(billId, {
      customer_id: cust.id,
      date: '2026-09-07',
      payment_type: 'Credit',
      items: [
        { vegetable_id: veg1.id, quantity: 5, rate: 40, item_date: '2026-09-07' },
        { vegetable_id: veg2.id, quantity: 2, rate: 50, item_date: '2026-09-07' }
      ]
    });

    expect(updateRes.success).toBe(true);
    expect(updateRes.data.subtotal).toBe(300);
    expect(updateRes.data.final_amount).toBe(324);
    expect(updateRes.data.commission_amount).toBe(24);
    expect(updateRes.data.items).toHaveLength(2);

    // Customer credit balance must adjust from ₹432 down to ₹324
    expect(creditBalance(ctx, cust.id)).toBe(324);
    expect(ledgerSum(ctx, cust.id)).toBe(324);

    // 3. Edit bill to fully Paid (Cash): customer balance must revert to 0
    const paidRes = await ctx.billService.updateExistingBill(billId, {
      customer_id: cust.id,
      date: '2026-09-07',
      payment_type: 'Cash',
      paid_amount: 324,
      items: [
        { vegetable_id: veg1.id, quantity: 5, rate: 40, item_date: '2026-09-07' },
        { vegetable_id: veg2.id, quantity: 2, rate: 50, item_date: '2026-09-07' }
      ]
    });

    expect(paidRes.success).toBe(true);
    expect(paidRes.data.remaining_amount).toBe(0);
    expect(creditBalance(ctx, cust.id)).toBe(0);
    expect(ledgerSum(ctx, cust.id)).toBe(0);

    // 4. Edit bill back to Credit: customer balance must increase to ₹324
    const creditBackRes = await ctx.billService.updateExistingBill(billId, {
      customer_id: cust.id,
      date: '2026-09-07',
      payment_type: 'Credit',
      paid_amount: 0,
      items: [
        { vegetable_id: veg1.id, quantity: 5, rate: 40, item_date: '2026-09-07' },
        { vegetable_id: veg2.id, quantity: 2, rate: 50, item_date: '2026-09-07' }
      ]
    });

    expect(creditBackRes.success).toBe(true);
    expect(creditBackRes.data.remaining_amount).toBe(324);
    expect(creditBalance(ctx, cust.id)).toBe(324);
    expect(ledgerSum(ctx, cust.id)).toBe(324);
  });

  it('correctly reverts debt and adjusts balance when editing a consolidated bill from transactions', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Ramesh Patil' });
    const veg = makeVegetable(ctx, { name: 'कांदा', rate: 25 });

    // 1. Create 2 transactions on credit: 10 kg @ 25 (270) + 10 kg @ 25 (270) = 540 total debt
    await ctx.transactionService.createTransaction({
      customer_id: cust.id,
      vegetable_id: veg.id,
      weight: 10,
      rate: 25,
      payment_type: 'Credit',
      transaction_date: '2026-09-08',
    });
    await ctx.transactionService.createTransaction({
      customer_id: cust.id,
      vegetable_id: veg.id,
      weight: 10,
      rate: 25,
      payment_type: 'Credit',
      transaction_date: '2026-09-08',
    });

    expect(creditBalance(ctx, cust.id)).toBe(540);

    // 2. Consolidate into bill
    const billRes = await ctx.transactionService.generateBillFromTransactions({
      customerId: cust.id,
      date: '2026-09-08',
    });
    expect(billRes.success).toBe(true);
    const billId = billRes.data.id;
    expect(creditBalance(ctx, cust.id)).toBe(540);

    // 3. User edits this consolidated bill: gives ₹40 discount and pays ₹200 cash
    const updateRes = await ctx.billService.updateExistingBill(billId, {
      customer_id: cust.id,
      date: '2026-09-08',
      discount_type: 'fixed',
      discount_value: 40,
      paid_amount: 200,
      payment_type: 'Partial',
      items: [
        { vegetable_id: veg.id, quantity: 20, rate: 25, item_date: '2026-09-08' }
      ]
    });

    expect(updateRes.success).toBe(true);
    const expectedRem = updateRes.data.remaining_amount;
    expect(expectedRem).toBeGreaterThan(0);
    expect(creditBalance(ctx, cust.id)).toBe(expectedRem);
    expect(ledgerSum(ctx, cust.id)).toBe(expectedRem);
  });

  it('moves debt from old customer to new customer when customer is changed on a bill', async () => {
    const ctx = await freshDb();
    const custA = makeCustomer(ctx, { name: 'Customer A' });
    const custB = makeCustomer(ctx, { name: 'Customer B' });
    const veg = makeVegetable(ctx, { name: 'बटाटा', rate: 30 });

    // 1. Bill for Customer A: ₹324 on credit
    const createRes = await ctx.billService.createNewBill({
      customer_id: custA.id,
      date: '2026-09-08',
      payment_type: 'Credit',
      items: [
        { vegetable_id: veg.id, quantity: 10, rate: 30, item_date: '2026-09-08' }
      ]
    });

    expect(createRes.success).toBe(true);
    const billId = createRes.data.id;
    expect(creditBalance(ctx, custA.id)).toBe(324);
    expect(creditBalance(ctx, custB.id)).toBe(0);

    // 2. Edit bill and assign it to Customer B
    const updateRes = await ctx.billService.updateExistingBill(billId, {
      customer_id: custB.id,
      date: '2026-09-08',
      payment_type: 'Credit',
      items: [
        { vegetable_id: veg.id, quantity: 10, rate: 30, item_date: '2026-09-08' }
      ]
    });

    expect(updateRes.success).toBe(true);
    // Customer A debt reverted to 0, Customer B receives ₹324
    expect(creditBalance(ctx, custA.id)).toBe(0);
    expect(ledgerSum(ctx, custA.id)).toBe(0);
    expect(creditBalance(ctx, custB.id)).toBe(324);
    expect(ledgerSum(ctx, custB.id)).toBe(324);
  });

  it('synchronizes transactions table, getCustomerDailyPurchase, and reportModel when editing a consolidated bill', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Sunil Patil' });
    const veg1 = makeVegetable(ctx, { name: 'टोमॅटो', rate: 40 });
    const veg2 = makeVegetable(ctx, { name: 'वांगी', rate: 50 });
    const reportModel = ctx.requireApp('models/reportModel.js');

    // 1. Create two daily transactions on 2026-09-09
    // Tx 1: 10 kg टोमॅटो @ 40 = 400 + 8% (32) = 432
    // Tx 2: 4 kg वांगी @ 50 = 200 + 8% (16) = 216
    // Total = 648
    await ctx.transactionService.createTransaction({
      customer_id: cust.id,
      vegetable_id: veg1.id,
      weight: 10,
      rate: 40,
      payment_type: 'Credit',
      transaction_date: '2026-09-09',
    });
    await ctx.transactionService.createTransaction({
      customer_id: cust.id,
      vegetable_id: veg2.id,
      weight: 4,
      rate: 50,
      payment_type: 'Credit',
      transaction_date: '2026-09-09',
    });

    // 2. Consolidate into bill
    const billRes = await ctx.transactionService.generateBillFromTransactions({
      customerId: cust.id,
      date: '2026-09-09',
    });
    expect(billRes.success).toBe(true);
    const billId = billRes.data.id;
    expect(creditBalance(ctx, cust.id)).toBe(648);

    // Initial report sales check
    const initialReport = reportModel.getSalesSummary('2026-09-09');
    expect(initialReport.summary.total_sales).toBe(648);

    // 3. User edits this bill:
    // Change टोमॅटो to 5 kg @ 40 = 200
    // Remove वांगी
    // Subtotal = 200, 8% commission = 16, Final Amount = 216
    const updateRes = await ctx.billService.updateExistingBill(billId, {
      customer_id: cust.id,
      date: '2026-09-09',
      payment_type: 'Credit',
      items: [
        { vegetable_id: veg1.id, quantity: 5, rate: 40, item_date: '2026-09-09' }
      ]
    });
    expect(updateRes.success).toBe(true);
    expect(updateRes.data.subtotal).toBe(200);
    expect(updateRes.data.final_amount).toBe(216);

    // 4. Verify transactions table was updated (not stale!)
    const txRows = ctx.transactionModel.findByCustomerAndDate(cust.id, '2026-09-09');
    expect(txRows).toHaveLength(1);
    expect(txRows[0].vegetable_id).toBe(veg1.id);
    expect(txRows[0].weight).toBe(5);
    expect(txRows[0].rate).toBe(40);
    expect(txRows[0].final_amount).toBe(216);
    expect(txRows[0].bill_id).toBe(billId);

    // 5. Verify getCustomerDailyPurchase returns the synchronized items
    const dailyPurchase = await ctx.transactionService.getCustomerDailyPurchase(cust.id, '2026-09-09');
    expect(dailyPurchase.success).toBe(true);
    expect(dailyPurchase.data.transactions).toHaveLength(1);
    expect(dailyPurchase.data.transactions[0].weight).toBe(5);
    expect(dailyPurchase.data.transactions[0].final_amount).toBe(216);

    // 6. Verify reportModel reflects downward edit in total sales (no Math.max stickiness)
    const updatedReport = reportModel.getSalesSummary('2026-09-09');
    expect(updatedReport.summary.total_sales).toBe(216);
    expect(updatedReport.customers).toHaveLength(1);
    expect(updatedReport.customers[0].today_bill_total).toBe(216);
    expect(updatedReport.customers[0].closing_balance).toBe(216);
  });

  it('Migration 12 automatically heals orphaned transactions, stale items, and customer balance drift', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Healing Test Customer' });
    const veg = makeVegetable(ctx, { name: 'कोथिंबीर', rate: 20 });

    // 1. Create a bill with 10 kg @ 20 = 200 + 8% (16) = 216
    const billRes = await ctx.billService.createNewBill({
      customer_id: cust.id,
      date: '2026-09-10',
      payment_type: 'Credit',
      items: [
        { vegetable_id: veg.id, quantity: 10, rate: 20, item_date: '2026-09-10' }
      ]
    });
    const billId = billRes.data.id;

    // Simulate an existing transaction linked to billId with STALE data (as happened in legacy bug)
    ctx.raw.run(
      `INSERT INTO transactions (customer_id, vegetable_id, vegetable_name_snapshot, weight, unit, rate, base_amount, commission_rate, commission_amount, final_amount, payment_type, payment_mode, paid_amount, remaining_amount, transaction_date, bill_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cust.id, veg.id, 'Old Name', 500, 'kg', 1000, 50000, 8, 4000, 54000, 'Credit', 'Credit', 0, 54000, '2026-09-10', billId, '2026-09-10 10:00:00']
    );

    // Artificially corrupt customer credit balance
    ctx.raw.run(`UPDATE customers SET credit_balance = 999999 WHERE id = ?`, [cust.id]);
    expect(creditBalance(ctx, cust.id)).toBe(9999.99);

    // Run Migration 12 logic directly against this database
    const { MIGRATIONS } = ctx.requireApp('database/migrations.js');
    const m12 = MIGRATIONS.find((m) => m.version === 12);
    m12.up(ctx.db.getDb());

    // Verify transaction rows were re-synced to match bill_items (1 item, 10 kg @ 20)
    const txRows = ctx.transactionModel.findByCustomerAndDate(cust.id, '2026-09-10');
    expect(txRows).toHaveLength(1);
    expect(txRows[0].weight).toBe(10);
    expect(txRows[0].rate).toBe(20);
    expect(txRows[0].final_amount).toBe(216);

    // Verify customer credit balance was repaired to 216
    expect(creditBalance(ctx, cust.id)).toBe(216);
  });

  it('preserves 7% commission when editing a bill with 7% commission instead of defaulting to 8%', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Pramod Patil' });
    const veg = makeVegetable(ctx, { name: 'गाजर', rate: 50 });

    // 1. Create a bill with 7% commission
    // 10 kg @ ₹50 = ₹500 + 7% comm (₹35) = ₹535
    const billRes = await ctx.billService.createNewBill({
      customer_id: cust.id,
      date: '2026-09-10',
      commission_rate: 7,
      payment_type: 'Credit',
      items: [
        { vegetable_id: veg.id, quantity: 10, rate: 50, item_date: '2026-09-10' }
      ]
    });
    expect(billRes.success).toBe(true);
    expect(billRes.data.commission_rate).toBe(7);
    expect(billRes.data.commission_amount).toBe(35);
    expect(billRes.data.final_amount).toBe(535);

    // 2. Edit the bill: change quantity to 20 kg @ ₹50 (₹1000)
    // 7% commission must be retained: ₹1000 + 7% (₹70) = ₹1070 (NOT 8% = ₹1080)
    const updateRes = await ctx.billService.updateExistingBill(billRes.data.id, {
      customer_id: cust.id,
      date: '2026-09-10',
      commission_rate: 7,
      payment_type: 'Credit',
      items: [
        { vegetable_id: veg.id, quantity: 20, rate: 50, item_date: '2026-09-10' }
      ]
    });
    expect(updateRes.success).toBe(true);
    expect(updateRes.data.commission_rate).toBe(7);
    expect(updateRes.data.commission_amount).toBe(70);
    expect(updateRes.data.final_amount).toBe(1070);
    expect(creditBalance(ctx, cust.id)).toBe(1070);

    // 3. Also test editing without passing commission_rate in payload: it should retain existing.commission_rate (7%)
    const updateWithoutRateRes = await ctx.billService.updateExistingBill(billRes.data.id, {
      customer_id: cust.id,
      date: '2026-09-10',
      payment_type: 'Credit',
      items: [
        { vegetable_id: veg.id, quantity: 10, rate: 50, item_date: '2026-09-10' }
      ]
    });
    expect(updateWithoutRateRes.success).toBe(true);
    expect(updateWithoutRateRes.data.commission_rate).toBe(7);
    expect(updateWithoutRateRes.data.commission_amount).toBe(35);
    expect(updateWithoutRateRes.data.final_amount).toBe(535);
  });

  it('Migration 12 automatically restores 7% commission when a bill was corrupted to 8% by a previous edit', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Legacy Corrupted Customer' });
    const veg = makeVegetable(ctx, { name: 'शिमला मिरची', rate: 40 });

    // Simulate database state:
    // Transactions originally created at 7% commission: 10 kg @ 40 = 400 + 7% (28) = 428
    // But previous bill edit had overwritten bill.commission_rate to 8.0: 400 + 8% (32) = 432
    const billInsert = ctx.raw.prepare(`
      INSERT INTO bills (
        bill_number, customer_id, date, subtotal, discount_type, discount_value,
        discount_amount, commission_rate, commission_amount, hamali_amount, transport_amount,
        final_amount, paid_amount, remaining_amount, payment_type, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'B-999', cust.id, '2026-09-10', 40000, 'fixed', 0, 0, 8.0, 3200, 0, 0, 43200, 0, 43200, 'Credit', 'Credit'
    );
    const billId = Number(billInsert.lastInsertRowid);

    ctx.raw.prepare(`
      INSERT INTO bill_items (bill_id, vegetable_id, vegetable_name, quantity, rate, total, item_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(billId, veg.id, 'शिमला मिरची', 10, 4000, 40000, '2026-09-10');

    ctx.raw.prepare(`
      INSERT INTO credit_transactions (customer_id, bill_id, transaction_type, amount, payment_mode, balance_after_transaction)
      VALUES (?, ?, 'CREDIT_ADDED', ?, 'Other', ?)
    `).run(cust.id, billId, 43200, 43200);

    // Existing transaction still carries the original 7% commission:
    ctx.raw.prepare(`
      INSERT INTO transactions (
        customer_id, vegetable_id, vegetable_name_snapshot, weight, unit, rate,
        base_amount, commission_rate, commission_amount, final_amount,
        payment_type, payment_mode, paid_amount, remaining_amount, transaction_date, bill_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cust.id, veg.id, 'शिमला मिरची', 10, 'kg', 4000, 40000, 7.0, 2800, 42800, 'Credit', 'Credit', 0, 42800, '2026-09-10', billId, '2026-09-10 10:00:00'
    );

    ctx.raw.run(`UPDATE customers SET credit_balance = 43200 WHERE id = ?`, [cust.id]);
    expect(creditBalance(ctx, cust.id)).toBe(432);

    // Run Migration 12
    const { MIGRATIONS } = ctx.requireApp('database/migrations.js');
    const m12 = MIGRATIONS.find((m) => m.version === 12);
    m12.up(ctx.db.getDb());

    // Check healed bill: commission_rate restored to 7, final amount healed to 428
    const healedBill = ctx.billModel.findById(billId);
    expect(healedBill.commission_rate).toBe(7);
    expect(healedBill.commission_amount).toBe(28);
    expect(healedBill.final_amount).toBe(428);
    expect(healedBill.remaining_amount).toBe(428);

    // Customer credit balance healed to 428
    expect(creditBalance(ctx, cust.id)).toBe(428);
  });
});
