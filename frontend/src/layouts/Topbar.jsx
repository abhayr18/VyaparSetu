/**
 * Topbar Component — Cleaner, Vyapar-inspired
 * Pill language toggle, slim border, business-name display.
 */

import { useTranslation } from '../hooks/useTranslation';
import { GlobeIcon } from '../components/Icons';

export default function Topbar({ pageTitle, pageSubtitle }) {
  const { t, language, toggleLanguage } = useTranslation();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">{pageTitle}</span>
        {pageSubtitle && (
          <span className="topbar-subtitle">{pageSubtitle}</span>
        )}
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
