/**
 * Customers Page
 * Full customer management UI:
 *  - Stats bar
 *  - Search bar
 *  - Customer table
 *  - Add / Edit modal
 *  - Delete confirmation
 *  - Customer ledger history modal
 *  - Toast notifications
 */

import { useState, useCallback } from 'react';
import { useCustomers } from '../hooks/useCustomers';
import { useTranslation } from '../hooks/useTranslation';
import CustomerModal from '../components/CustomerModal';
import CustomerLedgerModal from '../components/CustomerLedgerModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import MarathiInput from '../components/MarathiInput';
import {
  PhoneIcon,
  EditIcon,
  TrashIcon,
  UsersIcon,
  ReceiptIcon,
  SearchIcon,
  AlertIcon,
  HistoryIcon
} from '../components/Icons';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hasDevanagari(str) {
  return /[\u0900-\u097F]/.test(str);
}
function isAscii(str) {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return false;
  }
  return true;
}

// ─── Toast Notification (inline, no dependency) ───────────────────────────────
function Toast({ message, type, onClose }) {
  if (!message) return null;
  return (
    <div className={`toast toast-${type}`} id="toast-notification">
      <span>{message}</span>
      <button onClick={onClose} className="toast-close">✕</button>
    </div>
  );
}

// ─── Customer Table Row ───────────────────────────────────────────────────────
function CustomerRow({ customer, onEdit, onDelete, onHistory, t }) {
  const initials = customer.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const hasCredit = customer.credit_balance > 0;

  return (
    <tr className="table-row" id={`customer-row-${customer.id}`}>
      {/* Avatar + Name */}
      <td className="table-cell">
        <div className="customer-name-cell">
          <div className="avatar">{initials}</div>
          <div>
            <div className="customer-name">{customer.name}</div>
            {customer.address && (
              <div className="customer-address">{customer.address}</div>
            )}
          </div>
        </div>
      </td>

      {/* Mobile */}
      <td className="table-cell">
        <a href={`tel:${customer.mobile}`} className="mobile-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <PhoneIcon /> {customer.mobile}
        </a>
      </td>

      {/* Credit Balance */}
      <td className="table-cell">
        <span className={`badge ${hasCredit ? 'badge-warning' : 'badge-success'}`}>
          ₹ {Number(customer.credit_balance).toFixed(2)}
        </span>
      </td>

      {/* Registered On */}
      <td className="table-cell text-muted text-sm">
        {new Date(customer.created_at).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
        })}
      </td>

      {/* Actions */}
      <td className="table-cell">
        <div className="action-btns">
          {/* History / Ledger Button */}
          <button
            className="btn-icon"
            onClick={() => onHistory(customer)}
            title="View Full History"
            id={`history-btn-${customer.id}`}
            style={{ background: 'var(--color-primary-light)' }}
          >
            <HistoryIcon style={{ color: 'var(--color-primary)' }} />
          </button>
          <button
            className="btn-icon btn-icon-edit"
            onClick={() => onEdit(customer)}
            title={t('common.edit')}
            id={`edit-btn-${customer.id}`}
          >
            <EditIcon />
          </button>
          <button
            className="btn-icon btn-icon-delete"
            onClick={() => onDelete(customer)}
            title={t('common.delete')}
            id={`delete-btn-${customer.id}`}
          >
            <TrashIcon />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const { t } = useTranslation();
  const {
    customers, loading, error,
    searchQuery, setSearchQuery,
    createCustomer, updateCustomer, deleteCustomer,
  } = useCustomers();

  // Modal state
  const [modalOpen, setModalOpen]               = useState(false);
  const [editingCustomer, setEditingCustomer]   = useState(null);
  const [deleteTarget, setDeleteTarget]         = useState(null);
  const [deleteLoading, setDeleteLoading]       = useState(false);
  const [ledgerCustomer, setLedgerCustomer]     = useState(null); // for history modal
  const [toast, setToast]                       = useState({ message: '', type: 'success' });

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: 'success' }), 3500);
  }

  const openAdd = useCallback(() => {
    setEditingCustomer(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((customer) => {
    setEditingCustomer(customer);
    setModalOpen(true);
  }, []);

  const openHistory = useCallback((customer) => {
    setLedgerCustomer(customer);
  }, []);

  const openDelete = useCallback((customer) => {
    setDeleteTarget(customer);
  }, []);

  // ─── Submit Handlers ────────────────────────────────────────────────────────
  async function handleModalSubmit(data) {
    if (editingCustomer) {
      const res = await updateCustomer(editingCustomer.id, data);
      if (res.success) showToast(t('customers.saveSuccess'));
      return res;
    } else {
      const res = await createCustomer(data);
      if (res.success) showToast(t('customers.saveSuccess'));
      return res;
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const res = await deleteCustomer(deleteTarget.id);
    setDeleteLoading(false);
    if (res.success) {
      showToast(t('customers.deleteSuccess'));
      setDeleteTarget(null);
    } else {
      showToast(res.error || t('common.error'), 'error');
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="customers-page">
      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="page-header-bar">
        <div>
          <h1 className="page-title">{t('customers.title')}</h1>
          <p className="page-desc">{t('customers.subtitle')}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={openAdd}
          id="add-customer-btn"
        >
          + {t('customers.addCustomer')}
        </button>
      </div>

      {/* ── KPI Stats ──────────────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-blue">
            <UsersIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{customers.length}</div>
            <div className="kpi-label">{t('customers.totalCustomers')}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-red">
            <ReceiptIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">₹{customers.reduce((s, c) => s + Number(c.credit_balance), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            <div className="kpi-label">{t('customers.creditBalance')}</div>
          </div>
        </div>
      </div>

      {/* ── Smart Search Bar (Marathi + Fuzzy) ─────────────────────── */}
      <div className="search-bar-container">
        <div className={`search-bar${searchQuery && hasDevanagari(searchQuery) ? ' marathi-mode' : ''}`}>
          <span className="search-icon" style={{ display: 'flex', alignItems: 'center' }}>
            <SearchIcon />
          </span>
          <MarathiInput
            id="customer-search-input"
            variant="search"
            placeholder={t('customers.searchPlaceholder')}
            value={searchQuery}
            onChange={setSearchQuery}
          />
          {searchQuery && isAscii(searchQuery) && (
            <span className="search-marathi-badge">अ</span>
          )}
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery('')} title="Clear">✕</button>
          )}
        </div>
        {searchQuery && (
          <div className="search-hint">
            {t('transliteration.searchingFor')} <strong>"{searchQuery}"</strong>
            &nbsp;—&nbsp;{customers.length} {t('common.noData').includes('No') ? 'result(s)' : 'निकाल'}
          </div>
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Error state */}
        {error && !loading && (
          <div className="table-message table-error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertIcon /> {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="table-message">
            <span className="spinner" style={{ margin: 'auto' }} />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && customers.length === 0 && (
          <div className="table-message">
            <div style={{ marginBottom: 10 }}>
              <UsersIcon style={{ width: '2rem', height: '2rem', color: 'var(--color-text-muted)' }} />
            </div>
            <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
              {searchQuery ? t('customers.noSearchResults') : t('customers.noCustomers')}
            </p>
            {!searchQuery && (
              <button className="btn btn-primary" onClick={openAdd} style={{ marginTop: 12 }}>
                + {t('customers.addCustomer')}
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {!loading && !error && customers.length > 0 && (
          <div className="table-wrapper">
            <table className="data-table" id="customers-table">
              <thead>
                <tr>
                  <th className="table-th">{t('customers.name')}</th>
                  <th className="table-th">{t('customers.mobile')}</th>
                  <th className="table-th">{t('customers.creditBalance')}</th>
                  <th className="table-th">{t('customers.createdAt')}</th>
                  <th className="table-th">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <CustomerRow
                    key={customer.id}
                    customer={customer}
                    onEdit={openEdit}
                    onDelete={openDelete}
                    onHistory={openHistory}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <CustomerModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSubmit={handleModalSubmit}
          customer={editingCustomer}
        />
      )}

      {/* Customer Full Ledger / History Modal */}
      {ledgerCustomer && (
        <CustomerLedgerModal
          customerId={ledgerCustomer.id}
          customerName={ledgerCustomer.name}
          onClose={() => setLedgerCustomer(null)}
        />
      )}

      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
        title={t('customers.deleteConfirmTitle')}
        message={`${t('customers.deleteConfirmMsg')} "${deleteTarget?.name}"?`}
        subMessage={t('customers.deleteConfirmNote')}
      />
    </div>
  );
}
