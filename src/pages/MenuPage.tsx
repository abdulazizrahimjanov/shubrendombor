import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  ClipboardList,
  ArrowLeftRight,
  Trash2,
  Truck,
  Tag,
  Warehouse,
  PackageCheck,
  ScanBarcode,
  FileText,
  Users,
  AlertCircle,
  BarChart3,
  Wallet,
  UserCheck,
  Globe,
  Settings,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Permission } from '../types/models';

interface ModuleTile {
  label: string;
  sublabel?: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
  accent?: string;
}

interface ModuleGroup {
  title: string;
  items: ModuleTile[];
}

export const MenuPage: React.FC = () => {
  const can = useAppStore((s) => s.can);
  const navigate = useNavigate();

  const groups: ModuleGroup[] = [
    {
      title: 'Tovarlar va Ombor',
      items: [
        { label: 'Katalog', sublabel: 'Tovarlar va narxlar', to: '/catalog', icon: ShoppingBag, permission: 'view_catalog', accent: 'text-blue-600 bg-blue-50 dark:bg-blue-950/60' },
        { label: 'Ombor qoldiqlari', sublabel: 'Barcha omborlar', to: '/inventory?tab=stock', icon: Warehouse, permission: 'view_inventory', accent: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60' },
        { label: 'Kirim (Prihod)', sublabel: 'Tovar qabul qilish', to: '/inventory?tab=receiving', icon: PackageCheck, permission: 'manage_inventory', accent: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60' },
        { label: 'Inventarizatsiya', sublabel: 'Sanoq va tekshiruv', to: '/inventory?tab=stocktake', icon: ClipboardList, permission: 'view_inventory', accent: 'text-amber-600 bg-amber-50 dark:bg-amber-950/60' },
        { label: 'Transfer', sublabel: "Omborlararo ko'chirish", to: '/inventory?tab=transfers', icon: ArrowLeftRight, permission: 'view_inventory', accent: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/60' },
        { label: 'Qayta baholash', sublabel: 'Ommaviy narx tahriri', to: '/catalog', icon: Tag, permission: 'bulk_edit_prices', accent: 'text-violet-600 bg-violet-50 dark:bg-violet-950/60' },
        { label: 'Hisobdan chiqarish', sublabel: 'Brak va yo\'qotish', to: '/inventory?tab=writeoffs', icon: Trash2, permission: 'manage_inventory', accent: 'text-red-600 bg-red-50 dark:bg-red-950/60' },
        { label: "Ta'minotchilar", sublabel: 'Buyurtmalar va qarzlar', to: '/inventory?tab=suppliers', icon: Truck, permission: 'view_inventory', accent: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800' },
      ],
    },
    {
      title: 'Sotuvlar',
      items: [
        { label: 'Yangi sotuv', sublabel: 'Savatcha (POS)', to: '/pos', icon: ScanBarcode, permission: 'use_pos', accent: 'text-blue-600 bg-blue-50 dark:bg-blue-950/60' },
        { label: 'Tranzaksiyalar', sublabel: 'Cheklar va qaytarish', to: '/transactions', icon: FileText, permission: 'use_pos', accent: 'text-sky-600 bg-sky-50 dark:bg-sky-950/60' },
        { label: 'Onlayn buyurtmalar', sublabel: 'Veb-katalog va savdo', to: '/storefront', icon: Globe, permission: 'manage_online_orders', accent: 'text-teal-600 bg-teal-50 dark:bg-teal-950/60' },
      ],
    },
    {
      title: 'Mijozlar',
      items: [
        { label: 'Barcha mijozlar', sublabel: 'CRM va keshbek', to: '/customers', icon: Users, permission: 'view_customers', accent: 'text-blue-600 bg-blue-50 dark:bg-blue-950/60' },
        { label: 'Mijoz qarzlari', sublabel: 'Nasiya nazorati', to: '/customers', icon: AlertCircle, permission: 'manage_debts', accent: 'text-amber-600 bg-amber-50 dark:bg-amber-950/60' },
      ],
    },
    {
      title: 'Hisobot va Boshqaruv',
      items: [
        { label: 'Hisobotlar', sublabel: 'Savdo, ABC, Audit', to: '/reports', icon: BarChart3, permission: 'view_reports', accent: 'text-blue-600 bg-blue-50 dark:bg-blue-950/60' },
        { label: 'Moliya', sublabel: 'Hisoblar, xarajat, P&L', to: '/finance', icon: Wallet, permission: 'view_finance', accent: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60' },
        { label: 'Xodimlar va KPI', sublabel: 'Smena va oylik', to: '/employees', icon: UserCheck, permission: 'view_employees', accent: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60' },
        { label: 'Sozlamalar', sublabel: "Do'kon, chek, to'lovlar", to: '/settings', icon: Settings, permission: 'manage_settings', accent: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800' },
      ],
    },
  ];

  return (
    <div className="max-w-3xl mx-auto pb-8 space-y-6">
      {groups.map((grp) => {
        const visibleItems = grp.items.filter((it) => !it.permission || can(it.permission));
        if (visibleItems.length === 0) return null;

        return (
          <section key={grp.title} className="space-y-2.5">
            <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {grp.title}
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {visibleItems.map((it) => {
                const Icon = it.icon;
                return (
                  <button
                    key={`${grp.title}-${it.label}`}
                    type="button"
                    onClick={() => navigate(it.to)}
                    className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 text-left hover:border-blue-400 dark:hover:border-blue-600 active:scale-[0.99] transition-all shadow-xs flex items-start gap-3"
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        it.accent || 'text-blue-600 bg-blue-50 dark:bg-blue-950/60'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                        {it.label}
                      </div>
                      {it.sublabel && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                          {it.sublabel}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};
