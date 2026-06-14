const { getDb } = require('../database/db');
const backupService = require('./backupService');

// Helper to map SQLite rows to objects
function rowToObj(columns, row) {
  const obj = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj;
}

function execSelect(sql, params = []) {
  const db = getDb();
  const result = db.exec(sql, params);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((row) => rowToObj(columns, row));
}

async function getDashboardSummary() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  // ─── Today's Summary (SQL aggregations) ──────────────────────────────────────
  // Today's total sales, bills, paid, credit, and commission
  const todayBillsRes = execSelect(
    `SELECT 
      COALESCE(SUM(final_amount), 0.0) AS total_sales,
      COUNT(id) AS total_bills,
      COALESCE(SUM(paid_amount), 0.0) AS total_paid,
      COALESCE(SUM(remaining_amount), 0.0) AS total_credit,
      COALESCE(SUM(commission_amount), 0.0) AS total_commission
     FROM bills 
     WHERE date = ?`,
    [todayStr]
  );
  
  const todayBills = todayBillsRes[0] || {
    total_sales: 0.0,
    total_bills: 0,
    total_paid: 0.0,
    total_credit: 0.0,
    total_commission: 0.0,
  };

  // Today's credit recovery (payments collected)
  const todayRecoveryRes = execSelect(
    `SELECT COALESCE(SUM(amount), 0.0) AS total_recovery 
     FROM credit_transactions 
     WHERE transaction_type = 'PAYMENT_RECEIVED' 
       AND date(created_at) = ?`,
    [todayStr]
  );
  const totalRecovery = todayRecoveryRes[0]?.total_recovery || 0.0;

  const todaySummary = {
    totalSales: Number(todayBills.total_sales.toFixed(2)),
    totalBills: Number(todayBills.total_bills),
    paidAmount: Number(todayBills.total_paid.toFixed(2)),
    creditSales: Number(todayBills.total_credit.toFixed(2)),
    recoveryAmount: Number(totalRecovery.toFixed(2)),
    commission: Number(todayBills.total_commission.toFixed(2)),
    date: todayStr,
  };

  // ─── Overall Summary (SQL aggregations) ─────────────────────────────────────
  const totalCustomersRes = execSelect('SELECT COUNT(*) AS count FROM customers');
  const totalVegetablesRes = execSelect('SELECT COUNT(*) AS count FROM vegetables');
  const totalUdharRes = execSelect('SELECT COALESCE(SUM(credit_balance), 0.0) AS total_udhar FROM customers');
  const totalBillsRes = execSelect('SELECT COUNT(*) AS count FROM bills');

  const overallSummary = {
    totalCustomers: Number(totalCustomersRes[0]?.count || 0),
    totalVegetables: Number(totalVegetablesRes[0]?.count || 0),
    totalUdhar: Number((totalUdharRes[0]?.total_udhar || 0.0).toFixed(2)),
    totalBills: Number(totalBillsRes[0]?.count || 0),
  };

  // ─── Recent Bills (limit 5) ──────────────────────────────────────────────────
  const recentBills = execSelect(
    `SELECT b.*, c.name AS customer_name, c.mobile AS customer_mobile
     FROM bills b
     JOIN customers c ON b.customer_id = c.id
     ORDER BY b.date DESC, b.id DESC
     LIMIT 5`
  );

  // ─── Pending Credit Customers (limit 5, sorted descending by balance) ─────────
  const pendingCustomers = execSelect(
    `SELECT id, name, mobile, credit_balance
     FROM customers
     WHERE credit_balance > 0
     ORDER BY credit_balance DESC, name ASC
     LIMIT 5`
  );

  // ─── Backup and Connection Status ───────────────────────────────────────────
  let lastBackup = null;
  try {
    lastBackup = await backupService.getLatestBackupStatus();
  } catch (err) {
    /* ignore status errors */
  }

  let internetOnline = false;
  try {
    internetOnline = await backupService.checkInternetStatus();
  } catch (err) {
    /* ignore connectivity status errors */
  }

  return {
    todaySummary,
    overallSummary,
    recentBills,
    pendingCustomers,
    lastBackup,
    internetOnline,
  };
}

module.exports = {
  getDashboardSummary,
};
