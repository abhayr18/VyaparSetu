/**
 * Transaction Service
 * Business logic, validation, calculations, credit balance updates,
 * and bill consolidation for customer vegetable transactions.
 */

const transactionModel = require('../models/transactionModel');
const customerModel = require('../models/customerModel');
const vegetableModel = require('../models/vegetableModel');
const billModel = require('../models/billModel');
const { calculateTransactionTotals } = require('../utils/calculation');
const { getDb, saveDb } = require('../database/db');

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
    commission_rate = 0.08,
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

  // 5. Calculate Base, Commission (8%), Final Amount
  const totals = calculateTransactionTotals(numWeight, numRate, commission_rate);

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
    const transaction = transactionModel.create({
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

    // Automatically update customer credit balance if remaining_amount > 0
    if (finalRemaining > 0) {
      const db = getDb();
      db.run(`UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?`, [finalRemaining, customer_id]);
      
      const balanceRow = db.exec(`SELECT credit_balance FROM customers WHERE id = ${customer_id}`);
      const balanceAfter = balanceRow[0]?.values[0][0] || 0;

      db.run(
        `INSERT INTO credit_transactions (customer_id, transaction_type, amount, payment_mode, note, balance_after_transaction)
         VALUES (?, 'CREDIT_ADDED', ?, ?, ?, ?)`,
        [customer_id, finalRemaining, payment_mode || 'Credit', `Udhar added: ${vegName} (${numWeight}kg)`, balanceAfter]
      );
      saveDb();
    }

    return { success: true, data: transaction };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Consolidates a customer's daily transactions into a formal Bill.
 */
async function generateBillFromTransactions({ customerId, date }) {
  const targetDate = date ? date.trim() : getLocalDateString();
  const transactions = transactionModel.findByCustomerAndDate(customerId, targetDate);

  if (!transactions || transactions.length === 0) {
    return { success: false, error: 'No transactions found for this customer on the selected date' };
  }

  const customer = customerModel.findById(customerId);
  if (!customer) return { success: false, error: 'Customer not found' };

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

  const billNumber = `BILL-${targetDate.replace(/-/g, '')}-${String(customerId).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;

  try {
    const createdBill = billModel.create({
      bill_number: billNumber,
      customer_id: Number(customerId),
      customer_name: customer.name,
      customer_mobile: customer.mobile,
      date: targetDate,
      subtotal: Math.round(subtotal * 100) / 100,
      discount_type: 'fixed',
      discount_value: 0,
      discount_amount: 0,
      commission_rate: 8.0,
      commission_amount: Math.round(commissionAmount * 100) / 100,
      hamali_amount: 0,
      transport_amount: 0,
      final_amount: Math.round(finalAmount * 100) / 100,
      paid_amount: Math.round(paidAmount * 100) / 100,
      remaining_amount: Math.round(remainingAmount * 100) / 100,
      payment_type: paymentStatus === 'Credit' ? 'Credit' : 'Cash',
      payment_status: paymentStatus,
      items
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
 */
async function deleteTransaction(id) {
  try {
    const existing = transactionModel.findById(id);
    if (!existing) return { success: false, error: 'Transaction not found' };

    transactionModel.deleteById(id);
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
