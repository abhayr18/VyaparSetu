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

  // Element Refs for Auto Focus & Arrow Navigation
  const customerRef = useRef(null);
  const vegetableRef = useRef(null);
  const weightRef = useRef(null);
  const rateRef = useRef(null);
  const paymentTypeRef = useRef(null);
  const paymentModeRef = useRef(null);
  const paidInputRef = useRef(null);
  const saveBtnRef = useRef(null);

  // Field focus helpers
  function focusCustomer() {
    customerRef.current?.focus();
    customerRef.current?.select?.();
  }

  function focusVegetable() {
    vegetableRef.current?.focus();
    vegetableRef.current?.select?.();
  }

  function focusWeight() {
    weightRef.current?.focus();
    weightRef.current?.select?.();
  }

  function focusRate() {
    rateRef.current?.focus();
    rateRef.current?.select?.();
  }

  function focusPaymentType() {
    paymentTypeRef.current?.focus();
  }

  function focusPaymentMode() {
    paymentModeRef.current?.focus();
  }

  function focusPaidInput() {
    paidInputRef.current?.focus();
    paidInputRef.current?.select?.();
  }

  function focusSaveBtn() {
    saveBtnRef.current?.focus();
  }

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
      // If vegetable is already selected from a previous entry, jump straight to weight input!
      if (selectedVegetable) {
        setTimeout(() => {
          focusWeight();
        }, 50);
      } else {
        setTimeout(() => {
          focusVegetable();
        }, 50);
      }
    }
  }

  // Handle Vegetable Selection
  function handleSelectVegetable(veg) {
    setSelectedVegetable(veg);
    if (veg) {
      setRate(veg.rate != null ? String(veg.rate) : '');
      setErrors((prev) => ({ ...prev, vegetable: null }));
      setTimeout(() => {
        focusWeight();
      }, 50);
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
      // Mandi workflow: Keep selected vegetable & rate sticky for consecutive customer sales.
      // Reset customer and weight fields for the next buyer.
      setSelectedCustomer(null);
      setWeight('');
      setPaidInput('');
      setPaymentType('Credit');
      setPaymentMode('Cash');
      setErrors({});

      // Clear customer autocomplete
      customerRef.current?.clear();

      // Return focus directly to Customer input for the next buyer
      setTimeout(() => {
        focusCustomer();
      }, 50);
    }
  }

  // KeyDown Navigation Logic
  function handleWeightKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusVegetable();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusRate();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (numWeight > 0) {
        setErrors((prev) => ({ ...prev, weight: null }));
        focusRate();
      } else {
        setErrors((prev) => ({ ...prev, weight: t('transactions.weightRequired') }));
      }
    }
  }

  function handleRateKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusWeight();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusPaymentType();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!isNaN(numRate) && numRate >= 0) {
        setErrors((prev) => ({ ...prev, rate: null }));
        if (paymentType === 'Partial') {
          focusPaidInput();
        } else {
          handleSubmit();
        }
      } else {
        setErrors((prev) => ({ ...prev, rate: t('transactions.rateRequired') }));
      }
    }
  }

  function handlePaymentTypeKeyDown(e) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusRate();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (paymentType !== 'Credit') {
        focusPaymentMode();
      } else {
        focusSaveBtn();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (paymentType === 'Partial') {
        focusPaidInput();
      } else {
        focusSaveBtn();
      }
    }
  }

  function handlePaymentModeKeyDown(e) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPaymentType();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (paymentType === 'Partial') {
        focusPaidInput();
      } else {
        focusSaveBtn();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (paymentType === 'Partial') {
        focusPaidInput();
      } else {
        focusSaveBtn();
      }
    }
  }

  function handlePaidKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusPaymentMode();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusSaveBtn();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSaveBtnKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (paymentType === 'Partial') {
        focusPaidInput();
      } else if (paymentType !== 'Credit') {
        focusPaymentMode();
      } else {
        focusPaymentType();
      }
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusCustomer();
    }
  }

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
          {t('transactions.entryTitle')}
        </h3>
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', background: 'var(--color-bg-light)', padding: '4px 12px', borderRadius: 'var(--border-radius-pill)', border: '1px solid var(--color-border)', fontWeight: 600 }}>
          ⌨️ ← → ↑ ↓ Arrow Keys / Enter to navigate
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
              name="customer"
              customers={customers}
              selectedCustomer={selectedCustomer}
              onSelectCustomer={handleSelectCustomer}
              onNavigateNext={() => {
                if (selectedVegetable) {
                  focusWeight();
                } else {
                  focusVegetable();
                }
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

          {/* Vegetable Input */}
          <div>
            <label htmlFor="vegetable-input" className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
              2. {t('transactions.selectVegetable')} <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <VegetableAutocomplete
              ref={vegetableRef}
              id="vegetable-input"
              name="vegetable"
              vegetables={vegetables}
              selectedVegetable={selectedVegetable}
              onSelectVegetable={handleSelectVegetable}
              onNavigateNext={() => focusWeight()}
              onNavigatePrev={() => focusCustomer()}
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
              name="weight"
              type="number"
              step="any"
              min="0.01"
              className={`input-field ${errors.weight ? 'input-error' : ''}`}
              placeholder={t('transactions.weightPlaceholder') || 'उदा. 10.5 kg'}
              title={t('transactions.weight')}
              value={weight}
              onFocus={(e) => e.target.select()}
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
              name="rate"
              type="number"
              step="any"
              min="0"
              className={`input-field ${errors.rate ? 'input-error' : ''}`}
              placeholder={t('transactions.ratePlaceholder') || 'उदा. 35 ₹/kg'}
              title={t('transactions.rate')}
              value={rate}
              onFocus={(e) => e.target.select()}
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
            <label htmlFor="payment-type-select" className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
              5. {t('billing.paymentStatus')}
            </label>
            <select
              ref={paymentTypeRef}
              id="payment-type-select"
              name="paymentType"
              title={t('billing.paymentStatus')}
              className="input-field"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              onKeyDown={handlePaymentTypeKeyDown}
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
              <label htmlFor="payment-mode-select" className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                {t('credit.paymentMode')}
              </label>
              <select
                ref={paymentModeRef}
                id="payment-mode-select"
                name="paymentMode"
                title={t('credit.paymentMode')}
                className="input-field"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                onKeyDown={handlePaymentModeKeyDown}
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
              <label htmlFor="paid-input" className="form-label" style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                {t('billing.paid')} (₹)
              </label>
              <input
                ref={paidInputRef}
                id="paid-input"
                name="paidAmount"
                type="number"
                step="any"
                min="0"
                max={finalAmount}
                className="input-field"
                placeholder={t('transactions.paidPlaceholder') || 'उदा. 500 ₹'}
                title={t('billing.paid')}
                value={paidInput}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setPaidInput(e.target.value)}
                onKeyDown={handlePaidKeyDown}
                style={{ fontSize: '1rem', padding: '0.65rem 0.85rem' }}
              />
            </div>
          )}
        </div>

        {/* Calculated Financial Summaries Panel & Action Bar */}
        <div
          style={{
            marginTop: '1.5rem',
            padding: '1.25rem',
            background: 'var(--color-bg-light)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}
        >
          {/* 5 Financial Metric Chips - Evenly Distributed Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.85rem',
              width: '100%'
            }}
          >
            {/* 1. Base Amount */}
            <div style={{ background: 'var(--color-surface)', padding: '0.75rem 1rem', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', display: 'block', fontWeight: 600, marginBottom: '4px' }}>
                {t('transactions.baseAmount')}
              </span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--color-text-primary)' }}>
                ₹{baseAmount.toFixed(2)}
              </strong>
            </div>

            {/* 2. Commission */}
            <div style={{ background: 'var(--color-surface)', padding: '0.75rem 1rem', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.74rem', color: '#4338ca', display: 'block', fontWeight: 600, marginBottom: '4px' }}>
                {t('transactions.commission')} ({formatCommissionPercent(commissionRate)})
              </span>
              <strong style={{ fontSize: '1.15rem', color: '#4338ca' }}>
                ₹{commissionAmount.toFixed(2)}
              </strong>
            </div>

            {/* 3. Final Amount */}
            <div style={{ background: 'var(--color-success-bg)', padding: '0.75rem 1rem', borderRadius: 'var(--border-radius-sm)', border: '1px solid #86efac', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.74rem', color: '#15803d', display: 'block', fontWeight: 700, marginBottom: '4px' }}>
                {t('transactions.finalAmount')}
              </span>
              <strong style={{ fontSize: '1.25rem', color: '#15803d', fontWeight: 800 }}>
                ₹{finalAmount.toFixed(2)}
              </strong>
            </div>

            {/* 4. Paid Amount */}
            <div style={{ background: 'var(--color-surface)', padding: '0.75rem 1rem', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.74rem', color: '#15803d', display: 'block', fontWeight: 600, marginBottom: '4px' }}>
                {t('billing.paid')}
              </span>
              <strong style={{ fontSize: '1.15rem', color: '#15803d' }}>
                ₹{calculatedPaid.toFixed(2)}
              </strong>
            </div>

            {/* 5. Remaining Udhar */}
            <div style={{ background: calculatedRemaining > 0 ? '#fef2f2' : 'var(--color-surface)', padding: '0.75rem 1rem', borderRadius: 'var(--border-radius-sm)', border: calculatedRemaining > 0 ? '1px solid #fca5a5' : '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.74rem', color: '#dc2626', display: 'block', fontWeight: 700, marginBottom: '4px' }}>
                {t('billing.remainingAmount')} (Udhar)
              </span>
              <strong style={{ fontSize: '1.2rem', color: '#dc2626', fontWeight: 800 }}>
                ₹{calculatedRemaining.toFixed(2)}
              </strong>
            </div>
          </div>

          {/* Action Row - Save Button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border-light)', paddingTop: '1rem' }}>
            <button
              ref={saveBtnRef}
              id="save-transaction-btn"
              type="submit"
              disabled={loading}
              onKeyDown={handleSaveBtnKeyDown}
              className="btn btn-primary"
              style={{
                padding: '0.85rem 2.2rem',
                fontSize: '1rem',
                fontWeight: 700,
                borderRadius: 'var(--border-radius-pill)',
                minWidth: '240px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 14px rgba(20, 110, 245, 0.3)',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16, borderTopColor: '#ffffff' }} />
                  <span>{t('transactions.saving')}...</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '1.15rem' }}>💾</span>
                  <span>{t('transactions.saveTransaction')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
