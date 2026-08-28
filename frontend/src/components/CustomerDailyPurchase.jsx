/**
 * CustomerDailyPurchase Component (MODULE B)
 * Customer Daily Purchase Summary & Transaction History View
 * 
 * Features:
 * - Customer & Date Filter (Today, Yesterday, Specific Date, Date Range)
 * - Daily Summary KPI Cards (Total Purchase, Count, Total Weight, Commission, Final Amount)
 * - "Generate Today's Bill" action button -> Consolidation + WhatsApp Send + Print + PDF
 * - Itemized Transaction History Table with Delete confirmation
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import CustomerAutocomplete from './CustomerAutocomplete';
import DeleteConfirmModal from './DeleteConfirmModal';
import TodayBillModal from './TodayBillModal';
import EditTransactionModal from './EditTransactionModal';
import BilledBadge from './BilledBadge';
import { formatCommissionPercent, parseStoredPercent } from '../utils/money';
import { isBilled } from '../utils/billDisplay';

export default function CustomerDailyPurchase({
  customers = [],
  vegetables = [],
  activeCustomerId,
  onSelectCustomer,
  dateFilterType = 'today',
  onChangeDateFilterType,
  selectedDate,
  onChangeSelectedDate,
  startDate,
  onChangeStartDate,
  endDate,
  onChangeEndDate,
  billPeriod,
  dailyData = { summary: {}, transactions: [] },
  historyLoading = false,
  onDeleteTransaction,
  onUpdateTransaction,
  onGenerateBill,
  onGenerateStatement,
  commissionRate,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [deletingId, setDeletingId] = useState(null);
  const [editingTx, setEditingTx] = useState(null);
  const [generatedBill, setGeneratedBill] = useState(null);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [billGenerating, setBillGenerating] = useState(false);

  const activeCustomer = customers.find((c) => c.id === activeCustomerId);
  const summary = dailyData.summary || {};
  const transactions = dailyData.transactions || [];

  /**
   * Open the bill an entry was consolidated into, in the archive that owns it.
   */
  function openBillInArchive(billId) {
    if (!billId) return;
    navigate(`/billing?bill=${encodeURIComponent(billId)}`);
  }

  async function handleConfirmDelete() {
    if (!deletingId) return;
    await onDeleteTransaction(deletingId);
    setDeletingId(null);
  }

  async function handleGenerateBillClick() {
    if (!activeCustomerId) return;
    setBillGenerating(true);
    try {
      let res;
      if (dateFilterType === 'range' && onGenerateStatement) {
        // Range reports are generated on-the-fly without saving to DB/Invoices
        res = await onGenerateStatement(activeCustomerId, { startDate, endDate });
      } else {
        // Single day bills are consolidated and saved as invoices in DB
        res = await onGenerateBill(activeCustomerId, billPeriod || { date: selectedDate });
      }

      if (res?.success && res.data) {
        setGeneratedBill(res.data);
        setIsBillModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to generate bill or statement:', err);
    } finally {
      setBillGenerating(false);
    }
  }

  return (
    <div className="card" style={{ padding: '1.25rem', marginTop: '1.25rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
            📊 {t('transactions.historyTitle')}
          </h3>
          <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
            {t('transactions.subtitle')}
          </p>
        </div>

        {/* Date Filter Selector Buttons */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn ${dateFilterType === 'today' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onChangeDateFilterType('today')}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}
          >
            {t('transactions.dateFilter.today')}
          </button>

          <button
            type="button"
            className={`btn ${dateFilterType === 'yesterday' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onChangeDateFilterType('yesterday')}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}
          >
            {t('transactions.dateFilter.yesterday')}
          </button>

          <button
            type="button"
            className={`btn ${dateFilterType === 'specific' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onChangeDateFilterType('specific')}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}
          >
            {t('transactions.dateFilter.specificDate')}
          </button>

          <button
            type="button"
            className={`btn ${dateFilterType === 'range' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onChangeDateFilterType('range')}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}
          >
            {t('transactions.dateFilter.dateRange')}
          </button>
        </div>
      </div>

      {/* Customer & Date Selector Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem', padding: '1rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
        <div>
          <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
            {t('transactions.selectCustomer')}
          </label>
          <CustomerAutocomplete
            customers={customers}
            selectedCustomer={activeCustomer}
            onSelectCustomer={(c) => onSelectCustomer(c ? c.id : null)}
            placeholder={t('transactions.selectCustomer')}
          />
        </div>

        {dateFilterType === 'specific' && (
          <div>
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              {t('transactions.dateFilter.specificDate')}
            </label>
            <input
              type="date"
              className="input-field"
              value={selectedDate}
              onChange={(e) => onChangeSelectedDate(e.target.value)}
              style={{ fontSize: '0.95rem', padding: '0.65rem 0.85rem' }}
            />
          </div>
        )}

        {dateFilterType === 'range' && (
          <>
            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                {t('billing.dateFilter.startDate')}
              </label>
              <input
                type="date"
                className="input-field"
                value={startDate}
                onChange={(e) => onChangeStartDate(e.target.value)}
                style={{ fontSize: '0.95rem', padding: '0.65rem 0.85rem' }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                {t('billing.dateFilter.endDate')}
              </label>
              <input
                type="date"
                className="input-field"
                value={endDate}
                onChange={(e) => onChangeEndDate(e.target.value)}
                style={{ fontSize: '0.95rem', padding: '0.65rem 0.85rem' }}
              />
            </div>
          </>
        )}
      </div>

      {!activeCustomerId ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b', background: '#f8fafc', borderRadius: '6px' }}>
          <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
            👈 {t('transactions.promptSelectCustomer')}
          </p>
        </div>
      ) : (
        <>
          {/* Summary KPI Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="card" style={{ padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>{t('transactions.totalTransactions')}</span>
              <strong style={{ fontSize: '1.2rem', color: '#0f172a' }}>{summary.total_transactions || 0}</strong>
            </div>

            <div className="card" style={{ padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>{t('transactions.totalWeight')}</span>
              <strong style={{ fontSize: '1.2rem', color: '#0f172a' }}>{summary.total_weight || 0} kg</strong>
            </div>

            <div className="card" style={{ padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>{t('transactions.totalBaseAmount')}</span>
              <strong style={{ fontSize: '1.2rem', color: '#0f172a' }}>₹{Number(summary.total_base_amount || 0).toFixed(2)}</strong>
            </div>

            <div className="card" style={{ padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>{t('transactions.totalCommission')}</span>
              <strong style={{ fontSize: '1.2rem', color: '#0284c7' }}>₹{Number(summary.total_commission || 0).toFixed(2)}</strong>
            </div>

            <div className="card" style={{ padding: '0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <span style={{ fontSize: '0.75rem', color: '#15803d', display: 'block' }}>{t('transactions.totalFinalAmount')}</span>
              <strong style={{ fontSize: '1.2rem', color: '#16a34a' }}>₹{Number(summary.total_final_amount || 0).toFixed(2)}</strong>
            </div>

            {/* Generate Bill CTA */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGenerateBillClick}
                disabled={billGenerating || transactions.length === 0}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: '60px',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #16a34a, #15803d)',
                  color: 'white',
                  borderRadius: '6px',
                  boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.3)'
                }}
              >
                {billGenerating
                  ? t('common.loading')
                  : `📄 ${dateFilterType === 'range' ? t('transactions.generatePeriodBill') : t('transactions.generateBill')}`}
              </button>
            </div>
          </div>

          {/* Transactions History Table */}
          {historyLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
              {t('common.loading')}
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', background: '#f8fafc', borderRadius: '6px' }}>
              {t('transactions.noTransactions')}
            </div>
          ) : (
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', textAlign: 'left', fontSize: '0.85rem', color: '#475569' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Tariqh / Date</th>
                    <th style={{ padding: '0.75rem 1rem' }}>{t('billing.vegetable')}</th>
                    <th style={{ padding: '0.75rem 1rem' }}>{t('transactions.weight')}</th>
                    <th style={{ padding: '0.75rem 1rem' }}>{t('transactions.rate')}</th>
                    <th style={{ padding: '0.75rem 1rem' }}>{t('transactions.baseAmount')}</th>
                    <th style={{ padding: '0.75rem 1rem' }}>{t('transactions.commission')}</th>
                    <th style={{ padding: '0.75rem 1rem' }}>{t('transactions.finalAmount')}</th>
                    <th style={{ padding: '0.75rem 1rem' }}>{t('billing.paymentStatus')}</th>
                    <th style={{ padding: '0.75rem 1rem' }}>{t('transactions.billStatus')}</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const billed = isBilled(tx.bill_id);
                    return (
                    <tr key={tx.id} id={`history-row-${tx.id}`} style={{ borderBottom: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
                      <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                        {tx.transaction_date}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                        {tx.vegetable_name_snapshot}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                        {tx.weight} {tx.unit || 'kg'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                        ₹{tx.rate}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                        ₹{Number(tx.base_amount).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#0284c7' }}>
                        ₹{Number(tx.commission_amount).toFixed(2)}
                        {parseStoredPercent(tx.commission_rate) === null ? null : (
                          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
                            {' '}({formatCommissionPercent(tx.commission_rate)})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#16a34a' }}>
                        ₹{Number(tx.final_amount).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: tx.payment_type === 'Paid' ? '#dcfce7' : tx.payment_type === 'Partial' ? '#fef9c3' : '#fee2e2',
                            color: tx.payment_type === 'Paid' ? '#15803d' : tx.payment_type === 'Partial' ? '#a16207' : '#b91c1c'
                          }}
                        >
                          {tx.payment_type || 'Credit'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <BilledBadge
                          billId={tx.bill_id}
                          billNumber={tx.bill_number}
                          id={`history-bill-${tx.id}`}
                          onOpenBill={openBillInArchive}
                        />
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => setEditingTx(tx)}
                            disabled={billed}
                            id={`history-edit-${tx.id}`}
                            title={billed ? 'This transaction is part of a generated bill. Delete the bill first to edit.' : t('common.edit')}
                            style={{
                              padding: '3px 8px',
                              fontSize: '0.78rem',
                              color: billed ? '#94a3b8' : '#0284c7',
                              borderColor: billed ? '#e2e8f0' : '#bae6fd',
                              cursor: billed ? 'not-allowed' : 'pointer'
                            }}
                          >
                            ✏️ {t('common.edit')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => setDeletingId(tx.id)}
                            disabled={billed}
                            id={`history-delete-${tx.id}`}
                            title={billed ? t('transactions.deleteBlockedBilled') : t('common.delete')}
                            style={{
                              padding: '3px 8px',
                              fontSize: '0.78rem',
                              color: billed ? '#94a3b8' : '#ef4444',
                              borderColor: billed ? '#e2e8f0' : '#fca5a5',
                              cursor: billed ? 'not-allowed' : 'pointer'
                            }}
                          >
                            🗑️ {t('common.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Edit Transaction Modal */}
      {editingTx && (
        <EditTransactionModal
          isOpen={Boolean(editingTx)}
          onClose={() => setEditingTx(null)}
          transaction={editingTx}
          customers={customers}
          vegetables={vegetables}
          onUpdateTransaction={onUpdateTransaction}
          commissionRate={commissionRate}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <DeleteConfirmModal
          isOpen={!!deletingId}
          onClose={() => setDeletingId(null)}
          onConfirm={handleConfirmDelete}
          title={t('transactions.deleteConfirmTitle')}
          message={t('transactions.deleteConfirmMsg')}
        />
      )}

      {/* Today Bill Modal View (Print, WhatsApp, PDF) */}
      {isBillModalOpen && (
        <TodayBillModal
          isOpen={isBillModalOpen}
          onClose={() => setIsBillModalOpen(false)}
          bill={generatedBill}
        />
      )}
    </div>
  );
}
