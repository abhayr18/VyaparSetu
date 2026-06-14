/**
 * BillingPage — Vyapar-inspired
 * Filter tabs (All/Paid/Unpaid/Partial) + KPI cards + clean table
 */

import { useState, useCallback, useMemo } from 'react';
import { useBills } from '../hooks/useBills';
import { useTranslation } from '../hooks/useTranslation';
import BillModal from '../components/BillModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import ReceiptPrint from '../components/ReceiptPrint';
import MarathiInput from '../components/MarathiInput';
import {
  ReceiptIcon, SearchIcon, AlertIcon, HistoryIcon,
  PrintIcon, EditIcon, TrashIcon, CheckIcon, ChartIcon
} from '../components/Icons';

function hasDevanagari(str) { return /[\u0900-\u097F]/.test(str); }
function isAscii(str) {
  for (let i = 0; i < str.length; i++) if (str.charCodeAt(i) > 127) return false;
  return true;
}

function Toast({ message, type, onClose }) {
  if (!message) return null;
  return (
    <div className={`toast toast-${type}`} id="toast-notification">
      <span>{message}</span>
      <button onClick={onClose} className="toast-close">✕</button>
    </div>
  );
}

const STATUS_FILTERS = ['All', 'Paid', 'Credit', 'Partial'];

export default function BillingPage() {
  const { t } = useTranslation();
  const { bills, loading, error, searchQuery, setSearchQuery, createBill, updateBill, deleteBill } = useBills();

  const [activeFilter, setActiveFilter]     = useState('All');
  const [modalOpen, setModalOpen]           = useState(false);
  const [editingBill, setEditingBill]       = useState(null);
  const [deleteTarget, setDeleteTarget]     = useState(null);
  const [deleteLoading, setDeleteLoading]   = useState(false);
  const [printTarget, setPrintTarget]       = useState(null);
  const [toast, setToast]                   = useState({ message: '', type: 'success' });

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: 'success' }), 3500);
  }

  const openAdd    = useCallback(() => { setEditingBill(null); setModalOpen(true); }, []);
  const openEdit   = useCallback((b) => { setEditingBill(b); setModalOpen(true); }, []);
  const openDelete = useCallback((b) => setDeleteTarget(b), []);
  const openPrint  = useCallback((b) => setPrintTarget(b), []);

  async function handleModalSubmit(data) {
    const res = editingBill ? await updateBill(editingBill.id, data) : await createBill(data);
    if (res.success) showToast(t('billing.saveSuccess'));
    return res;
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const res = await deleteBill(deleteTarget.id);
    setDeleteLoading(false);
    if (res.success) { showToast(t('billing.deleteSuccess')); setDeleteTarget(null); }
    else showToast(res.error || t('common.error'), 'error');
  }

  // ─── Computed stats ────────────────────────────────────────────────────────
  const totalAmount   = bills.reduce((s, b) => s + Number(b.final_amount || 0), 0);
  const paidAmount    = bills.filter(b => b.payment_status === 'Paid').reduce((s, b) => s + Number(b.final_amount || 0), 0);
  const pendingAmount = bills.reduce((s, b) => s + Number(b.remaining_amount || 0), 0);

  // ─── Filter counts ─────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    All:     bills.length,
    Paid:    bills.filter(b => b.payment_status === 'Paid').length,
    Credit:  bills.filter(b => b.payment_status === 'Credit').length,
    Partial: bills.filter(b => b.payment_status === 'Partial').length,
  }), [bills]);

  // ─── Filtered bills ────────────────────────────────────────────────────────
  const filteredBills = useMemo(() =>
    activeFilter === 'All' ? bills : bills.filter(b => b.payment_status === activeFilter),
  [bills, activeFilter]);

  return (
    <div className="billing-page" style={{ animation: 'pageIn 0.2s ease' }}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="page-header-bar">
        <div>
          <h1 className="page-title">{t('billing.title')}</h1>
          <p className="page-desc">{t('billing.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} id="add-bill-btn">
          + {t('billing.addBill')}
        </button>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-blue">
            <ReceiptIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{bills.length}</div>
            <div className="kpi-label">{t('billing.totalBills')}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-green">
            <CheckIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            <div className="kpi-label">{t('billing.totalRevenue')}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-teal">
            <ChartIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">₹{paidAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            <div className="kpi-label">{t('billing.paid') || 'Amount Paid'}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-red">
            <HistoryIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">₹{pendingAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            <div className="kpi-label">{t('billing.unpaidAmount')}</div>
          </div>
        </div>
      </div>

      {/* ── Filter Tabs (Vyapar-style) ─────────────────────────────────────── */}
      <div className="filter-tabs">
        {STATUS_FILTERS.map(status => (
          <button
            key={status}
            className={`filter-tab${activeFilter === status ? ' active' : ''}`}
            onClick={() => setActiveFilter(status)}
          >
            {status === 'All' ? t('common.all') || 'All'
              : status === 'Paid' ? t('billing.paymentTypePaid') || 'Paid'
              : status === 'Credit' ? t('billing.paymentTypeCredit') || 'Unpaid'
              : t('billing.paymentTypePartial') || 'Partial'}
            <span className="filter-tab-count">{counts[status]}</span>
          </button>
        ))}
      </div>

      {/* ── Search Bar ────────────────────────────────────────────────────── */}
      <div className="search-bar-container">
        <div className={`search-bar${searchQuery && hasDevanagari(searchQuery) ? ' marathi-mode' : ''}`}>
          <span className="search-icon"><SearchIcon /></span>
          <MarathiInput
            id="bill-search-input"
            variant="search"
            placeholder={`${t('billing.billNumber')}, ${t('billing.customer')}...`}
            value={searchQuery}
            onChange={setSearchQuery}
          />
          {searchQuery && isAscii(searchQuery) && <span className="search-marathi-badge">अ</span>}
          {searchQuery && <button className="search-clear-btn" onClick={() => setSearchQuery('')}>✕</button>}
        </div>
        {searchQuery && (
          <div className="search-hint">
            {t('transliteration.searchingFor')} <strong>"{searchQuery}"</strong>
            &nbsp;—&nbsp;{filteredBills.length} {t('common.noData').includes('No') ? 'result(s)' : 'निकाल'}
          </div>
        )}
      </div>

      {/* ── Bills Table ───────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {error && !loading && (
          <div className="table-error" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' }}>
            <AlertIcon /> {error}
          </div>
        )}
        {loading && <div className="table-message"><span className="spinner" style={{ margin: 'auto' }} /></div>}

        {!loading && !error && filteredBills.length === 0 && (
          <div className="table-message">
            <div style={{ marginBottom: 10 }}>
              <ReceiptIcon style={{ width: '2rem', height: '2rem', color: 'var(--color-text-muted)' }} />
            </div>
            <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
              {searchQuery ? t('billing.noSearchResults') || 'No bills match search.'
                : activeFilter !== 'All' ? `No ${activeFilter} bills found.`
                : 'No bills generated yet.'}
            </p>
            {!searchQuery && activeFilter === 'All' && (
              <button className="btn btn-primary" onClick={openAdd} style={{ marginTop: 12 }}>
                + {t('billing.addBill')}
              </button>
            )}
          </div>
        )}

        {!loading && !error && filteredBills.length > 0 && (
          <div className="table-wrapper">
            <table className="data-table" id="bills-table">
              <thead>
                <tr>
                  <th className="table-th">{t('billing.billNumber')}</th>
                  <th className="table-th">{t('billing.customer')}</th>
                  <th className="table-th">{t('billing.date')}</th>
                  <th className="table-th" style={{ textAlign: 'right' }}>{t('billing.total')}</th>
                  <th className="table-th" style={{ textAlign: 'right' }}>{t('billing.paid')}</th>
                  <th className="table-th">{t('billing.status')}</th>
                  <th className="table-th">{t('billing.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map((bill) => (
                  <tr className="table-row" key={bill.id} id={`bill-row-${bill.id}`}>
                    <td className="table-cell" style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                      {bill.bill_number}
                    </td>
                    <td className="table-cell">
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{bill.customer_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{bill.customer_mobile}</div>
                    </td>
                    <td className="table-cell" style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(bill.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="table-cell" style={{ fontWeight: 700, textAlign: 'right' }}>
                      ₹{Number(bill.final_amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="table-cell" style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: 600 }}>
                      ₹{Number(bill.paid_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="table-cell">
                      <span className={`badge badge-${bill.payment_status === 'Paid' ? 'success' : bill.payment_status === 'Partial' ? 'warning' : 'error'}`}>
                        {t(`billing.status${bill.payment_status}`)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="action-btns">
                        <button className="btn-icon" onClick={() => openPrint(bill)} title={t('billing.print')} id={`print-btn-${bill.id}`} style={{ background: 'var(--color-success-bg)' }}>
                          <PrintIcon style={{ color: 'var(--color-success)' }} />
                        </button>
                        <button className="btn-icon btn-icon-edit" onClick={() => openEdit(bill)} title={t('common.edit')} id={`edit-btn-${bill.id}`}>
                          <EditIcon />
                        </button>
                        <button className="btn-icon btn-icon-delete" onClick={() => openDelete(bill)} title={t('common.delete')} id={`delete-btn-${bill.id}`}>
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <BillModal
          isOpen={modalOpen}
          onClose={(savedBill) => { setModalOpen(false); if (savedBill) setPrintTarget(savedBill); }}
          onSubmit={handleModalSubmit}
          bill={editingBill}
        />
      )}
      <ReceiptPrint isOpen={Boolean(printTarget)} onClose={() => setPrintTarget(null)} bill={printTarget} />
      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
        title={t('billing.deleteConfirmTitle')}
        message={`${t('billing.deleteConfirmMsg')} "${deleteTarget?.bill_number}"?`}
        subMessage={t('billing.deleteConfirmNote')}
      />
    </div>
  );
}
