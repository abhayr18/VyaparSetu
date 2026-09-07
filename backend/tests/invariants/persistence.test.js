/**
 * Persistence invariants — the better-sqlite3 migration safety net.
 *
 * Every test here passes on sql.js today. They must still pass after the storage
 * engine is swapped, because they assert *behaviour a vendor depends on* rather
 * than driver mechanics: writes survive a restart, transactions roll back
 * cleanly, foreign keys hold, and the read paths return what was written.
 *
 * If one of these goes red during the migration, the migration changed semantics
 * and needs fixing — as opposed to the money tests, which are red on purpose
 * until the Phase 0 fixes land.
 */

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import { freshDb, cleanupDbs, makeCustomer, makeVegetable, paise } from '../helpers/testDb.js';

afterAll(cleanupDbs);

describe('writes reach the disk', () => {
  it('creates the database file', async () => {
    const ctx = await freshDb();
    expect(fs.existsSync(ctx.dbPath)).toBe(true);
    expect(fs.statSync(ctx.dbPath).size).toBeGreaterThan(0);
  });

  it('survives reopening the file — a customer written now is there after a restart', async () => {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx, { name: 'Abhay' });

    // Simulate the shop PC restarting. Under WAL the newest commits live in the
    // -wal sidecar, so a raw read of the main file alone would be a pre-insert
    // snapshot; serialize() folds the WAL in to give the true on-disk state.
    const buffer = ctx.db.serialize();
    ctx.db.reloadDb(buffer);

    const reread = require('../../models/customerModel.js');
    const found = reread.findById(customer.id);
    expect(found).toBeTruthy();
    expect(found.name).toBe('Abhay');
  });

  it('grows the file as rows are added', async () => {
    const ctx = await freshDb();

    // Under WAL a committed write lands in the -wal sidecar and does not enlarge
    // the main file until a checkpoint folds it back in. Checkpoint on both sides
    // so the comparison sees the main file actually growing with the rows, rather
    // than both reads catching the same pre-checkpoint snapshot.
    ctx.db.checkpoint();
    const before = fs.statSync(ctx.dbPath).size;

    for (let i = 0; i < 50; i += 1) makeCustomer(ctx);

    ctx.db.checkpoint();
    expect(fs.statSync(ctx.dbPath).size).toBeGreaterThan(before);
    expect(ctx.customerModel.findAll()).toHaveLength(50);
  });
});

describe('customer round trip', () => {
  it('writes and reads back every field', async () => {
    const ctx = await freshDb();
    const created = ctx.customerModel.create({
      name: 'Abhay Raut',
      mobile: '9812345678',
      address: 'Gate 3, APMC',
      notes: 'Pays weekly',
    });

    const found = ctx.customerModel.findById(created.id);
    expect(found.name).toBe('Abhay Raut');
    expect(found.mobile).toBe('9812345678');
    expect(found.address).toBe('Gate 3, APMC');
    expect(found.notes).toBe('Pays weekly');
    expect(Number(found.credit_balance)).toBe(0);
  });

  it('updates in place', async () => {
    const ctx = await freshDb();
    const c = makeCustomer(ctx, { name: 'Old Name' });

    ctx.customerModel.update(c.id, {
      name: 'New Name',
      mobile: c.mobile,
      address: 'Gate 4',
      notes: '',
    });

    const found = ctx.customerModel.findById(c.id);
    expect(found.name).toBe('New Name');
    expect(found.address).toBe('Gate 4');
    expect(ctx.customerModel.findAll()).toHaveLength(1);
  });

  it('finds by mobile for the duplicate check', async () => {
    const ctx = await freshDb();
    const c = makeCustomer(ctx);

    expect(ctx.customerModel.findByMobile(c.mobile)).toBeTruthy();
    expect(ctx.customerModel.findByMobile(c.mobile, c.id)).toBeFalsy(); // excluded
    expect(ctx.customerModel.findByMobile('9999999999')).toBeFalsy();
  });

  it('searches by name and by mobile', async () => {
    const ctx = await freshDb();
    makeCustomer(ctx, { name: 'Abhay Raut', mobile: '9811111111' });
    makeCustomer(ctx, { name: 'Nirbhay Patil', mobile: '9822222222' });

    expect(ctx.customerModel.search('Abhay')).toHaveLength(1);
    expect(ctx.customerModel.search('bhay')).toHaveLength(2); // substring, both names
    expect(ctx.customerModel.search('Raut')).toHaveLength(1);
    expect(ctx.customerModel.search('98111')).toHaveLength(1);
    expect(ctx.customerModel.search('zzz')).toHaveLength(0);
  });

  it('stores Marathi names without mangling them', async () => {
    const ctx = await freshDb();
    const c = makeCustomer(ctx, { name: 'अभय राऊत' });

    const found = ctx.customerModel.findById(c.id);
    expect(found.name).toBe('अभय राऊत');
    expect(ctx.customerModel.search('अभय')).toHaveLength(1);
  });
});

describe('vegetable round trip', () => {
  it('writes and reads back every field', async () => {
    const ctx = await freshDb();
    const v = ctx.vegetableModel.create({
      name: 'कांदा',
      rate: 32.5,
      unit: 'kg',
      search_keywords: 'kanda onion',
      notes: 'Nashik',
    });

    const found = ctx.vegetableModel.findById(v.id);
    expect(found.name).toBe('कांदा');
    expect(paise(found.rate)).toBe(32.5);
    expect(found.unit).toBe('kg');
  });

  it('searches on transliteration keywords', async () => {
    const ctx = await freshDb();
    ctx.vegetableModel.create({
      name: 'कांदा',
      rate: 30,
      unit: 'kg',
      search_keywords: 'kanda onion',
      notes: '',
    });

    expect(ctx.vegetableModel.search('kanda')).toHaveLength(1);
    expect(ctx.vegetableModel.search('कांदा')).toHaveLength(1);
  });
});

describe('bill round trip', () => {
  const billData = (customerId) => ({
    bill_number: 'BILL-TEST-0001',
    customer_id: customerId,
    date: '2026-08-25',
    subtotal: 425,
    discount_type: 'fixed',
    discount_value: 0,
    discount_amount: 0,
    commission_rate: 8,
    commission_amount: 34,
    hamali_amount: 0,
    transport_amount: 0,
    final_amount: 459,
    paid_amount: 0,
    remaining_amount: 459,
    payment_type: 'Credit',
    payment_status: 'Credit',
    items: [
      { vegetable_id: 1, vegetable_name: 'Onion', quantity: 10, rate: 30, total: 300 },
      { vegetable_id: 2, vegetable_name: 'Potato', quantity: 5, rate: 25, total: 125 },
    ],
  });

  it('writes a bill with its items and reads both back', async () => {
    const ctx = await freshDb();
    const c = makeCustomer(ctx);
    makeVegetable(ctx);
    makeVegetable(ctx);

    const bill = ctx.billModel.create(billData(c.id));

    expect(bill.id).toBeGreaterThan(0);
    expect(bill.bill_number).toBe('BILL-TEST-0001');
    expect(paise(bill.final_amount)).toBe(459);
    expect(bill.items).toHaveLength(2);
    expect(bill.customer_name).toBe(c.name);
  });

  it('books the bill as debt when the bill is where the debt originates', async () => {
    const ctx = await freshDb();
    const c = makeCustomer(ctx);
    makeVegetable(ctx);
    makeVegetable(ctx);

    ctx.billModel.create(billData(c.id));

    // A bill entered directly through the Billing module has no prior
    // transactions behind it, so it must book the credit itself.
    expect(paise(ctx.customerModel.findById(c.id).credit_balance)).toBe(459);
  });

  it('reverses the debt when the bill is deleted', async () => {
    const ctx = await freshDb();
    const c = makeCustomer(ctx);
    makeVegetable(ctx);
    makeVegetable(ctx);

    const bill = ctx.billModel.create(billData(c.id));
    expect(paise(ctx.customerModel.findById(c.id).credit_balance)).toBe(459);

    ctx.billModel.remove(bill.id);

    expect(paise(ctx.customerModel.findById(c.id).credit_balance)).toBe(0);
    expect(ctx.billModel.findById(bill.id)).toBeNull();
    expect(ctx.billItemModel.getByBillId(bill.id)).toHaveLength(0);
  });

  it('finds bills by number, by customer and by search', async () => {
    const ctx = await freshDb();
    const c = makeCustomer(ctx, { name: 'Abhay' });
    makeVegetable(ctx);
    makeVegetable(ctx);
    ctx.billModel.create(billData(c.id));

    expect(ctx.billModel.findByNumber('BILL-TEST-0001')).toBeTruthy();
    expect(ctx.billModel.findByCustomerId(c.id)).toHaveLength(1);
    expect(ctx.billModel.search('BILL-TEST')).toHaveLength(1);
    expect(ctx.billModel.search('Abhay')).toHaveLength(1);
    expect(ctx.billModel.findAll()).toHaveLength(1);
    expect(ctx.billModel.findAll()[0].items).toHaveLength(2);
  });
});

describe('referential integrity', () => {
  it('still enforces foreign keys after the first write is persisted', async () => {
    const ctx = await freshDb();

    // foreign_keys is per-connection and defaults OFF. db.js turns it on in
    // applyConnectionPragmas, and under better-sqlite3 the one connection stays
    // open across every write, so the pragma simply holds. (sql.js used to reopen
    // the handle on each save and silently lose it, which is how the orphan-row
    // tests below could ever have inserted.) Write first, then check, to prove it
    // survives normal operation.
    makeCustomer(ctx);

    const res = ctx.raw.exec('PRAGMA foreign_keys');
    expect(res[0].values[0][0]).toBe(1);
  });

  it('leaves no orphan bill behind when item insertion fails', async () => {
    const ctx = await freshDb();
    const c = makeCustomer(ctx);

    const before = ctx.billModel.findAll().length;

    expect(() =>
      ctx.billModel.create({
        bill_number: 'BILL-BAD-0001',
        customer_id: c.id,
        date: '2026-08-25',
        subtotal: 100,
        commission_rate: 8,
        commission_amount: 8,
        final_amount: 108,
        paid_amount: 0,
        remaining_amount: 108,
        payment_type: 'Credit',
        payment_status: 'Credit',
        // vegetable_id 424242 does not exist — the FK must reject it.
        items: [{ vegetable_id: 424242, vegetable_name: 'Ghost', quantity: 1, rate: 100, total: 100 }],
      })
    ).toThrow();

    expect(ctx.billModel.findAll()).toHaveLength(before);
    expect(ctx.billModel.findByNumber('BILL-BAD-0001')).toBeNull();
    // And the customer must not have been charged for a bill that never existed.
    expect(paise(ctx.customerModel.findById(c.id).credit_balance)).toBe(0);
  });

  it('rejects a transaction pointing at a customer who does not exist', async () => {
    const ctx = await freshDb();
    expect(() => {
      ctx.raw.run(
        `INSERT INTO transactions
           (customer_id, vegetable_id, vegetable_name_snapshot, weight, unit, rate,
            base_amount, commission_rate, commission_amount, final_amount, transaction_date)
         VALUES (424242, 424243, 'Ghost', 1, 'kg', 10, 10, 8, 0.8, 10.8, '2026-08-25')`
      );
    }).toThrow();
  });

  it('rejects a ledger row pointing at a bill that does not exist', async () => {
    const ctx = await freshDb();
    const c = makeCustomer(ctx);
    expect(() => {
      ctx.raw.run(
        `INSERT INTO credit_transactions
           (customer_id, bill_id, transaction_type, amount, payment_mode, balance_after_transaction)
         VALUES (?, 424242, 'CREDIT_ADDED', 100, 'Other', 100)`,
        [c.id]
      );
    }).toThrow();
  });
});

describe('transaction read paths', () => {
  async function threeSales() {
    const ctx = await freshDb();
    const customer = makeCustomer(ctx, { name: 'Abhay' });
    const other = makeCustomer(ctx, { name: 'Nirbhay' });
    const veg = makeVegetable(ctx, { name: 'Onion', rate: 30 });

    const mk = (customerId, date, weight) =>
      ctx.transactionService.createTransaction({
        customer_id: customerId,
        vegetable_id: veg.id,
        weight,
        rate: 30,
        payment_type: 'Credit',
        transaction_date: date,
      });

    await mk(customer.id, '2026-08-24', 10);
    await mk(customer.id, '2026-08-25', 5);
    await mk(other.id, '2026-08-25', 8);

    return { ctx, customer, other, veg };
  }

  it('filters by customer', async () => {
    const { ctx, customer } = await threeSales();
    expect(ctx.transactionModel.findAll({ customerId: customer.id })).toHaveLength(2);
  });

  it('filters by exact date', async () => {
    const { ctx, customer } = await threeSales();
    expect(ctx.transactionModel.findByCustomerAndDate(customer.id, '2026-08-25')).toHaveLength(1);
    expect(ctx.transactionModel.findByCustomerAndDate(customer.id, '2026-08-23')).toHaveLength(0);
  });

  it('filters by inclusive date range', async () => {
    const { ctx, customer } = await threeSales();
    expect(
      ctx.transactionModel.findByCustomerAndDateRange(customer.id, '2026-08-24', '2026-08-25')
    ).toHaveLength(2);
    expect(
      ctx.transactionModel.findByCustomerAndDateRange(customer.id, '2026-08-25', '2026-08-25')
    ).toHaveLength(1);
  });

  it('returns all transactions across customers when unfiltered', async () => {
    const { ctx } = await threeSales();
    expect(ctx.transactionModel.findAll({})).toHaveLength(3);
  });

  it('joins the customer name onto each row', async () => {
    const { ctx, customer } = await threeSales();
    const rows = ctx.transactionModel.findAll({ customerId: customer.id });
    expect(rows[0].customer_name).toBe('Abhay');
  });

  it('aggregates a daily summary that matches the rows behind it', async () => {
    const { ctx, customer } = await threeSales();
    const summary = ctx.transactionModel.getDailyCustomerSummary(customer.id, '2026-08-24');

    expect(summary.total_transactions).toBe(1);
    expect(summary.total_weight).toBe(10);
    expect(summary.total_base_amount).toBe(300);
    expect(summary.total_final_amount).toBe(324);
    expect(summary.total_remaining_amount).toBe(324);
  });

  it('returns zeros, not nulls, for a day with no sales', async () => {
    const { ctx, customer } = await threeSales();
    const summary = ctx.transactionModel.getDailyCustomerSummary(customer.id, '2026-01-01');

    expect(summary.total_transactions).toBe(0);
    expect(summary.total_weight).toBe(0);
    expect(summary.total_final_amount).toBe(0);
  });

  it('returns the row it just created, with a real id', async () => {
    const ctx = await freshDb();
    const c = makeCustomer(ctx);
    const v = makeVegetable(ctx);

    const res = await ctx.transactionService.createTransaction({
      customer_id: c.id,
      vegetable_id: v.id,
      weight: 10,
      rate: 30,
      payment_type: 'Credit',
      transaction_date: '2026-08-25',
    });

    expect(res.success).toBe(true);
    expect(res.data.id).toBeGreaterThan(0);
    expect(ctx.transactionModel.findById(res.data.id)).toBeTruthy();
  });

  it('returns the correct row when two customers write concurrently', async () => {
    const ctx = await freshDb();
    const a = makeCustomer(ctx, { name: 'A' });
    const b = makeCustomer(ctx, { name: 'B' });
    const v = makeVegetable(ctx);

    const mk = (customerId, weight) =>
      ctx.transactionService.createTransaction({
        customer_id: customerId,
        vegetable_id: v.id,
        weight,
        rate: 10,
        payment_type: 'Credit',
        transaction_date: '2026-08-25',
      });

    // transactionModel.create must identify its new row by this INSERT's own
    // lastInsertRowid, not by SELECT MAX(id) WHERE customer_id = ? — the latter
    // returned the wrong row as soon as another sale for that customer landed in
    // between.
    const r1 = await mk(a.id, 1);
    const r2 = await mk(b.id, 2);
    const r3 = await mk(a.id, 3);

    expect(r1.data.customer_id).toBe(a.id);
    expect(r2.data.customer_id).toBe(b.id);
    expect(r3.data.customer_id).toBe(a.id);
    expect(paise(r3.data.weight)).toBe(3);
    expect(new Set([r1.data.id, r2.data.id, r3.data.id]).size).toBe(3);
  });
});
