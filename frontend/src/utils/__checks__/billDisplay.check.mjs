/**
 * Arithmetic check for the customer-facing bill transform.
 *
 * There is no test harness on the frontend, and `billDisplay.js` decides what a
 * customer reads off a printed sheet — if the item column does not add up to the
 * total underneath it, the vendor gets a phone call they cannot answer. So this runs
 * on plain node, with no tooling:
 *
 *     node src/utils/__checks__/billDisplay.check.mjs
 *
 * Exits non-zero if any case fails.
 */

import {
  commissionMultiplier,
  grossSubtotal,
  grossItems,
  groupItemsByDate,
  isPeriodBill,
  formatBillPeriod,
  isBilled,
} from '../billDisplay.js';

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL  ${label}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

/** The sum of an item column, as a customer with a calculator would add it. */
function columnSum(items) {
  return Math.round(items.reduce((acc, i) => acc + i.total, 0) * 100) / 100;
}

function item(name, quantity, rate, total, itemDate) {
  return { vegetable_name: name, quantity, rate, total, vegetable_unit: 'kg', item_date: itemDate };
}

// ── A five-day range bill: 10kg of onions a day at ₹30, 8% commission ────────────
const DAYS = ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24'];
const week = {
  subtotal: 1500,
  commission_amount: 120,
  discount_amount: 0,
  hamali_amount: 0,
  transport_amount: 0,
  final_amount: 1620,
  period_start: DAYS[0],
  period_end: DAYS[4],
  items: DAYS.map((d) => item('Onion', 10, 30, 300, d)),
};
const weekItems = grossItems(week.items, week);

check('week: multiplier folds 8% in', Number(commissionMultiplier(week).toFixed(4)), 1.08);
check('week: rate is grossed to the all-in price', weekItems[0].rate, 32.4);
check('week: 10kg x the grossed rate is the line amount', weekItems[0].total, 324);
check('week: the item column adds up to the subtotal printed under it', columnSum(weekItems), grossSubtotal(week));
check('week: and that subtotal is the total payable', grossSubtotal(week), week.final_amount);
check('week: reads as a period bill', isPeriodBill(week), true);
check(
  'week: one section per day, each with its own total',
  groupItemsByDate(weekItems).map((g) => [g.date, g.subtotal]),
  DAYS.map((d) => [d, 324])
);

// ── Rounding residue: three lines that individually round the wrong way ──────────
const penny = {
  subtotal: 100,
  commission_amount: 8,
  discount_amount: 0,
  hamali_amount: 0,
  transport_amount: 0,
  final_amount: 108,
  items: [item('A', 1, 33.33, 33.33), item('B', 1, 33.33, 33.33), item('C', 1, 33.34, 33.34)],
};
const pennyItems = grossItems(penny.items, penny);
// Grossed independently these would be 36.00 + 36.00 + 36.01 = 108.01 — a paisa over
// the total. The last line absorbs the residue.
check('residue: the column still ties out exactly', columnSum(pennyItems), 108);
check('residue: only the last line was adjusted', pennyItems.map((i) => i.total), [36, 36, 36]);

// ── A bill with a discount, hamali and transport still reconciles ────────────────
// commission is charged on the discounted base here (billingCalc.js), so the identity
// being checked is: grossed subtotal − discount + hamali + transport = final.
const withExpenses = {
  subtotal: 1000,
  discount_amount: 100,
  commission_amount: 72,
  hamali_amount: 50,
  transport_amount: 25,
  final_amount: 1047,
  items: [item('Potato', 10, 100, 1000)],
};
const expensesItems = grossItems(withExpenses.items, withExpenses);
check('expenses: the item column matches the grossed subtotal', columnSum(expensesItems), grossSubtotal(withExpenses));
check(
  'expenses: grossed subtotal − discount + hamali + transport lands on total payable',
  Math.round(
    (grossSubtotal(withExpenses) -
      withExpenses.discount_amount +
      withExpenses.hamali_amount +
      withExpenses.transport_amount) * 100
  ) / 100,
  withExpenses.final_amount
);

// ── Waived commission prints the vendor's own rates, unchanged ───────────────────
const waived = {
  subtotal: 500,
  commission_amount: 0,
  final_amount: 500,
  items: [item('Methi', 5, 100, 500)],
};
check('waived: multiplier is 1', commissionMultiplier(waived), 1);
check('waived: the rate is untouched', grossItems(waived.items, waived)[0].rate, 100);

// ── Degenerate bills must not divide by zero ─────────────────────────────────────
check('empty bill: multiplier is 1', commissionMultiplier({ subtotal: 0, commission_amount: 0 }), 1);
check('missing bill: multiplier is 1', commissionMultiplier(undefined), 1);
check('no items: nothing to gross', grossItems(undefined, week), []);

// ── A legacy single-day bill is left exactly as it was ──────────────────────────
const legacy = {
  subtotal: 300,
  commission_amount: 24,
  final_amount: 324,
  date: '2026-08-24',
  items: [item('Onion', 10, 30, 300, null)],
};
check('legacy: not a period bill', isPeriodBill(legacy), false);
check('legacy: nothing to group by', groupItemsByDate(legacy.items), null);
check('legacy: labelled with its own date', formatBillPeriod(legacy, false), '24/8/2026');
check('period: labelled with its span', formatBillPeriod(week, false), '20/8/2026 – 24/8/2026');

// ── A bill whose stored figures disagree is shown as-is, not quietly patched ─────
// 400 + 500 is not the stored 1000. Folding that ₹100 gap into one vegetable would
// print a wrong price for that vegetable; a total that is visibly off is the honest
// outcome and the vendor can see something is wrong.
const inconsistent = {
  subtotal: 1000,
  commission_amount: 80,
  items: [item('A', 1, 400, 400), item('B', 1, 500, 500)],
};
check('inconsistent: the discrepancy is not hidden in the last line', columnSum(grossItems(inconsistent.items, inconsistent)), 972);

// ── isBilled: the fact behind both the badge and the Delete button ──────────────
// Getting this backwards would tell a vendor a debt was settled when it was not, and
// would offer a Delete the backend is going to refuse. Both directions are asserted.
check('a real bill id is billed',            isBilled(7), true);
check('id 1 is billed',                      isBilled(1), true);
// id 0 is not a value SQLite AUTOINCREMENT hands out, but truthiness checks are the
// classic way a real id gets read as absent, so it is pinned deliberately.
check('id 0 is still an id',                 isBilled(0), true);
check('a string id is billed',               isBilled('7'), true);
check('null is not billed',                  isBilled(null), false);
check('undefined is not billed',             isBilled(undefined), false);
check('a missing property is not billed',    isBilled({}.bill_id), false);
// An empty string is what a JSON round-trip or form state leaves behind where a missing
// id was meant; treating it as an id would mark an unbilled entry settled.
check('empty string is not billed',          isBilled(''), false);

console.log(`\n${checks - failures}/${checks} passed`);
if (failures > 0) process.exit(1);
