/**
 * Harness self-test.
 *
 * If this file fails, no other test result means anything — every downstream test
 * depends on freshDb() actually pointing the app at an isolated temp database
 * rather than the real shop database.
 */

import { describe, it, expect, afterAll } from 'vitest';
import os from 'os';
import fs from 'fs';
import { freshDb, cleanupDbs, makeCustomer, makeVegetable, creditBalance } from './helpers/testDb.js';

afterAll(cleanupDbs);

describe('test harness', () => {
  it('points the app at a temp database, not the real one', async () => {
    const ctx = await freshDb();

    expect(ctx.dbPath).toContain('vyapaarsetu-test-');
    expect(ctx.dbPath.startsWith(os.tmpdir())).toBe(true);
    expect(ctx.dbPath).not.toContain('database\\vyapaarsetu.db');
    expect(ctx.dbPath).not.toContain('database/vyapaarsetu.db');
    expect(fs.existsSync(ctx.dbPath)).toBe(true);
  });

  it('gives each freshDb() call an empty, fully-migrated database', async () => {
    const a = await freshDb();
    makeCustomer(a);
    expect(a.customerModel.findAll()).toHaveLength(1);

    const b = await freshDb();
    expect(b.dbPath).not.toBe(a.dbPath);
    expect(b.customerModel.findAll()).toHaveLength(0);

    // Schema and seeds came through.
    expect(b.settingsModel.getSetting('commission_rate')).toBeTruthy();
  });

  it('creates usable customer and vegetable fixtures', async () => {
    const ctx = await freshDb();

    const customer = makeCustomer(ctx, { name: 'Abhay' });
    expect(customer.id).toBeGreaterThan(0);
    expect(customer.name).toBe('Abhay');
    expect(Number(customer.credit_balance)).toBe(0);

    const veg = makeVegetable(ctx, { name: 'Onion', rate: 30 });
    expect(veg.id).toBeGreaterThan(0);

    expect(creditBalance(ctx, customer.id)).toBe(0);
  });
});
