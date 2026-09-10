import { describe, it, expect, afterAll } from 'vitest';
import { freshDb, cleanupDbs } from '../helpers/testDb.js';

afterAll(cleanupDbs);

describe('Customer Search Keywords', () => {
  it('creates and retrieves a customer with search_keywords', async () => {
    const ctx = await freshDb();

    const customer = ctx.customerService.createCustomer({
      name: 'रमेश पाटील',
      mobile: '9876543210',
      address: 'हॉटेल निसर्ग',
      search_keywords: 'ramu, hotel nisarga, rameshwar',
      notes: 'VIP client',
    });

    expect(customer.id).toBeDefined();
    expect(customer.name).toBe('रमेश पाटील');
    expect(customer.search_keywords).toBe('ramu, hotel nisarga, rameshwar');

    const byId = ctx.customerModel.findById(customer.id);
    expect(byId.search_keywords).toBe('ramu, hotel nisarga, rameshwar');

    const all = ctx.customerModel.findAll();
    const found = all.find((c) => c.id === customer.id);
    expect(found.search_keywords).toBe('ramu, hotel nisarga, rameshwar');
  });

  it('searches customer by keyword alias (case-insensitive LIKE)', async () => {
    const ctx = await freshDb();

    ctx.customerService.createCustomer({
      name: 'सुरेश जाधव',
      mobile: '9876543211',
      address: 'मार्केट यार्ड',
      search_keywords: 'suresh, market yard, hoteler',
      notes: '',
    });

    ctx.customerService.createCustomer({
      name: 'आनंद जगताप',
      mobile: '9876543212',
      address: 'वारजे',
      search_keywords: 'anand hotel, dhaba',
      notes: '',
    });

    // Search by keyword "dhaba"
    const resultsDhaba = ctx.customerService.searchCustomers('dhaba');
    expect(resultsDhaba).toHaveLength(1);
    expect(resultsDhaba[0].name).toBe('आनंद जगताप');

    // Search by keyword "market yard"
    const resultsMarket = ctx.customerService.searchCustomers('market yard');
    expect(resultsMarket).toHaveLength(1);
    expect(resultsMarket[0].name).toBe('सुरेश जाधव');

    // Search by name "आनंद"
    const resultsName = ctx.customerService.searchCustomers('आनंद');
    expect(resultsName).toHaveLength(1);
    expect(resultsName[0].name).toBe('आनंद जगताप');

    // Search by partial mobile
    const resultsMobile = ctx.customerService.searchCustomers('43211');
    expect(resultsMobile).toHaveLength(1);
    expect(resultsMobile[0].name).toBe('सुरेश जाधव');
  });

  it('updates search_keywords on customer update', async () => {
    const ctx = await freshDb();

    const created = ctx.customerService.createCustomer({
      name: 'गणेश शिंदे',
      mobile: '9876543213',
      address: 'कोथरूड',
      search_keywords: 'ganesh',
      notes: '',
    });

    const updated = ctx.customerService.updateCustomer(created.id, {
      name: 'गणेश शिंदे',
      mobile: '9876543213',
      address: 'कोथरूड डेपो',
      search_keywords: 'ganesh, kothrud depot, vadapav center',
      notes: '',
    });

    expect(updated.search_keywords).toBe('ganesh, kothrud depot, vadapav center');

    const searchMatch = ctx.customerService.searchCustomers('vadapav');
    expect(searchMatch).toHaveLength(1);
    expect(searchMatch[0].id).toBe(created.id);
  });

  it('bulk imports customers with search_keywords', async () => {
    const ctx = await freshDb();

    const items = [
      {
        name: 'अमोल गायकवाड',
        mobile: '9876543214',
        address: 'पुणे',
        search_keywords: 'amol, caterer, wedding',
        notes: '',
      },
      {
        name: 'विकास कदम',
        mobile: '9876543215',
        address: 'हडपसर',
        search_keywords: 'vikas, kadam bandhu',
        notes: '',
      },
    ];

    const res = ctx.customerModel.bulkUpsert(items);
    expect(res.created).toBe(2);

    const matchAmol = ctx.customerService.searchCustomers('caterer');
    expect(matchAmol).toHaveLength(1);
    expect(matchAmol[0].name).toBe('अमोल गायकवाड');
    expect(matchAmol[0].search_keywords).toBe('amol, caterer, wedding');
  });

  it('verifies customers table has search_keywords column in schema', async () => {
    const ctx = await freshDb();
    const res = ctx.raw.exec(`PRAGMA table_info(customers)`);
    const colNames = res[0].values.map((r) => r[1]);
    expect(colNames).toContain('search_keywords');
  });
});
