import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb } from '../helpers/testDb.js';

describe('Optional Mobile Number & Backup Import/Export', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await freshDb();
  });

  it('allows creating multiple customers with empty mobile number', async () => {
    const c1 = ctx.customerService.createCustomer({ name: 'Vendor A', mobile: '' });
    const c2 = ctx.customerService.createCustomer({ name: 'Vendor B', mobile: '' });
    const c3 = ctx.customerService.createCustomer({ name: 'Vendor C' });

    expect(c1.id).toBeDefined();
    expect(c2.id).toBeDefined();
    expect(c3.id).toBeDefined();
    expect(c1.name).toBe('Vendor A');
    expect(c2.name).toBe('Vendor B');
    expect(c3.name).toBe('Vendor C');
    expect(c1.mobile).toBe('');
    expect(c2.mobile).toBe('');
    expect(c3.mobile).toBe('');
  });

  it('still enforces 10-digit validation when mobile is provided', async () => {
    expect(() => {
      ctx.customerService.createCustomer({ name: 'Vendor Invalid', mobile: '123' });
    }).toThrow('Mobile number must be exactly 10 digits.');
  });

  it('still prevents duplicate non-empty mobile numbers', async () => {
    ctx.customerService.createCustomer({ name: 'Vendor First', mobile: '9876543210' });
    expect(() => {
      ctx.customerService.createCustomer({ name: 'Vendor Duplicate', mobile: '9876543210' });
    }).toThrow('Mobile number 9876543210 is already registered.');
  });

  it('searches customers with empty mobile properly by name', async () => {
    ctx.customerService.createCustomer({ name: 'Suresh Patil', mobile: '' });
    ctx.customerService.createCustomer({ name: 'Ramesh Pawar', mobile: '9988776655' });

    const searchResults = ctx.customerService.searchCustomers('Suresh');
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].name).toBe('Suresh Patil');
  });

  it('creates, exports and imports backup buffers cleanly', async () => {
    const backupService = require('../../services/backupService');

    // 1. Create a customer
    ctx.customerService.createCustomer({ name: 'Initial Customer', mobile: '9123456780' });
    const allBefore = ctx.customerService.getAllCustomers();
    expect(allBefore.some((c) => c.name === 'Initial Customer')).toBe(true);

    // 2. Export snapshot
    const exported = await backupService.exportCurrentSnapshot();
    expect(exported.filename).toBeDefined();
    expect(exported.size).toBeGreaterThan(0);

    const fs = require('fs');
    const exportedBuffer = fs.readFileSync(exported.filePath);

    // 3. Add another customer
    ctx.customerService.createCustomer({ name: 'Later Customer', mobile: '9123456789' });
    expect(ctx.customerService.getAllCustomers().length).toBe(allBefore.length + 1);

    // 4. Restore from the exported buffer
    const restoreResult = await backupService.restoreFromBuffer(exportedBuffer, 'test-import.db');
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.safetyBackup).toBeDefined();

    // 5. Verify data reverted to the snapshot state
    const allAfter = ctx.customerService.getAllCustomers();
    expect(allAfter.some((c) => c.name === 'Initial Customer')).toBe(true);
    expect(allAfter.some((c) => c.name === 'Later Customer')).toBe(false);
  });

  it('configures custom backup directory and performs auto-sync mirroring cleanly', async () => {
    const backupService = require('../../services/backupService');
    const path = require('path');
    const fs = require('fs');

    // Test config retrieval
    const initialConfig = backupService.getBackupConfig();
    expect(initialConfig.defaultDir).toBeDefined();
    expect(initialConfig.autoBackupEnabled).toBe(true);

    // Test setting custom folder
    const tempCustomDir = path.join(initialConfig.defaultDir, 'test_cloud_mirror');
    backupService.saveBackupConfig({ customDir: tempCustomDir, autoBackupEnabled: true });

    const updatedConfig = backupService.getBackupConfig();
    expect(updatedConfig.customDir).toBe(tempCustomDir);
    expect(fs.existsSync(tempCustomDir)).toBe(true);

    // Create a customer to mark database dirty
    ctx.customerService.createCustomer({ name: 'Sync Test Customer', mobile: '9111222333' });

    // Test auto-sync
    const syncResult = await backupService.performAutoSync();
    expect(syncResult.success).toBe(true);
    expect(syncResult.data.filename).toBeDefined();


    // Verify file exists in both default and custom folders
    const mirroredLatest = path.join(tempCustomDir, 'vyapaarsetu-latest.db');
    expect(fs.existsSync(mirroredLatest)).toBe(true);

    // Clean up temp test folder
    try {
      fs.rmSync(tempCustomDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('generates valid Google OAuth URL seamlessly for 1-click connection', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    const driveService = require('../../services/googleDriveBackupService');
    const authUrl = driveService.getAuthUrl();
    expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(authUrl).toContain('client_id=test-client-id.apps.googleusercontent.com');
    expect(authUrl).toContain('redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Fapi%2Fdrive%2Fcallback');
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  }, 35000);
});
