/**
 * App Root
 * Sets up React Router and wraps everything in the LanguageProvider.
 * All pages are rendered inside MainLayout via nested routes.
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import ActivationGate from './components/ActivationGate';
import MainLayout from './layouts/MainLayout';

// Pages
import DashboardPage  from './pages/DashboardPage';
import CustomersPage  from './pages/CustomersPage';
import VegetablesPage from './pages/VegetablesPage';
import BillingPage    from './pages/BillingPage';
import TransactionsPage from './pages/TransactionsPage';
import DayBookPage     from './pages/DayBookPage';
import UdharPage      from './pages/UdharPage';
import ReportsPage    from './pages/ReportsPage';
import BackupPage     from './pages/BackupPage';
import SettingsPage   from './pages/SettingsPage';

// Global styles
import './styles/globals.css';

export default function App() {
  return (
    <LanguageProvider>
      <ActivationGate>
        <BrowserRouter>
          <Routes>
            <Route element={<MainLayout />}>
              <Route index         element={<DashboardPage    />} />
              <Route path="customers"    element={<CustomersPage    />} />
              <Route path="vegetables"   element={<VegetablesPage   />} />
              <Route path="billing"      element={<BillingPage      />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="daybook"      element={<DayBookPage      />} />
              <Route path="udhar"        element={<UdharPage        />} />
              <Route path="reports"      element={<ReportsPage      />} />
              <Route path="backup"       element={<BackupPage       />} />
              <Route path="settings"     element={<SettingsPage     />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ActivationGate>
    </LanguageProvider>
  );
}

