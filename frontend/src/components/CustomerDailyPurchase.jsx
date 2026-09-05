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
import { billsApi } from '../services/apiService';
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
  const [generateError, setGenerateError] = useState('');

  const activeCustomer = customers.find((c) => c.id === activeCustomerId);
  const summary = dailyData.summary || {};
  const transactions = dailyData.transactions || [];

  const unbilledTransactions = transactions.filter((t) => !isBilled(t));
  const allBilled = transactions.length > 0 && unbilledTransactions.length === 0;
  const existingBillId = allBilled ? transactions.find((t) => t.bill_id)?.bill_id : null;

  /**
   * Open the bill in modal for immediate viewing, PDF download, and WhatsApp sharing.
   */
  async function openBillModal(billId) {
    if (!billId) return;
    setBillGenerating(true);
    setGenerateError('');
    try {
      const res = await billsApi.getById(billId);
      if (res?.success && res.data) {
        setGeneratedBill(res.data);
        setIsBillModalOpen(true);
      } else {
        openBillInArchive(billId);
      }
    } catch (err) {
      console.error('Failed to load bill modal:', err);
      openBillInArchive(billId);
    } finally {
      setBillGenerating(false);
    }
  }

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
    setGenerateError('');
    try {
      const period = billPeriod || (dateFilterType === 'range' ? { startDate, endDate } : { date: selectedDate });
      const res = await onGenerateBill(activeCustomerId, period);

      if (res?.success && res.data) {
        setGeneratedBill(res.data);
        setIsBillModalOpen(true);
      } else if (res?.error) {
        setGenerateError(res.error);
      }
    } catch (err) {
      console.error('Failed to generate bill:', err);
      setGenerateError(err.message || 'Failed to generate bill');
    } finally {
      setBillGenerating(false);
    }
  }

  /**
   * Generates a datewise itemized vegetable history report & statement
   * that can be viewed, downloaded as PDF, or shared directly via WhatsApp.
   */
  async function handleGenerateStatementClick() {
    if (!activeCustomerId) return;
    setBillGenerating(true);
    setGenerateError('');
    try {
      let rangePayload;
      if (dateFilterType === 'range') {
        rangePayload = { startDate, endDate };
      } else if (dateFilterType === 'specific') {
        rangePayload = { startDate: selectedDate, endDate: selectedDate };
      } else if (dateFilterType === 'yesterday') {
        const y = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        rangePayload = { startDate: y, endDate: y };
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        rangePayload = { startDate: todayStr, endDate: todayStr };
      }

      const res = await onGenerateStatement(activeCustomerId, rangePayload);
      if (res?.success && res.data) {
        setGeneratedBill(res.data);
        setIsBillModalOpen(true);
      } else if (res?.error) {
        setGenerateError(res.error);
      }
    } catch (err) {
      console.error('Failed to generate statement:', err);
      setGenerateError(err.message || 'Failed to generate statement');
    } finally {
      setBillGenerating(false);
    }
  }

  return (
    <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
            📊 {t('transactions.historyTitle')}
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>
            {t('transactions.subtitle')}
          </p>
        </div>

        {/* Action & Date Filter Selector Buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Quick Datewise Statement Button */}
          <button
            type="button"
            id="quick-datewise-statement-btn"
            onClick={handleGenerateStatementClick}
            disabled={!activeCustomerId || billGenerating || transactions.length === 0}
            title={t('transactions.viewStatementDesc') || 'तारीखवार खरेदी अहवाल पहा, डाऊनलोड करा व WhatsApp वर पाठवा'}
            style={{
              fontSize: '0.82rem',
              padding: '0.42rem 0.85rem',
              borderRadius: 'var(--border-radius-pill)',
              border: '1.5px solid #2563eb',
              background: (!activeCustomerId || billGenerating || transactions.length === 0) ? '#f1f5f9' : '#eff6ff',
              color: (!activeCustomerId || billGenerating || transactions.length === 0) ? '#94a3b8' : '#1d4ed8',
              fontWeight: 700,
              cursor: (!activeCustomerId || billGenerating || transactions.length === 0) ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
              boxShadow: (!activeCustomerId || billGenerating || transactions.length === 0) ? 'none' : '0 2px 6px rgba(37, 99, 235, 0.15)'
            }}
          >
            <span>📑</span>
            <span>{t('transactions.datewiseStatement') || 'तारीखवार खरेदी अहवाल'}</span>
          </button>

          <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: 'var(--border-radius-pill)' }}>
            <button
              type="button"
              className={`btn ${dateFilterType === 'today' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => onChangeDateFilterType('today')}
              style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', border: 'none' }}
            >
              {t('transactions.dateFilter.today')}
            </button>

            <button
              type="button"
              className={`btn ${dateFilterType === 'yesterday' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => onChangeDateFilterType('yesterday')}
              style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', border: 'none' }}
            >
              {t('transactions.dateFilter.yesterday')}
            </button>

            <button
              type="button"
              className={`btn ${dateFilterType === 'specific' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => onChangeDateFilterType('specific')}
              style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', border: 'none' }}
            >
              {t('transactions.dateFilter.specificDate')}
            </button>

            <button
              type="button"
              className={`btn ${dateFilterType === 'range' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => onChangeDateFilterType('range')}
              style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', border: 'none' }}
            >
              {t('transactions.dateFilter.dateRange')}
            </button>
          </div>
        </div>
      </div>

      {/* Customer & Date Selector Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem', padding: '1.2rem', background: 'var(--color-bg-light)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--color-border-copper)' }}>
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
            <label htmlFor="history-specific-date" className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              {t('transactions.dateFilter.specificDate')}
            </label>
            <input
              id="history-specific-date"
              name="selectedDate"
              type="date"
              title={t('transactions.dateFilter.specificDate')}
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
              <label htmlFor="history-start-date" className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                {t('billing.dateFilter.startDate')}
              </label>
              <input
                id="history-start-date"
                name="startDate"
                type="date"
                title={t('billing.dateFilter.startDate')}
                className="input-field"
                value={startDate}
                onChange={(e) => onChangeStartDate(e.target.value)}
                style={{ fontSize: '0.95rem', padding: '0.65rem 0.85rem' }}
              />
            </div>
            <div>
              <label htmlFor="history-end-date" className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                {t('billing.dateFilter.endDate')}
              </label>
              <input
                id="history-end-date"
                name="endDate"
                type="date"
                title={t('billing.dateFilter.endDate')}
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
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-muted)', background: 'var(--color-bg-light)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--color-border-copper)' }}>
          <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
            👈 {t('transactions.promptSelectCustomer')}
          </p>
        </div>
      ) : (
        <>
          {/* Summary KPI Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem', width: '100%' }}>
            <div className="card" style={{ padding: '0.85rem 0.9rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-sm)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'block', fontWeight: 600 }}>{t('transactions.totalTransactions')}</span>
              <strong style={{ fontSize: '1.2rem', color: 'var(--color-text-primary)' }}>{summary.total_transactions || 0}</strong>
            </div>

            <div className="card" style={{ padding: '0.85rem 0.9rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-sm)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'block', fontWeight: 600 }}>{t('transactions.totalWeight')}</span>
              <strong style={{ fontSize: '1.2rem', color: 'var(--color-text-primary)' }}>{summary.total_weight || 0} kg</strong>
            </div>

            <div className="card" style={{ padding: '0.85rem 0.9rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-sm)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'block', fontWeight: 600 }}>{t('transactions.totalBaseAmount')}</span>
              <strong style={{ fontSize: '1.2rem', color: 'var(--color-text-primary)' }}>₹{Number(summary.total_base_amount || 0).toFixed(2)}</strong>
            </div>

            <div className="card" style={{ padding: '0.85rem 0.9rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-sm)' }}>
              <span style={{ fontSize: '0.72rem', color: '#4338ca', display: 'block', fontWeight: 600 }}>{t('transactions.totalCommission')}</span>
              <strong style={{ fontSize: '1.2rem', color: '#4338ca' }}>₹{Number(summary.total_commission || 0).toFixed(2)}</strong>
            </div>

            <div className="card" style={{ padding: '0.85rem 0.9rem', background: 'var(--color-success-bg)', border: '1px solid #86efac', borderRadius: 'var(--border-radius-sm)' }}>
              <span style={{ fontSize: '0.72rem', color: '#15803d', display: 'block', fontWeight: 700 }}>{t('transactions.totalFinalAmount')}</span>
              <strong style={{ fontSize: '1.2rem', color: '#15803d', fontWeight: 800 }}>₹{Number(summary.total_final_amount || 0).toFixed(2)}</strong>
            </div>

            {/* Generate Bill CTA / View & WhatsApp Share Bill CTA */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {allBilled && existingBillId ? (
                <button
                  type="button"
                  id="view-existing-bill-btn"
                  onClick={() => openBillModal(existingBillId)}
                  title="Click to open full bill and share on WhatsApp"
                  style={{
                    width: '100%',
                    minHeight: '56px',
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    background: '#15803d',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--border-radius-pill)',
                    boxShadow: '0 4px 14px rgba(21, 128, 61, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.15rem' }}>📱</span>
                    <span>{t('billing.shareWhatsApp') || 'WhatsApp वर पाठवा'}</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#bbf7d0', fontWeight: 600 }}>
                    ✓ बिल तयार आहे (#{existingBillId}) • पहा / शेअर करा
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  id="generate-todays-bill-btn"
                  onClick={handleGenerateBillClick}
                  disabled={billGenerating || transactions.length === 0}
                  style={{
                    width: '100%',
                    minHeight: '56px',
                    padding: '0.75rem 1rem',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    background: (billGenerating || transactions.length === 0) ? '#cbd5e1' : '#15803d',
                    color: (billGenerating || transactions.length === 0) ? '#64748b' : '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--border-radius-pill)',
                    boxShadow: (billGenerating || transactions.length === 0) ? 'none' : '0 4px 14px rgba(21, 128, 61, 0.35)',
                    whiteSpace: 'normal',
                    textAlign: 'center',
                    lineHeight: '1.25',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: (billGenerating || transactions.length === 0) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {billGenerating ? (
                    <>
                      <span className="spinner" style={{ width: 14, height: 14, borderTopColor: '#ffffff' }} />
                      <span>{t('common.loading')}...</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '1.1rem' }}>📄</span>
                      <span>
                        {dateFilterType === 'range'
                          ? (t('transactions.generatePeriodBill') || 'कालावधीचे बिल बनवा')
                          : (t('transactions.generateBill') || 'आजचे बिल बनवा')}
                      </span>
                      {unbilledTransactions.length > 0 && (
                        <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.25)', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                          {unbilledTransactions.length}
                        </span>
                      )}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Inline Error Message Banner if generation failed */}
          {generateError && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚠️</span>
                <span>{generateError}</span>
              </div>
              <button
                type="button"
                onClick={() => setGenerateError('')}
                style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }}
              >
                ✕
              </button>
            </div>
          )}

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
            <div className="table-container" style={{ overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', textAlign: 'left', fontSize: '0.82rem', color: '#475569' }}>
                    <th style={{ padding: '0.6rem 0.75rem' }}>{t('billing.date') || 'Date'}</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>{t('billing.vegetable')}</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>{t('transactions.weight')}</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>{t('transactions.rate')}</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>{t('transactions.baseAmount')}</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>{t('transactions.commission')}</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>{t('transactions.finalAmount')}</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>{t('billing.paymentStatus')}</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>{t('transactions.billStatus')}</th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>{t('common.actions')}</th>
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
                          onOpenBill={openBillModal}
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
