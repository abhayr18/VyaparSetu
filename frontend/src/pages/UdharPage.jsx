/**
 * UdharPage — Vyapar Receivables-style
 * KPI icon cards + enhanced two-panel customer ledger
 */

import { useState, useEffect } from 'react';
import { useCredit } from '../hooks/useCredit';
import { useTranslation } from '../hooks/useTranslation';
import MarathiInput from '../components/MarathiInput';
import {
  ReceiptIcon, AlertIcon, ChartIcon, HistoryIcon, CheckIcon,
  SearchIcon, UsersIcon, PhoneIcon, MapPinIcon
} from '../components/Icons';

function Toast({ message, type, onClose }) {
  if (!message) return null;
  return (
    <div className={`toast toast-${type}`} id="toast-notification">
      <span>{message}</span>
      <button onClick={onClose} className="toast-close">✕</button>
    </div>
  );
}

// ─── Avatar Initials ───────────────────────────────────────────────────────────
function CustomerAvatar({ name, size = 36 }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #16a34a, #22c55e)',
      color: 'white', fontSize: '0.72rem', fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// ─── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ isOpen, onClose, customers, preselectedCustomerId, onSubmit, t }) {
  const [customerId, setCustomerId]     = useState('');
  const [amount, setAmount]             = useState('');
  const [paymentMode, setPaymentMode]   = useState('Cash');
  const [note, setNote]                 = useState('');
  const [errors, setErrors]             = useState({});
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCustomerId(preselectedCustomerId || '');
      setAmount(''); setPaymentMode('Cash'); setNote(''); setErrors({});
    }
  }, [isOpen, preselectedCustomerId]);

  if (!isOpen) return null;

  const activeCustomer = customers.find(c => c.id === Number(customerId));
  const maxAmount = activeCustomer ? Number(activeCustomer.credit_balance) : 0;

  function validate() {
    const errs = {};
    if (!customerId) errs.customer_id = t('credit.selectCustomer');
    const amt = Number(amount);
    if (!amount) errs.amount = t('credit.amountRequired');
    else if (isNaN(amt) || amt <= 0) errs.amount = t('credit.amountInvalid');
    else if (amt > Number(maxAmount.toFixed(2))) errs.amount = `${t('credit.amountExceeds')} (Max: ₹${maxAmount.toFixed(2)})`;
    if (!paymentMode) errs.payment_mode = t('credit.paymentModeRequired');
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    const res = await onSubmit({ customer_id: Number(customerId), amount: Number(amount), payment_mode: paymentMode, note: note.trim() });
    setSaving(false);
    if (res.success) onClose();
    else setErrors({ api: res.error });
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal modal-sm" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ReceiptIcon style={{ color: 'var(--color-primary)' }} />
            {t('credit.receivePayment')}
          </h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {errors.api && (
          <div className="form-api-error"><AlertIcon /> {errors.api}</div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label">{t('credit.customer')} *</label>
            {preselectedCustomerId ? (
              <input type="text" className="form-input" value={activeCustomer ? `${activeCustomer.name} (${activeCustomer.mobile})` : ''} disabled />
            ) : (
              <select
                className={`form-input form-select${errors.customer_id ? ' input-error' : ''}`}
                value={customerId}
                onChange={e => { setCustomerId(e.target.value); setAmount(''); if (errors.customer_id) setErrors(p => ({ ...p, customer_id: '' })); }}
              >
                <option value="">-- {t('credit.selectCustomer')} --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} (₹{Number(c.credit_balance).toFixed(2)})</option>
                ))}
              </select>
            )}
            {errors.customer_id && <span className="field-error">{errors.customer_id}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('credit.amount')} *</span>
              {activeCustomer && (
                <button type="button" onClick={() => setAmount(maxAmount.toFixed(2))}
                  style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                  Pay Full (₹{maxAmount.toFixed(2)})
                </button>
              )}
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: 8, fontWeight: 600, color: 'var(--color-text-secondary)' }}>₹</span>
              <input type="number" className={`form-input${errors.amount ? ' input-error' : ''}`}
                value={amount} min="0.01" step="any"
                onChange={e => { setAmount(e.target.value); if (errors.amount) setErrors(p => ({ ...p, amount: '' })); }}
                placeholder="0.00" style={{ paddingLeft: 24 }} disabled={!customerId} />
            </div>
            {errors.amount && <span className="field-error">{errors.amount}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">{t('credit.paymentMode')} *</label>
            <select className="form-input form-select" value={paymentMode} onChange={e => setPaymentMode(e.target.value)} disabled={!customerId}>
              <option value="Cash">{t('credit.modeCash')}</option>
              <option value="UPI">{t('credit.modeUPI')}</option>
              <option value="Other">{t('credit.modeOther')}</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t('credit.note')}</label>
            <input type="text" className="form-input" value={note}
              onChange={e => setNote(e.target.value)} placeholder="e.g. Cleared pending dues" disabled={!customerId} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !customerId}>
              {saving ? t('common.loading') : t('credit.savePayment')}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── Main Udhar Page ──────────────────────────────────────────────────────────
export default function UdharPage() {
  const { t } = useTranslation();
  const {
    summary, customers, loading, error,
    searchQuery, setSearchQuery,
    activeCustomerId, setActiveCustomerId,
    activeCustomer, transactions, transactionsLoading,
    collectPayment
  } = useCredit();

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [txFilter, setTxFilter]                 = useState('all'); // all | payments | credits
  const [toast, setToast] = useState({ message: '', type: 'success' });

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: 'success' }), 3500);
  }

  async function handlePaymentSubmit(data) {
    const res = await collectPayment(data);
    if (res.success) { showToast(t('credit.paymentSuccess')); return { success: true }; }
    return res;
  }

  function hasDevanagari(str) { return /[\u0900-\u097F]/.test(str); }
  function isAscii(str) {
    for (let i = 0; i < str.length; i++) if (str.charCodeAt(i) > 127) return false;
    return true;
  }

  return (
    <div className="udhar-page" style={{ animation: 'pageIn 0.2s ease' }}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="page-header-bar">
        <div>
          <h1 className="page-title">{t('credit.title')}</h1>
          <p className="page-desc">{t('credit.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setPaymentModalOpen(true)} id="receive-payment-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ReceiptIcon style={{ width: '16px', height: '16px' }} />
          {t('credit.receivePayment')}
        </button>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 24 }}>
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-orange">
            <ReceiptIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">₹{summary.total_outstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            <div className="kpi-label">{t('credit.totalOutstanding')}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-red">
            <ChartIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">₹{summary.today_added.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            <div className="kpi-label">{t('credit.todayAdded')}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-green">
            <HistoryIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">₹{summary.today_recovered.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            <div className="kpi-label">{t('credit.todayRecovered')}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-blue">
            <UsersIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{customers.length}</div>
            <div className="kpi-label">Customers with Udhar</div>
          </div>
        </div>
      </div>

      {/* ── Two-panel Grid ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 20, alignItems: 'start' }}>

        {/* Left: Customer List */}
        <div>
          {/* Search */}
          <div className="search-bar-container" style={{ marginBottom: 12 }}>
            <div className={`search-bar${searchQuery && hasDevanagari(searchQuery) ? ' marathi-mode' : ''}`}>
              <span className="search-icon"><SearchIcon /></span>
              <MarathiInput id="udhar-search-input" variant="search" placeholder={t('customers.searchPlaceholder')}
                value={searchQuery} onChange={setSearchQuery} />
              {searchQuery && isAscii(searchQuery) && <span className="search-marathi-badge">अ</span>}
              {searchQuery && <button className="search-clear-btn" onClick={() => setSearchQuery('')}>✕</button>}
            </div>
          </div>

          {/* Customer List Card */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Card Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <UsersIcon style={{ color: 'var(--color-primary)', width: '16px', height: '16px' }} />
              <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{t('credit.customersWithBalance') || 'Customers'}</span>
              {customers.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--color-text-muted)', background: 'var(--color-border-light)', padding: '2px 8px', borderRadius: '20px', fontWeight: 600 }}>
                  {customers.length}
                </span>
              )}
            </div>

            {error && !loading && (
              <div className="table-error" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' }}><AlertIcon /> {error}</div>
            )}
            {loading && <div className="table-message"><span className="spinner" style={{ margin: 'auto' }} /></div>}

            {!loading && !error && customers.length === 0 && (
              <div className="table-message" style={{ padding: '40px 20px' }}>
                <UsersIcon style={{ width: '1.8rem', height: '1.8rem', color: 'var(--color-text-muted)', marginBottom: 8 }} />
                <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                  {searchQuery ? t('credit.noSearchResults') : t('credit.noPendingCustomers')}
                </p>
              </div>
            )}

            {!loading && !error && customers.length > 0 && customers.map(c => (
              <div
                key={c.id}
                className={`udhar-customer-row${activeCustomerId === c.id ? ' active' : ''}`}
                onClick={() => { setActiveCustomerId(c.id); setTxFilter('all'); }}
              >
                <CustomerAvatar name={c.name} size={36} />
                <div className="udhar-customer-info">
                  <div className="udhar-customer-name">{c.name}</div>
                  <div className="udhar-customer-mobile">{c.mobile}</div>
                </div>
                <span className="udhar-balance-badge">₹{Number(c.credit_balance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Transaction Detail Panel */}
        <div className="card" style={{ minHeight: 420, position: 'sticky', top: 20, padding: 0, overflow: 'hidden' }}>
          {activeCustomer ? (
            <>
              {/* Customer Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <CustomerAvatar name={activeCustomer.name} size={40} />
                    <div>
                      <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 2px 0' }}>{activeCustomer.name}</h2>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <PhoneIcon style={{ width: '12px', height: '12px' }} /> {activeCustomer.mobile}
                      </p>
                      {activeCustomer.address && (
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <MapPinIcon style={{ width: '12px', height: '12px' }} /> {activeCustomer.address}
                        </p>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', marginBottom: 2 }}>
                      {t('credit.totalOutstanding')}
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-error)', lineHeight: 1 }}>
                      ₹{Number(activeCustomer.credit_balance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                    <button className="btn btn-outline" onClick={() => setPaymentModalOpen(true)}
                      style={{ marginTop: 8, padding: '4px 12px', fontSize: '0.78rem' }}>
                      + {t('credit.receivePayment')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Transaction History */}
              <div style={{ padding: '14px 20px 0' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <HistoryIcon style={{ width: '14px', height: '14px' }} />
                  {t('credit.historyTitle')}
                </div>

                {/* Filter Tabs */}
                {transactions.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                    {[
                      { key: 'all',      label: 'All',              count: transactions.length },
                      { key: 'payments', label: 'Payments Received', count: transactions.filter(t => t.transaction_type === 'PAYMENT_RECEIVED').length },
                      { key: 'credits',  label: 'Credit Added',      count: transactions.filter(t => t.transaction_type === 'CREDIT_ADDED').length },
                    ].map(({ key, label, count }) => (
                      <button
                        key={key}
                        onClick={() => setTxFilter(key)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '16px',
                          border: 'none',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          background: txFilter === key ? 'var(--color-primary)' : 'var(--color-bg-light)',
                          color: txFilter === key ? '#fff' : 'var(--color-text-secondary)',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {label}
                        <span style={{
                          background: txFilter === key ? 'rgba(255,255,255,0.25)' : 'var(--color-border)',
                          padding: '1px 5px', borderRadius: '8px', fontSize: '0.68rem',
                        }}>{count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Mini summary bar */}
                {transactions.length > 0 && (
                  <div style={{
                    display: 'flex', gap: 12, marginBottom: 10, fontSize: '0.75rem',
                    background: 'var(--color-bg-light)', borderRadius: 8, padding: '6px 10px', flexWrap: 'wrap'
                  }}>
                    <span style={{ color: 'var(--color-error)', fontWeight: 700 }}>
                      Credit: ₹{transactions.filter(t => t.transaction_type === 'CREDIT_ADDED').reduce((s, t) => s + Number(t.amount), 0).toFixed(2)}
                    </span>
                    <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>
                      Received: ₹{transactions.filter(t => t.transaction_type === 'PAYMENT_RECEIVED').reduce((s, t) => s + Number(t.amount), 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {transactionsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><span className="spinner" /></div>
              ) : transactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  No transaction history yet.
                </div>
              ) : (() => {
                const filtered = txFilter === 'all'
                  ? transactions
                  : txFilter === 'payments'
                    ? transactions.filter(t => t.transaction_type === 'PAYMENT_RECEIVED')
                    : transactions.filter(t => t.transaction_type === 'CREDIT_ADDED');

                if (filtered.length === 0) return (
                  <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    No records for this filter.
                  </div>
                );

                return (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                          <th style={{ padding: '8px 20px', fontWeight: 700, color: 'var(--color-text-muted)', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date & Time</th>
                          <th style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--color-text-muted)', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</th>
                          <th style={{ padding: '8px 20px', fontWeight: 700, color: 'var(--color-text-muted)', textAlign: 'right', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</th>
                          <th style={{ padding: '8px 20px', fontWeight: 700, color: 'var(--color-text-muted)', textAlign: 'right', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(tx => {
                          const isPayment = tx.transaction_type === 'PAYMENT_RECEIVED';
                          const isCredit  = tx.transaction_type === 'CREDIT_ADDED';
                          const typeColor = isPayment ? 'var(--color-success)' : isCredit ? 'var(--color-error)' : 'var(--color-text-secondary)';
                          const typeLabel = isCredit ? t('credit.typeCreditAdded') : isPayment ? t('credit.typePaymentReceived') : t('credit.typeCreditAdjustment');
                          return (
                            <tr key={tx.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                              <td style={{ padding: '9px 20px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                                <div style={{ fontWeight: 600 }}>
                                  {new Date(tx.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </div>
                                <div style={{ fontSize: '0.7rem', marginTop: 1 }}>
                                  {new Date(tx.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </td>
                              <td style={{ padding: '9px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{
                                    width: 18, height: 18, borderRadius: '50%',
                                    background: isPayment ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                  }}>
                                    {isPayment
                                      ? <CheckIcon style={{ width: 10, height: 10, color: 'var(--color-success)' }} />
                                      : <ChartIcon style={{ width: 10, height: 10, color: 'var(--color-error)' }} />
                                    }
                                  </span>
                                  <div>
                                    <div style={{ fontWeight: 600, color: typeColor, fontSize: '0.8rem' }}>{typeLabel}</div>
                                    {tx.note && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 1 }}>{tx.note}</div>}
                                    {tx.bill_number && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>#{tx.bill_number}</div>}
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '9px 20px', textAlign: 'right', fontWeight: 700, color: isPayment ? 'var(--color-success)' : 'var(--color-text-primary)' }}>
                                {isPayment ? '−' : '+'}₹{Number(tx.amount).toFixed(2)}
                              </td>
                              <td style={{ padding: '9px 20px', textAlign: 'right', fontWeight: 600 }}>
                                ₹{Number(tx.balance_after_transaction).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '80px 20px', color: 'var(--color-text-muted)', textAlign: 'center', gap: 12 }}>
              <ReceiptIcon style={{ width: '2.5rem', height: '2.5rem', color: 'var(--color-border)' }} />
              <p style={{ margin: 0, fontWeight: 500, fontSize: '0.875rem' }}>
                {t('credit.selectCustomerHint') || 'Select a customer from the left to view their transaction history'}
              </p>
            </div>
          )}
        </div>
      </div>

      {paymentModalOpen && (
        <PaymentModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          customers={customers}
          preselectedCustomerId={activeCustomerId}
          onSubmit={handlePaymentSubmit}
          t={t}
        />
      )}
    </div>
  );
}
