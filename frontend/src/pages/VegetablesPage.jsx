/**
 * VegetablesPage — Vyapar Items-style
 * KPI cards + Grid/List view toggle + cleaner card/list rows
 */

import { useState, useCallback } from 'react';
import { useVegetables } from '../hooks/useVegetables';
import { useTranslation } from '../hooks/useTranslation';
import VegetableModal from '../components/VegetableModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import MarathiInput from '../components/MarathiInput';
import { LeafIcon, EditIcon, TrashIcon, ReceiptIcon, SearchIcon, AlertIcon } from '../components/Icons';

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

// ─── Grid Icon SVGs ────────────────────────────────────────────────────────────
const GridViewIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const ListViewIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);

// ─── Vegetable Grid Card ───────────────────────────────────────────────────────
function VegetableCard({ veg, onEdit, onDelete, t }) {
  return (
    <div className="veg-card" id={`veg-card-${veg.id}`}>
      <div className="veg-card-header">
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LeafIcon style={{ color: 'var(--color-primary)', width: '17px', height: '17px' }} />
        </div>
        <div className="veg-card-actions">
          <button className="btn-icon btn-icon-edit" onClick={() => onEdit(veg)} title={t('common.edit')} id={`veg-edit-${veg.id}`}>
            <EditIcon />
          </button>
          <button className="btn-icon btn-icon-delete" onClick={() => onDelete(veg)} title={t('common.delete')} id={`veg-delete-${veg.id}`}>
            <TrashIcon />
          </button>
        </div>
      </div>
      <div className="veg-name">{veg.name}</div>
      <div className="veg-rate">
        <span className="veg-rate-value">₹{Number(veg.rate).toFixed(2)}</span>
        <span className="unit-badge">/{veg.unit}</span>
      </div>
      {veg.search_keywords && (
        <div className="veg-keywords">
          {veg.search_keywords.split(',').map((kw, i) => (
            <span key={i} className="keyword-chip">{kw.trim()}</span>
          ))}
        </div>
      )}
      <div className="veg-date text-sm text-muted">
        {new Date(veg.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
      </div>
    </div>
  );
}

// ─── Vegetable List Row ────────────────────────────────────────────────────────
function VegetableListRow({ veg, onEdit, onDelete, t }) {
  return (
    <div className="veg-list-row" id={`veg-row-${veg.id}`}>
      <div className="veg-list-icon">
        <LeafIcon style={{ width: '16px', height: '16px' }} />
      </div>
      <div style={{ flex: 1 }}>
        <div className="veg-list-name">{veg.name}</div>
        {veg.search_keywords && (
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
            {veg.search_keywords.split(',').slice(0, 3).map(k => k.trim()).join(' · ')}
          </div>
        )}
      </div>
      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginRight: 8 }}>{veg.unit}</span>
      <span className="veg-list-rate">₹{Number(veg.rate).toFixed(2)}</span>
      <div className="veg-list-actions">
        <button className="btn-icon btn-icon-edit" onClick={() => onEdit(veg)} title={t('common.edit')} id={`veg-edit-${veg.id}`}>
          <EditIcon />
        </button>
        <button className="btn-icon btn-icon-delete" onClick={() => onDelete(veg)} title={t('common.delete')} id={`veg-delete-${veg.id}`}>
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VegetablesPage() {
  const { t } = useTranslation();
  const { vegetables, loading, error, searchQuery, setSearchQuery, createVegetable, updateVegetable, deleteVegetable } = useVegetables();

  const [view, setView]                     = useState('grid'); // 'grid' | 'list'
  const [modalOpen, setModalOpen]           = useState(false);
  const [editingVeg, setEditingVeg]         = useState(null);
  const [deleteTarget, setDeleteTarget]     = useState(null);
  const [deleteLoading, setDeleteLoading]   = useState(false);
  const [toast, setToast]                   = useState({ message: '', type: 'success' });

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: 'success' }), 3500);
  }

  const openAdd    = useCallback(() => { setEditingVeg(null); setModalOpen(true); }, []);
  const openEdit   = useCallback((v) => { setEditingVeg(v); setModalOpen(true); }, []);
  const openDelete = useCallback((v) => setDeleteTarget(v), []);

  async function handleModalSubmit(data) {
    const res = editingVeg ? await updateVegetable(editingVeg.id, data) : await createVegetable(data);
    if (res.success) showToast(t('vegetables.saveSuccess'));
    return res;
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const res = await deleteVegetable(deleteTarget.id);
    setDeleteLoading(false);
    if (res.success) { showToast(t('vegetables.deleteSuccess')); setDeleteTarget(null); }
    else showToast(res.error || t('common.error'), 'error');
  }

  const avgRate = vegetables.length
    ? (vegetables.reduce((s, v) => s + Number(v.rate), 0) / vegetables.length).toFixed(2)
    : '0.00';

  return (
    <div className="vegetables-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="page-header-bar">
        <div>
          <h1 className="page-title">{t('vegetables.title')}</h1>
          <p className="page-desc">{t('vegetables.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* View Toggle */}
          <div className="view-toggle">
            <button
              className={`view-toggle-btn${view === 'grid' ? ' active' : ''}`}
              onClick={() => setView('grid')}
              title="Grid view"
            >
              <GridViewIcon />
            </button>
            <button
              className={`view-toggle-btn${view === 'list' ? ' active' : ''}`}
              onClick={() => setView('list')}
              title="List view"
            >
              <ListViewIcon />
            </button>
          </div>
          <button className="btn btn-primary" onClick={openAdd} id="add-veg-btn">
            + {t('vegetables.addVegetable')}
          </button>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-green">
            <LeafIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{vegetables.length}</div>
            <div className="kpi-label">{t('vegetables.totalVegetables')}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-teal">
            <ReceiptIcon style={{ width: '20px', height: '20px' }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">₹{avgRate}</div>
            <div className="kpi-label">Avg. Rate / Unit</div>
          </div>
        </div>
      </div>

      {/* ── Search Bar ────────────────────────────────────────────────────── */}
      <div className="search-bar-container">
        <div className={`search-bar${searchQuery && hasDevanagari(searchQuery) ? ' marathi-mode' : ''}`}>
          <span className="search-icon"><SearchIcon /></span>
          <MarathiInput
            id="veg-search-input"
            variant="search"
            placeholder={t('vegetables.searchPlaceholder')}
            value={searchQuery}
            onChange={setSearchQuery}
          />
          {searchQuery && isAscii(searchQuery) && <span className="search-marathi-badge">अ</span>}
          {searchQuery && <button className="search-clear-btn" onClick={() => setSearchQuery('')}>✕</button>}
        </div>
        {searchQuery && (
          <div className="search-hint">
            {t('transliteration.searchingFor')} <strong>"{searchQuery}"</strong>
            &nbsp;—&nbsp;{vegetables.length} {t('common.noData').includes('No') ? 'result(s)' : 'निकाल'}
          </div>
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {error && !loading && (
        <div className="table-error" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 'var(--border-radius-sm)', marginBottom: 16 }}>
          <AlertIcon /> {error}
        </div>
      )}
      {loading && <div className="table-message"><span className="spinner" style={{ margin: 'auto' }} /></div>}

      {!loading && !error && vegetables.length === 0 && (
        <div className="table-message" style={{ minHeight: 300 }}>
          <div style={{ marginBottom: 10 }}>
            <LeafIcon style={{ width: '2rem', height: '2rem', color: 'var(--color-text-muted)' }} />
          </div>
          <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            {searchQuery ? t('vegetables.noSearchResults') : t('vegetables.noVegetables')}
          </p>
          {!searchQuery && (
            <button className="btn btn-primary" onClick={openAdd} style={{ marginTop: 12 }}>
              + {t('vegetables.addVegetable')}
            </button>
          )}
        </div>
      )}

      {!loading && !error && vegetables.length > 0 && view === 'grid' && (
        <div className="veg-grid" id="vegetables-grid">
          {vegetables.map((veg) => (
            <VegetableCard key={veg.id} veg={veg} onEdit={openEdit} onDelete={openDelete} t={t} />
          ))}
        </div>
      )}

      {!loading && !error && vegetables.length > 0 && view === 'list' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {vegetables.map((veg) => (
            <VegetableListRow key={veg.id} veg={veg} onEdit={openEdit} onDelete={openDelete} t={t} />
          ))}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <VegetableModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleModalSubmit} vegetable={editingVeg} />
      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
        title={t('vegetables.deleteConfirmTitle')}
        message={`${t('vegetables.deleteConfirmMsg')} "${deleteTarget?.name}"?`}
        subMessage={t('vegetables.deleteConfirmNote')}
      />
    </div>
  );
}
