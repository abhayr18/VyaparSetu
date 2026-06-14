/**
 * MainLayout Component
 * Shell layout that wraps all authenticated pages.
 * Renders: Sidebar + Topbar + page content via <Outlet />.
 */

import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useTranslation } from '../hooks/useTranslation';

// Map routes to their title translation keys
const PAGE_META = {
  '/':           { title: 'nav.dashboard',  subtitle: 'dashboard.subtitle' },
  '/customers':  { title: 'nav.customers',  subtitle: 'pages.customers.desc' },
  '/vegetables': { title: 'nav.vegetables', subtitle: 'pages.vegetables.desc' },
  '/billing':    { title: 'nav.billing',    subtitle: 'pages.billing.desc' },
  '/udhar':      { title: 'nav.udhar',      subtitle: 'pages.udhar.desc' },
  '/reports':    { title: 'nav.reports',    subtitle: 'pages.reports.desc' },
  '/backup':     { title: 'nav.backup',     subtitle: 'pages.backup.desc' },
  '/settings':   { title: 'nav.settings',   subtitle: 'pages.settings.desc' },
};

export default function MainLayout() {
  const { t, language } = useTranslation();
  const { pathname } = useLocation();

  const meta = PAGE_META[pathname] || { title: 'common.appName', subtitle: '' };

  return (
    <div className="app-layout" lang={language}>
      <Sidebar />
      <div className="main-content">
        <Topbar
          pageTitle={t(meta.title)}
          pageSubtitle={t(meta.subtitle)}
        />
        <main className="page-content" id="main-page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
