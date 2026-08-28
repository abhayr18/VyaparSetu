/**
 * TransactionEntry Component (MODULE A)
 * Customer-wise Vegetable Transaction Entry Interface
 * 
 * Features:
 * - Keyboard-first workflow: Customer -> Vegetable -> Weight -> Rate -> Save -> Reset & Focus Customer
 * - Payment Type Selector: Paid (Full), Credit (Udhar), Partial
 * - Payment Mode Selector: Cash, UPI, Other
 * - Live Payment Calculations (Paid Amount vs Remaining Udhar)
 * - Commission calculated at the shop's configured rate & total computation
 * - Read-only calculated fields (Base Amount, Commission, Final Amount)
 * - Non-blocking toast feedback
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import CustomerAutocomplete from './CustomerAutocomplete';
import VegetableAutocomplete from './VegetableAutocomplete';
import {
  calculateTransactionTotals,
  formatCommissionPercent,
  DEFAULT_COMMISSION_PERCENT,
} from '../utils/money';

export default function TransactionEntry({
  customers = [],
  vegetables = [],
  onSubmitTransaction,
  loading = false,
  onCustomerSelectForHistory,
  commissionRate = DEFAULT_COMMISSION_PERCENT
}) {
  const { t } = useTranslation();

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedVegetable, setSelectedVegetable] = useState(null);
  const [weight, setWeight] = useState('');
  const [rate, setRate] = useState('');
  const [paymentType, setPaymentType] = useState('Credit'); // 'Paid', 'Credit', 'Partial'
  const [paymentMode, setPaymentMode] = useState('Cash');  // 'Cash', 'UPI', 'Other'
  const [paidInput, setPaidInput] = useState('');
  const [errors, setErrors] = useState({});

  // Element Refs for Auto Focus Navigation
  const customerRef = useRef(null);
  const vegetableRef = useRef(null);
  const weightRef = useRef(null);
  const rateRef = useRef(null);
  const paidInputRef = useRef(null);
  const saveBtnRef = useRef(null);

  // Auto focus Customer input on component mount
  useEffect(() => {
    const timer = setTimeout(() => {
      customerRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Calculate totals in real-time, at the shop's configured commission rate.
  // The server recalculates from the same setting, so what is shown here is what
  // gets saved.
  const numWeight = parseFloat(weight) || 0;
  const numRate = parseFloat(rate) || 0;
  const { baseAmount, commissionAmount, finalAmount } = calculateTransactionTotals(
    numWeight,
    numRate,
    commissionRate
  );

  // Paid & Remaining calculations
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
    // Credit
    calculatedPaid = 0;
    calculatedRemaining = finalAmount;
  }

  // Handle Customer Selection
  function handleSelectCustomer(customer) {
    setSelectedCustomer(customer);
    if (customer && onCustomerSelectForHistory) {
      onCustomerSelectForHistory(customer.id);
    }
    if (customer) {
      setErrors((prev) => ({ ...prev, customer: null }));
      setTimeout(() => vegetableRef.current?.focus(), 50);
    }
  }

  // Handle Vegetable Selection
  function handleSelectVegetable(veg) {
    setSelectedVegetable(veg);
    if (veg) {
      setRate(veg.rate != null ? String(veg.rate) : '');
      setErrors((prev) => ({ ...prev, vegetable: null }));
      setTimeout(() => weightRef.current?.focus(), 50);
    }
  }

  // Form Validation
  function validate() {
    const errs = {};
    if (!selectedCustomer) {
      errs.customer = t('transactions.customerRequired');
    }
    if (!selectedVegetable) {
      errs.vegetable = t('transactions.vegetableRequired');
    }
    if (isNaN(numWeight) || numWeight <= 0) {
      errs.weight = t('transactions.weightRequired');
    }
    if (isNaN(numRate) || numRate < 0) {
      errs.rate = t('transactions.rateRequired');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // Submit Handler
  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!validate()) return;

    const payload = {
      customer_id: selectedCustomer.id,
      vegetable_id: selectedVegetable.id,
      vegetable_name_snapshot: selectedVegetable.name,
      weight: numWeight,
      rate: numRate,
      unit: selectedVegetable.unit || 'kg',
      payment_type: paymentType,
      payment_mode: paymentType === 'Credit' ? 'Credit' : paymentMode,
      paid_amount: calculatedPaid,
      remaining_amount: calculatedRemaining
    };

    const res = await onSubmitTransaction(payload);
    if (res?.success) {
      // Keep selectedCustomer sticky for rapid multi-vegetable entry.
      // Reset only the vegetable and line details.
      setSelectedVegetable(null);
      setWeight('');
      setRate('');
      setPaidInput('');
      setPaymentType('Credit');
      setPaymentMode('Cash');
      setErrors({});

      // Clear vegetable autocomplete
      vegetableRef.current?.clear();

      // Return focus directly to Vegetable input for next item of this customer
      setTimeout(() => {
        vegetableRef.current?.focus();
      }, 50);
    }
  }

  // KeyDown Navigation Logic
  function handleWeightKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (numWeight > 0) {
        setErrors((prev) => ({ ...prev, weight: null }));
        rateRef.current?.focus();
        rateRef.current?.select();
      } else {
        setErrors((prev) => ({ ...prev, weight: t('transactions.weightRequired') }));
      }
    }
  }

  function handleRateKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!isNaN(numRate) && numRate >= 0) {
        setErrors((prev) => ({ ...prev, rate: null }));
        if (paymentType === 'Partial') {
          paidInputRef.current?.focus();
          paidInputRef.current?.select();
        } else {
          handleSubmit();
        }
      } else {
        setErrors((prev) => ({ ...prev, rate: t('transactions.rateRequired') }));
      }
    }
  }

  function handlePaidKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
          {t('transactions.entryTitle')}
        </h3>
        <span style={{ fontSize: '0.8rem', color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px' }}>
          ⌨️ Keyboard-First (Type → Enter → Save)
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {/* Customer Input */}
          <div>
            <label htmlFor="customer-input" className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
              1. {t('transactions.selectCustomer')} <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <CustomerAutocomplete
              ref={customerRef}
              id="customer-input"
              customers={customers}
              selectedCustomer={selectedCustomer}
              onSelectCustomer={handleSelectCustomer}
              placeholder={t('transactions.selectCustomer')}
              hasError={!!errors.customer}
            />
            {errors.customer && (
              <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '2px', display: 'block' }}>
                {errors.customer}
              </span>
            )}
          </div>

          {/* Vegetable Input */}
          <div>
            <label htmlFor="vegetable-input" className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
              2. {t('transactions.selectVegetable')} <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <VegetableAutocomplete
              ref={vegetableRef}
              id="vegetable-input"
              vegetables={vegetables}
              selectedVegetable={selectedVegetable}
              onSelectVegetable={handleSelectVegetable}
              placeholder={t('transactions.selectVegetable')}
              hasError={!!errors.vegetable}
            />
            {errors.vegetable && (
              <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '2px', display: 'block' }}>
                {errors.vegetable}
              </span>
            )}
          </div>

          {/* Weight Input */}
          <div>
            <label htmlFor="weight-input" className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
              3. {t('transactions.weight')} <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              ref={weightRef}
              id="weight-input"
              type="number"
              step="any"
              min="0.01"
              className={`input-field ${errors.weight ? 'input-error' : ''}`}
              placeholder="e.g. 10"
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value);
                setErrors((prev) => ({ ...prev, weight: null }));
              }}
              onKeyDown={handleWeightKeyDown}
              style={{ fontSize: '1.05rem', padding: '0.65rem 0.85rem' }}
            />
            {errors.weight && (
              <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '2px', display: 'block' }}>
                {errors.weight}
              </span>
            )}
          </div>

          {/* Rate Input */}
          <div>
            <label htmlFor="rate-input" className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
              4. {t('transactions.rate')} <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              ref={rateRef}
              id="rate-input"
              type="number"
              step="any"
              min="0"
              className={`input-field ${errors.rate ? 'input-error' : ''}`}
              placeholder="e.g. 30"
              value={rate}
              onChange={(e) => {
                setRate(e.target.value);
                setErrors((prev) => ({ ...prev, rate: null }));
              }}
              onKeyDown={handleRateKeyDown}
              style={{ fontSize: '1.05rem', padding: '0.65rem 0.85rem' }}
            />
            {errors.rate && (
              <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '2px', display: 'block' }}>
                {errors.rate}
              </span>
            )}
          </div>

          {/* Payment Type Selector (Credit, Paid, Partial) */}
          <div>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
              5. {t('billing.paymentStatus')}
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

          {/* Payment Mode Selector (Cash, UPI, Other) */}
          {paymentType !== 'Credit' && (
            <div>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                {t('credit.paymentMode')}
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

          {/* Paid Amount Input (Shown when Partial is selected) */}
          {paymentType === 'Partial' && (
            <div>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                {t('billing.paid')} (₹)
              </label>
              <input
                ref={paidInputRef}
                type="number"
                step="any"
                min="0"
                max={finalAmount}
                className="input-field"
                placeholder="Enter paid amount"
                value={paidInput}
                onChange={(e) => setPaidInput(e.target.value)}
                onKeyDown={handlePaidKeyDown}
                style={{ fontSize: '1rem', padding: '0.65rem 0.85rem' }}
              />
            </div>
          )}
        </div>

        {/* Calculated Financial Summaries Panel (Read-only) */}
        <div
          style={{
            marginTop: '1.25rem',
            padding: '0.85rem 1rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.85rem',
            alignItems: 'center'
          }}
        >
          <div>
            <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
              {t('transactions.baseAmount')}
            </span>
            <strong style={{ fontSize: '1.05rem', color: '#334155' }}>
              ₹{baseAmount.toFixed(2)}
            </strong>
          </div>

          <div>
            <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
              {t('transactions.commission')} ({formatCommissionPercent(commissionRate)})
            </span>
            <strong style={{ fontSize: '1.05rem', color: '#0284c7' }}>
              ₹{commissionAmount.toFixed(2)}
            </strong>
          </div>

          <div>
            <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
              {t('transactions.finalAmount')}
            </span>
            <strong style={{ fontSize: '1.2rem', color: '#16a34a', fontWeight: 800 }}>
              ₹{finalAmount.toFixed(2)}
            </strong>
          </div>

          <div>
            <span style={{ fontSize: '0.8rem', color: '#15803d', display: 'block' }}>
              {t('billing.paid')}
            </span>
            <strong style={{ fontSize: '1.05rem', color: '#15803d' }}>
              ₹{calculatedPaid.toFixed(2)}
            </strong>
          </div>

          <div>
            <span style={{ fontSize: '0.8rem', color: '#b91c1c', display: 'block' }}>
              {t('billing.remainingAmount')} (Udhar)
            </span>
            <strong style={{ fontSize: '1.05rem', color: '#b91c1c', fontWeight: 700 }}>
              ₹{calculatedRemaining.toFixed(2)}
            </strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button
              ref={saveBtnRef}
              id="save-transaction-btn"
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                padding: '0.65rem 1.25rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                width: '100%'
              }}
            >
              {loading ? t('transactions.saving') : `💾 ${t('transactions.saveTransaction')}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
