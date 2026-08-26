/**
 * License service tests — signature, machine binding, expiry, and file handling.
 *
 * These do NOT use the real keypair (tools/keys/private-key.pem is gitignored and
 * absent in CI). Instead we generate a throwaway Ed25519 keypair here and hand its
 * PUBLIC key to the service via LICENSE_PUBLIC_KEY_PEM — the service honors that env
 * override only when NODE_ENV !== 'production' (vitest sets NODE_ENV=test), so this
 * exercises the exact same verify path the shipped app uses against its embedded key.
 *
 * Env MUST be set before requiring the service: it resolves LICENSE_PATH once at
 * module load, and getPublicKeyPem() reads the override at call time.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

// A throwaway signing keypair for the tests, and a second one to stand in for a
// forged/foreign key (signed by something other than the trusted public key).
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const { privateKey: otherPrivateKey } = crypto.generateKeyPairSync('ed25519');
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' });

const THIS_MACHINE = 'AAAA-AAAA-AAAA-AAAA';
const LICENSE_PATH = path.join(os.tmpdir(), `vs-license-test-${process.pid}.json`);

// Set BEFORE requiring the service.
process.env.MACHINE_ID = THIS_MACHINE;
process.env.LICENSE_PUBLIC_KEY_PEM = PUBLIC_PEM;
process.env.LICENSE_PATH = LICENSE_PATH;
delete process.env.LICENSE_DEV_BYPASS;

const licenseService = require('../../services/licenseService.js');

/** Build a license key the way tools/generate-license.mjs does. */
function makeKey(payload, signer = privateKey) {
  const seg = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.sign(null, Buffer.from(seg), signer).toString('base64url');
  return `${seg}.${sig}`;
}

function validPayload(overrides = {}) {
  return {
    v: 1,
    lid: 'test-lid-0001',
    name: 'Test Shop',
    mid: THIS_MACHINE,
    iat: 1700000000,
    exp: 0, // perpetual
    ...overrides,
  };
}

function removeLicenseFile() {
  try {
    fs.rmSync(LICENSE_PATH, { force: true });
  } catch {
    /* ignore */
  }
}

beforeEach(removeLicenseFile);
afterEach(removeLicenseFile);

describe('getMachineId', () => {
  it('returns the MACHINE_ID override, normalized to uppercase', () => {
    expect(licenseService.getMachineId()).toBe(THIS_MACHINE);

    const prev = process.env.MACHINE_ID;
    process.env.MACHINE_ID = 'aaaa-aaaa-aaaa-aaaa';
    expect(licenseService.getMachineId()).toBe(THIS_MACHINE); // uppercased
    process.env.MACHINE_ID = prev;
  });

  it('IGNORES the MACHINE_ID override in production', () => {
    // Load-bearing: if a shipped app honored MACHINE_ID, anyone with a copied .exe
    // and someone else's key could set it to that key's bound ID and walk straight
    // through the machine binding. Production must always derive its own ID.
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const derived = licenseService.getMachineId();
      expect(derived).not.toBe(THIS_MACHINE);
      expect(derived).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});

describe('verifyKey', () => {
  it('accepts a valid, machine-matched, non-expired key', () => {
    const result = licenseService.verifyKey(makeKey(validPayload()));
    expect(result.ok).toBe(true);
    expect(result.payload.name).toBe('Test Shop');
  });

  it('rejects a key whose payload bytes were tampered with', () => {
    const key = makeKey(validPayload());
    const [seg, sig] = key.split('.');
    // Flip one character in the payload segment — signature no longer matches.
    const i = Math.floor(seg.length / 2);
    const flipped = seg.slice(0, i) + (seg[i] === 'A' ? 'B' : 'A') + seg.slice(i + 1);
    const result = licenseService.verifyKey(`${flipped}.${sig}`);
    expect(result.ok).toBe(false);
  });

  it('rejects a key signed by a different (untrusted) private key', () => {
    const result = licenseService.verifyKey(makeKey(validPayload(), otherPrivateKey));
    expect(result.ok).toBe(false);
  });

  it('rejects a key bound to a different machine', () => {
    const result = licenseService.verifyKey(makeKey(validPayload({ mid: 'BBBB-BBBB-BBBB-BBBB' })));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/different computer/i);
  });

  it('rejects an expired key', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const result = licenseService.verifyKey(makeKey(validPayload({ exp: past })));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it('accepts a key whose expiry is still in the future', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const result = licenseService.verifyKey(makeKey(validPayload({ exp: future })));
    expect(result.ok).toBe(true);
  });

  it('rejects malformed / empty input without throwing', () => {
    expect(licenseService.verifyKey('').ok).toBe(false);
    expect(licenseService.verifyKey(null).ok).toBe(false);
    expect(licenseService.verifyKey('no-dot-here').ok).toBe(false);
    expect(licenseService.verifyKey('too.many.dots').ok).toBe(false);
  });
});

describe('activate / isActivated / getStatus', () => {
  it('is not activated when no license file exists', () => {
    expect(licenseService.isActivated()).toBe(false);
    const status = licenseService.getStatus();
    expect(status.activated).toBe(false);
    expect(status.machineId).toBe(THIS_MACHINE);
  });

  it('activate() writes the license file and flips isActivated to true', () => {
    const key = makeKey(validPayload());
    const status = licenseService.activate(key);

    expect(status.activated).toBe(true);
    expect(status.customerName).toBe('Test Shop');
    expect(fs.existsSync(LICENSE_PATH)).toBe(true);

    const stored = JSON.parse(fs.readFileSync(LICENSE_PATH, 'utf8'));
    expect(stored.key).toBe(key);
    expect(stored.activatedAt).toBeTruthy();

    expect(licenseService.isActivated()).toBe(true);
    expect(licenseService.getStatus().activated).toBe(true);
  });

  it('activate() throws a 400 error on a bad key and writes nothing', () => {
    expect(() => licenseService.activate('garbage.key')).toThrowError();
    try {
      licenseService.activate('garbage.key');
    } catch (err) {
      expect(err.statusCode).toBe(400);
    }
    expect(fs.existsSync(LICENSE_PATH)).toBe(false);
  });

  it('treats a corrupt license file as not activated (never throws)', () => {
    fs.writeFileSync(LICENSE_PATH, 'this is not json', 'utf8');
    expect(licenseService.isActivated()).toBe(false);
    expect(licenseService.getStatus().activated).toBe(false);
  });

  it('treats a file with a valid-shape but wrong-machine key as not activated', () => {
    const key = makeKey(validPayload({ mid: 'BBBB-BBBB-BBBB-BBBB' }));
    fs.writeFileSync(LICENSE_PATH, JSON.stringify({ key, activatedAt: 'x' }), 'utf8');
    expect(licenseService.isActivated()).toBe(false);
  });
});
