/**
 * Customer Model
 * All raw SQL queries for the customers table live here.
 * Services call these functions — never call db directly from controllers.
 */

const { execSelect, execRun } = require('../database/db');

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get all customers, ordered by name.
 * @returns {Array}
 */
function findAll() {
  return execSelect(
    `SELECT id, name, mobile, address, notes, credit_balance, created_at, updated_at
     FROM customers
     WHERE is_deleted = 0
     ORDER BY name ASC`
  );
}

/**
 * Find a single customer by ID.
 * @param {number} id
 * @returns {Object|null}
 */
function findById(id) {
  const rows = execSelect(
    `SELECT id, name, mobile, address, notes, credit_balance, created_at, updated_at
     FROM customers WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Find a customer by mobile number (used for duplicate check).
 * @param {string} mobile
 * @param {number|null} excludeId - skip this ID (for edit validation)
 * @returns {Object|null}
 */
function findByMobile(mobile, excludeId = null) {
  const sql = excludeId
    ? `SELECT id FROM customers WHERE mobile = ? AND id != ? AND is_deleted = 0`
    : `SELECT id FROM customers WHERE mobile = ? AND is_deleted = 0`;
  const params = excludeId ? [mobile, excludeId] : [mobile];
  const rows = execSelect(sql, params);
  return rows[0] || null;
}

/**
 * Search customers by name or mobile (case-insensitive LIKE).
 * @param {string} query
 * @returns {Array}
 */
function search(query) {
  const like = `%${query}%`;
  return execSelect(
    `SELECT id, name, mobile, address, notes, credit_balance, created_at, updated_at
     FROM customers
     WHERE (name LIKE ? OR mobile LIKE ?) AND is_deleted = 0
     ORDER BY name ASC`,
    [like, like]
  );
}

/**
 * Insert a new customer or reactivate a deleted one.
 * @param {{ name, mobile, address, notes }} data
 * @returns {Object} The newly created/updated customer
 */
function create({ name, mobile, address = '', notes = '' }) {
  // Check if a record already exists with this mobile (even if deleted)
  const rows = execSelect(`SELECT id FROM customers WHERE mobile = ?`, [mobile.trim()]);

  if (rows.length > 0) {
    // Reactivate and update the existing soft-deleted record
    const existingId = rows[0].id;
    execRun(
      `UPDATE customers
       SET name = ?, address = ?, notes = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name.trim(), address.trim(), notes.trim(), existingId]
    );
  } else {
    // Insert fresh record
    execRun(
      `INSERT INTO customers (name, mobile, address, notes, credit_balance)
       VALUES (?, ?, ?, ?, 0.0)`,
      [name.trim(), mobile.trim(), address.trim(), notes.trim()]
    );
  }

  // Retrieve the inserted/updated row
  const resultRows = execSelect(
    `SELECT id, name, mobile, address, notes, credit_balance, created_at, updated_at
     FROM customers WHERE mobile = ?`,
    [mobile.trim()]
  );
  return resultRows[0];
}

/**
 * Update an existing customer.
 * @param {number} id
 * @param {{ name, mobile, address, notes }} data
 * @returns {Object|null} Updated customer or null if not found
 */
function update(id, { name, mobile, address = '', notes = '' }) {
  execRun(
    `UPDATE customers
     SET name = ?, mobile = ?, address = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [name.trim(), mobile.trim(), address.trim(), notes.trim(), id]
  );
  return findById(id);
}

/**
 * Delete a customer by ID.
 * @param {number} id
 * @returns {boolean} true if deleted
 */
function remove(id) {
  const existing = findById(id);
  if (!existing) return false;
  execRun(`UPDATE customers SET is_deleted = 1 WHERE id = ?`, [id]);
  return true;
}

/**
 * Get full ledger for a customer: profile + all bills + all credit transactions + summary.
 * @param {number} customerId
 * @returns {Object|null}
 */
function getLedger(customerId) {
  const customer = findById(customerId);
  if (!customer) return null;

  // All bills for this customer
  const bills = execSelect(
    `SELECT b.id, b.bill_number, b.date, b.subtotal, b.discount_amount,
            b.commission_amount, b.hamali_amount, b.transport_amount,
            b.final_amount, b.paid_amount, b.remaining_amount,
            b.payment_type, b.payment_status
     FROM bills b
     WHERE b.customer_id = ?
     ORDER BY b.date DESC, b.id DESC`,
    [customerId]
  );

  // All credit transactions for this customer
  const transactions = execSelect(
    `SELECT ct.id, ct.transaction_type, ct.amount, ct.payment_mode,
            ct.note, ct.balance_after_transaction, ct.created_at,
            b.bill_number
     FROM credit_transactions ct
     LEFT JOIN bills b ON ct.bill_id = b.id
     WHERE ct.customer_id = ?
     ORDER BY ct.created_at DESC, ct.id DESC`,
    [customerId]
  );

  // Summary totals
  //
  // totalCredit − totalRecovered must land exactly on outstanding, because the
  // vendor reads those three figures side by side and a customer will do the
  // subtraction. Adjustments were previously left out of both, so any written-off
  // or corrected balance made the summary contradict the outstanding beside it.
  //
  // A signed adjustment belongs on whichever side its sign puts it: a positive one
  // is debt added, a negative one is debt forgiven and reads as recovery.
  const adjustments = transactions.filter((t) => t.transaction_type === 'CREDIT_ADJUSTMENT');

  const totalBilled  = bills.reduce((s, b) => s + Number(b.final_amount  || 0), 0);
  const totalPaid    = bills.reduce((s, b) => s + Number(b.paid_amount   || 0), 0);
  const totalCredit  = transactions
    .filter(t => t.transaction_type === 'CREDIT_ADDED')
    .reduce((s, t) => s + Number(t.amount || 0), 0)
    + adjustments.reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
  const totalRecovered = transactions
    .filter(t => t.transaction_type === 'PAYMENT_RECEIVED')
    .reduce((s, t) => s + Number(t.amount || 0), 0)
    + adjustments.reduce((s, t) => s + Math.max(0, -(Number(t.amount) || 0)), 0);

  return {
    customer,
    bills,
    transactions,
    summary: {
      totalBilled:    Number(totalBilled.toFixed(2)),
      totalPaid:      Number(totalPaid.toFixed(2)),
      totalCredit:    Number(totalCredit.toFixed(2)),
      totalRecovered: Number(totalRecovered.toFixed(2)),
      outstanding:    Number(Number(customer.credit_balance).toFixed(2)),
    }
  };
}

module.exports = { findAll, findById, findByMobile, search, create, update, remove, getLedger };
