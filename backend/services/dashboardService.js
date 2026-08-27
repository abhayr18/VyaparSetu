const { execSelect } = require('../database/db');
const { toRupees, rowToRupees } = require('../utils/money');
const backupService = require('./backupService');
const creditModel = require('../models/creditModel');
const logger = require('../utils/logger');
const { localDateSql, todayLocal } = require('../utils/businessDay');

async function getDashboardSummary() {
  const todayStr = todayLocal();

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

  // Today's credit recovery (payments collected). PAYMENT_RECEIVED only, matching
  // creditModel.getSummary's todayRecovered — this sits beside the day's cash and UPI
  // figures, so it means money that came in, not any row that reduced a balance.
  const todayRecoveryRes = execSelect(
    `SELECT COALESCE(SUM(amount), 0.0) AS total_recovery
     FROM credit_transactions
     WHERE transaction_type = 'PAYMENT_RECEIVED'
       AND ${localDateSql('created_at')} = ?`,
    [todayStr]
  );
  const totalRecovery = todayRecoveryRes[0]?.total_recovery || 0.0;

  const todaySummary = {
    totalSales: Number(toRupees(todayBills.total_sales).toFixed(2)),
    totalBills: Number(todayBills.total_bills),
    paidAmount: Number(toRupees(todayBills.total_paid).toFixed(2)),
    creditSales: Number(toRupees(todayBills.total_credit).toFixed(2)),
    recoveryAmount: Number(toRupees(totalRecovery).toFixed(2)),
    commission: Number(toRupees(todayBills.total_commission).toFixed(2)),
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
    totalUdhar: Number(toRupees(totalUdharRes[0]?.total_udhar || 0).toFixed(2)),
    totalBills: Number(totalBillsRes[0]?.count || 0),
  };

  // ─── Recent Bills (limit 5) ──────────────────────────────────────────────────
  const recentBills = execSelect(
    `SELECT b.*, c.name AS customer_name, c.mobile AS customer_mobile
     FROM bills b
     JOIN customers c ON b.customer_id = c.id
     ORDER BY b.date DESC, b.id DESC
     LIMIT 5`
  ).map((b) => rowToRupees(b, 'bills'));

  // ─── Pending Credit Customers (limit 5, sorted descending by balance) ─────────
  const pendingCustomers = execSelect(
    `SELECT id, name, mobile, credit_balance
     FROM customers
     WHERE credit_balance > 0
     ORDER BY credit_balance DESC, name ASC
     LIMIT 5`
  ).map((c) => rowToRupees(c, 'customers'));

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

  // ─── Ledger Reconciliation ──────────────────────────────────────────────────
  // Every customer's stored balance must equal the sum of their passbook. If it
  // does not, the vendor is holding two different answers to "how much is owed"
  // and needs to know before quoting either one — silence here is how a rounding
  // bug turns into a disputed settlement weeks later.
  const ledgerCheck = { ok: true, mismatchCount: 0, mismatches: [] };
  try {
    const mismatches = creditModel.findBalanceMismatches();
    ledgerCheck.ok = mismatches.length === 0;
    ledgerCheck.mismatchCount = mismatches.length;
    ledgerCheck.mismatches = mismatches.slice(0, 5); // report the full count, show a few
    if (mismatches.length > 0) {
      logger.error(
        `Ledger reconciliation failed for ${mismatches.length} customer(s): ` +
          mismatches
            .slice(0, 5)
            .map((m) => `#${m.id} ${m.name} stored ${m.stored_balance} vs ledger ${m.ledger_balance}`)
            .join('; ')
      );
    }
  } catch (err) {
    // A check that cannot run must not read as a clean bill of health.
    ledgerCheck.ok = false;
    ledgerCheck.error = 'Reconciliation check could not run';
    logger.error(`Ledger reconciliation check failed to run: ${err.message}`);
  }

  return {
    todaySummary,
    overallSummary,
    recentBills,
    pendingCustomers,
    lastBackup,
    internetOnline,
    ledgerCheck,
  };
}

module.exports = {
  getDashboardSummary,
};
