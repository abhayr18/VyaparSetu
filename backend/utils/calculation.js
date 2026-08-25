/**
 * Calculation Utility for Transactions
 * Provides precise monetary calculations with 2-decimal rounding.
 */

function round2(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates transaction financial totals.
 * @param {number} weight 
 * @param {number} rate 
 * @param {number} [commissionRate=0.08] Default 8% (0.08)
 * @returns {object} { baseAmount, commissionRate, commissionAmount, finalAmount }
 */
function calculateTransactionTotals(weight, rate, commissionRate = 0.08) {
  const w = Number(weight) || 0;
  const r = Number(rate) || 0;
  const commRate = Number(commissionRate) || 0.08;

  const baseAmount = round2(w * r);
  const commissionAmount = round2(baseAmount * commRate);
  const finalAmount = round2(baseAmount + commissionAmount);

  return {
    baseAmount,
    commissionRate: commRate,
    commissionAmount,
    finalAmount
  };
}

module.exports = {
  round2,
  calculateTransactionTotals
};
