/**
 * The two credit-ledger sign maps must agree.
 *
 * `backend/utils/creditLedger.js` is the definition: every SQL replay and every backend
 * total is generated from it, so a row type that is missing there fails loudly. The
 * frontend needs the same signs to render "credit given" and "recovered" beside the
 * outstanding figure, but it cannot import a CommonJS module from a separate process —
 * Vite bundles only `frontend/src`. So `frontend/src/utils/creditLedger.js` holds a copy.
 *
 * A copy that can drift is worse than no copy: the vendor would read two totals derived
 * from two different rules and have no way to tell which one to say out loud. This test
 * is what makes the copy safe. It reads the frontend file as text and compares the sign
 * map literal against the backend's, so adding a ledger row type in one place and
 * forgetting the other is a red test rather than a screen that quietly stops adding up.
 *
 * Parsed as text rather than imported because the frontend module is ESM with no
 * relationship to this package's dependency tree; a regex over one object literal is a
 * smaller commitment than making the backend test runner resolve the frontend's graph.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LEDGER_SIGNS } = require('../../utils/creditLedger.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND_LEDGER = resolve(HERE, '../../../frontend/src/utils/creditLedger.js');

/** Pulls `TYPE: <signed int>` pairs out of the frontend's exported LEDGER_SIGNS literal. */
function readFrontendSigns() {
  const source = readFileSync(FRONTEND_LEDGER, 'utf8');
  const literal = source.match(/export const LEDGER_SIGNS\s*=\s*\{([^}]*)\}/);
  if (!literal) {
    throw new Error(
      `Could not find "export const LEDGER_SIGNS = { ... }" in ${FRONTEND_LEDGER}. ` +
      'If that module was renamed or restructured, update this test — do not delete it.'
    );
  }

  const signs = {};
  for (const [, type, value] of literal[1].matchAll(/([A-Z_]+)\s*:\s*(-?\d+)/g)) {
    signs[type] = Number(value);
  }
  return signs;
}

describe('credit ledger sign parity between backend and frontend', () => {
  it('defines exactly the same row types on both sides', () => {
    const frontend = readFrontendSigns();
    expect(Object.keys(frontend).sort()).toEqual(Object.keys(LEDGER_SIGNS).sort());
  });

  it('gives every row type the same sign on both sides', () => {
    const frontend = readFrontendSigns();
    expect(frontend).toEqual(LEDGER_SIGNS);
  });

  it('found a non-empty map, so a silent parse failure cannot pass this suite', () => {
    // Without this, a regex that stopped matching would yield {} === {} for a backend
    // map that had also somehow emptied, and the two assertions above would go green
    // while checking nothing.
    const frontend = readFrontendSigns();
    expect(Object.keys(frontend).length).toBeGreaterThanOrEqual(4);
    expect(frontend.OPENING_BALANCE).toBe(1);
  });
});
