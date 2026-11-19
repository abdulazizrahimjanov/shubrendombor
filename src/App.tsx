import React, { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { AuthScreen } from './components/AuthScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { OnboardingWizard } from './components/OnboardingWizard';
import { DashboardPage } from './pages/DashboardPage';
import { POSPage } from './pages/POSPage';
import { CatalogPage } from './pages/CatalogPage';
import { InventoryPage } from './pages/InventoryPage';
import { CustomersPage } from './pages/CustomersPage';
import { FinancePage } from './pages/FinancePage';
import { EmployeesPage } from './pages/EmployeesPage';
import { ReportsPage } from './pages/ReportsPage';
import { StorefrontPage } from './pages/StorefrontPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { TransactionDetailPage } from './pages/TransactionDetailPage';
import { MenuPage } from './pages/MenuPage';

function AppRoutes() {
  const initialized = useAppStore((s) => s.initialized);
  const fatalSyncError = useAppStore((s) => s.fatalSyncError);
  const currentUser = useAppStore((s) => s.getCurrentUser());
  const can = useAppStore((s) => s.can);
  const [guestShop, setGuestShop] = useState(false);
  const navigate = useNavigate();

  if (fatalSyncError) {
    throw fatalSyncError;
  }

  if (!initialized) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-2">
          <img
            src="/assets/aistudio/IMG_20261007_140535_653_64e97dff.jpg"
            alt="SHU BREND OMBOR"
            className="w-14 h-14 rounded-xl mx-auto object-cover border border-slate-200 dark:border-slate-800"
          />
          <div className="font-display text-sm font-semibold text-slate-600 dark:text-slate-300">
            SHU BREND OMBOR yuklanmoqda...
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    if (guestShop) {
      return <StorefrontPage publicStandalone onBackToLogin={() => setGuestShop(false)} />;
    }
    return <AuthScreen onOpenCatalog={() => setGuestShop(true)} />;
  }

  const defaultHomePath = can('view_dashboard')
    ? '/'
    : can('use_pos')
    ? '/pos'
    : can('view_catalog')
    ? '/catalog'
    : can('view_inventory')
    ? '/inventory'
    : '/menu';

  return (
    <>
      <OnboardingWizard onGoToPos={() => navigate('/pos')} />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={can('view_dashboard') ? <DashboardPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="pos" element={can('use_pos') ? <POSPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="catalog" element={can('view_catalog') ? <CatalogPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="transactions" element={can('use_pos') ? <TransactionsPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="transactions/:id" element={can('use_pos') ? <TransactionDetailPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="inventory" element={can('view_inventory') ? <InventoryPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="customers" element={can('view_customers') ? <CustomersPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="finance" element={can('view_finance') ? <FinancePage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="employees" element={can('view_employees') ? <EmployeesPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="reports" element={can('view_reports') ? <ReportsPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="storefront" element={<StorefrontPage />} />
          <Route path="settings" element={can('manage_settings') ? <SettingsPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="*" element={<Navigate to={defaultHomePath} replace />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  const init = useAppStore((s) => s.init);
  const setOnline = useAppStore((s) => s.setOnline);

  useEffect(() => {
    init();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [init, setOnline]);

  return (
    <ErrorBoundary>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </ErrorBoundary>
  );
}
