import { describe, it, expect, afterAll } from 'vitest';
import {
  freshDb,
  cleanupDbs,
  makeCustomer,
  makeVegetable,
} from '../helpers/testDb.js';

afterAll(cleanupDbs);

describe('Bill Editing Workflow', () => {
  it('updates an existing bill line items and recalculates totals properly', async () => {
    const ctx = await freshDb();
    const cust = makeCustomer(ctx, { name: 'Ganesh Shinde', mobile: '9876543210' });
    const veg1 = makeVegetable(ctx, { name: 'टोमॅटो', rate: 40 });
    const veg2 = makeVegetable(ctx, { name: 'वांगी', rate: 50 });

    // 1. Create a bill with 1 item: 10 kg of टोमॅटो @ ₹40 = ₹400 + 8% comm = ₹432
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
    expect(createRes.data.items).toHaveLength(1);

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

    // 3. Fetch from DB to ensure persistence
    const fetched = await ctx.billService.getBillById(billId);
    expect(fetched.success).toBe(true);
    expect(fetched.data.subtotal).toBe(300);
    expect(fetched.data.final_amount).toBe(324);
    expect(fetched.data.items).toHaveLength(2);
    expect(fetched.data.items[0].vegetable_name).toBe('टोमॅटो');
    expect(fetched.data.items[0].quantity).toBe(5);
    expect(fetched.data.items[0].item_date).toBe('2026-09-07');
    expect(fetched.data.items[1].vegetable_name).toBe('वांगी');
    expect(fetched.data.items[1].quantity).toBe(2);
  });
});
