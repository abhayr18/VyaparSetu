// backend/models/reportModel.js
const { getDb } = require('../database/db');

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

/** Get sales summary + bills list for date range */
function getSalesSummary(startDate, endDate) {
  // 1. Get aggregated summary statistics
  const summaryRes = execSelect(
    `SELECT 
      COUNT(*) as total_bills,
      COALESCE(SUM(subtotal), 0) as total_subtotal,
      COALESCE(SUM(discount_amount), 0) as total_discount,
      COALESCE(SUM(commission_amount), 0) as total_commission,
      COALESCE(SUM(final_amount), 0) as total_sales,
      COALESCE(SUM(paid_amount), 0) as total_paid,
      COALESCE(SUM(remaining_amount), 0) as total_remaining,
      COALESCE(SUM(CASE WHEN payment_type = 'Cash' THEN paid_amount ELSE 0 END), 0) as cash_collection,
      COALESCE(SUM(CASE WHEN payment_type = 'UPI' THEN paid_amount ELSE 0 END), 0) as upi_collection,
      COALESCE(SUM(CASE WHEN payment_status = 'Credit' THEN final_amount WHEN payment_status = 'Partial' THEN remaining_amount ELSE 0 END), 0) as credit_sales
     FROM bills
     WHERE date BETWEEN ? AND ?`,
    [startDate, endDate]
  );
  
  // 2. Get invoice rows
  const bills = execSelect(
    `SELECT b.*, c.name as customer_name, c.mobile as customer_mobile
     FROM bills b
     JOIN customers c ON b.customer_id = c.id
     WHERE b.date BETWEEN ? AND ?
     ORDER BY b.date DESC, b.id DESC`,
    [startDate, endDate]
  );

  return {
    summary: summaryRes[0] || {},
    bills
  };
}

/** Get purchase summary per customer */
function getCustomerPurchaseSummary(startDate, endDate) {
  return execSelect(
    `SELECT 
      c.id as customer_id,
      c.name as customer_name,
      c.mobile as customer_mobile,
      COUNT(b.id) as total_bills,
      COALESCE(SUM(b.final_amount), 0) as total_purchase,
      COALESCE(SUM(b.paid_amount), 0) as total_paid,
      c.credit_balance as total_pending_credit
     FROM customers c
     LEFT JOIN bills b ON c.id = b.customer_id AND b.date BETWEEN ? AND ?
     WHERE c.is_deleted = 0 OR (c.is_deleted = 1 AND b.id IS NOT NULL)
     GROUP BY c.id
     ORDER BY total_purchase DESC, c.name ASC`,
    [startDate, endDate]
  );
}

/** Get vegetable sales summary */
function getVegetableSalesSummary(startDate, endDate) {
  return execSelect(
    `SELECT 
      bi.vegetable_id,
      bi.vegetable_name,
      v.unit as vegetable_unit,
      COALESCE(SUM(bi.quantity), 0) as total_quantity,
      COALESCE(SUM(bi.total), 0) as total_sales,
      COUNT(DISTINCT bi.bill_id) as total_bills
     FROM bill_items bi
     JOIN bills b ON bi.bill_id = b.id
     LEFT JOIN vegetables v ON bi.vegetable_id = v.id
     WHERE b.date BETWEEN ? AND ?
     GROUP BY bi.vegetable_id, bi.vegetable_name
     ORDER BY total_sales DESC`,
    [startDate, endDate]
  );
}

/** Get credit balances, additions, and collections on a specific date */
function getCreditSummary(dateVal) {
  // Total outstanding balance across all customers (cumulative total)
  const outstandingRes = execSelect(`SELECT COALESCE(SUM(credit_balance), 0) AS total_outstanding FROM customers WHERE is_deleted = 0`);
  const totalOutstanding = outstandingRes[0]?.total_outstanding || 0.0;

  // Credit added on that date
  const addedRes = execSelect(
    `SELECT COALESCE(SUM(amount), 0) AS credit_added 
     FROM credit_transactions 
     WHERE transaction_type = 'CREDIT_ADDED' 
       AND date(created_at) = ?`,
    [dateVal]
  );
  const creditAdded = addedRes[0]?.credit_added || 0.0;

  // Recovery amount on that date
  const recoveredRes = execSelect(
    `SELECT COALESCE(SUM(amount), 0) AS credit_recovered 
     FROM credit_transactions 
     WHERE transaction_type = 'PAYMENT_RECEIVED' 
       AND date(created_at) = ?`,
    [dateVal]
  );
  const creditRecovered = recoveredRes[0]?.credit_recovered || 0.0;

  // Customer outstanding balance listing
  const customers = execSelect(
    `SELECT id, name, mobile, credit_balance 
     FROM customers 
     WHERE credit_balance > 0 AND is_deleted = 0
     ORDER BY credit_balance DESC, name ASC`
  );

  return {
    summary: {
      total_outstanding: totalOutstanding,
      credit_added: creditAdded,
      credit_recovered: creditRecovered
    },
    customers
  };
}

/** Get commission collection date-wise and bill-wise */
function getCommissionSummary(startDate, endDate) {
  // Aggregate sum
  const sumRes = execSelect(
    `SELECT COALESCE(SUM(commission_amount), 0) as total_commission
     FROM bills
     WHERE date BETWEEN ? AND ?`,
    [startDate, endDate]
  );
  const totalCommission = sumRes[0]?.total_commission || 0.0;

  // Date-wise commission
  const dateWise = execSelect(
    `SELECT 
      date,
      COUNT(*) as total_bills,
      SUM(commission_amount) as total_commission
     FROM bills
     WHERE date BETWEEN ? AND ?
     GROUP BY date
     ORDER BY date DESC`,
    [startDate, endDate]
  );

  // Bill-wise commission
  const billWise = execSelect(
    `SELECT 
      b.id as bill_id,
      b.bill_number,
      b.date,
      c.name as customer_name,
      b.final_amount,
      b.commission_amount
     FROM bills b
     JOIN customers c ON b.customer_id = c.id
     WHERE b.date BETWEEN ? AND ?
     ORDER BY b.date DESC, b.id DESC`,
    [startDate, endDate]
  );

  return {
    total_commission: totalCommission,
    dateWise,
    billWise
  };
}

module.exports = {
  getSalesSummary,
  getCustomerPurchaseSummary,
  getVegetableSalesSummary,
  getCreditSummary,
  getCommissionSummary
};
