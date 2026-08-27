// backend/models/creditModel.js
const { execSelect, execRun, transaction } = require('../database/db');
const { toPaise, toRupees, rowToRupees } = require('../utils/money');
const { signedSumSql } = require('../utils/creditLedger');
const { localDateSql, TODAY_LOCAL_SQL } = require('../utils/businessDay');

/** Get credit metrics summary */
function getSummary() {
  // Total outstanding balance across all customers
  const outstandingRes = execSelect(`SELECT SUM(credit_balance) AS total_outstanding FROM customers`);
  const totalOutstanding = outstandingRes[0]?.total_outstanding || 0.0;

  // Today's credit added.
  //
  // Deliberately CREDIT_ADDED only, not every row that increases what is owed. This is
  // an activity figure — how much udhar the shop extended today — so a notebook opening
  // balance entered today does not belong in it, and neither does a correction. Counting
  // them would tell a vendor migrating 200 customers that they gave out ₹2,00,000 of
  // credit on a day they gave out none. The figure that has to account for every row is
  // the per-customer reconciliation in customerModel.getLedger, which uses splitSigned.
  const addedRes = execSelect(
    `SELECT SUM(amount) AS today_added
     FROM credit_transactions
     WHERE transaction_type = 'CREDIT_ADDED'
       AND ${localDateSql('created_at')} = ${TODAY_LOCAL_SQL}`
  );
  const todayAdded = addedRes[0]?.today_added || 0.0;

  // Today's recovery — money actually collected, so PAYMENT_RECEIVED only. A written-off
  // adjustment reduces the balance but nothing came in, and this sits beside the day's
  // cash and UPI figures.
  const recoveredRes = execSelect(
    `SELECT SUM(amount) AS today_recovered
     FROM credit_transactions
     WHERE transaction_type = 'PAYMENT_RECEIVED'
       AND ${localDateSql('created_at')} = ${TODAY_LOCAL_SQL}`
  );
  const todayRecovered = recoveredRes[0]?.today_recovered || 0.0;

  return {
    total_outstanding: Number(toRupees(totalOutstanding).toFixed(2)),
    today_added: Number(toRupees(todayAdded).toFixed(2)),
    today_recovered: Number(toRupees(todayRecovered).toFixed(2))
  };
}

/** Get customers with active credit balance */
function getCustomersWithBalance() {
  return execSelect(
    `SELECT id, name, mobile, address, credit_balance, updated_at
     FROM customers
     WHERE credit_balance > 0
     ORDER BY credit_balance DESC, name ASC`
  ).map((c) => rowToRupees(c, 'customers'));
}

/** Get transaction logs for a single customer, newest first, opening balance pinned last. */
function getCustomerTransactions(customerId) {
  return execSelect(
    `SELECT ct.*, b.bill_number
     FROM credit_transactions ct
     LEFT JOIN bills b ON ct.bill_id = b.id
     WHERE ct.customer_id = ?
     ORDER BY CASE WHEN ct.transaction_type = 'OPENING_BALANCE' THEN 1 ELSE 0 END ASC,
              ct.created_at DESC, ct.id DESC`,
    [customerId]
  ).map((t) => rowToRupees(t, 'credit_transactions'));
}

/**
 * Customers whose stored balance no longer matches their passbook.
 *
 * `customers.credit_balance` is a running total; `credit_transactions` is the
 * history that explains it. They are written together and must agree — a credit
 * adds to what is owed, a payment subtracts, an adjustment and an opening balance
 * apply their own sign. When they disagree, the vendor is holding two different
 * answers to "how much does this customer owe me", and there is no way to tell
 * which one to say out loud. Every money test ends on this invariant; this is the
 * same check run against live data so drift surfaces on the dashboard instead of at
 * settlement.
 *
 * The signs come from utils/creditLedger, not from a CASE written out here, so this
 * query and the JavaScript replay can never disagree about a row type.
 *
 * @param {number} tolerance Paise of slack, default 0. Money is stored as whole
 *   paise now, so a healthy balance equals its ledger *exactly* — any non-zero
 *   difference is real drift, not the float noise the old REAL columns produced.
 * @returns {Array<{id, name, mobile, stored_balance, ledger_balance, difference}>}
 */
function findBalanceMismatches(tolerance = 0) {
  const signedSum = signedSumSql('ct');

  const rows = execSelect(
    `SELECT c.id, c.name, c.mobile,
            c.credit_balance AS stored_balance,
            ${signedSum} AS ledger_balance
     FROM customers c
     LEFT JOIN credit_transactions ct ON ct.customer_id = c.id
     WHERE c.is_deleted = 0
     GROUP BY c.id, c.name, c.mobile, c.credit_balance
     HAVING ABS(c.credit_balance - ${signedSum}) > ?
     ORDER BY ABS(c.credit_balance - ${signedSum}) DESC`,
    [tolerance]
  );

  return rows.map((row) => ({
    ...row,
    stored_balance: Number(toRupees(row.stored_balance).toFixed(2)),
    ledger_balance: Number(toRupees(row.ledger_balance).toFixed(2)),
    difference: Number(
      (toRupees(row.stored_balance) - toRupees(row.ledger_balance)).toFixed(2)
    ),
  }));
}

/** Transactional payment registration */
function recordPayment({ customer_id, amount, payment_mode, note }) {
  return transaction(() => {
    const amountPaise = toPaise(amount);

    // Deduct from customer credit balance
    execRun(
      `UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?`,
      [amountPaise, customer_id]
    );

    // Retrieve balance after (stored as paise)
    const balanceRow = execSelect(`SELECT credit_balance FROM customers WHERE id = ?`, [customer_id]);
    const balanceAfter = balanceRow[0]?.credit_balance || 0;

    // Insert transaction
    execRun(
      `INSERT INTO credit_transactions (customer_id, transaction_type, amount, payment_mode, note, balance_after_transaction)
       VALUES (?, 'PAYMENT_RECEIVED', ?, ?, ?, ?)`,
      [customer_id, amountPaise, payment_mode, note || 'Payment received', balanceAfter]
    );

    return { customer_id, balance_after_transaction: toRupees(balanceAfter) };
  });
}

/**
 * Transactional balance manual adjustments.
 *
 * The amount is stored with its sign: negative writes debt off, positive adds it.
 * It used to be stored as Math.abs(amount), which recorded a ₹500 write-off as a
 * ₹500 charge — the balance moved down while the passbook said it went up, so
 * replaying the passbook no longer reached the balance and the vendor had no way
 * to explain the difference to the customer.
 */
function recordAdjustment({ customer_id, amount, note }) {
  const signedPaise = toPaise(amount);

  return transaction(() => {
    // Adjust customer credit balance (amount can be positive or negative)
    execRun(
      `UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?`,
      [signedPaise, customer_id]
    );

    // Retrieve balance after (stored as paise)
    const balanceRow = execSelect(`SELECT credit_balance FROM customers WHERE id = ?`, [customer_id]);
    const balanceAfter = balanceRow[0]?.credit_balance || 0;

    // Insert transaction
    execRun(
      `INSERT INTO credit_transactions (customer_id, transaction_type, amount, payment_mode, note, balance_after_transaction)
       VALUES (?, 'CREDIT_ADJUSTMENT', ?, 'Other', ?, ?)`,
      [customer_id, signedPaise, note || 'Balance adjustment', balanceAfter]
    );

    return { customer_id, balance_after_transaction: toRupees(balanceAfter) };
  });
}

/** True when this customer already has an opening balance on record. */
function hasOpeningBalance(customerId) {
  const rows = execSelect(
    `SELECT 1 FROM credit_transactions
     WHERE customer_id = ? AND transaction_type = 'OPENING_BALANCE'
     LIMIT 1`,
    [customerId]
  );
  return rows.length > 0;
}

/**
 * Records what a customer already owed before they existed in this app.
 *
 * Shops migrate off a paper notebook, and those customers arrive mid-debt. The only
 * way to represent that before this existed was to invent a bill, which put revenue
 * that never happened into the sales and commission reports and gave the customer a
 * bill for vegetables they could not be shown. So this writes the balance and one
 * ledger row explaining it — and no bill.
 *
 * It is deliberately its own row type rather than a CREDIT_ADJUSTMENT: a vendor
 * reading the passbook needs to tell "this is where we started" apart from "we
 * corrected something later", and an opening balance is the one row that legitimately
 * predates every bill.
 *
 * Stored signed, like recordAdjustment, so a customer who was in credit (the shop
 * owed *them*) can be opened with a negative figure.
 */
function recordOpeningBalance({ customer_id, amount, note }) {
  const signedPaise = toPaise(amount);

  return transaction(() => {
    execRun(
      `UPDATE customers SET credit_balance = credit_balance + ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [signedPaise, customer_id]
    );

    const balanceRow = execSelect(`SELECT credit_balance FROM customers WHERE id = ?`, [customer_id]);
    const balanceAfter = balanceRow[0]?.credit_balance || 0;

    execRun(
      `INSERT INTO credit_transactions (customer_id, transaction_type, amount, payment_mode, note, balance_after_transaction)
       VALUES (?, 'OPENING_BALANCE', ?, 'Other', ?, ?)`,
      [customer_id, signedPaise, note || 'Opening balance', balanceAfter]
    );

    return { customer_id, balance_after_transaction: toRupees(balanceAfter) };
  });
}

module.exports = {
  getSummary,
  getCustomersWithBalance,
  getCustomerTransactions,
  findBalanceMismatches,
  recordPayment,
  recordAdjustment,
  hasOpeningBalance,
  recordOpeningBalance
};
