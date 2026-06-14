/* eslint-disable react-refresh/only-export-components */
/**
 * LanguageContext
 * Provides language state and the t() translation function to the entire app.
 * Selected language is persisted to localStorage.
 */

import { createContext, useContext, useState, useCallback } from 'react';
import en from '../i18n/en.json';
import mr from '../i18n/mr.json';

const TRANSLATIONS = { en, mr };
const STORAGE_KEY = 'vyapaarsetu_lang';

const LanguageContext = createContext(null);

/**
 * Resolves a dot-notated key from a nested translation object.
 * Example: t('nav.dashboard') → "Dashboard"
 */
function resolvePath(obj, path) {
  return path.split('.').reduce((acc, key) => {
    return acc && acc[key] !== undefined ? acc[key] : null;
  }, obj);
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || 'en'
  );

  const setLanguage = useCallback((lang) => {
    if (TRANSLATIONS[lang]) {
      localStorage.setItem(STORAGE_KEY, lang);
      setLanguageState(lang);
    }
  }, []);

  /**
   * Translate a dot-notated key.
   * Falls back to the key itself if translation is missing.
   * @param {string} key - e.g. 'nav.dashboard'
   * @returns {string}
   */
  const t = useCallback((key) => {
    const translations = TRANSLATIONS[language] || TRANSLATIONS.en;
    return resolvePath(translations, key) ?? key;
  }, [language]);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'en' ? 'mr' : 'en');
  }, [language, setLanguage]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
