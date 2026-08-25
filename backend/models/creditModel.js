// backend/models/creditModel.js
const { getDb, transaction } = require('../database/db');

// Helper to map rows
function rowToObj(columns, row) {
  const obj = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

function execSelect(sql, params = []) {
  const db = getDb();
  const result = db.exec(sql, params);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(row => rowToObj(columns, row));
}

/** Get credit metrics summary */
function getSummary() {
  const db = getDb();
  
  // Total outstanding balance across all customers
  const outstandingRes = execSelect(`SELECT SUM(credit_balance) AS total_outstanding FROM customers`);
  const totalOutstanding = outstandingRes[0]?.total_outstanding || 0.0;

  // Today's credit added
  const addedRes = execSelect(
    `SELECT SUM(amount) AS today_added 
     FROM credit_transactions 
     WHERE transaction_type = 'CREDIT_ADDED' 
       AND date(created_at) = date('now', 'localtime')`
  );
  const todayAdded = addedRes[0]?.today_added || 0.0;

  // Today's recovery (payments received)
  const recoveredRes = execSelect(
    `SELECT SUM(amount) AS today_recovered 
     FROM credit_transactions 
     WHERE transaction_type = 'PAYMENT_RECEIVED' 
       AND date(created_at) = date('now', 'localtime')`
  );
  const todayRecovered = recoveredRes[0]?.today_recovered || 0.0;

  return {
    total_outstanding: Number(totalOutstanding.toFixed(2)),
    today_added: Number(todayAdded.toFixed(2)),
    today_recovered: Number(todayRecovered.toFixed(2))
  };
}

/** Get customers with active credit balance */
function getCustomersWithBalance() {
  return execSelect(
    `SELECT id, name, mobile, address, credit_balance, updated_at 
     FROM customers 
     WHERE credit_balance > 0 
     ORDER BY credit_balance DESC, name ASC`
  );
}

/** Get transaction logs for a single customer */
function getCustomerTransactions(customerId) {
  return execSelect(
    `SELECT ct.*, b.bill_number
     FROM credit_transactions ct
     LEFT JOIN bills b ON ct.bill_id = b.id
     WHERE ct.customer_id = ?
     ORDER BY ct.created_at DESC, ct.id DESC`,
    [customerId]
  );
}

/**
 * Customers whose stored balance no longer matches their passbook.
 *
 * `customers.credit_balance` is a running total; `credit_transactions` is the
 * history that explains it. They are written together and must agree — a credit
 * adds to what is owed, a payment subtracts, an adjustment applies its own sign.
 * When they disagree, the vendor is holding two different answers to "how much
 * does this customer owe me", and there is no way to tell which one to say out
 * loud. Every money test ends on this invariant; this is the same check run
 * against live data so drift surfaces on the dashboard instead of at settlement.
 *
 * @param {number} tolerance Rupees of slack. Above float noise, below one paise.
 * @returns {Array<{id, name, mobile, stored_balance, ledger_balance, difference}>}
 */
function findBalanceMismatches(tolerance = 0.005) {
  const signedSum = `COALESCE(SUM(CASE
            WHEN ct.transaction_type = 'CREDIT_ADDED'      THEN ct.amount
            WHEN ct.transaction_type = 'PAYMENT_RECEIVED'  THEN -ct.amount
            WHEN ct.transaction_type = 'CREDIT_ADJUSTMENT' THEN ct.amount
            ELSE 0
          END), 0.0)`;

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
    stored_balance: Number(Number(row.stored_balance || 0).toFixed(2)),
    ledger_balance: Number(Number(row.ledger_balance || 0).toFixed(2)),
    difference: Number(
      (Number(row.stored_balance || 0) - Number(row.ledger_balance || 0)).toFixed(2)
    ),
  }));
}

/** Transactional payment registration */
function recordPayment({ customer_id, amount, payment_mode, note }) {
  const db = getDb();

  return transaction(() => {
    // Deduct from customer credit balance
    db.run(
      `UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?`,
      [amount, customer_id]
    );

    // Retrieve balance after
    const balanceRow = execSelect(`SELECT credit_balance FROM customers WHERE id = ?`, [customer_id]);
    const balanceAfter = balanceRow[0]?.credit_balance || 0;

    // Insert transaction
    db.run(
      `INSERT INTO credit_transactions (customer_id, transaction_type, amount, payment_mode, note, balance_after_transaction)
       VALUES (?, 'PAYMENT_RECEIVED', ?, ?, ?, ?)`,
      [customer_id, amount, payment_mode, note || 'Payment received', balanceAfter]
    );

    return { customer_id, balance_after_transaction: balanceAfter };
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
  const db = getDb();
  const signedAmount = Number(amount);

  return transaction(() => {
    // Adjust customer credit balance (amount can be positive or negative)
    db.run(
      `UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?`,
      [signedAmount, customer_id]
    );

    // Retrieve balance after
    const balanceRow = execSelect(`SELECT credit_balance FROM customers WHERE id = ?`, [customer_id]);
    const balanceAfter = balanceRow[0]?.credit_balance || 0;

    // Insert transaction
    db.run(
      `INSERT INTO credit_transactions (customer_id, transaction_type, amount, payment_mode, note, balance_after_transaction)
       VALUES (?, 'CREDIT_ADJUSTMENT', ?, 'Other', ?, ?)`,
      [customer_id, signedAmount, note || 'Balance adjustment', balanceAfter]
    );

    return { customer_id, balance_after_transaction: balanceAfter };
  });
}

module.exports = {
  getSummary,
  getCustomersWithBalance,
  getCustomerTransactions,
  findBalanceMismatches,
  recordPayment,
  recordAdjustment
};
