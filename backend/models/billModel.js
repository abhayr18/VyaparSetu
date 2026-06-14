// backend/models/billModel.js

const { getDb, saveDb } = require('../database/db');
const { getByBillId, createMany, deleteByBillId } = require('./billItemModel');

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

/** Get all bills with customer names, and attach items */
function findAll() {
  const bills = execSelect(
    `SELECT b.*, c.name AS customer_name, c.mobile AS customer_mobile
     FROM bills b
     JOIN customers c ON b.customer_id = c.id
     ORDER BY b.date DESC, b.id DESC`
  );
  for (const bill of bills) {
    bill.items = getByBillId(bill.id);
  }
  return bills;
}

/** Get a bill by its ID, with items attached */
function findById(id) {
  const rows = execSelect(
    `SELECT b.*, c.name AS customer_name, c.mobile AS customer_mobile
     FROM bills b
     JOIN customers c ON b.customer_id = c.id
     WHERE b.id = ?`,
    [id]
  );
  const bill = rows[0] || null;
  if (bill) {
    bill.items = getByBillId(bill.id);
  }
  return bill;
}

/** Get a bill by its bill_number, with items attached */
function findByNumber(number) {
  const rows = execSelect(
    `SELECT b.*, c.name AS customer_name, c.mobile AS customer_mobile
     FROM bills b
     JOIN customers c ON b.customer_id = c.id
     WHERE b.bill_number = ?`,
    [number]
  );
  const bill = rows[0] || null;
  if (bill) {
    bill.items = getByBillId(bill.id);
  }
  return bill;
}

/** Search bills by number or customer name, and attach items */
function search(query) {
  const like = `%${query}%`;
  const bills = execSelect(
    `SELECT b.*, c.name AS customer_name, c.mobile AS customer_mobile
     FROM bills b
     JOIN customers c ON b.customer_id = c.id
     WHERE b.bill_number LIKE ? OR c.name LIKE ?
     ORDER BY b.date DESC, b.id DESC`,
    [like, like]
  );
  for (const bill of bills) {
    bill.items = getByBillId(bill.id);
  }
  return bills;
}

/** Get bills by customer ID, and attach items */
function findByCustomerId(customerId) {
  const bills = execSelect(
    `SELECT b.*, c.name AS customer_name, c.mobile AS customer_mobile
     FROM bills b
     JOIN customers c ON b.customer_id = c.id
     WHERE b.customer_id = ?
     ORDER BY b.date DESC, b.id DESC`,
    [customerId]
  );
  for (const bill of bills) {
    bill.items = getByBillId(bill.id);
  }
  return bills;
}

/** Create a new bill and its items */
function create(data) {
  const db = getDb();
  const actualNumber = data.bill_number || `BILL-${Date.now()}`;
  const dateVal = data.date || new Date().toISOString().split('T')[0];

  try {
    db.run("BEGIN TRANSACTION");

    db.run(
      `INSERT INTO bills (
        bill_number, customer_id, date, subtotal, discount_type, discount_value,
        discount_amount, commission_rate, commission_amount, hamali_amount, transport_amount, final_amount,
        paid_amount, remaining_amount, payment_type, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actualNumber,
        data.customer_id,
        dateVal,
        data.subtotal,
        data.discount_type || 'fixed',
        data.discount_value || 0,
        data.discount_amount || 0,
        data.commission_rate || 8.0,
        data.commission_amount,
        data.hamali_amount || 0,
        data.transport_amount || 0,
        data.final_amount,
        data.paid_amount || 0,
        data.remaining_amount || 0,
        data.payment_type,
        data.payment_status
      ]
    );

    // Retrieve the inserted row ID
    const rows = execSelect(`SELECT id FROM bills WHERE bill_number = ?`, [actualNumber]);
    if (!rows.length) throw new Error('Failed to retrieve inserted bill ID');
    const billId = rows[0].id;

    // Insert items
    if (data.items && data.items.length) {
      createMany(billId, data.items);
    }

    // Add remaining_amount to customer credit balance & create transaction
    const rem = Number(data.remaining_amount) || 0;
    if (rem > 0) {
      db.run(
        `UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?`,
        [rem, data.customer_id]
      );
      const balanceRow = execSelect(`SELECT credit_balance FROM customers WHERE id = ?`, [data.customer_id]);
      const balanceAfter = balanceRow[0]?.credit_balance || 0;

      db.run(
        `INSERT INTO credit_transactions (customer_id, bill_id, transaction_type, amount, payment_mode, note, balance_after_transaction)
         VALUES (?, ?, 'CREDIT_ADDED', ?, 'Other', ?, ?)`,
        [data.customer_id, billId, rem, `Bill #${actualNumber} generated`, balanceAfter]
      );
    }

    db.run("COMMIT");
    saveDb();

    return findById(billId);
  } catch (err) {
    try { db.run("ROLLBACK"); } catch (rollbackErr) { /* ignore */ }
    throw err;
  }
}

/** Update an existing bill and replace its items if provided */
function update(id, data) {
  const db = getDb();
  const oldBill = findById(id);
  if (!oldBill) throw new Error('Bill not found');

  try {
    db.run("BEGIN TRANSACTION");

    // Reverse old remaining_amount from old customer
    const oldRem = Number(oldBill.remaining_amount) || 0;
    if (oldRem > 0) {
      db.run(
        `UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?`,
        [oldRem, oldBill.customer_id]
      );
      // Delete old CREDIT_ADDED transaction for this bill
      db.run(
        `DELETE FROM credit_transactions WHERE bill_id = ? AND transaction_type = 'CREDIT_ADDED'`,
        [id]
      );
    }

    const fields = [];
    const values = [];
    if (data.bill_number) { fields.push('bill_number = ?'); values.push(data.bill_number); }
    if (data.customer_id) { fields.push('customer_id = ?'); values.push(data.customer_id); }
    if (data.date) { fields.push('date = ?'); values.push(data.date); }
    if (data.subtotal !== undefined) { fields.push('subtotal = ?'); values.push(data.subtotal); }
    if (data.discount_type) { fields.push('discount_type = ?'); values.push(data.discount_type); }
    if (data.discount_value !== undefined) { fields.push('discount_value = ?'); values.push(data.discount_value); }
    if (data.discount_amount !== undefined) { fields.push('discount_amount = ?'); values.push(data.discount_amount); }
    if (data.commission_rate !== undefined) { fields.push('commission_rate = ?'); values.push(data.commission_rate); }
    if (data.commission_amount !== undefined) { fields.push('commission_amount = ?'); values.push(data.commission_amount); }
    if (data.hamali_amount !== undefined) { fields.push('hamali_amount = ?'); values.push(data.hamali_amount); }
    if (data.transport_amount !== undefined) { fields.push('transport_amount = ?'); values.push(data.transport_amount); }
    if (data.final_amount !== undefined) { fields.push('final_amount = ?'); values.push(data.final_amount); }
    if (data.paid_amount !== undefined) { fields.push('paid_amount = ?'); values.push(data.paid_amount); }
    if (data.remaining_amount !== undefined) { fields.push('remaining_amount = ?'); values.push(data.remaining_amount); }
    if (data.payment_type) { fields.push('payment_type = ?'); values.push(data.payment_type); }
    if (data.payment_status) { fields.push('payment_status = ?'); values.push(data.payment_status); }

    if (fields.length) {
      db.run(
        `UPDATE bills SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, id]
      );
    }

    if (data.items) {
      deleteByBillId(id);
      createMany(id, data.items);
    }

    // Apply new remaining_amount to the new/current customer
    const newCustId = data.customer_id || oldBill.customer_id;
    const newRem = data.remaining_amount !== undefined ? Number(data.remaining_amount) : oldRem;
    const billNum = data.bill_number || oldBill.bill_number;

    if (newRem > 0) {
      db.run(
        `UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?`,
        [newRem, newCustId]
      );
      const balanceRow = execSelect(`SELECT credit_balance FROM customers WHERE id = ?`, [newCustId]);
      const balanceAfter = balanceRow[0]?.credit_balance || 0;

      db.run(
        `INSERT INTO credit_transactions (customer_id, bill_id, transaction_type, amount, payment_mode, note, balance_after_transaction)
         VALUES (?, ?, 'CREDIT_ADDED', ?, 'Other', ?, ?)`,
        [newCustId, id, newRem, `Bill #${billNum} updated`, balanceAfter]
      );
    }

    db.run("COMMIT");
    saveDb();

    return findById(id);
  } catch (err) {
    try { db.run("ROLLBACK"); } catch (rollbackErr) { /* ignore */ }
    throw err;
  }
}

/** Delete a bill and its items */
function remove(id) {
  const db = getDb();
  const oldBill = findById(id);
  if (!oldBill) return false;

  try {
    db.run("BEGIN TRANSACTION");

    const oldRem = Number(oldBill.remaining_amount) || 0;
    if (oldRem > 0) {
      db.run(
        `UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?`,
        [oldRem, oldBill.customer_id]
      );
    }

    db.run(`DELETE FROM bills WHERE id = ?`, [id]);
    db.run(`DELETE FROM bill_items WHERE bill_id = ?`, [id]);
    db.run(`DELETE FROM credit_transactions WHERE bill_id = ?`, [id]);

    db.run("COMMIT");
    saveDb();
    return true;
  } catch (err) {
    try { db.run("ROLLBACK"); } catch (rollbackErr) { /* ignore */ }
    throw err;
  }
}

module.exports = {
  findAll,
  findById,
  findByNumber,
  findByCustomerId,
  search,
  create,
  update,
  remove,
};
