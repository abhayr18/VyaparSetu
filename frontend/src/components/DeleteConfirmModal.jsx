/**
 * DeleteConfirmModal Component
 * Generic confirmation dialog for destructive actions.
 * Props:
 *  - isOpen        {boolean}
 *  - onClose       {function}
 *  - onConfirm     {function}
 *  - title         {string}
 *  - message       {string}
 *  - subMessage    {string}
 *  - loading       {boolean}
 */

import { useTranslation } from '../hooks/useTranslation';
import { TrashIcon } from './Icons';

export default function DeleteConfirmModal({
  isOpen, onClose, onConfirm,
  title, message, subMessage,
  loading = false,
}) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal modal-sm" role="dialog" id="delete-confirm-modal">
        <div className="modal-header">
          <h2 className="modal-title" style={{ color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrashIcon /> {title}
          </h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '4px 0 20px' }}>
          <p style={{ fontSize: '0.95rem', color: 'var(--color-text-primary)', marginBottom: 8 }}>
            {message}
          </p>
          {subMessage && (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
              {subMessage}
            </p>
          )}
        </div>

        <div className="modal-actions">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={loading}
            id="delete-cancel-btn"
          >
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={loading}
            id="delete-confirm-btn"
          >
            {loading ? (
              <span className="flex flex-center gap-sm">
                <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'white' }} />
                {t('common.loading')}
              </span>
            ) : (
              <span className="flex flex-center gap-sm">
                <TrashIcon />
                {t('common.delete')}
              </span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
