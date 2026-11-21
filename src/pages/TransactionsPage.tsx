import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  SlidersHorizontal,
  Calendar,
  X,
  Loader2,
  FileText,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useT } from '../i18n';
import { PaymentMethod, Sale } from '../types/models';
import { formatUzsSpaced } from '../utils/receipt';

function formatTimeHMS(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function getDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function getDayHeading(dayKey: string, todayLabel: string, yesterdayLabel: string): string {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterdayKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(
    y.getDate()
  ).padStart(2, '0')}`;

  if (dayKey === todayKey) return todayLabel;
  if (dayKey === yesterdayKey) return yesterdayLabel;
  const [yr, mo, da] = dayKey.split('-');
  return `${da}.${mo}.${yr}`;
}

export const TransactionsPage: React.FC = () => {
  const db = useAppStore((s) => s.db);
  const activeStoreId = useAppStore((s) => s.activeStoreId);
  const currentUser = useAppStore((s) => s.getCurrentUser());
  const t = useT();
  const navigate = useNavigate();

  const [rawSearch, setRawSearch] = useState('');
  const [search, setSearch] = useState('');
  const [viewScope, setViewScope] = useState<'all' | 'mine'>('all');

  // Filters
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | Sale['status']>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [storeFilter, setStoreFilter] = useState<string>('global'); // 'global' uses header activeStoreId or specific store
  const [sellerFilter, setSellerFilter] = useState<string>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');

  // Date range picker
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Infinite scroll pagination
  const [visibleCount, setVisibleCount] = useState(14);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(rawSearch.trim().toLowerCase()), 120);
    return () => clearTimeout(timer);
  }, [rawSearch]);

  const filteredSales = useMemo(() => {
    if (!db) return [];
    const effectiveStore = storeFilter === 'global' ? activeStoreId : storeFilter;
    const minVal = minAmount ? Number(minAmount) : null;
    const maxVal = maxAmount ? Number(maxAmount) : null;
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return [...db.sales]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((s) => {
        if (effectiveStore !== 'all' && s.storeId !== effectiveStore) return false;
        if (statusFilter !== 'all' && s.status !== statusFilter) return false;
        if (methodFilter !== 'all' && !s.payments.some((p) => p.method === methodFilter)) {
          return false;
        }
        if (viewScope === 'mine' && currentUser && s.cashierId !== currentUser.id) return false;
        if (sellerFilter !== 'all' && s.cashierId !== sellerFilter) return false;
        if (minVal !== null && s.totalAmount < minVal) return false;
        if (maxVal !== null && s.totalAmount > maxVal) return false;
        const createdMs = new Date(s.createdAt).getTime();
        if (fromMs !== null && createdMs < fromMs) return false;
        if (toMs !== null && createdMs > toMs) return false;

        if (search) {
          const hit =
            s.receiptNumber.toLowerCase().includes(search) ||
            s.id.toLowerCase().includes(search) ||
            (s.customerName?.toLowerCase().includes(search) ?? false) ||
            s.cashierName.toLowerCase().includes(search) ||
            s.items.some(
              (it) =>
                it.productName.toLowerCase().includes(search) ||
                it.sku.toLowerCase().includes(search)
            );
          if (!hit) return false;
        }
        return true;
      });
  }, [
    db,
    activeStoreId,
    storeFilter,
    statusFilter,
    methodFilter,
    viewScope,
    currentUser,
    sellerFilter,
    minAmount,
    maxAmount,
    dateFrom,
    dateTo,
    search,
  ]);

  useEffect(() => {
    setVisibleCount(14);
  }, [search, viewScope, statusFilter, methodFilter, storeFilter, sellerFilter, minAmount, maxAmount, dateFrom, dateTo]);

  const visibleSales = useMemo(
    () => filteredSales.slice(0, visibleCount),
    [filteredSales, visibleCount]
  );

  const hasMore = visibleCount < filteredSales.length;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          setLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((prev) => prev + 12);
            setLoadingMore(false);
          }, 280);
        }
      },
      { rootMargin: '120px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore]);

  const groupedByDay = useMemo(() => {
    const groups: { dayKey: string; label: string; rows: Sale[] }[] = [];
    const map = new Map<string, Sale[]>();
    visibleSales.forEach((s) => {
      const k = getDayKey(s.createdAt);
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    });
    map.forEach((rows, dayKey) => {
      groups.push({
        dayKey,
        label: getDayHeading(dayKey, t.transactions.todayGroup, t.transactions.yesterdayGroup),
        rows,
      });
    });
    return groups;
  }, [visibleSales, t]);

  if (!db) return null;

  const activeFiltersCount = [
    statusFilter !== 'all',
    methodFilter !== 'all',
    storeFilter !== 'global',
    sellerFilter !== 'all',
    Boolean(minAmount),
    Boolean(maxAmount),
  ].filter(Boolean).length;

  const dateBadgeLabel = (() => {
    if (!dateFrom && !dateTo) return t.transactions.allDates;
    const fmt = (d: string) => {
      const [y, m, da] = d.split('-');
      return `${da}.${m}.${y}`;
    };
    if (dateFrom && dateTo && dateFrom === dateTo) return fmt(dateFrom);
    if (dateFrom && dateTo) return `${fmt(dateFrom)} — ${fmt(dateTo)}`;
    if (dateFrom) return `${fmt(dateFrom)} →`;
    return `← ${fmt(dateTo)}`;
  })();

  const sellers = db.users.filter((u) => u.isActive);

  return (
    <div className="max-w-3xl mx-auto pb-28 lg:pb-16 space-y-4">
      {/* Search + Blue Filter Icon */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder={t.transactions.searchPlaceholder}
            className="w-full h-11 pl-10 pr-9 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {rawSearch && (
            <button
              type="button"
              onClick={() => {
                setRawSearch('');
                setSearch('');
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          aria-label="Filtrlar"
          className="relative w-11 h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shrink-0 shadow-xs transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-mono font-bold flex items-center justify-center border-2 border-slate-50 dark:border-slate-950">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* Scope Toggle: All Sales vs My Sales */}
      {currentUser && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewScope('all')}
            className={`h-9 px-3.5 rounded-xl text-xs font-semibold border transition-colors ${
              viewScope === 'all'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            Barcha sotuvlar
          </button>
          <button
            type="button"
            onClick={() => setViewScope('mine')}
            className={`h-9 px-3.5 rounded-xl text-xs font-semibold border transition-colors ${
              viewScope === 'mine'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            Mening sotuvlarim
          </button>
        </div>
      )}

      {/* Day-grouped Transaction List */}
      {groupedByDay.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <FileText className="w-6 h-6" />
          </div>
          <div className="font-display text-sm font-bold text-slate-700 dark:text-slate-200">
            {t.common.emptyTitle}
          </div>
          <p className="text-xs text-slate-500">{t.common.emptyDesc}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByDay.map((grp) => (
            <section key={grp.dayKey} className="space-y-2">
              <div className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {grp.label}
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs">
                {grp.rows.map((sale) => {
                  const store = db.stores.find((st) => st.id === sale.storeId);
                  const units = sale.items.reduce((sum, it) => sum + it.qty, 0);

                  return (
                    <button
                      key={sale.id}
                      type="button"
                      onClick={() => navigate(`/transactions/${sale.id}`)}
                      className="w-full px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800 transition-colors flex items-center justify-between gap-3"
                    >
                      {/* Left column */}
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-blue-600 dark:text-blue-400 font-mono">
                            Sotuv {sale.receiptNumber}
                          </span>
                          {sale.status === 'deferred' && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                              {t.transactions.deferred}
                            </span>
                          )}
                          {(sale.status === 'returned' || sale.status === 'partial_return') && (
                            <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[10px] font-bold">
                              {sale.status === 'returned'
                                ? t.transactions.returned
                                : t.transactions.partialReturn}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono tabular-nums">{formatTimeHMS(sale.createdAt)}</span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold">
                            {units} {t.transactions.units}
                          </span>
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
                            {sale.cashierName}
                          </span>
                        </div>
                        {sale.items[0] && (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                            {sale.items[0].productName}
                            {sale.items[0].variantLabel ? ` (${sale.items[0].variantLabel})` : ''}
                            {sale.items.length > 1 ? ` +${sale.items.length - 1}` : ''}
                          </div>
                        )}
                      </div>

                      {/* Right column */}
                      <div className="text-right shrink-0 space-y-1.5">
                        <div className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white">
                          {formatUzsSpaced(sale.totalAmount)}
                        </div>
                        <div className="flex items-center justify-end gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: store?.color || '#2563EB' }}
                          />
                          <span className="truncate max-w-[130px]">{store?.name ?? t.common.store}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Infinite scroll sentinel & spinner */}
          {hasMore && (
            <div ref={sentinelRef} className="py-5 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>{t.common.loading}</span>
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom Calendar Pill */}
      <div className="fixed left-0 right-0 bottom-[74px] lg:bottom-5 lg:left-64 z-20 flex justify-center pointer-events-none px-4">
        <button
          type="button"
          onClick={() => setDateModalOpen(true)}
          className="pointer-events-auto h-11 px-5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold inline-flex items-center gap-2 shadow-lg hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Calendar className="w-4 h-4 text-blue-600" />
          <span>{dateBadgeLabel}</span>
        </button>
      </div>

      {/* Filter Sheet */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center"
          onClick={() => setFilterOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-5 pb-safe space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Filtrlar</h3>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-500 mb-1.5">{t.common.status}</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | Sale['status'])}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  <option value="all">{t.common.all}</option>
                  <option value="completed">{t.transactions.completed}</option>
                  <option value="deferred">{t.transactions.deferred}</option>
                  <option value="returned">{t.transactions.returned}</option>
                  <option value="partial_return">{t.transactions.partialReturn}</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-500 mb-1.5">To'lov turi</label>
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value as 'all' | PaymentMethod)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  <option value="all">{t.common.all}</option>
                  {db.settings.enabledPaymentMethods.map((m) => (
                    <option key={m} value={m}>
                      {t.pos.methods[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-500 mb-1.5">{t.common.store}</label>
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  <option value="global">{t.common.allStores}</option>
                  {db.stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-500 mb-1.5">Sotuvchi</label>
                <select
                  value={sellerFilter}
                  onChange={(e) => setSellerFilter(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  <option value="all">{t.common.all}</option>
                  {sellers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1.5">Summa (dan)</label>
                  <input
                    type="number"
                    min={0}
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    placeholder="0"
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1.5">Summa (gacha)</label>
                  <input
                    type="number"
                    min={0}
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    placeholder="5 000 000"
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setMethodFilter('all');
                  setStoreFilter('global');
                  setSellerFilter('all');
                  setMinAmount('');
                  setMaxAmount('');
                }}
                className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Tozalash
              </button>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="h-11 rounded-xl bg-blue-600 text-white text-xs font-bold"
              >
                {t.pos.apply}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date Range Picker Modal */}
      {dateModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center"
          onClick={() => setDateModalOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-5 pb-safe space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Sana bo'yicha tanlash</h3>
              <button
                type="button"
                onClick={() => setDateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                {
                  label: t.transactions.allDates,
                  apply: () => {
                    setDateFrom('');
                    setDateTo('');
                  },
                },
                {
                  label: t.common.today,
                  apply: () => {
                    const d = new Date().toISOString().slice(0, 10);
                    setDateFrom(d);
                    setDateTo(d);
                  },
                },
                {
                  label: t.transactions.yesterdayGroup,
                  apply: () => {
                    const y = new Date();
                    y.setDate(y.getDate() - 1);
                    const d = y.toISOString().slice(0, 10);
                    setDateFrom(d);
                    setDateTo(d);
                  },
                },
                {
                  label: t.common.week,
                  apply: () => {
                    const now = new Date();
                    const w = new Date();
                    w.setDate(w.getDate() - 7);
                    setDateFrom(w.toISOString().slice(0, 10));
                    setDateTo(now.toISOString().slice(0, 10));
                  },
                },
                {
                  label: t.common.month,
                  apply: () => {
                    const now = new Date();
                    const m = new Date();
                    m.setDate(m.getDate() - 30);
                    setDateFrom(m.toISOString().slice(0, 10));
                    setDateTo(now.toISOString().slice(0, 10));
                  },
                },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    preset.apply();
                    setDateModalOpen(false);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-xs font-semibold"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Dan</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Gacha</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDateModalOpen(false)}
              className="w-full h-11 rounded-xl bg-blue-600 text-white text-xs font-bold"
            >
              {t.pos.apply}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
