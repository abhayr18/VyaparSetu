/**
 * Topbar Component — Cleaner, Vyapar-inspired
 * Pill language toggle, slim border, business-name display.
 */

import { useTranslation } from '../hooks/useTranslation';
import { GlobeIcon } from '../components/Icons';

export default function Topbar({ pageTitle, pageSubtitle, onOpenShortcuts }) {
  const { language, toggleLanguage } = useTranslation();

  const todayFormatted = new Date().toLocaleDateString(language === 'mr' ? 'mr-IN' : 'en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="topbar-title">{pageTitle || 'VyapaarSetu'}</span>
          {pageSubtitle && (
            <>
              <span style={{ color: 'var(--color-border)', fontSize: '0.9rem' }}>|</span>
              <span className="topbar-subtitle">{pageSubtitle}</span>
            </>
          )}
        </div>
      </div>

      <div className="topbar-right">
        {/* Keyboard Shortcuts button */}
        <button
          id="shortcuts-help-btn"
          className="lang-toggle-btn"
          onClick={onOpenShortcuts}
          title="Keyboard Shortcuts (F12 or ?)"
          style={{ gap: '5px', fontSize: '0.78rem' }}
        >
          <span>⌨️</span>
          <span>F12</span>
        </button>

        {/* Language Toggle — pill style */}
        <button
          id="lang-toggle-btn"
          className="lang-toggle-btn"
          onClick={toggleLanguage}
          title={language === 'en' ? 'Switch to Marathi (Ctrl+L)' : 'Switch to English (Ctrl+L)'}
        >
          <GlobeIcon style={{ width: '14px', height: '14px', flexShrink: 0 }} />
          {language === 'en' ? 'मराठी' : 'EN'}
        </button>
      </div>
    </header>
  );
}
