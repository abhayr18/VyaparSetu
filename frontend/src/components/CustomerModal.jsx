/**
 * CustomerModal Component
 * Handles both Add and Edit customer in a single modal form.
 *
 * The name field is structured so a future <MarathiInput> component
 * can replace <input> without changing surrounding code.
 *
 * Props:
 *  - isOpen       {boolean}
 *  - onClose      {function}
 *  - onSubmit     {function(data): Promise<{success, error?}>}
 *  - customer     {object|null}  — null for Add, populated for Edit
 */

import { useState, useEffect } from 'react';
import MarathiInput from './MarathiInput';
import { useTranslation } from '../hooks/useTranslation';
import { AlertIcon } from './Icons';
import { getLocalDateString, formatDDMMYYYY, parseDDMMYYYY } from '../utils/dates';

const EMPTY_FORM = {
  name: '',
  mobile: '',
  address: '',
  search_keywords: '',
  notes: '',
  opening_balance: '',
  opening_balance_date: '',
};

export default function CustomerModal({ isOpen, onClose, onSubmit, customer }) {
  const { t } = useTranslation();
  const isEdit = Boolean(customer);

  const [form, setForm]       = useState(EMPTY_FORM);
  const [errors, setErrors]   = useState({});
  const [saving, setSaving]   = useState(false);
  const [apiError, setApiError] = useState('');

  // Populate form when editing or adding
  useEffect(() => {
    if (isOpen) {
      if (customer) {
        let obDate = '';
        if (customer.opening_balance_date) {
          obDate = String(customer.opening_balance_date).slice(0, 10);
        }
        setForm({
          name: customer.name || '',
          mobile: customer.mobile || '',
          address: customer.address || '',
          search_keywords: customer.search_keywords || '',
          notes: customer.notes || '',
          opening_balance:
            customer.opening_balance !== undefined &&
            customer.opening_balance !== null &&
            Number(customer.opening_balance) > 0
              ? String(customer.opening_balance)
              : '',
          opening_balance_date: obDate || getLocalDateString(),
        });
      } else {
        setForm({ ...EMPTY_FORM, opening_balance_date: getLocalDateString() });
      }
      setErrors({});
      setApiError('');
    }
  }, [isOpen, customer]);

  if (!isOpen) return null;

  // ─── Client-side validation ────────────────────────────────────────────────
  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = t('customers.nameRequired');
    if (form.mobile.trim() && !/^\d{10}$/.test(form.mobile.trim())) {
      errs.mobile = t('customers.mobileInvalid');
    }

    const opening = form.opening_balance.trim();
    if (opening !== '') {
      const amount = Number(opening);
      if (!Number.isFinite(amount) || amount < 0) {
        errs.opening_balance = t('customers.openingBalanceInvalid');
      }
    }
    return errs;
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    setApiError('');

    const opening = form.opening_balance.trim();
    const payload = {
      name:            form.name.trim(),
      mobile:          form.mobile.trim(),
      address:         form.address.trim(),
      search_keywords: form.search_keywords.trim(),
      notes:           form.notes.trim(),
      opening_balance: opening !== '' ? opening : '0',
      opening_balance_date: form.opening_balance_date || undefined,
    };

    const result = await onSubmit(payload);

    setSaving(false);

    if (result.success) {
      onClose();
    } else {
      setApiError(result.error || t('common.error'));
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="modal-backdrop" onClick={onClose} />

      {/* Modal */}
      <div className="modal" role="dialog" aria-modal="true" id="customer-modal">
        <div className="modal-header">
          <h2 className="modal-title">
            {isEdit ? t('customers.editCustomer') : t('customers.addCustomer')}
          </h2>
          <button className="modal-close-btn" onClick={onClose} id="modal-close-btn">✕</button>
        </div>

        {apiError && (
          <div className="form-api-error" id="form-api-error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertIcon style={{ flexShrink: 0 }} /> {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* ── Customer Name (MarathiInput — Module 3) ───────────────────── */}
          <div className="form-group">
            <label className="form-label" htmlFor="customer-name">
              {t('customers.name')} <span className="required-star">*</span>
            </label>
            <MarathiInput
              id="customer-name"
              name="name"
              value={form.name}
              onChange={(val) => {
                setForm((prev) => ({ ...prev, name: val }));
                if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
              }}
              placeholder={t('customers.namePlaceholder')}
              hasError={Boolean(errors.name)}
              autoFocus
              label={t('transliteration.suggestionsLabel')}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          {/* ── Mobile ───────────────────────────────────────────────────── */}
          <div className="form-group">
            <label className="form-label" htmlFor="customer-mobile">
              {t('customers.mobile')}
            </label>
            <input
              id="customer-mobile"
              name="mobile"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className={`form-input${errors.mobile ? ' input-error' : ''}`}
              placeholder={t('customers.mobilePlaceholder')}
              value={form.mobile}
              onChange={handleChange}
            />
            {errors.mobile && <span className="field-error">{errors.mobile}</span>}
          </div>

          {/* ── Address ──────────────────────────────────────────────────── */}
          <div className="form-group">
            <label className="form-label" htmlFor="customer-address">
              {t('customers.address')}
            </label>
            <MarathiInput
              id="customer-address"
              name="address"
              value={form.address}
              onChange={(val) => setForm((prev) => ({ ...prev, address: val }))}
              placeholder={t('customers.addressPlaceholder')}
              label={t('transliteration.suggestionsLabel')}
            />
          </div>

          {/* ── Search Keywords / Aliases ─────────────────────────────────── */}
          <div className="form-group">
            <label className="form-label" htmlFor="customer-keywords">
              {t('customers.searchKeywords')}
            </label>
            <MarathiInput
              id="customer-keywords"
              name="search_keywords"
              value={form.search_keywords}
              onChange={(val) => setForm((prev) => ({ ...prev, search_keywords: val }))}
              placeholder={t('customers.searchKeywordsPlaceholder')}
              label={t('transliteration.suggestionsLabel')}
            />
            <span className="field-hint">{t('customers.searchKeywordsHelp')}</span>
          </div>

          {/* ── Notes ────────────────────────────────────────────────────── */}
          <div className="form-group">
            <label className="form-label" htmlFor="customer-notes">
              {t('customers.notes')}
            </label>
            <MarathiInput
              id="customer-notes"
              name="notes"
              value={form.notes}
              onChange={(val) => setForm((prev) => ({ ...prev, notes: val }))}
              placeholder={t('customers.notesPlaceholder')}
              label={t('transliteration.suggestionsLabel')}
            />
          </div>

          {/* ── Opening Balance & Date ─────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="customer-opening-balance">
                {t('customers.openingBalance')}
              </label>
              <input
                id="customer-opening-balance"
                name="opening_balance"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                className={`form-input${errors.opening_balance ? ' input-error' : ''}`}
                placeholder="0.00"
                value={form.opening_balance}
                onChange={handleChange}
              />
              {errors.opening_balance
                ? <span className="field-error">{errors.opening_balance}</span>
                : <span className="field-hint">{t('customers.openingBalanceHint')}</span>}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="form-label" htmlFor="customer-opening-balance-date" style={{ margin: 0 }}>
                  {t('customers.openingBalanceDate')} <span style={{ fontSize: '0.75rem', color: '#6366f1' }}>(DD/MM/YYYY)</span>
                </label>
                <span style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: 700, background: '#eff6ff', padding: '1px 6px', borderRadius: '4px' }}>
                  {formatDDMMYYYY(form.opening_balance_date || getLocalDateString())}
                </span>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="customer-opening-balance-date"
                  name="opening_balance_date_text"
                  type="text"
                  placeholder="DD/MM/YYYY"
                  className="form-input"
                  value={formatDDMMYYYY(form.opening_balance_date || getLocalDateString())}
                  onChange={(e) => {
                    const val = e.target.value;
                    const iso = parseDDMMYYYY(val);
                    setForm((prev) => ({
                      ...prev,
                      opening_balance_date: iso || val
                    }));
                  }}
                  onBlur={(e) => {
                    const iso = parseDDMMYYYY(e.target.value);
                    setForm((prev) => ({
                      ...prev,
                      opening_balance_date: iso || getLocalDateString()
                    }));
                  }}
                  style={{ paddingRight: '2.4rem' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    try {
                      document.getElementById('hidden-ob-date-picker')?.showPicker?.();
                    } catch {
                      document.getElementById('hidden-ob-date-picker')?.focus();
                    }
                  }}
                  style={{
                    position: 'absolute',
                    right: 8,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    padding: '2px 4px',
                    lineHeight: 1
                  }}
                  title="कॅलेंडर उघडा (Open Calendar)"
                  tabIndex={-1}
                >
                  📅
                </button>
                <input
                  id="hidden-ob-date-picker"
                  type="date"
                  max={getLocalDateString()}
                  value={parseDDMMYYYY(form.opening_balance_date) || form.opening_balance_date || getLocalDateString()}
                  onChange={(e) => {
                    if (e.target.value) {
                      setForm((prev) => ({ ...prev, opening_balance_date: e.target.value }));
                    }
                  }}
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    pointerEvents: 'none',
                    width: 0,
                    height: 0
                  }}
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>
              <span className="field-hint">
                {t('customers.openingBalanceDateHint')} ({formatDDMMYYYY(form.opening_balance_date || getLocalDateString())})
              </span>
            </div>
          </div>

          {/* ── Actions ──────────────────────────────────────────────────── */}
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={saving}
              id="modal-cancel-btn"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
              id="modal-save-btn"
            >
              {saving ? (
                <span className="flex flex-center gap-sm">
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  {t('common.loading')}
                </span>
              ) : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
