/**
 * Transaction Model
 * Database operations for customer vegetable transactions.
 */

const { execSelect, execRun } = require('../database/db');
const { DEFAULT_COMMISSION_PERCENT } = require('../utils/calculation');

/**
 * Creates a new transaction record.
 *
 * @param {object} data
 * @param {number} [data.commission_rate=8] Commission as a percentage.
 */
function create({
  customer_id,
  vegetable_id,
  vegetable_name_snapshot,
  weight,
  unit = 'kg',
  rate,
  base_amount,
  commission_rate = DEFAULT_COMMISSION_PERCENT,
  commission_amount,
  final_amount,
  payment_type = 'Credit',
  payment_mode = 'Credit',
  paid_amount = 0,
  remaining_amount = 0,
  transaction_date
}) {
  const info = execRun(
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

  // lastInsertRowid is per-connection and reflects this INSERT specifically. The
  // previous SELECT MAX(id) WHERE customer_id = ? returned the wrong row as soon
  // as anything else inserted for the same customer in between.
  const newId = Number(info.lastInsertRowid);

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
 * Finds a customer's transactions on a date that have not yet been billed.
 *
 * Bill generation reads this rather than every transaction on the date, so a
 * second run finds nothing and cannot bill the same sales twice.
 */
function findUnbilledByCustomerAndDate(customerId, date) {
  return execSelect(
    `SELECT t.*, c.name AS customer_name, c.mobile AS customer_mobile
     FROM transactions t
     JOIN customers c ON t.customer_id = c.id
     WHERE t.customer_id = ? AND t.transaction_date = ? AND t.bill_id IS NULL
     ORDER BY t.created_at DESC, t.id DESC`,
    [customerId, date]
  );
}

/**
 * Marks transactions as consolidated into a bill.
 *
 * Only claims rows that are still unbilled, and returns how many it claimed. A
 * caller that asked for N and got fewer raced with another bill and must not
 * proceed.
 *
 * @returns {number} rows claimed
 */
function markAsBilled(ids, billId) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;

  const placeholders = ids.map(() => '?').join(', ');
  execRun(
    `UPDATE transactions SET bill_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id IN (${placeholders}) AND bill_id IS NULL`,
    [billId, ...ids]
  );

  const claimed = execSelect(
    `SELECT COUNT(*) AS n FROM transactions WHERE id IN (${placeholders}) AND bill_id = ?`,
    [...ids, billId]
  );
  return Number(claimed[0]?.n || 0);
}

/** Releases transactions back to unbilled, used when a bill is deleted. */
function clearBillLink(billId) {
  execRun(
    `UPDATE transactions SET bill_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE bill_id = ?`,
    [billId]
  );
  return true;
}

/**
 * Deletes a transaction by ID.
 *
 * Callers must reverse the credit this transaction booked first — see
 * transactionService.deleteTransaction, which does both inside one transaction.
 */
function deleteById(id) {
  execRun(`DELETE FROM transactions WHERE id = ?`, [id]);
  return true;
}

module.exports = {
  create,
  findById,
  findByCustomerAndDate,
  findUnbilledByCustomerAndDate,
  findByCustomerAndDateRange,
  findAll,
  getDailyCustomerSummary,
  markAsBilled,
  clearBillLink,
  deleteById
};
