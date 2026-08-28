/**
 * EditTransactionModal Component
 * Modal for editing previously recorded transactions if entered wrongly.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import CustomerAutocomplete from './CustomerAutocomplete';
import VegetableAutocomplete from './VegetableAutocomplete';
import {
  calculateTransactionTotals,
  DEFAULT_COMMISSION_PERCENT,
} from '../utils/money';
import { AlertIcon, CheckIcon } from './Icons';

export default function EditTransactionModal({
  isOpen,
  onClose,
  transaction,
  customers = [],
  vegetables = [],
  onUpdateTransaction,
  commissionRate = DEFAULT_COMMISSION_PERCENT,
}) {
  const { t } = useTranslation();

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedVegetable, setSelectedVegetable] = useState(null);
  const [weight, setWeight] = useState('');
  const [rate, setRate] = useState('');
  const [unit, setUnit] = useState('kg');
  const [transactionDate, setTransactionDate] = useState('');
  const [paymentType, setPaymentType] = useState('Credit');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [paidInput, setPaidInput] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (isOpen && transaction) {
      const cust = customers.find((c) => c.id === transaction.customer_id) || {
        id: transaction.customer_id,
        name: transaction.customer_name || 'Customer',
      };
      const veg = vegetables.find((v) => v.id === transaction.vegetable_id) || {
        id: transaction.vegetable_id,
        name: transaction.vegetable_name_snapshot || 'Vegetable',
        unit: transaction.unit || 'kg',
      };

      setSelectedCustomer(cust);
      setSelectedVegetable(veg);
      setWeight(String(transaction.weight || ''));
      setRate(String(transaction.rate || ''));
      setUnit(transaction.unit || 'kg');
      setTransactionDate(transaction.transaction_date || '');
      setPaymentType(transaction.payment_type || 'Credit');
      setPaymentMode(transaction.payment_mode === 'Credit' ? 'Cash' : transaction.payment_mode || 'Cash');
      setPaidInput(transaction.paid_amount ? String(transaction.paid_amount) : '');
      setErrors({});
      setApiError('');
    }
  }, [isOpen, transaction, customers, vegetables]);

  if (!isOpen || !transaction) return null;

  const numWeight = parseFloat(weight) || 0;
  const numRate = parseFloat(rate) || 0;
  const commRate = transaction?.commission_rate != null ? Number(transaction.commission_rate) : commissionRate;
  const { baseAmount, commissionAmount, finalAmount } = calculateTransactionTotals(
    numWeight,
    numRate,
    commRate
  );

  let calculatedPaid = 0;
  let calculatedRemaining = finalAmount;

  if (paymentType === 'Paid') {
    calculatedPaid = finalAmount;
    calculatedRemaining = 0;
  } else if (paymentType === 'Partial') {
    const rawPaid = parseFloat(paidInput) || 0;
    calculatedPaid = Math.min(finalAmount, Math.max(0, Math.round(rawPaid * 100) / 100));
    calculatedRemaining = Math.round((finalAmount - calculatedPaid) * 100) / 100;
  } else {
    calculatedPaid = 0;
    calculatedRemaining = finalAmount;
  }

  function validate() {
    const errs = {};
    if (!selectedCustomer) errs.customer = t('transactions.customerRequired');
    if (!selectedVegetable) errs.vegetable = t('transactions.vegetableRequired');
    if (isNaN(numWeight) || numWeight <= 0) errs.weight = t('transactions.weightRequired');
    if (isNaN(numRate) || numRate < 0) errs.rate = t('transactions.rateRequired');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setApiError('');

    const payload = {
      customer_id: selectedCustomer.id,
      vegetable_id: selectedVegetable.id,
      vegetable_name_snapshot: selectedVegetable.name,
      weight: numWeight,
      rate: numRate,
      unit: unit || selectedVegetable.unit || 'kg',
      payment_type: paymentType,
      payment_mode: paymentType === 'Credit' ? 'Credit' : paymentMode,
      paid_amount: calculatedPaid,
      remaining_amount: calculatedRemaining,
      transaction_date: transactionDate,
    };

    const res = await onUpdateTransaction(transaction.id, payload);
    setSaving(false);

    if (res?.success) {
      onClose();
    } else {
      setApiError(res?.error || 'Failed to update transaction.');
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✏️</span>
            <span>व्यवहार दुरुस्त करा / Edit Transaction</span>
          </h2>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {apiError && (
          <div
            className="form-api-error"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              background: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fca5a5',
              borderRadius: '6px',
              marginBottom: '16px',
              fontSize: '0.85rem',
            }}
          >
            <AlertIcon style={{ flexShrink: 0 }} />
            <span>{apiError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            {/* Customer Selection */}
            <div>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                1. {t('transactions.selectCustomer')} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <CustomerAutocomplete
                customers={customers}
                selectedCustomer={selectedCustomer}
                onSelectCustomer={(c) => {
                  setSelectedCustomer(c);
                  if (c) setErrors((prev) => ({ ...prev, customer: null }));
                }}
                placeholder={t('transactions.selectCustomer')}
                hasError={!!errors.customer}
              />
              {errors.customer && (
                <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '2px', display: 'block' }}>
                  {errors.customer}
                </span>
              )}
            </div>

            {/* Vegetable Selection */}
            <div>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                2. {t('transactions.selectVegetable')} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <VegetableAutocomplete
                vegetables={vegetables}
                selectedVegetable={selectedVegetable}
                onSelectVegetable={(v) => {
                  setSelectedVegetable(v);
                  if (v) {
                    setRate(v.rate != null ? String(v.rate) : rate);
                    setUnit(v.unit || unit);
                    setErrors((prev) => ({ ...prev, vegetable: null }));
                  }
                }}
                placeholder={t('transactions.selectVegetable')}
                hasError={!!errors.vegetable}
              />
              {errors.vegetable && (
                <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '2px', display: 'block' }}>
                  {errors.vegetable}
                </span>
              )}
            </div>

            {/* Weight */}
            <div>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                3. {t('transactions.weight')} ({unit}) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                className={`input-field ${errors.weight ? 'input-error' : ''}`}
                value={weight}
                onChange={(e) => {
                  setWeight(e.target.value);
                  setErrors((prev) => ({ ...prev, weight: null }));
                }}
                style={{ fontSize: '1rem', padding: '0.65rem 0.85rem' }}
              />
              {errors.weight && (
                <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '2px', display: 'block' }}>
                  {errors.weight}
                </span>
              )}
            </div>

            {/* Rate */}
            <div>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                4. {t('transactions.rate')} (₹/{unit}) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0"
                className={`input-field ${errors.rate ? 'input-error' : ''}`}
                value={rate}
                onChange={(e) => {
                  setRate(e.target.value);
                  setErrors((prev) => ({ ...prev, rate: null }));
                }}
                style={{ fontSize: '1rem', padding: '0.65rem 0.85rem' }}
              />
              {errors.rate && (
                <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '2px', display: 'block' }}>
                  {errors.rate}
                </span>
              )}
            </div>

            {/* Transaction Date */}
            <div>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                5. तारीख / Transaction Date
              </label>
              <input
                type="date"
                className="input-field"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                style={{ fontSize: '0.95rem', padding: '0.65rem 0.85rem' }}
              />
            </div>

            {/* Payment Type */}
            <div>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                6. {t('billing.paymentStatus')}
              </label>
              <select
                className="input-field"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                style={{ fontSize: '0.95rem', padding: '0.65rem 0.85rem', fontWeight: 600 }}
              >
                <option value="Credit">🔴 {t('billing.statusCredit')}</option>
                <option value="Paid">🟢 {t('billing.statusPaid')}</option>
                <option value="Partial">🟡 {t('billing.statusPartial')}</option>
              </select>
            </div>

            {/* Payment Mode (if not full credit) */}
            {paymentType !== 'Credit' && (
              <div>
                <label className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                  7. {t('credit.paymentMode')}
                </label>
                <select
                  className="input-field"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  style={{ fontSize: '0.95rem', padding: '0.65rem 0.85rem' }}
                >
                  <option value="Cash">💵 {t('billing.paymentTypeCash')}</option>
                  <option value="UPI">📱 {t('billing.paymentTypeUPI')}</option>
                  <option value="Other">💳 {t('credit.modeOther')}</option>
                </select>
              </div>
            )}

            {/* Paid Amount Input for Partial */}
            {paymentType === 'Partial' && (
              <div>
                <label className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                  8. {t('billing.paid')} (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  max={finalAmount}
                  className="input-field"
                  value={paidInput}
                  onChange={(e) => setPaidInput(e.target.value)}
                  style={{ fontSize: '1rem', padding: '0.65rem 0.85rem' }}
                />
              </div>
            )}
          </div>

          {/* Financial Calculation Summary Bar */}
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
              gap: '10px',
              textAlign: 'center',
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>
                {t('transactions.baseAmount')}
              </span>
              <strong style={{ fontSize: '0.95rem', color: '#334155' }}>
                ₹{baseAmount.toFixed(2)}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>
                {t('transactions.commission')} ({commRate}%)
              </span>
              <strong style={{ fontSize: '0.95rem', color: '#0284c7' }}>
                ₹{commissionAmount.toFixed(2)}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>
                {t('transactions.finalAmount')}
              </span>
              <strong style={{ fontSize: '1.05rem', color: '#16a34a', fontWeight: 800 }}>
                ₹{finalAmount.toFixed(2)}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#15803d', display: 'block' }}>
                {t('billing.paid')}
              </span>
              <strong style={{ fontSize: '0.95rem', color: '#15803d' }}>
                ₹{calculatedPaid.toFixed(2)}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#b91c1c', display: 'block' }}>
                {t('billing.remainingAmount')} (Udhar)
              </span>
              <strong style={{ fontSize: '0.95rem', color: '#b91c1c', fontWeight: 700 }}>
                ₹{calculatedRemaining.toFixed(2)}
              </strong>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="modal-actions" style={{ marginTop: '20px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  {t('common.loading')}
                </span>
              ) : (
                `💾 Save Changes / दुरुस्त करा`
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
