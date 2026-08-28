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
  });
});
