/**
 * Pure calculation tests — no database.
 *
 * These pin down the *unit* of commission_rate, which the codebase currently
 * disagrees with itself about:
 *
 *   settings.commission_rate        = '8'    (percent, seeded in database/init.js)
 *   bills.commission_rate           = 8.0    (percent, divided by 100 in billingCalc)
 *   transactions.commission_rate    = 0.08   (fraction, multiplied directly)
 *   BillModal.jsx / TransactionEntry.jsx     (hardcoded, both conventions)
 *
 * Three of those four are percent, and percent is what the vendor sees on screen
 * ("Commission (8%)"), so percent is the convention these tests enforce
 * everywhere. Feeding 8 to the fraction-based path charges 800% commission —
 * ₹800 on a ₹100 sale — which is the bug the last case here documents.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { calculateTransactionTotals, round2 } = require('../../utils/calculation.js');

describe('round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(10.004)).toBe(10.0);
    expect(round2(0)).toBe(0);
  });

  it('handles the float cases that lose a paisa without an epsilon nudge', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(8.115)).toBe(8.12);
  });
});

describe('calculateTransactionTotals — commission_rate is a percentage', () => {
  it('10 kg @ ₹30 with 8% commission = ₹300 base + ₹24 = ₹324', () => {
    const t = calculateTransactionTotals(10, 30, 8);
    expect(t.baseAmount).toBe(300);
    expect(t.commissionAmount).toBe(24);
    expect(t.finalAmount).toBe(324);
  });

  it('5 kg @ ₹25 with 8% commission = ₹125 base + ₹10 = ₹135', () => {
    const t = calculateTransactionTotals(5, 25, 8);
    expect(t.baseAmount).toBe(125);
    expect(t.commissionAmount).toBe(10);
    expect(t.finalAmount).toBe(135);
  });

  it('8 kg @ ₹40 with 8% commission = ₹320 base + ₹25.60 = ₹345.60', () => {
    const t = calculateTransactionTotals(8, 40, 8);
    expect(t.baseAmount).toBe(320);
    expect(t.commissionAmount).toBe(25.6);
    expect(t.finalAmount).toBe(345.6);
  });

  it('supports a non-default percentage', () => {
    const t = calculateTransactionTotals(10, 100, 5);
    expect(t.baseAmount).toBe(1000);
    expect(t.commissionAmount).toBe(50);
    expect(t.finalAmount).toBe(1050);
  });

  it('supports zero commission', () => {
    const t = calculateTransactionTotals(10, 100, 0);
    expect(t.baseAmount).toBe(1000);
    expect(t.commissionAmount).toBe(0);
    expect(t.finalAmount).toBe(1000);
  });

  it('reports the rate back in the same unit it was given', () => {
    expect(calculateTransactionTotals(10, 30, 8).commissionRate).toBe(8);
  });

  it('handles fractional weights without drifting off a paisa', () => {
    const t = calculateTransactionTotals(12.5, 33.33, 8);
    expect(t.baseAmount).toBe(416.63);
    expect(t.commissionAmount).toBe(33.33);
    expect(t.finalAmount).toBe(449.96);
  });

  it('treats a zero weight as a zero-value line, not an error', () => {
    const t = calculateTransactionTotals(0, 30, 8);
    expect(t.baseAmount).toBe(0);
    expect(t.commissionAmount).toBe(0);
    expect(t.finalAmount).toBe(0);
  });

  it('never charges more commission than the goods are worth', () => {
    // Guards the 0.08-vs-8 mixup: under fraction semantics, a rate of 8 means
    // 800% and the vendor bills ₹900 for ₹100 of onions.
    const t = calculateTransactionTotals(1, 100, 8);
    expect(t.commissionAmount).toBe(8);
    expect(t.commissionAmount).toBeLessThan(t.baseAmount);
    expect(t.finalAmount).toBe(108);
  });
});
