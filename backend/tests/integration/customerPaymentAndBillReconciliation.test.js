import { describe, it, expect } from 'vitest';
import { freshDb } from '../helpers/testDb';
import { todayLocal } from '../../utils/businessDay';

describe('Customer Payment and Bill Reconciliation', () => {
  it('accurately calculates previous balance, payment received, total payable, and net dues', async () => {
    const ctx = await freshDb();

    // 1. Create customer with opening balance 8000
    const customer = ctx.customerService.createCustomer({
      name: 'Uma Koli',
      mobile: '9876543210',
      opening_balance: 8000,
    });

    const veg1 = ctx.vegetableModel.create({ name: 'Methi', unit: 'kg', default_rate: 27 });
    const veg2 = ctx.vegetableModel.create({ name: 'Kothimbir', unit: 'kg', default_rate: 22.5 });

    const todayStr = todayLocal();

    // 2. Add transactions: Methi (2916 total) and Kothimbir (243 total)
    // Rate 27, weight 100 -> base 2700 + 8% comm (216) = 2916
    const t1Res = await ctx.transactionService.createTransaction({
      customer_id: customer.id,
      vegetable_id: veg1.id,
      weight: 100,
      rate: 27,
      unit: 'kg',
      payment_type: 'Credit',
      transaction_date: todayStr,
    });
    expect(t1Res.success).toBe(true);
    expect(t1Res.data.final_amount).toBe(2916);

    // Rate 22.5, weight 10 -> base 225 + 8% comm (18) = 243
    const t2Res = await ctx.transactionService.createTransaction({
      customer_id: customer.id,
      vegetable_id: veg2.id,
      weight: 10,
      rate: 22.5,
      unit: 'kg',
      payment_type: 'Credit',
      transaction_date: todayStr,
    });
    expect(t2Res.success).toBe(true);
    expect(t2Res.data.final_amount).toBe(243);

    // Verify customer balance is 8000 + 2916 + 243 = 11159
    let cust = ctx.customerService.getCustomerById(customer.id);
    expect(cust.credit_balance).toBe(11159);

    // 3. Receive payment of Rs 4000 from customer
    const payRes = await ctx.creditService.collectPayment({
      customer_id: customer.id,
      amount: 4000,
      payment_mode: 'Cash',
      note: 'Payment received from Uma Koli',
    });
    expect(payRes.success).toBe(true);

    // Balance is now 11159 - 4000 = 7159
    cust = ctx.customerService.getCustomerById(customer.id);
    expect(cust.credit_balance).toBe(7159);

    // 4. Generate bill from today's transactions
    const billRes = await ctx.transactionService.generateBillFromTransactions({
      customerId: customer.id,
      date: todayStr,
    });
    expect(billRes.success).toBe(true);
    const billId = billRes.data.id;

    // 5. Fetch bill and verify the reconciled figures
    const loaded = await ctx.billService.getBillById(billId);
    expect(loaded.success).toBe(true);
    const bill = loaded.data;

    expect(bill.final_amount).toBe(3159); // Today's bill
    expect(bill.payments_received).toBe(4000); // 4000 received today
    expect(bill.previous_balance).toBe(8000); // 8000 before today
    expect(bill.customer_credit_balance).toBe(7159); // Net balance

    // 6. Test statement generation as well
    const stmtRes = await ctx.transactionService.generateStatement({
      customerId: customer.id,
      startDate: todayStr,
      endDate: todayStr,
    });
    expect(stmtRes.success).toBe(true);
    const stmt = stmtRes.data;
    expect(stmt.final_amount).toBe(3159);
    expect(stmt.payments_received).toBe(4000);
    expect(stmt.previous_balance).toBe(8000);
    expect(stmt.customer_credit_balance).toBe(7159);
  });
});
