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

const EMPTY_FORM = { name: '', mobile: '', address: '', notes: '' };

export default function CustomerModal({ isOpen, onClose, onSubmit, customer }) {
  const { t } = useTranslation();
  const isEdit = Boolean(customer);

  const [form, setForm]       = useState(EMPTY_FORM);
  const [errors, setErrors]   = useState({});
  const [saving, setSaving]   = useState(false);
  const [apiError, setApiError] = useState('');

  // Populate form when editing
  useEffect(() => {
    if (isOpen) {
      setForm(customer
        ? { name: customer.name, mobile: customer.mobile, address: customer.address || '', notes: customer.notes || '' }
        : EMPTY_FORM
      );
      setErrors({});
      setApiError('');
    }
  }, [isOpen, customer]);

  if (!isOpen) return null;

  // ─── Client-side validation ────────────────────────────────────────────────
  function validate() {
    const errs = {};
    if (!form.name.trim())   errs.name   = t('customers.nameRequired');
    if (!form.mobile.trim()) errs.mobile = t('customers.mobileRequired');
    else if (!/^\d{10}$/.test(form.mobile.trim())) errs.mobile = t('customers.mobileInvalid');
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

    const result = await onSubmit({
      name:    form.name.trim(),
      mobile:  form.mobile.trim(),
      address: form.address.trim(),
      notes:   form.notes.trim(),
    });

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
              {t('customers.mobile')} <span className="required-star">*</span>
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
            <input
              id="customer-address"
              name="address"
              type="text"
              className="form-input"
              placeholder={t('customers.addressPlaceholder')}
              value={form.address}
              onChange={handleChange}
            />
          </div>

          {/* ── Notes ────────────────────────────────────────────────────── */}
          <div className="form-group">
            <label className="form-label" htmlFor="customer-notes">
              {t('customers.notes')}
            </label>
            <textarea
              id="customer-notes"
              name="notes"
              rows={2}
              className="form-input form-textarea"
              placeholder={t('customers.notesPlaceholder')}
              value={form.notes}
              onChange={handleChange}
            />
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
