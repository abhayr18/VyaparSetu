// backend/models/creditModel.js
const { getDb, saveDb } = require('../database/db');

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

/** Transactional payment registration */
function recordPayment({ customer_id, amount, payment_mode, note }) {
  const db = getDb();
  try {
    db.run("BEGIN TRANSACTION");

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

    db.run("COMMIT");
    saveDb();

    return { customer_id, balance_after_transaction: balanceAfter };
  } catch (err) {
    try { db.run("ROLLBACK"); } catch (rollbackErr) { /* ignore */ }
    throw err;
  }
}

/** Transactional balance manual adjustments */
function recordAdjustment({ customer_id, amount, note }) {
  const db = getDb();
  try {
    db.run("BEGIN TRANSACTION");

    // Adjust customer credit balance (amount can be positive or negative)
    db.run(
      `UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?`,
      [amount, customer_id]
    );

    // Retrieve balance after
    const balanceRow = execSelect(`SELECT credit_balance FROM customers WHERE id = ?`, [customer_id]);
    const balanceAfter = balanceRow[0]?.credit_balance || 0;

    // Insert transaction
    db.run(
      `INSERT INTO credit_transactions (customer_id, transaction_type, amount, payment_mode, note, balance_after_transaction)
       VALUES (?, 'CREDIT_ADJUSTMENT', ?, 'Other', ?, ?)`,
      [customer_id, Math.abs(amount), note || 'Balance adjustment', balanceAfter]
    );

    db.run("COMMIT");
    saveDb();

    return { customer_id, balance_after_transaction: balanceAfter };
  } catch (err) {
    try { db.run("ROLLBACK"); } catch (rollbackErr) { /* ignore */ }
    throw err;
  }
}

module.exports = {
  getSummary,
  getCustomersWithBalance,
  getCustomerTransactions,
  recordPayment,
  recordAdjustment
};
