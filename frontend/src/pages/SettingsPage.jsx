/**
 * SettingsPage — Vyapar Business Settings-style
 * Section-grouped form cards: Business Info / Billing Setup / Preferences / Backup
 */

import { useState, useEffect } from 'react';
import useSettings from '../hooks/useSettings';
import { useTranslation } from '../hooks/useTranslation';
import { AlertIcon, CheckIcon, BuildingIcon, ChartIcon, CogIcon, CloudIcon, SaveIcon } from '../components/Icons';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { settings, loading, saving, error: apiError, success, saveSettings } = useSettings();

  const [form, setForm] = useState({
    vendor_name: '', owner_name: '', mobile_number: '',
    address: '', commission_rate: '8',
    default_payment_mode: 'Cash', language: 'en',
  });
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (settings) {
      setForm({
        vendor_name:          settings.vendor_name || '',
        owner_name:           settings.owner_name || '',
        mobile_number:        settings.mobile_number || '',
        address:              settings.address || '',
        commission_rate:      settings.commission_rate || '8',
        default_payment_mode: settings.default_payment_mode || 'Cash',
        language:             settings.language || 'en',
      });
    }
  }, [settings]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    const rate = parseFloat(form.commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      setValidationError(t('settings.commissionError') || 'Commission must be 0–100%.');
      return;
    }
    if (form.mobile_number && !/^\d{10}$/.test(form.mobile_number)) {
      setValidationError(t('customers.mobileInvalid') || 'Mobile must be 10 digits.');
      return;
    }
    try { await saveSettings(form); }
    catch (err) { console.error('Failed to save settings:', err); }
  };

  if (loading) {
    return (
      <div className="flex flex-center" style={{ minHeight: '60vh', gap: 10 }}>
        <span className="spinner" /> {t('common.loading')}
      </div>
    );
  }

  const hasAlert = success || apiError || validationError;
  const isError  = !!(apiError || validationError);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', animation: 'pageIn 0.2s ease' }}>

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="page-header-bar" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-desc">{t('settings.subtitle')}</p>
        </div>
      </div>

      {/* ── Alert Banner ──────────────────────────────────────────────────── */}
      {hasAlert && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: isError ? 'var(--color-error-bg)' : 'var(--color-success-bg)',
          color: isError ? 'var(--color-error)' : 'var(--color-success)',
          padding: '10px 16px', borderRadius: 'var(--border-radius-sm)',
          marginBottom: 20, fontSize: '0.875rem', fontWeight: 500,
          border: `1px solid ${isError ? 'var(--color-error)' : 'var(--color-success)'}20`,
        }}>
          {isError
            ? <AlertIcon style={{ flexShrink: 0 }} />
            : <CheckIcon style={{ flexShrink: 0 }} />}
          {validationError || (apiError || t('settings.saveSuccess'))}
        </div>
      )}

      <form onSubmit={handleSubmit}>

        {/* ── Section 1: Business Profile ───────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-icon" style={{ background: '#dcfce7' }}>
              <BuildingIcon style={{ color: 'var(--color-primary)', width: '16px', height: '16px' }} />
            </div>
            <span className="settings-section-title">{t('settings.businessProfile')}</span>
          </div>
          <div className="settings-section-body">
            <div className="form-group">
              <label htmlFor="vendor_name" className="form-label">{t('settings.businessName')}</label>
              <input type="text" id="vendor_name" name="vendor_name" value={form.vendor_name}
                onChange={handleChange} placeholder="e.g. Mahalaxmi Vegetables"
                className="form-input" disabled={saving} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div className="form-group">
                <label htmlFor="owner_name" className="form-label">{t('settings.ownerName')}</label>
                <input type="text" id="owner_name" name="owner_name" value={form.owner_name}
                  onChange={handleChange} placeholder="Owner Name" className="form-input" disabled={saving} />
              </div>
              <div className="form-group">
                <label htmlFor="mobile_number" className="form-label">{t('settings.mobileNumber')}</label>
                <input type="text" id="mobile_number" name="mobile_number" value={form.mobile_number}
                  onChange={handleChange} placeholder="10-digit mobile" className="form-input" disabled={saving} />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="address" className="form-label">{t('settings.address')}</label>
              <textarea id="address" name="address" value={form.address}
                onChange={handleChange} placeholder="Shop Address"
                className="form-input" rows="3"
                style={{ fontFamily: 'inherit', resize: 'vertical' }} disabled={saving} />
            </div>
          </div>
        </div>

        {/* ── Section 2: Billing Setup ──────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-icon" style={{ background: '#dcfce7' }}>
              <ChartIcon style={{ color: 'var(--color-success)', width: '16px', height: '16px' }} />
            </div>
            <span className="settings-section-title">{t('settings.billingSetup')}</span>
          </div>
          <div className="settings-section-body">
            <div className="form-group" style={{ maxWidth: 300, marginBottom: 0 }}>
              <label htmlFor="commission_rate" className="form-label">{t('settings.commissionRate')}</label>
              <div style={{ position: 'relative' }}>
                <input type="number" id="commission_rate" name="commission_rate"
                  step="0.1" min="0" max="100" value={form.commission_rate}
                  onChange={handleChange} className="form-input" disabled={saving}
                  style={{ paddingRight: 32 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>%</span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Applied as commission on each sale/bill
              </p>
            </div>
          </div>
        </div>

        {/* ── Section 3: Preferences ────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-icon" style={{ background: '#ede9fe' }}>
              <CogIcon style={{ color: '#7c3aed', width: '16px', height: '16px' }} />
            </div>
            <span className="settings-section-title">{t('settings.preferences')}</span>
          </div>
          <div className="settings-section-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="default_payment_mode" className="form-label">{t('settings.defaultPaymentMode')}</label>
                <select id="default_payment_mode" name="default_payment_mode" value={form.default_payment_mode}
                  onChange={handleChange} className="form-input form-select" disabled={saving}>
                  <option value="Cash">{t('billing.paymentTypeCash')}</option>
                  <option value="UPI">{t('billing.paymentTypeUPI')}</option>
                  <option value="Credit">{t('billing.paymentTypeCredit')}</option>
                  <option value="Partial">{t('billing.paymentTypePartial')}</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="language" className="form-label">{t('settings.defaultLanguage')}</label>
                <select id="language" name="language" value={form.language}
                  onChange={handleChange} className="form-input form-select" disabled={saving}>
                  <option value="en">{t('common.english')}</option>
                  <option value="mr">{t('common.marathi')}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 4: Backup Info ────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-icon" style={{ background: '#dbeafe' }}>
              <CloudIcon style={{ color: '#2563eb', width: '16px', height: '16px' }} />
            </div>
            <span className="settings-section-title">{t('nav.backup')}</span>
          </div>
          <div className="settings-section-body">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <div>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)', marginBottom: 4, fontWeight: 700 }}>
                  {t('settings.backupFolder')}
                </div>
                <code style={{ background: 'var(--color-bg)', padding: '5px 10px', borderRadius: 6, fontSize: '0.82rem', border: '1px solid var(--color-border)' }}>
                  /backups
                </code>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)', marginBottom: 4, fontWeight: 700 }}>
                  {t('backup.googleDrive')}
                </div>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                  Manage in <strong>Backup</strong> section
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Save Button ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
          <button id="save-settings-btn" type="submit" className="btn btn-primary"
            style={{ padding: '10px 28px', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: 7 }}
            disabled={saving}>
            {saving
              ? <><span className="spinner" style={{ width: 13, height: 13 }} /> {t('settings.saving')}</>
              : <><SaveIcon style={{ width: '15px', height: '15px' }} /> {t('common.save')}</>}
          </button>
        </div>
      </form>
    </div>
  );
}
