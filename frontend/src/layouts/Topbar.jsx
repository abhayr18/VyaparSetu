/**
 * Topbar Component — Cleaner, Vyapar-inspired
 * Pill language toggle, slim border, business-name display.
 */

import { useTranslation } from '../hooks/useTranslation';
import { GlobeIcon } from '../components/Icons';

export default function Topbar({ pageTitle, pageSubtitle }) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>VyapaarSetu</span>
          <span style={{ color: 'var(--color-smoke)' }}>/</span>
          <span>{todayFormatted}</span>
        </div>
      </div>

      <div className="topbar-right">
        {/* Language Toggle — pill style */}
        <button
          id="lang-toggle-btn"
          className="lang-toggle-btn"
          onClick={toggleLanguage}
          title={language === 'en' ? 'Switch to Marathi' : 'Switch to English'}
        >
          <GlobeIcon style={{ width: '14px', height: '14px', flexShrink: 0 }} />
          {language === 'en' ? 'मराठी' : 'EN'}
        </button>
      </div>
    </header>
  );
}
