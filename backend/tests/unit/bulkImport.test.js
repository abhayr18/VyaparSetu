import { describe, it, expect, afterAll } from 'vitest';
import {
  freshDb,
  cleanupDbs,
} from '../helpers/testDb.js';

afterAll(cleanupDbs);

describe('Bulk Import', () => {
  describe('Vegetables Bulk Import', () => {
    it('imports new vegetables and respects updateExisting option', async () => {
      const ctx = await freshDb();

      const items = [
        { name: 'टोमॅटो', rate: 40, unit: 'kg', search_keywords: 'tomato, tamatar', notes: 'Fresh red' },
        { name: 'बटाटा', rate: 30, unit: 'kg', search_keywords: 'potato, aloo', notes: '' },
        { name: 'कोथिंबीर', rate: 10, unit: 'bundle', search_keywords: 'coriander, kothimbir', notes: '' },
      ];

      const res = ctx.vegetableService.bulkImportVegetables(items, { updateExisting: true });
      expect(res.total).toBe(3);
      expect(res.created).toBe(3);
      expect(res.updated).toBe(0);
      expect(res.skipped).toBe(0);
      expect(res.errors).toHaveLength(0);

      const allVeg = ctx.vegetableService.getAllVegetables();
      expect(allVeg).toHaveLength(3);

      // Now import again with one new, one updated rate, one duplicate with updateExisting=false
      const secondBatch = [
        { name: 'टोमॅटो', rate: 45, unit: 'kg', search_keywords: 'tomato', notes: 'Rate updated' },
        { name: 'गाजर', rate: 50, unit: 'kg', search_keywords: 'carrot', notes: '' },
      ];

      const resUpdate = ctx.vegetableService.bulkImportVegetables(secondBatch, { updateExisting: true });
      expect(resUpdate.created).toBe(1); // गाजर
      expect(resUpdate.updated).toBe(1); // टोमॅटो
      expect(resUpdate.skipped).toBe(0);

      const tomato = ctx.vegetableService.searchVegetables('टोमॅटो')[0];
      expect(tomato.rate).toBe(45);

      // Import with updateExisting=false
      const thirdBatch = [
        { name: 'टोमॅटो', rate: 60, unit: 'kg' },
        { name: 'पालक', rate: 15, unit: 'bundle' },
      ];
      const resSkip = ctx.vegetableService.bulkImportVegetables(thirdBatch, { updateExisting: false });
      expect(resSkip.created).toBe(1); // पालक
      expect(resSkip.updated).toBe(0);
      expect(resSkip.skipped).toBe(1); // टोमॅटो skipped

      const tomatoUnchanged = ctx.vegetableService.searchVegetables('टोमॅटो')[0];
      expect(tomatoUnchanged.rate).toBe(45);
    });

    it('captures row-level errors for invalid items without failing entire batch', async () => {
      const ctx = await freshDb();

      const items = [
        { name: 'कांदा', rate: 25, unit: 'kg' },
        { name: '', rate: 20, unit: 'kg' }, // missing name
        { name: 'लसूण', rate: -5, unit: 'kg' }, // invalid negative rate
      ];

      const res = ctx.vegetableService.bulkImportVegetables(items);
      expect(res.total).toBe(3);
      expect(res.created).toBe(1);
      expect(res.errors).toHaveLength(2);
      expect(res.errors[0].row).toBe(2);
      expect(res.errors[1].row).toBe(3);
    });
  });

  describe('Customers Bulk Import', () => {
    it('imports new customers with optional opening balances and handles duplicates', async () => {
      const ctx = await freshDb();

      const items = [
        { name: 'रमेश पाटील', mobile: '9876543210', address: 'पुणे', notes: 'हॉटेल मालक', opening_balance: 1500 },
        { name: 'सुरेश जाधव', mobile: '9876543211', address: 'मुंबई', notes: '', opening_balance: 0 },
        { name: 'गणेश शिंदे', mobile: '9876543212', address: 'नाशिक', notes: 'नियमित ग्राहक' },
      ];

      const res = ctx.customerService.bulkImportCustomers(items, { updateExisting: true });
      expect(res.total).toBe(3);
      expect(res.created).toBe(3);
      expect(res.updated).toBe(0);
      expect(res.skipped).toBe(0);
      expect(res.errors).toHaveLength(0);

      const ramesh = ctx.customerService.searchCustomers('9876543210')[0];
      expect(ramesh.name).toBe('रमेश पाटील');
      expect(Number(ramesh.credit_balance)).toBe(1500);

      // Verify opening balance ledger entry
      const ledger = ctx.customerService.getCustomerLedger(ramesh.id);
      expect(ledger.transactions).toHaveLength(1);
      expect(ledger.transactions[0].transaction_type).toBe('OPENING_BALANCE');
      expect(ledger.transactions[0].amount).toBe(1500);

      // Second batch with update
      const updateBatch = [
        { name: 'रमेश पाटील (नवीन पत्ता)', mobile: '9876543210', address: 'कोथरूड पुणे' },
        { name: 'महेश कदम', mobile: '9876543213', address: 'सातारा' },
      ];

      const res2 = ctx.customerService.bulkImportCustomers(updateBatch, { updateExisting: true });
      expect(res2.created).toBe(1); // महेश
      expect(res2.updated).toBe(1); // रमेश
      expect(res2.skipped).toBe(0);

      const rameshUpdated = ctx.customerService.getCustomerById(ramesh.id);
      expect(rameshUpdated.name).toBe('रमेश पाटील (नवीन पत्ता)');
      expect(rameshUpdated.address).toBe('कोथरूड पुणे');
      // Balance remains 1500, not double recorded
      expect(Number(rameshUpdated.credit_balance)).toBe(1500);
    });

    it('validates mobile numbers (must be 10 digits) and required names', async () => {
      const ctx = await freshDb();

      const items = [
        { name: 'अमित', mobile: '9876543210' },
        { name: 'विकास', mobile: '123' }, // invalid mobile
        { name: '', mobile: '9876543211' }, // invalid empty name
      ];

      const res = ctx.customerService.bulkImportCustomers(items);
      expect(res.total).toBe(3);
      expect(res.created).toBe(1);
      expect(res.errors).toHaveLength(2);
    });

    it('records custom opening balance date during customer bulk import', async () => {
      const ctx = await freshDb();

      const items = [
        {
          name: 'दिनेश माने',
          mobile: '9876543299',
          opening_balance: 3200,
          opening_balance_date: '2026-06-20',
        },
      ];

      const res = ctx.customerService.bulkImportCustomers(items);
      expect(res.created).toBe(1);

      const dinesh = ctx.customerService.searchCustomers('9876543299')[0];
      const ledger = ctx.customerService.getCustomerLedger(dinesh.id);
      expect(ledger.transactions).toHaveLength(1);
      expect(ledger.transactions[0].transaction_type).toBe('OPENING_BALANCE');
      expect(ledger.transactions[0].amount).toBe(3200);
      expect(ledger.transactions[0].created_at).toMatch(/^2026-06-20/);
    });

    it('does not duplicate customers when imported twice without mobile numbers', async () => {

      const ctx = await freshDb();

      const items = [
        { name: 'शुभम शिंदे', mobile: '', address: 'पुणे', notes: 'भाजी विक्रेता' },
        { name: 'प्रदीप मोरे', mobile: '', address: 'सातारा', notes: '' },
      ];

      // First import
      const res1 = ctx.customerService.bulkImportCustomers(items, { updateExisting: true });
      expect(res1.created).toBe(2);
      expect(res1.updated).toBe(0);

      const allFirst = ctx.customerService.getAllCustomers();
      expect(allFirst).toHaveLength(2);

      // Second import of the same file
      const res2 = ctx.customerService.bulkImportCustomers(items, { updateExisting: true });
      expect(res2.created).toBe(0);
      expect(res2.updated).toBe(2);

      const allSecond = ctx.customerService.getAllCustomers();
      expect(allSecond).toHaveLength(2);
    });

    it('merges duplicate customers and reconciles balances during deduplication', async () => {
      const ctx = await freshDb();

      // Manually create two customers with the same name or mobile
      const c1 = ctx.customerModel.create({ name: 'विकास पवार', mobile: '9876500001', address: 'दुकान १' });
      // Force insert duplicate directly in DB
      const { execRun, execSelect } = require('../../database/db');
      const insertRes = execRun(
        `INSERT INTO customers (name, mobile, address, notes, credit_balance) VALUES (?, ?, ?, ?, 0)`,
        ['विकास पवार', '', 'दुकान २', 'नियमित']
      );
      const c2Id = insertRes.lastInsertRowid;

      // Add a bill/transaction to c2
      execRun(
        `INSERT INTO bills (bill_number, customer_id, date, subtotal, discount_amount, commission_amount, hamali_amount, transport_amount, final_amount, paid_amount, remaining_amount, payment_type, payment_status)
         VALUES (?, ?, '2026-06-20', 50000, 0, 0, 0, 0, 50000, 0, 50000, 'CREDIT', 'PENDING')`,
        ['BILL-TEST-DUP-1', c2Id]
      );
      execRun(
        `INSERT INTO credit_transactions (customer_id, transaction_type, amount, payment_mode, balance_after_transaction)
         VALUES (?, 'CREDIT_ADDED', 50000, 'CREDIT', 50000)`,
        [c2Id]
      );

      execRun(`UPDATE customers SET credit_balance = 50000 WHERE id = ?`, [c2Id]);

      const countBefore = execSelect(`SELECT count(*) as c FROM customers WHERE is_deleted = 0`)[0].c;
      expect(countBefore).toBe(2);

      // Run deduplication
      const dedupRes = ctx.customerService.deduplicateCustomers();
      expect(dedupRes.duplicatesRemoved).toBe(1);
      expect(dedupRes.mergedGroups).toBe(1);

      const remaining = ctx.customerService.getAllCustomers();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(c1.id);
      expect(remaining[0].name).toBe('विकास पवार');
      // Credit balance was merged and transferred to primary
      expect(Number(remaining[0].credit_balance)).toBe(500);

      // Bill is now assigned to c1
      const bills = execSelect(`SELECT customer_id FROM bills WHERE bill_number = 'BILL-TEST-DUP-1'`);
      expect(bills[0].customer_id).toBe(c1.id);
    });
  });
});

