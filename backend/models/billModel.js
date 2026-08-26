// backend/models/billModel.js

const { execSelect, execRun, transaction } = require('../database/db');
const { normalizeCommissionPercent } = require('../utils/calculation');
const { toPaise, rowToRupees } = require('../utils/money');
const { getByBillId, createMany, deleteByBillId } = require('./billItemModel');

/** Get all bills with customer names, and attach items */
function findAll() {
  const bills = execSelect(
    `SELECT b.*, c.name AS customer_name, c.mobile AS customer_mobile
     FROM bills b
     JOIN customers c ON b.customer_id = c.id
     ORDER BY b.date DESC, b.id DESC`
  ).map((b) => rowToRupees(b, 'bills'));
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
  const bill = rows[0] ? rowToRupees(rows[0], 'bills') : null;
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
  const bill = rows[0] ? rowToRupees(rows[0], 'bills') : null;
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
  ).map((b) => rowToRupees(b, 'bills'));
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
  ).map((b) => rowToRupees(b, 'bills'));
  for (const bill of bills) {
    bill.items = getByBillId(bill.id);
  }
  return bills;
}

/**
 * The debt this bill booked *itself*, as recorded in the ledger.
 *
 * A bill entered through the Billing module originates its own debt. A bill
 * generated from a day's transactions does not — the transactions already booked
 * it, and their ledger rows are merely re-labelled with this bill's id. Those rows
 * carry a transaction_id, which is what distinguishes them here.
 *
 * Reversing a bill means reversing what it booked, so this is the figure to use
 * rather than remaining_amount.
 */
function selfBookedCredit(billId) {
  const rows = execSelect(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM credit_transactions
     WHERE bill_id = ? AND transaction_type = 'CREDIT_ADDED' AND transaction_id IS NULL`,
    [billId]
  );
  return Number(rows[0]?.total || 0);
}

/** Removes the ledger rows this bill originated, leaving transaction-owned rows. */
function deleteSelfBookedLedgerRows(billId) {
  execRun(
    `DELETE FROM credit_transactions
     WHERE bill_id = ? AND transaction_type = 'CREDIT_ADDED' AND transaction_id IS NULL`,
    [billId]
  );
}

/** Adds `amount` to a customer's balance and writes the matching ledger row. */
function bookCreditRow({ customerId, billId, amount, note }) {
  const amountPaise = toPaise(amount);
  execRun(`UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?`, [
    amountPaise,
    customerId,
  ]);
  const balanceRow = execSelect(`SELECT credit_balance FROM customers WHERE id = ?`, [customerId]);
  const balanceAfter = Number(balanceRow[0]?.credit_balance || 0);

  execRun(
    `INSERT INTO credit_transactions
       (customer_id, bill_id, transaction_type, amount, payment_mode, note, balance_after_transaction)
     VALUES (?, ?, 'CREDIT_ADDED', ?, 'Other', ?, ?)`,
    [customerId, billId, amountPaise, note, balanceAfter]
  );
}

/**
 * Create a new bill and its items.
 *
 * @param {object} data
 * @param {object}  [options]
 * @param {boolean} [options.bookCredit=true] Whether this bill should add its
 *   unpaid portion to the customer's balance.
 *
 *   Pass `false` when the debt already exists. `transactionService` books credit
 *   the moment an udhar sale is entered, so the vendor sees a running balance
 *   through the day; consolidating those sales into a bill must not charge for
 *   them a second time. Both this function and that one used to write to
 *   `customers.credit_balance` independently, which doubled every consolidated
 *   day's debt.
 */
function create(data, { bookCredit = true } = {}) {
  const actualNumber = data.bill_number || `BILL-${Date.now()}`;
  const dateVal = data.date || new Date().toISOString().split('T')[0];

  return transaction(() => {
    const info = execRun(
      `INSERT INTO bills (
        bill_number, customer_id, date, subtotal, discount_type, discount_value,
        discount_amount, commission_rate, commission_amount, hamali_amount, transport_amount, final_amount,
        paid_amount, remaining_amount, payment_type, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actualNumber,
        data.customer_id,
        dateVal,
        toPaise(data.subtotal),
        data.discount_type || 'fixed',
        data.discount_value || 0,
        toPaise(data.discount_amount || 0),
        normalizeCommissionPercent(data.commission_rate),
        toPaise(data.commission_amount),
        toPaise(data.hamali_amount || 0),
        toPaise(data.transport_amount || 0),
        toPaise(data.final_amount),
        toPaise(data.paid_amount || 0),
        toPaise(data.remaining_amount || 0),
        data.payment_type,
        data.payment_status,
      ]
    );

    const billId = Number(info.lastInsertRowid);
    if (!billId) throw new Error('Failed to retrieve inserted bill ID');

    if (data.items && data.items.length) {
      createMany(billId, data.items);
    }

    const rem = Number(data.remaining_amount) || 0;
    if (bookCredit && rem > 0) {
      bookCreditRow({
        customerId: data.customer_id,
        billId,
        amount: rem,
        note: `Bill #${actualNumber} generated`,
      });
    }

    return findById(billId);
  });
}

/** Update an existing bill and replace its items if provided */
function update(id, data) {
  const oldBill = findById(id);
  if (!oldBill) throw new Error('Bill not found');

  // A consolidated bill's debt belongs to its transactions, so this bill must not
  // reverse or re-book it.
  const originatedOwnCredit = selfBookedCredit(id) > 0;

  return transaction(() => {
    if (originatedOwnCredit) {
      execRun(`UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?`, [
        selfBookedCredit(id),
        oldBill.customer_id,
      ]);
      deleteSelfBookedLedgerRows(id);
    }

    const fields = [];
    const values = [];
    if (data.bill_number) { fields.push('bill_number = ?'); values.push(data.bill_number); }
    if (data.customer_id) { fields.push('customer_id = ?'); values.push(data.customer_id); }
    if (data.date) { fields.push('date = ?'); values.push(data.date); }
    if (data.subtotal !== undefined) { fields.push('subtotal = ?'); values.push(toPaise(data.subtotal)); }
    if (data.discount_type) { fields.push('discount_type = ?'); values.push(data.discount_type); }
    if (data.discount_value !== undefined) { fields.push('discount_value = ?'); values.push(data.discount_value); }
    if (data.discount_amount !== undefined) { fields.push('discount_amount = ?'); values.push(toPaise(data.discount_amount)); }
    if (data.commission_rate !== undefined) { fields.push('commission_rate = ?'); values.push(normalizeCommissionPercent(data.commission_rate)); }
    if (data.commission_amount !== undefined) { fields.push('commission_amount = ?'); values.push(toPaise(data.commission_amount)); }
    if (data.hamali_amount !== undefined) { fields.push('hamali_amount = ?'); values.push(toPaise(data.hamali_amount)); }
    if (data.transport_amount !== undefined) { fields.push('transport_amount = ?'); values.push(toPaise(data.transport_amount)); }
    if (data.final_amount !== undefined) { fields.push('final_amount = ?'); values.push(toPaise(data.final_amount)); }
    if (data.paid_amount !== undefined) { fields.push('paid_amount = ?'); values.push(toPaise(data.paid_amount)); }
    if (data.remaining_amount !== undefined) { fields.push('remaining_amount = ?'); values.push(toPaise(data.remaining_amount)); }
    if (data.payment_type) { fields.push('payment_type = ?'); values.push(data.payment_type); }
    if (data.payment_status) { fields.push('payment_status = ?'); values.push(data.payment_status); }

    if (fields.length) {
      execRun(
        `UPDATE bills SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, id]
      );
    }

    if (data.items) {
      deleteByBillId(id);
      createMany(id, data.items);
    }

    const newCustId = data.customer_id || oldBill.customer_id;
    const newRem =
      data.remaining_amount !== undefined
        ? Number(data.remaining_amount)
        : Number(oldBill.remaining_amount) || 0;
    const billNum = data.bill_number || oldBill.bill_number;

    if (originatedOwnCredit && newRem > 0) {
      bookCreditRow({
        customerId: newCustId,
        billId: id,
        amount: newRem,
        note: `Bill #${billNum} updated`,
      });
    }

    return findById(id);
  });
}

/**
 * Delete a bill and its items.
 *
 * Children go before the parent: with foreign keys enforced, deleting a bill that
 * still has bill_items violates the constraint and the whole delete rolls back.
 */
function remove(id) {
  const oldBill = findById(id);
  if (!oldBill) return false;

  const ownCredit = selfBookedCredit(id);

  return transaction(() => {
    if (ownCredit > 0) {
      execRun(`UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?`, [
        ownCredit,
        oldBill.customer_id,
      ]);
    }

    // Rows this bill originated are gone with it. Rows a transaction originated
    // stay — that debt is still owed, because the transaction still exists — and
    // are simply unlinked.
    deleteSelfBookedLedgerRows(id);
    execRun(`UPDATE credit_transactions SET bill_id = NULL WHERE bill_id = ?`, [id]);

    // Return the source transactions to unbilled so the day can be re-billed.
    execRun(`UPDATE transactions SET bill_id = NULL WHERE bill_id = ?`, [id]);

    execRun(`DELETE FROM bill_items WHERE bill_id = ?`, [id]);
    execRun(`DELETE FROM bills WHERE id = ?`, [id]);

    return true;
  });
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
  selfBookedCredit,
};
