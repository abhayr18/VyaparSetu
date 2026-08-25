/**
 * Transaction Model
 * Database operations for customer vegetable transactions.
 */

const { getDb, saveDb } = require('../database/db');

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
  return values.map((row) => rowToObj(columns, row));
}

/**
 * Creates a new transaction record.
 */
function create({
  customer_id,
  vegetable_id,
  vegetable_name_snapshot,
  weight,
  unit = 'kg',
  rate,
  base_amount,
  commission_rate = 0.08,
  commission_amount,
  final_amount,
  payment_type = 'Credit',
  payment_mode = 'Credit',
  paid_amount = 0,
  remaining_amount = 0,
  transaction_date
}) {
  const db = getDb();

  db.run(
    `INSERT INTO transactions (
      customer_id, vegetable_id, vegetable_name_snapshot, weight, unit, rate,
      base_amount, commission_rate, commission_amount, final_amount,
      payment_type, payment_mode, paid_amount, remaining_amount, transaction_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customer_id,
      vegetable_id,
      vegetable_name_snapshot,
      weight,
      unit,
      rate,
      base_amount,
      commission_rate,
      commission_amount,
      final_amount,
      payment_type,
      payment_mode,
      paid_amount,
      remaining_amount,
      transaction_date
    ]
  );

  saveDb();

  const idRes = execSelect(
    `SELECT MAX(id) AS id FROM transactions WHERE customer_id = ?`,
    [customer_id]
  );
  const newId = idRes[0]?.id;
  return findById(newId);
}


/**
 * Find transaction by ID.
 */
function findById(id) {
  const rows = execSelect(
    `SELECT t.*, c.name AS customer_name, c.mobile AS customer_mobile
     FROM transactions t
     JOIN customers c ON t.customer_id = c.id
     WHERE t.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Find transactions for a customer on a specific date (YYYY-MM-DD).
 */
function findByCustomerAndDate(customerId, date) {
  return execSelect(
    `SELECT t.*, c.name AS customer_name, c.mobile AS customer_mobile
     FROM transactions t
     JOIN customers c ON t.customer_id = c.id
     WHERE t.customer_id = ? AND t.transaction_date = ?
     ORDER BY t.created_at DESC, t.id DESC`,
    [customerId, date]
  );
}

/**
 * Find transactions for a customer within a date range (YYYY-MM-DD to YYYY-MM-DD).
 */
function findByCustomerAndDateRange(customerId, startDate, endDate) {
  return execSelect(
    `SELECT t.*, c.name AS customer_name, c.mobile AS customer_mobile
     FROM transactions t
     JOIN customers c ON t.customer_id = c.id
     WHERE t.customer_id = ? 
       AND t.transaction_date >= ? 
       AND t.transaction_date <= ?
     ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC`,
    [customerId, startDate, endDate]
  );
}

/**
 * Find all transactions for a customer (or all customers) with optional date filtering.
 */
function findAll({ customerId, date, startDate, endDate }) {
  let sql = `SELECT t.*, c.name AS customer_name, c.mobile AS customer_mobile
             FROM transactions t
             JOIN customers c ON t.customer_id = c.id
             WHERE 1=1`;
  const params = [];

  if (customerId) {
    sql += ` AND t.customer_id = ?`;
    params.push(customerId);
  }

  if (date) {
    sql += ` AND t.transaction_date = ?`;
    params.push(date);
  } else {
    if (startDate) {
      sql += ` AND t.transaction_date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND t.transaction_date <= ?`;
      params.push(endDate);
    }
  }

  sql += ` ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC`;

  return execSelect(sql, params);
}

/**
 * Calculates aggregated daily purchase totals for a customer on a given date.
 */
function getDailyCustomerSummary(customerId, date) {
  const rows = execSelect(
    `SELECT 
       COUNT(t.id) AS total_transactions,
       SUM(t.weight) AS total_weight,
       SUM(t.base_amount) AS total_base_amount,
       SUM(t.commission_amount) AS total_commission,
       SUM(t.final_amount) AS total_final_amount,
       SUM(t.paid_amount) AS total_paid_amount,
       SUM(t.remaining_amount) AS total_remaining_amount
     FROM transactions t
     WHERE t.customer_id = ? AND t.transaction_date = ?`,
    [customerId, date]
  );

  const row = rows[0] || {};
  return {
    total_transactions: Number(row.total_transactions || 0),
    total_weight: Number((Number(row.total_weight || 0)).toFixed(2)),
    total_base_amount: Number((Number(row.total_base_amount || 0)).toFixed(2)),
    total_commission: Number((Number(row.total_commission || 0)).toFixed(2)),
    total_final_amount: Number((Number(row.total_final_amount || 0)).toFixed(2)),
    total_paid_amount: Number((Number(row.total_paid_amount || 0)).toFixed(2)),
    total_remaining_amount: Number((Number(row.total_remaining_amount || 0)).toFixed(2))
  };
}


/**
 * Deletes a transaction by ID.
 */
function deleteById(id) {
  const db = getDb();
  db.run(`DELETE FROM transactions WHERE id = ?`, [id]);
  saveDb();
  return true;
}

module.exports = {
  create,
  findById,
  findByCustomerAndDate,
  findByCustomerAndDateRange,
  findAll,
  getDailyCustomerSummary,
  deleteById
};
