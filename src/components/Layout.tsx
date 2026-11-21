import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  ShoppingBag,
  ScanBarcode,
  FileText,
  LayoutGrid,
  Warehouse,
  Users,
  Wallet,
  UserCheck,
  BarChart3,
  Globe,
  Settings,
  MoreHorizontal,
  X,
  Sun,
  Moon,
  LogOut,
  KeyRound,
  Lock,
  Store as StoreIcon,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Info,
  Check,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useT } from '../i18n';
import { Permission } from '../types/models';
import { PWAInstallButton, OfflineIndicator } from './PWAInstallButton';

interface NavItem {
  to: string;
  labelKey: keyof ReturnType<typeof useT>['nav'];
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/', labelKey: 'dashboard', icon: Home, permission: 'view_dashboard' },
  { to: '/catalog', labelKey: 'catalog', icon: ShoppingBag, permission: 'view_catalog' },
  { to: '/pos', labelKey: 'pos', icon: ScanBarcode, permission: 'use_pos' },
  { to: '/transactions', labelKey: 'transactions', icon: FileText, permission: 'use_pos' },
  { to: '/menu', labelKey: 'menu', icon: LayoutGrid },
];

const SECONDARY_NAV: NavItem[] = [
  { to: '/inventory', labelKey: 'inventory', icon: Warehouse, permission: 'view_inventory' },
  { to: '/customers', labelKey: 'customers', icon: Users, permission: 'view_customers' },
  { to: '/finance', labelKey: 'finance', icon: Wallet, permission: 'view_finance' },
  { to: '/employees', labelKey: 'employees', icon: UserCheck, permission: 'view_employees' },
  { to: '/reports', labelKey: 'reports', icon: BarChart3, permission: 'view_reports' },
  { to: '/storefront', labelKey: 'storefront', icon: Globe },
  { to: '/settings', labelKey: 'settings', icon: Settings, permission: 'manage_settings' },
];

function getInitials(name?: string): string {
  if (!name) return 'SB';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export const Layout: React.FC = () => {
  const db = useAppStore((s) => s.db);
  const currentUser = useAppStore((s) => s.getCurrentUser());
  const can = useAppStore((s) => s.can);
  const canAccessStore = useAppStore((s) => s.canAccessStore);
  const activeStoreId = useAppStore((s) => s.activeStoreId);
  const setActiveStoreId = useAppStore((s) => s.setActiveStoreId);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const switchUserByPin = useAppStore((s) => s.switchUserByPin);
  const updateUserCredentials = useAppStore((s) => s.updateUserCredentials);
  const setShowOnboarding = useAppStore((s) => s.setShowOnboarding);
  const logout = useAppStore((s) => s.logout);
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);
  const notify = useAppStore((s) => s.notify);
  const cartItems = useAppStore((s) => s.cartItems);
  const setSavatchaMenuOpen = useAppStore((s) => s.setSavatchaMenuOpen);

  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();

  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [storeSwitchOpen, setStoreSwitchOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');

  const [credModalOpen, setCredModalOpen] = useState(false);
  const [curPassInput, setCurPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [credError, setCredError] = useState('');

  const visiblePrimary = PRIMARY_NAV.filter((item) => !item.permission || can(item.permission));
  const visibleSecondary = SECONDARY_NAV.filter((item) => !item.permission || can(item.permission));

  const cartUnitsCount = useMemo(
    () => cartItems.reduce((sum, it) => sum + it.qty, 0),
    [cartItems]
  );

  const deferredCount = useMemo(
    () => (db ? db.sales.filter((s) => s.status === 'deferred').length : 0),
    [db]
  );

  // Transaction detail page renders its own dedicated back-bar + segmented header
  const isTransactionDetail = /^\/transactions\/[^/]+$/.test(location.pathname);

  const headerInfo = (() => {
    const p = location.pathname;
    if (p === '/') {
      return { title: t.nav.dashboard, badge: null as number | null, action: 'settings' as const };
    }
    if (p.startsWith('/catalog')) {
      return { title: t.nav.catalog, badge: null, action: 'reports' as const };
    }
    if (p.startsWith('/pos')) {
      return { title: t.pos.cart, badge: cartUnitsCount, action: 'savatcha' as const };
    }
    if (p === '/transactions') {
      return { title: t.transactions.title, badge: deferredCount, action: 'reports' as const };
    }
    if (p.startsWith('/menu')) {
      return { title: t.menu.title, badge: null, action: 'settings' as const };
    }
    const matched = [...visiblePrimary, ...visibleSecondary].find((n) =>
      n.to === '/' ? p === '/' : p.startsWith(n.to)
    );
    return {
      title: matched ? t.nav[matched.labelKey] : t.appName,
      badge: null,
      action: p.startsWith('/settings') ? ('reports' as const) : ('settings' as const),
    };
  })();

  const accessibleStores = useMemo(
    () => (db ? db.stores.filter((s) => canAccessStore(s.id)) : []),
    [db, canAccessStore, currentUser]
  );
  const canViewAllStores = currentUser?.roleId === 'owner' || currentUser?.roleId === 'admin';
  const activeStore = db?.stores.find((s) => s.id === activeStoreId);
  const activeStoreLabel =
    activeStoreId === 'all' && canViewAllStores
      ? t.common.allStores
      : activeStore?.name ?? accessibleStores[0]?.name ?? db?.stores[0]?.name ?? t.common.store;

  const handlePinSwitch = (e: React.FormEvent) => {
    e.preventDefault();
    const user = switchUserByPin(pinValue.trim());
    if (!user) {
      setPinError(t.auth.invalidPin);
      return;
    }
    setPinError('');
    setPinValue('');
    setPinModalOpen(false);
    const roleLabel =
      db?.roles.find((rl) => rl.id === user.roleId)?.[language === 'ru' ? 'nameRu' : 'nameUz'] ??
      t.auth.roles[user.roleId as keyof typeof t.auth.roles] ??
      user.roleId;
    notify(`${user.name} (${roleLabel})`, 'success');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-30">
        <div className="h-14 px-5 flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <img
            src="/assets/aistudio/IMG_20261007_140535_653_64e97dff.jpg"
            alt="SHU BREND OMBOR"
            className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
          />
          <span className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap truncate">
            SHU BREND OMBOR
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visiblePrimary.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t.nav[item.labelKey]}</span>
                </span>
                {item.to === '/pos' && cartUnitsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-mono font-bold">
                    {cartUnitsCount}
                  </span>
                )}
                {item.to === '/transactions' && deferredCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[10px] font-mono font-bold">
                    {deferredCount}
                  </span>
                )}
              </NavLink>
            );
          })}

          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
            {visibleSecondary.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t.nav[item.labelKey]}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          {currentUser && (
            <div className="px-2 py-1">
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{currentUser.name}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {db?.roles.find((rl) => rl.id === currentUser.roleId)?.[language === 'ru' ? 'nameRu' : 'nameUz'] ??
                  t.auth.roles[currentUser.roleId as keyof typeof t.auth.roles] ??
                  currentUser.roleId}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setPinModalOpen(true)}
              className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span>PIN</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>{t.auth.logout}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 pb-20 lg:pb-0">
        {/* Top Header */}
        {!isTransactionDetail && (
          <header className="no-print sticky top-0 z-20 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <h1 className="font-display text-xl lg:text-2xl font-bold text-slate-900 dark:text-white truncate tracking-tight">
                {headerInfo.title}
              </h1>
              {headerInfo.badge !== null && (
                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-mono font-bold tabular-nums shrink-0">
                  {headerInfo.badge}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {accessibleStores.length > 0 && (
                <div className="hidden md:flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 h-9 bg-slate-50 dark:bg-slate-950">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: activeStore?.color || '#2563EB' }}
                  />
                  <select
                    value={activeStoreId}
                    onChange={(e) => setActiveStoreId(e.target.value)}
                    aria-label={t.common.store}
                    className="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
                  >
                    {canViewAllStores && (
                      <option value="all" className="dark:bg-slate-900">{t.common.allStores}</option>
                    )}
                    {accessibleStores.map((s) => (
                      <option key={s.id} value={s.id} className="dark:bg-slate-900">
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="hidden sm:flex items-center gap-1.5">
                <PWAInstallButton />
                <button
                  type="button"
                  onClick={() => setLanguage(language === 'uz' ? 'ru' : 'uz')}
                  className="h-9 px-2.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                >
                  {language.toUpperCase()}
                </button>
                <button
                  type="button"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                  aria-label="Theme"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>

              {/* Context Action Button: Gear on Asosiy/Menu, Stats on Katalog/Tranzaksiyalar, ... on Sotuvlar */}
              {headerInfo.action === 'savatcha' ? (
                <button
                  type="button"
                  onClick={() => setSavatchaMenuOpen(true)}
                  aria-label="Savatcha menyusi"
                  className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              ) : headerInfo.action === 'reports' ? (
                can('view_reports') && (
                  <button
                    type="button"
                    onClick={() => navigate('/reports')}
                    aria-label={t.nav.reports}
                    className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                )
              ) : (
                can('manage_settings') && (
                  <button
                    type="button"
                    onClick={() => navigate('/settings')}
                    aria-label={t.nav.settings}
                    className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                )
              )}

              {/* User Initials Blue Avatar */}
              <button
                type="button"
                onClick={() => {
                  setStoreSwitchOpen(false);
                  setAvatarSheetOpen(true);
                }}
                aria-label={currentUser?.name || 'Profil'}
                className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-xs transition-colors"
              >
                {getInitials(currentUser?.name)}
              </button>
            </div>
          </header>
        )}

        {/* Page Content */}
        <main
          className={`flex-1 w-full mx-auto min-w-0 ${
            isTransactionDetail ? 'p-0' : 'p-3 sm:p-4 lg:p-6 max-w-[1440px]'
          }`}
        >
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar — Permission-aware 5 tabs */}
      <nav className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-30 pb-safe bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shadow-[0_-2px_12px_rgba(15,23,42,0.06)]">
        <div
          className="h-16 grid"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, visiblePrimary.length)}, minmax(0, 1fr))` }}
        >
          {visiblePrimary.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `relative flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors ${
                    isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
                  }`
                }
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {item.to === '/pos' && cartUnitsCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[9px] font-mono font-bold flex items-center justify-center">
                      {cartUnitsCount}
                    </span>
                  )}
                  {item.to === '/transactions' && deferredCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-mono font-bold flex items-center justify-center">
                      {deferredCount}
                    </span>
                  )}
                </div>
                <span className="truncate max-w-[74px]">{t.nav[item.labelKey]}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Avatar Profile Bottom Sheet */}
      {avatarSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center"
          onClick={() => setAvatarSheetOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-5 pb-safe space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto sm:hidden" />

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-display font-bold text-base flex items-center justify-center shrink-0">
                  {getInitials(currentUser?.name)}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-base font-bold text-slate-900 dark:text-white truncate">
                    {currentUser?.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: activeStore?.color || '#2563EB' }}
                    />
                    <span className="truncate">{activeStoreLabel}</span>
                    <span>·</span>
                    <span>
                      {currentUser
                        ? db?.roles.find((rl) => rl.id === currentUser.roleId)?.[language === 'ru' ? 'nameRu' : 'nameUz'] ??
                          t.auth.roles[currentUser.roleId as keyof typeof t.auth.roles] ??
                          currentUser.roleId
                        : ''}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAvatarSheetOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setStoreSwitchOpen((v) => !v)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              >
                <span className="flex items-center gap-3">
                  <StoreIcon className="w-4 h-4 text-blue-600" />
                  <span>{t.menu.switchStore}</span>
                </span>
                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${storeSwitchOpen ? 'rotate-90' : ''}`} />
              </button>

              {storeSwitchOpen && db && (
                <div className="px-3 py-2 bg-white dark:bg-slate-900 space-y-1">
                  {canViewAllStores && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveStoreId('all');
                        setStoreSwitchOpen(false);
                        setAvatarSheetOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between ${
                        activeStoreId === 'all'
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{t.common.allStores}</span>
                      {activeStoreId === 'all' && <Check className="w-4 h-4" />}
                    </button>
                  )}
                  {accessibleStores.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setActiveStoreId(s.id);
                        setStoreSwitchOpen(false);
                        setAvatarSheetOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between ${
                        activeStoreId === s.id
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || '#2563EB' }} />
                        <span>{s.name}</span>
                      </span>
                      {activeStoreId === s.id && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setAvatarSheetOpen(false);
                  setPinModalOpen(true);
                }}
                className="w-full px-4 py-3.5 flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              >
                <span className="flex items-center gap-3">
                  <KeyRound className="w-4 h-4 text-slate-500" />
                  <span>{t.auth.switchCashier}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setAvatarSheetOpen(false);
                  setCurPassInput('');
                  setNewPassInput('');
                  setNewPinInput(currentUser?.pin ?? '');
                  setCredError('');
                  setCredModalOpen(true);
                }}
                className="w-full px-4 py-3.5 flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              >
                <span className="flex items-center gap-3">
                  <Lock className="w-4 h-4 text-blue-600" />
                  <span>Parol va PIN-kodni almashtirish</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setAvatarSheetOpen(false);
                  setShowOnboarding(true);
                }}
                className="w-full px-4 py-3.5 flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              >
                <span className="flex items-center gap-3">
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                  <span>{t.menu.needHelp}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setAvatarSheetOpen(false);
                  logout();
                }}
                className="w-full px-4 py-3.5 flex items-center justify-between text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <span className="flex items-center gap-3">
                  <LogOut className="w-4 h-4" />
                  <span>{t.menu.signOut}</span>
                </span>
              </button>
            </div>

            {/* Compact Theme & Language Controls for mobile */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setLanguage(language === 'uz' ? 'ru' : 'uz')}
                className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold flex items-center justify-center gap-2"
              >
                <span>Til: {language === 'uz' ? "O'zbekcha" : 'Русский'}</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold flex items-center justify-center gap-2"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span>{theme === 'dark' ? 'Kunduzgi' : 'Tungi'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick PIN Switch Modal */}
      {pinModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold">{t.auth.switchCashier}</h3>
              <button
                type="button"
                onClick={() => {
                  setPinModalOpen(false);
                  setPinError('');
                  setPinValue('');
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handlePinSwitch} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">{t.auth.enterPin}</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={pinValue}
                  onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full h-12 text-center text-xl tracking-[0.4em] font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="•••••"
                />
              </div>
              {pinError && <p className="text-xs text-red-600 font-medium">{pinError}</p>}
              <button
                type="submit"
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
              >
                {t.common.confirm}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Change Own Password & PIN Modal */}
      {credModalOpen && currentUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold">Parol va PIN-kodni almashtirish</h3>
              <button
                type="button"
                onClick={() => setCredModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setCredError('');
                if (!curPassInput) {
                  setCredError('Joriy parolni kiriting');
                  return;
                }
                const res = await updateUserCredentials(currentUser.id, {
                  currentPassword: curPassInput,
                  newPassword: newPassInput.trim() ? newPassInput : undefined,
                  newPin: newPinInput.trim() ? newPinInput : undefined,
                });
                if (!res.ok) {
                  setCredError(res.error || 'Xatolik');
                  return;
                }
                notify("Parol va PIN-kod yangilandi", 'success');
                setCredModalOpen(false);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block text-slate-500 mb-1">Joriy parol *</label>
                <input
                  type="password"
                  required
                  value={curPassInput}
                  onChange={(e) => setCurPassInput(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  placeholder="••••••"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Yangi parol (o'zgartirmaslik uchun bo'sh qoldiring)</label>
                <input
                  type="password"
                  value={newPassInput}
                  onChange={(e) => setNewPassInput(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  placeholder="Kamida 4 ta belgi"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Yangi PIN-kod (4–6 raqam)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono tracking-widest text-center"
                  placeholder="•••••"
                />
              </div>
              {credError && <p className="text-xs text-red-600 font-medium">{credError}</p>}
              <button
                type="submit"
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
              >
                {t.common.save}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="no-print fixed top-16 right-4 z-50 space-y-2 max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => dismissToast(toast.id)}
            className="cursor-pointer flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs font-medium shadow-lg"
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-blue-600 shrink-0" />}
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      <OfflineIndicator />
    </div>
  );
};
