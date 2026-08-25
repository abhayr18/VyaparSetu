/**
 * Transaction Service
 * Business logic, validation, calculations, credit balance updates,
 * and bill consolidation for customer vegetable transactions.
 */

const transactionModel = require('../models/transactionModel');
const customerModel = require('../models/customerModel');
const vegetableModel = require('../models/vegetableModel');
const billModel = require('../models/billModel');
const settingsModel = require('../models/settingsModel');
const {
  calculateTransactionTotals,
  normalizeCommissionPercent,
  DEFAULT_COMMISSION_PERCENT,
} = require('../utils/calculation');
const { execRun, execGet, transaction } = require('../database/db');

/**
 * Returns local YYYY-MM-DD date string.
 */
function getLocalDateString(dateObj = new Date()) {
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The shop's commission rate, as a percentage.
 *
 * Read from settings rather than taken from the request. The rate is a property of
 * the shop, not of one sale, and accepting it from the client meant a stale or
 * hand-edited payload could bill a customer at any rate at all — the frontend was
 * sending 0.08 while the schema default was 8, so the same sale was charged 8% or
 * 800% depending on which value arrived.
 */
function getShopCommissionPercent() {
  const stored = settingsModel.getSetting('commission_rate');
  if (stored === null || stored === undefined || stored === '') {
    return DEFAULT_COMMISSION_PERCENT;
  }
  return normalizeCommissionPercent(stored);
}

/**
 * Creates a new customer vegetable transaction and updates credit balance if unpaid.
 */
async function createTransaction(payload) {
  const {
    customer_id,
    vegetable_id,
    vegetable_name_snapshot,
    weight,
    rate,
    unit,
    payment_type = 'Credit', // 'Paid', 'Credit', 'Partial'
    payment_mode = 'Cash',  // 'Cash', 'UPI', 'Credit', 'Other'
    paid_amount,
    transaction_date
  } = payload || {};

  // 1. Validate Customer
  if (!customer_id) {
    return { success: false, error: 'Customer selection is required' };
  }
  const customer = customerModel.findById(customer_id);
  if (!customer) {
    return { success: false, error: 'Selected customer does not exist' };
  }

  // 2. Validate Vegetable
  if (!vegetable_id) {
    return { success: false, error: 'Vegetable selection is required' };
  }
  const vegetable = vegetableModel.findById(vegetable_id);
  if (!vegetable) {
    return { success: false, error: 'Selected vegetable does not exist' };
  }

  // 3. Validate Weight
  const numWeight = Number(weight);
  if (isNaN(numWeight) || numWeight <= 0) {
    return { success: false, error: 'Weight must be greater than 0' };
  }

  // 4. Validate Rate
  const numRate = Number(rate);
  if (isNaN(numRate) || numRate < 0) {
    return { success: false, error: 'Rate must be 0 or greater' };
  }

  // 5. Calculate Base, Commission, Final Amount at the shop's configured rate
  const totals = calculateTransactionTotals(numWeight, numRate, getShopCommissionPercent());

  // 6. Payment Amount Calculations
  let finalPaid = 0;
  let finalRemaining = totals.finalAmount;

  if (payment_type === 'Paid') {
    finalPaid = totals.finalAmount;
    finalRemaining = 0;
  } else if (payment_type === 'Partial') {
    const rawPaid = Number(paid_amount) || 0;
    finalPaid = Math.min(totals.finalAmount, Math.max(0, Math.round(rawPaid * 100) / 100));
    finalRemaining = Math.round((totals.finalAmount - finalPaid) * 100) / 100;
  } else {
    // Credit
    finalPaid = 0;
    finalRemaining = totals.finalAmount;
  }

  // Snapshot name from payload or DB
  const vegName = vegetable_name_snapshot && vegetable_name_snapshot.trim()
    ? vegetable_name_snapshot.trim()
    : vegetable.name;

  // Set local date if not specified
  const tDate = transaction_date && transaction_date.trim()
    ? transaction_date.trim()
    : getLocalDateString();

  try {
    // The sale, the customer's balance and the ledger row are one fact recorded in
    // three places. Written separately, a failure between them left the balance
    // and the passbook disagreeing with no way to tell which was right.
    const created = transaction(() => {
      const newTransaction = transactionModel.create({
        customer_id: Number(customer_id),
        vegetable_id: Number(vegetable_id),
        vegetable_name_snapshot: vegName,
        weight: numWeight,
        unit: unit || vegetable.unit || 'kg',
        rate: numRate,
        base_amount: totals.baseAmount,
        commission_rate: totals.commissionRate,
        commission_amount: totals.commissionAmount,
        final_amount: totals.finalAmount,
        payment_type,
        payment_mode: payment_type === 'Credit' ? 'Credit' : payment_mode,
        paid_amount: finalPaid,
        remaining_amount: finalRemaining,
        transaction_date: tDate
      });

      if (finalRemaining > 0) {
        execRun(`UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?`, [
          finalRemaining,
          customer_id,
        ]);

        const balanceRow = execGet(`SELECT credit_balance FROM customers WHERE id = ?`, [
          customer_id,
        ]);
        const balanceAfter = balanceRow?.credit_balance || 0;

        // transaction_id ties this ledger row to the sale, so deleting the sale
        // can reverse exactly the debt it booked.
        execRun(
          `INSERT INTO credit_transactions
             (customer_id, transaction_id, transaction_type, amount, payment_mode, note, balance_after_transaction)
           VALUES (?, ?, 'CREDIT_ADDED', ?, ?, ?, ?)`,
          [
            customer_id,
            newTransaction.id,
            finalRemaining,
            payment_mode || 'Credit',
            `Udhar added: ${vegName} (${numWeight}kg)`,
            balanceAfter,
          ]
        );
      }

      return newTransaction;
    });

    return { success: true, data: created };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Consolidates a customer's daily transactions into a formal Bill.
 *
 * Only unbilled transactions are consolidated, and they are claimed by the bill as
 * part of the same database transaction that creates it. Running this twice for the
 * same day therefore finds nothing the second time instead of billing the customer
 * again.
 *
 * The bill does not book credit: `createTransaction` already did, when each sale
 * was entered. The existing ledger rows are relabelled with the new bill's id so
 * the passbook still points at the bill, and the customer's balance is untouched.
 */
async function generateBillFromTransactions({ customerId, date }) {
  const targetDate = date ? date.trim() : getLocalDateString();

  const customer = customerModel.findById(customerId);
  if (!customer) return { success: false, error: 'Customer not found' };

  const transactions = transactionModel.findUnbilledByCustomerAndDate(customerId, targetDate);

  if (!transactions || transactions.length === 0) {
    const alreadyBilled = transactionModel.findByCustomerAndDate(customerId, targetDate);
    if (alreadyBilled && alreadyBilled.length > 0) {
      return {
        success: false,
        error: "This day's transactions have already been billed for this customer",
      };
    }
    return {
      success: false,
      error: 'No transactions found for this customer on the selected date',
    };
  }

  // Calculate totals across today's transactions
  const subtotal = transactions.reduce((acc, t) => acc + Number(t.base_amount || 0), 0);
  const commissionAmount = transactions.reduce((acc, t) => acc + Number(t.commission_amount || 0), 0);
  const finalAmount = transactions.reduce((acc, t) => acc + Number(t.final_amount || 0), 0);
  const paidAmount = transactions.reduce((acc, t) => acc + Number(t.paid_amount || 0), 0);
  const remainingAmount = transactions.reduce((acc, t) => acc + Number(t.remaining_amount || 0), 0);

  let paymentStatus = 'Credit';
  if (remainingAmount <= 0) {
    paymentStatus = 'Paid';
  } else if (paidAmount > 0) {
    paymentStatus = 'Partial';
  }

  const items = transactions.map((t) => ({
    vegetable_id: t.vegetable_id,
    vegetable_name: t.vegetable_name_snapshot,
    quantity: t.weight,
    rate: t.rate,
    total: t.base_amount,
    vegetable_unit: t.unit || 'kg'
  }));

  // Every transaction on a day is charged the same shop rate, so the bill carries
  // that rate rather than re-deriving one from summed amounts.
  const billCommissionRate = normalizeCommissionPercent(
    transactions[0].commission_rate ?? getShopCommissionPercent()
  );

  const billNumber = `BILL-${targetDate.replace(/-/g, '')}-${String(customerId).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;
  const transactionIds = transactions.map((t) => t.id);

  try {
    const createdBill = transaction(() => {
      const bill = billModel.create(
        {
          bill_number: billNumber,
          customer_id: Number(customerId),
          customer_name: customer.name,
          customer_mobile: customer.mobile,
          date: targetDate,
          subtotal: Math.round(subtotal * 100) / 100,
          discount_type: 'fixed',
          discount_value: 0,
          discount_amount: 0,
          commission_rate: billCommissionRate,
          commission_amount: Math.round(commissionAmount * 100) / 100,
          hamali_amount: 0,
          transport_amount: 0,
          final_amount: Math.round(finalAmount * 100) / 100,
          paid_amount: Math.round(paidAmount * 100) / 100,
          remaining_amount: Math.round(remainingAmount * 100) / 100,
          payment_type: paymentStatus === 'Credit' ? 'Credit' : 'Cash',
          payment_status: paymentStatus,
          items
        },
        // The transactions already booked this debt.
        { bookCredit: false }
      );

      const claimed = transactionModel.markAsBilled(transactionIds, bill.id);
      if (claimed !== transactionIds.length) {
        throw new Error('Transactions were billed concurrently — no bill was created');
      }

      // Point the existing ledger rows at this bill so the passbook and the bill
      // agree, without adding rows that would inflate the balance.
      const placeholders = transactionIds.map(() => '?').join(', ');
      execRun(
        `UPDATE credit_transactions SET bill_id = ?
         WHERE transaction_id IN (${placeholders}) AND transaction_type = 'CREDIT_ADDED'`,
        [bill.id, ...transactionIds]
      );

      return billModel.findById(bill.id);
    });

    return { success: true, data: createdBill };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get single transaction by ID.
 */
async function getTransactionById(id) {
  try {
    const transaction = transactionModel.findById(id);
    if (!transaction) return { success: false, error: 'Transaction not found' };
    return { success: true, data: transaction };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get all transactions for a specific customer with optional date or range filters.
 */
async function getCustomerTransactions(customerId, query = {}) {
  try {
    const customer = customerModel.findById(customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    const { date, startDate, endDate } = query;
    let list = [];

    if (date) {
      list = transactionModel.findByCustomerAndDate(customerId, date);
    } else if (startDate && endDate) {
      list = transactionModel.findByCustomerAndDateRange(customerId, startDate, endDate);
    } else {
      list = transactionModel.findAll({ customerId });
    }

    return { success: true, data: list };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get daily purchase summary & transactions list for a customer on a specific date.
 */
async function getCustomerDailyPurchase(customerId, date) {
  try {
    const customer = customerModel.findById(customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    const targetDate = date ? date.trim() : getLocalDateString();
    const summary = transactionModel.getDailyCustomerSummary(customerId, targetDate);
    const transactions = transactionModel.findByCustomerAndDate(customerId, targetDate);

    return {
      success: true,
      data: {
        customer,
        date: targetDate,
        summary,
        transactions
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get transactions list across all customers or filtered by parameters.
 */
async function getAllTransactions(query = {}) {
  try {
    const list = transactionModel.findAll(query);
    return { success: true, data: list };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Delete a transaction by ID after confirmation.
 *
 * Deleting an udhar sale must also cancel the debt it created. Previously it
 * removed the row and left the balance standing, so the customer kept owing money
 * for a sale the vendor had already decided never happened — and the passbook no
 * longer replayed to the balance.
 */
async function deleteTransaction(id) {
  try {
    const existing = transactionModel.findById(id);
    if (!existing) return { success: false, error: 'Transaction not found' };

    // A transaction inside a bill cannot be deleted on its own: the bill's totals
    // and its line items would no longer match the sales behind them. Delete the
    // bill first, which releases its transactions.
    if (existing.bill_id) {
      return {
        success: false,
        error:
          'This transaction is part of a generated bill. Delete the bill first, then delete the transaction.',
      };
    }

    transaction(() => {
      // Reverse exactly what this sale booked, read from the ledger rather than
      // recomputed, so a later change to the pricing rules cannot make the
      // reversal disagree with the original charge.
      const bookedRow = execGet(
        `SELECT COALESCE(SUM(amount), 0) AS booked FROM credit_transactions
         WHERE transaction_id = ? AND transaction_type = 'CREDIT_ADDED'`,
        [id]
      );
      const booked = Number(bookedRow?.booked || 0);

      if (booked > 0) {
        execRun(`UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?`, [
          booked,
          existing.customer_id,
        ]);
      }

      // The ledger rows go with the sale. Keeping a reversal entry would be the
      // other reasonable choice, but the vendor's passbook is short and read by
      // hand — a cancelled sale is clearer absent than present twice.
      execRun(`DELETE FROM credit_transactions WHERE transaction_id = ?`, [id]);

      transactionModel.deleteById(id);
    });

    return { success: true, message: 'Transaction deleted successfully' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  createTransaction,
  generateBillFromTransactions,
  getTransactionById,
  getCustomerTransactions,
  getCustomerDailyPurchase,
  getAllTransactions,
  deleteTransaction,
  getLocalDateString
};
