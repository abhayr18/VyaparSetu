/**
 * App Root
 * Sets up React Router and wraps everything in the LanguageProvider.
 * All pages are rendered inside MainLayout via nested routes.
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import MainLayout from './layouts/MainLayout';

// Pages
import DashboardPage  from './pages/DashboardPage';
import CustomersPage  from './pages/CustomersPage';
import VegetablesPage from './pages/VegetablesPage';
import BillingPage    from './pages/BillingPage';
import UdharPage      from './pages/UdharPage';
import ReportsPage    from './pages/ReportsPage';
import BackupPage     from './pages/BackupPage';
import SettingsPage   from './pages/SettingsPage';

// Global styles
import './styles/globals.css';

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route index         element={<DashboardPage  />} />
            <Route path="customers"  element={<CustomersPage  />} />
            <Route path="vegetables" element={<VegetablesPage />} />
            <Route path="billing"    element={<BillingPage    />} />
            <Route path="udhar"      element={<UdharPage      />} />
            <Route path="reports"    element={<ReportsPage    />} />
            <Route path="backup"     element={<BackupPage     />} />
            <Route path="settings"   element={<SettingsPage   />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}
