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

describe('Consolidated Bill Edit & Delete Bug Fix (Client Scenario)', () => {
  it('prevents ledger desynchronization when a consolidated bill is edited, deleted, and re-billed', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Vithalrao Shinde', mobile: '9822012345' });
    const veg1 = makeVegetable(ctx, { name: 'टोमॅटो', rate: 40 });
    const veg2 = makeVegetable(ctx, { name: 'मिरची', rate: 60 });

    // 1. Create two daily purchase transactions for customer totaling credit
    // Tx 1: 200 kg @ ₹40 = 8000 + 8% (640) = 8640
    // Tx 2: 50 kg @ ₹60 = 3000 + 8% (240) = 3240
    // Total = 11,880
    const tx1Res = await ctx.transactionService.createTransaction({
      customer_id: cust.id,
      vegetable_id: veg1.id,
      weight: 200,
      rate: 40,
      payment_type: 'Credit',
      transaction_date: '2026-09-10',
    });
    const tx2Res = await ctx.transactionService.createTransaction({
      customer_id: cust.id,
      vegetable_id: veg2.id,
      weight: 50,
      rate: 60,
      payment_type: 'Credit',
      transaction_date: '2026-09-10',
    });

    expect(tx1Res.success).toBe(true);
    expect(tx2Res.success).toBe(true);
    expect(creditBalance(ctx, cust.id)).toBe(11880);
    expect(ledgerSum(ctx, cust.id)).toBe(11880);

    // 2. Consolidate into bill
    const billRes = await ctx.transactionService.generateBillFromTransactions({
      customerId: cust.id,
      date: '2026-09-10',
    });
    expect(billRes.success).toBe(true);
    const billId = billRes.data.id;
    expect(creditBalance(ctx, cust.id)).toBe(11880);
    expect(ledgerSum(ctx, cust.id)).toBe(11880);

    // 3. User edits this bill (adds new item or updates items)
    // For example: updates to 200 kg टोमॅटो + 55 kg मिरची
    // Subtotal: 8000 + 3300 = 11300 + 8% (904) = 12204
    const editRes = await ctx.billService.updateExistingBill(billId, {
      customer_id: cust.id,
      date: '2026-09-10',
      payment_type: 'Credit',
      items: [
        { vegetable_id: veg1.id, quantity: 200, rate: 40, item_date: '2026-09-10' },
        { vegetable_id: veg2.id, quantity: 55, rate: 60, item_date: '2026-09-10' },
      ],
    });
    expect(editRes.success).toBe(true);
    expect(creditBalance(ctx, cust.id)).toBe(12204);
    expect(ledgerSum(ctx, cust.id)).toBe(12204);

    // 4. Client now DELETES that edited bill!
    // In the old code, this deducted 12,204 from customer balance, deleted credit_transactions,
    // and left unbilled entries with 0 ledger debt.
    const delRes = await ctx.billService.deleteBillById(billId);
    expect(delRes.success).toBe(true);

    // Transactions must be back in unbilled
    const unbilledTxs = ctx.transactionModel.findUnbilledByCustomerAndDate(cust.id, '2026-09-10');
    expect(unbilledTxs).toHaveLength(2);

    // Customer balance must NOT be drained! Customer still owes for these sales.
    expect(creditBalance(ctx, cust.id)).toBe(12204);
    expect(ledgerSum(ctx, cust.id)).toBe(12204);
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);

    // 5. Vendor re-bills the unbilled entries
    const rebillRes = await ctx.transactionService.generateBillFromTransactions({
      customerId: cust.id,
      date: '2026-09-10',
    });
    expect(rebillRes.success).toBe(true);
    expect(rebillRes.data.items).toHaveLength(2);

    // Balance must STILL be 12,204 with ZERO gap!
    expect(creditBalance(ctx, cust.id)).toBe(12204);
    expect(ledgerSum(ctx, cust.id)).toBe(12204);
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });

  it('Migration 14 automatically heals corrupted client database with uncredited bill and missing balance', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Popat Bapu', mobile: '9988776655' });
    const veg = makeVegetable(ctx, { name: 'कोथिंबीर', rate: 10 });

    const rawDb = ctx.db.getDb();
    // Simulate the exact corrupted client state:
    // A bill exists with remaining_amount = 12214 (in paise: 1221400),
    // but customer credit_balance was reduced to 0, and credit_transactions has 0 CREDIT_ADDED rows!
    const billInsert = rawDb.prepare(
      `INSERT INTO bills (
        bill_number, customer_id, date, subtotal, commission_amount, final_amount, paid_amount,
        remaining_amount, payment_type, payment_status
      ) VALUES ('B-999', ?, '2026-09-10', 1130926, 90474, 1221400, 0, 1221400, 'Credit', 'Credit')`
    ).run(cust.id);
    const corruptedBillId = billInsert.lastInsertRowid;

    // And underlying transactions exist for that bill
    rawDb.prepare(
      `INSERT INTO transactions (
        customer_id, vegetable_id, vegetable_name_snapshot, weight, unit, rate,
        base_amount, commission_rate, commission_amount, final_amount,
        payment_type, payment_mode, paid_amount, remaining_amount,
        transaction_date, bill_id
      ) VALUES (?, ?, 'कोथिंबीर', 100, 'पेंढी', 1000, 100000, 8, 8000, 108000, 'Credit', 'Credit', 0, 108000, '2026-09-10', ?)`
    ).run(cust.id, veg.id, corruptedBillId);

    // Intentionally set customer credit_balance to 0 (corrupted)
    rawDb.prepare(`UPDATE customers SET credit_balance = 0 WHERE id = ?`).run(cust.id);

    // Verify corrupted state before migration
    expect(creditBalance(ctx, cust.id)).toBe(0);
    expect(ledgerSum(ctx, cust.id)).toBe(0);

    // Run Migration 14
    const migrations = ctx.requireApp('database/migrations.js');
    const m14 = migrations.MIGRATIONS.find((m) => m.version === 14);
    expect(m14).toBeDefined();

    m14.up(rawDb);

    // Customer balance must be healed and restored by ₹12,214!
    expect(creditBalance(ctx, cust.id)).toBe(12214);
    expect(ledgerSum(ctx, cust.id)).toBe(12214);
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);

    // Ledger row must have been created for the bill
    const rows = ledgerRows(ctx, cust.id);
    expect(rows.length).toBeGreaterThan(0);
    const totalCredit = rows
      .filter((r) => r.transaction_type === 'CREDIT_ADDED')
      .reduce((s, r) => s + r.amount, 0);
    expect(totalCredit).toBe(12214);
  });

  it('deleting a pure standalone bill still reverses its debt properly', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Standalone Customer' });
    const veg = makeVegetable(ctx, { name: 'कांदा', rate: 20 });

    const createRes = await ctx.billService.createNewBill({
      customer_id: cust.id,
      date: '2026-09-10',
      payment_type: 'Credit',
      items: [
        { vegetable_id: veg.id, quantity: 10, rate: 20, item_date: '2026-09-10' }
      ]
    });
    expect(createRes.success).toBe(true);
    const billId = createRes.data.id;
    expect(creditBalance(ctx, cust.id)).toBe(216);

    // Delete standalone bill
    const delRes = await ctx.billService.deleteBillById(billId);
    expect(delRes.success).toBe(true);

    // Since it was standalone with no transactions, its debt is cleanly reverted to 0
    expect(creditBalance(ctx, cust.id)).toBe(0);
    expect(ledgerSum(ctx, cust.id)).toBe(0);
    expect(ctx.creditModel.findBalanceMismatches()).toEqual([]);
  });
});
