/**
 * Pure billing calculation tests — no database.
 *
 * utils/billingCalc.js already treats commission_rate as a percentage, so these
 * lock in the convention the rest of the codebase is being moved onto, plus the
 * discount / hamali / transport ordering a vendor would verify by hand:
 *
 *   subtotal → less discount → plus commission → plus hamali → plus transport
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { calculateBill } = require('../../utils/billingCalc.js');

const items = () => [
  { vegetable_id: 1, vegetable_name: 'Onion', quantity: 10, rate: 30 },
  { vegetable_id: 2, vegetable_name: 'Potato', quantity: 5, rate: 25 },
];

describe('calculateBill', () => {
  it('sums item totals into the subtotal', () => {
    const b = calculateBill({ items: items() });
    expect(b.subtotal).toBe(425); // 300 + 125
    expect(b.items[0].total).toBe(300);
    expect(b.items[1].total).toBe(125);
  });

  it('applies commission as a percentage of the post-discount amount', () => {
    const b = calculateBill({ items: items(), commission_rate: 8 });
    expect(b.commission_amount).toBe(34); // 425 * 0.08
    expect(b.final_amount).toBe(459);
  });

  it('applies a fixed discount before commission', () => {
    const b = calculateBill({
      items: items(),
      discount_type: 'fixed',
      discount_value: 25,
      commission_rate: 8,
    });
    expect(b.discount_amount).toBe(25);
    expect(b.commission_amount).toBe(32); // (425 - 25) * 0.08
    expect(b.final_amount).toBe(432);
  });

  it('applies a percentage discount before commission', () => {
    const b = calculateBill({
      items: items(),
      discount_type: 'percentage',
      discount_value: 10,
      commission_rate: 8,
    });
    expect(b.discount_amount).toBe(42.5);
    expect(b.commission_amount).toBe(30.6); // 382.5 * 0.08
    expect(b.final_amount).toBe(413.1);
  });

  it('never lets a discount exceed the subtotal', () => {
    const b = calculateBill({
      items: items(),
      discount_type: 'fixed',
      discount_value: 99999,
      commission_rate: 8,
    });
    expect(b.discount_amount).toBe(425);
    expect(b.final_amount).toBe(0);
    expect(b.commission_amount).toBe(0);
  });

  it('adds hamali and transport after commission', () => {
    const b = calculateBill({
      items: items(),
      commission_rate: 8,
      hamali_amount: 50,
      transport_amount: 100,
    });
    expect(b.final_amount).toBe(609); // 425 + 34 + 50 + 100
  });

  it('derives payment_status from paid vs final', () => {
    const base = { items: items(), commission_rate: 8 }; // final = 459

    expect(calculateBill({ ...base, paid_amount: 0 }).payment_status).toBe('Credit');
    expect(calculateBill({ ...base, paid_amount: 200 }).payment_status).toBe('Partial');
    expect(calculateBill({ ...base, paid_amount: 459 }).payment_status).toBe('Paid');
    expect(calculateBill({ ...base, paid_amount: 500 }).payment_status).toBe('Paid');
  });

  it('reports remaining_amount as final minus paid', () => {
    const b = calculateBill({ items: items(), commission_rate: 8, paid_amount: 200 });
    expect(b.remaining_amount).toBe(259);
  });

  it('treats an empty bill as zero rather than NaN', () => {
    const b = calculateBill({ items: [] });
    expect(b.subtotal).toBe(0);
    expect(b.commission_amount).toBe(0);
    expect(b.final_amount).toBe(0);
    expect(b.remaining_amount).toBe(0);
    expect(b.payment_status).toBe('Paid'); // nothing owed
  });

  it('falls back to 8% when commission_rate is not a number', () => {
    expect(calculateBill({ items: items(), commission_rate: 'abc' }).commission_rate).toBe(8);
  });
});
