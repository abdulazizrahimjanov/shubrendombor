import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Smartphone,
  Wallet,
  Building2,
  Clock,
  CheckCircle2,
  Printer,
  Share2,
  Plus,
  RotateCcw,
  ArrowLeftRight,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useAppStore, uid } from '../store/useAppStore';
import { formatDateTime, formatMoney, useT } from '../i18n';
import { PaymentMethod, Sale } from '../types/models';
import {
  buildSaleShareText,
  formatUzsSpaced,
  generateSaleQr,
  printSaleReceipt,
} from '../utils/receipt';

function getMethodIcon(method: PaymentMethod) {
  switch (method) {
    case 'cash':
      return Banknote;
    case 'click':
    case 'payme':
    case 'uzum':
      return Smartphone;
    case 'transfer':
      return Building2;
    case 'debt':
      return Wallet;
    default:
      return CreditCard;
  }
}

export const TransactionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const db = useAppStore((s) => s.db);
  const currentUser = useAppStore((s) => s.getCurrentUser());
  const language = useAppStore((s) => s.language);
  const payDeferredTransaction = useAppStore((s) => s.payDeferredTransaction);
  const deleteDeferredTransaction = useAppStore((s) => s.deleteDeferredTransaction);
  const processReturn = useAppStore((s) => s.processReturn);
  const upsertCustomer = useAppStore((s) => s.upsertCustomer);
  const getVariantStock = useAppStore((s) => s.getVariantStock);
  const notify = useAppStore((s) => s.notify);
  const t = useT();

  const initialTab = searchParams.get('tab') === 'payment' ? 'payment' : 'details';
  const [activeTab, setActiveTab] = useState<'details' | 'payment'>(initialTab);

  // Payment form state
  const [splitMode, setSplitMode] = useState(false);
  const [selectedSingleMethod, setSelectedSingleMethod] = useState<PaymentMethod>('cash');
  const [splitAmounts, setSplitAmounts] = useState<Partial<Record<PaymentMethod, number>>>({
    cash: 0,
  });
  const [cashGiven, setCashGiven] = useState<number>(0);
  const [overrideCustomerId, setOverrideCustomerId] = useState<string>('');

  // Quick Add Customer (for Nasiya / Check)
  const [newCustomerModalOpen, setNewCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('+99890');

  // Success sheet state
  const [paidSuccessSale, setPaidSuccessSale] = useState<{ sale: Sale; qrUrl: string } | null>(null);

  // Return / Exchange modal
  const [returnModalMode, setReturnModalMode] = useState<'return' | 'exchange' | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("O'lchami to'g'ri kelmadi");
  const [returnMethod, setReturnMethod] = useState<PaymentMethod>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sale = useMemo(() => db?.sales.find((s) => s.id === id) ?? null, [db, id]);

  useEffect(() => {
    if (searchParams.get('tab') === 'payment') {
      setActiveTab('payment');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!sale) return;
    setOverrideCustomerId(sale.customerId ?? '');
    setCashGiven(sale.totalAmount);
    setSplitAmounts({ cash: sale.totalAmount });
    const priorReturned: Record<string, number> = {};
    (db?.returns ?? [])
      .filter((r) => r.saleId === sale.id)
      .forEach((r) =>
        r.items.forEach((ri) => {
          priorReturned[ri.saleItemId] = (priorReturned[ri.saleItemId] || 0) + ri.qty;
        })
      );
    const initRet: Record<string, number> = {};
    sale.items.forEach((it) => {
      initRet[it.id] = Math.max(0, it.qty - (priorReturned[it.id] || 0));
    });
    setReturnQtys(initRet);
  }, [sale?.id, db?.returns]);

  if (!db) return null;

  if (!sale) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center space-y-4">
        <div className="font-display text-lg font-bold">Tranzaksiya topilmadi</div>
        <button
          type="button"
          onClick={() => navigate('/transactions')}
          className="h-11 px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold"
        >
          Tranzaksiyalarga qaytish
        </button>
      </div>
    );
  }

  const store = db.stores.find((s) => s.id === sale.storeId);
  const totalAmount = sale.totalAmount;
  const enabledMethods = db.settings.enabledPaymentMethods.filter((m) => m !== 'loyalty');

  // Compute payment coverage
  const activePaymentList: { method: PaymentMethod; amount: number }[] = splitMode
    ? Object.entries(splitAmounts)
        .filter(([, amt]) => (amt ?? 0) > 0)
        .map(([method, amt]) => ({ method: method as PaymentMethod, amount: Number(amt) || 0 }))
    : [{ method: selectedSingleMethod, amount: totalAmount }];

  const splitSum = splitMode
    ? Object.values(splitAmounts).reduce((sum, v) => sum + (Number(v) || 0), 0)
    : totalAmount;

  const cashTarget = splitMode
    ? Number(splitAmounts.cash) || 0
    : selectedSingleMethod === 'cash'
    ? totalAmount
    : 0;

  const effectiveCashGiven = cashTarget > 0 ? cashGiven : 0;
  const changeAmount = cashTarget > 0 ? Math.max(0, effectiveCashGiven - cashTarget) : 0;
  const cashUnderpaid = cashTarget > 0 && effectiveCashGiven < cashTarget;

  const remainingToPay = splitMode
    ? Math.max(0, totalAmount - splitSum)
    : cashUnderpaid
    ? cashTarget - effectiveCashGiven
    : 0;

  const isCovered = splitMode
    ? splitSum === totalAmount && !cashUnderpaid
    : !cashUnderpaid;

  const hasDebtSelected = activePaymentList.some((p) => p.method === 'debt' && p.amount > 0);
  const effectiveCustomerId = overrideCustomerId || sale.customerId || '';

  const toggleSplitMethod = (method: PaymentMethod) => {
    setSplitAmounts((prev) => {
      const next = { ...prev };
      if (next[method] !== undefined) {
        delete next[method];
      } else {
        const currentSum = Object.values(next).reduce((s, v) => s + (Number(v) || 0), 0);
        const rem = Math.max(0, totalAmount - currentSum);
        next[method] = rem;
        if (method === 'cash') setCashGiven(rem);
      }
      return next;
    });
  };

  const handlePayNow = async () => {
    if (isSubmitting || sale.status !== 'deferred') return;
    if (!isCovered) {
      notify("To'lov summasi to'liq qoplanmagan", 'error');
      return;
    }
    if (hasDebtSelected && !effectiveCustomerId) {
      notify('Nasiya (qarz) uchun avval mijozni tanlang', 'error');
      return;
    }

    if (!db.settings.allowNegativeStock) {
      const insufficient = sale.items.find(
        (it) => it.qty > getVariantStock(it.variantId, sale.warehouseId)
      );
      if (insufficient) {
        notify(
          `"${insufficient.productName}" omborda yetarli emas (${getVariantStock(
            insufficient.variantId,
            sale.warehouseId
          )} qolgan)`,
          'error'
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const updatedSale = await payDeferredTransaction(sale.id, {
        payments: activePaymentList,
        cashGiven: cashTarget > 0 ? effectiveCashGiven : undefined,
        changeAmount: cashTarget > 0 ? changeAmount : undefined,
        customerId: effectiveCustomerId || undefined,
      });

      const qrUrl = await generateSaleQr(updatedSale, db.settings.showReceiptQr);
      setPaidSuccessSale({ sale: updatedSale, qrUrl });
      notify(`Tranzaksiya ${updatedSale.receiptNumber} to'landi`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : "To'lovni yakunlashda xatolik yuz berdi", 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = async (targetSale: Sale) => {
    await printSaleReceipt({
      sale: targetSale,
      settings: db.settings,
      store: db.stores.find((st) => st.id === targetSale.storeId),
      language,
      methodLabels: t.pos.methods as Record<string, string>,
    });
  };

  const handleShare = async (targetSale: Sale) => {
    const text = buildSaleShareText({
      sale: targetSale,
      brandName: db.settings.brandName,
      store: db.stores.find((st) => st.id === targetSale.storeId),
      language,
    });
    if (navigator.share) {
      try {
        await navigator.share({ title: `Chek ${targetSale.receiptNumber}`, text });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      notify('Chek matni buferga nusxalandi', 'success');
    } catch {
      notify('Ulashish imkonsiz', 'error');
    }
  };

  const quickCashAmounts = Array.from(
    new Set([
      cashTarget,
      Math.ceil(cashTarget / 10000) * 10000,
      Math.ceil(cashTarget / 50000) * 50000,
      Math.ceil(cashTarget / 100000) * 100000,
    ])
  ).filter((v) => v > 0);

  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !newCustName.trim()) return;
    const cleanPhone = newCustPhone.trim();
    if (cleanPhone.replace(/\D/g, '').length < 9) {
      notify("To'liq telefon raqamini kiriting", 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const created = await upsertCustomer({
        id: uid('cust'),
        name: newCustName.trim(),
        phone: cleanPhone,
        tags: [],
        segment: 'new',
        totalSpent: 0,
        ordersCount: 0,
        debtBalance: 0,
        storeId: sale.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: currentUser?.id ?? 'system',
      });
      setOverrideCustomerId(created.id);
      setNewCustomerModalOpen(false);
      setNewCustName('');
      setNewCustPhone('+99890');
      notify(`Mijoz "${created.name}" qo'shildi va tanlandi`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : "Mijoz qo'shishda xatolik", 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-28">
      {/* Dedicated Top Header: Back arrow + Tranzaksiya #... + Segmented Control */}
      <header className="no-print sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-5 pt-3 pb-3 space-y-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/transactions')}
            aria-label="Orqaga"
            className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate font-mono">
              Tranzaksiya {sale.receiptNumber}
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: store?.color || '#2563EB' }}
              />
              <span className="truncate">{store?.name}</span>
            </div>
          </div>
          {sale.status === 'deferred' && (
            <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[11px] font-bold shrink-0">
              {t.transactions.deferred}
            </span>
          )}
        </div>

        {/* Segmented Control: [Tafsilotlar | To'lov] */}
        <div className="max-w-2xl mx-auto grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`h-9 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'details'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {t.transactions.details}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payment')}
            className={`h-9 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'payment'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {t.transactions.payment}
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {activeTab === 'payment' ? (
          sale.status !== 'deferred' ? (
            /* Already Paid View on Payment Tab */
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                  {t.transactions.completed}
                </div>
                <div className="font-display font-mono tabular-nums text-2xl font-extrabold mt-1">
                  {formatUzsSpaced(sale.totalAmount)}
                </div>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1.5 text-xs text-left">
                {sale.payments.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <span className="text-slate-500">{t.pos.methods[p.method]}</span>
                    <span className="font-mono font-bold">{formatUzsSpaced(p.amount)}</span>
                  </div>
                ))}
                {sale.cashGiven ? (
                  <div className="flex justify-between text-slate-500">
                    <span>{t.pos.cashGiven}</span>
                    <span className="font-mono">{formatUzsSpaced(sale.cashGiven)}</span>
                  </div>
                ) : null}
                {sale.changeAmount ? (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>{t.pos.change}</span>
                    <span className="font-mono">{formatUzsSpaced(sale.changeAmount)}</span>
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => handlePrint(sale)}
                  className="h-11 rounded-xl bg-blue-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>{t.pos.printReceipt}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleShare(sale)}
                  className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <Share2 className="w-4 h-4" />
                  <span>{t.pos.share}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Active Deferred Transaction Payment Screen */
            <div className="space-y-4">
              {/* Big Total Amount Display */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-center space-y-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t.common.total}
                </div>
                <div className="font-display font-mono tabular-nums text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
                  {formatUzsSpaced(totalAmount)}
                </div>

                {/* Quick customer attach + Add New Customer */}
                <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                  <select
                    value={overrideCustomerId}
                    onChange={(e) => setOverrideCustomerId(e.target.value)}
                    className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium max-w-[230px]"
                  >
                    <option value="">{t.pos.walkIn}</option>
                    {db.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setNewCustomerModalOpen(true)}
                    className="h-9 px-3 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold inline-flex items-center gap-1 hover:bg-blue-100 dark:hover:bg-blue-950"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>+ Yangi mijoz</span>
                  </button>
                </div>
              </div>

              {/* "Aralash to'lov" Toggle */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {t.pos.splitPayment}
                  </div>
                  <div className="text-xs text-slate-500">
                    Bir nechta to'lov usulini birlashtirish
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={splitMode}
                  onClick={() => {
                    const next = !splitMode;
                    setSplitMode(next);
                    if (next) {
                      setSplitAmounts({ [selectedSingleMethod]: totalAmount });
                    } else {
                      const first = (Object.keys(splitAmounts)[0] as PaymentMethod) || 'cash';
                      setSelectedSingleMethod(first);
                    }
                  }}
                  className={`w-12 h-7 rounded-full p-0.5 transition-colors ${
                    splitMode ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full bg-white shadow-xs transition-transform ${
                      splitMode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 2-Column Payment Method Tiles */}
              <div className="grid grid-cols-2 gap-2.5">
                {enabledMethods.map((method) => {
                  const Icon = getMethodIcon(method);
                  const isSelected = splitMode
                    ? splitAmounts[method] !== undefined
                    : selectedSingleMethod === method;
                  return (
                    <div
                      key={method}
                      className={`rounded-2xl border p-3 transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-1 ring-blue-600'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (splitMode) {
                            toggleSplitMethod(method);
                          } else {
                            setSelectedSingleMethod(method);
                            if (method === 'cash') setCashGiven(totalAmount);
                          }
                        }}
                        className="w-full flex items-center gap-2.5 text-left"
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {t.pos.methods[method]}
                        </span>
                      </button>

                      {splitMode && isSelected && (
                        <div className="mt-2.5 flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            value={splitAmounts[method] ?? 0}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value));
                              setSplitAmounts((prev) => ({ ...prev, [method]: val }));
                              if (method === 'cash') setCashGiven(val);
                            }}
                            className="w-full h-10 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm font-bold text-right"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Highlighted Nasiya Customer Selector when Debt is active */}
              {hasDebtSelected && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-amber-800 dark:text-amber-300">
                        Nasiya (Qarz) uchun mijoz
                      </div>
                      <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                        Mijozni ro'yxatdan tanlang yoki raqami bilan yangi qo'shing
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewCustomerModalOpen(true)}
                      className="h-9 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Yangi odam qo'shish</span>
                    </button>
                  </div>
                  <select
                    value={overrideCustomerId}
                    onChange={(e) => setOverrideCustomerId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                  >
                    <option value="">— Mijozni tanlang —</option>
                    {db.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cash "Berilgan summa" & Qaytim */}
              {cashTarget > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      {t.pos.cashGiven}
                    </label>
                    <span className="text-xs text-slate-400 font-mono">
                      Kerak: {formatUzsSpaced(cashTarget)}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={cashGiven}
                    onChange={(e) => setCashGiven(Math.max(0, Number(e.target.value)))}
                    className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-lg font-bold text-right"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {quickCashAmounts.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCashGiven(amt)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-xs font-mono font-semibold"
                      >
                        {formatUzsSpaced(amt)}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-sm">
                    <span className="text-slate-500 font-medium">{t.pos.change}:</span>
                    <span className="font-mono tabular-nums font-bold text-emerald-600">
                      {formatUzsSpaced(changeAmount)}
                    </span>
                  </div>
                </div>
              )}

              {/* Live Coverage Indicator: Red until covered, Green when covered */}
              <div
                className={`rounded-2xl px-4 py-3 flex items-center justify-between text-sm font-bold ${
                  isCovered
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                }`}
              >
                <span>{t.pos.remaining}:</span>
                <span className="font-mono tabular-nums">
                  {isCovered
                    ? `0 UZS (To'liq qoplandi)`
                    : formatUzsSpaced(remainingToPay)}
                </span>
              </div>

              {/* Bottom Action Buttons: Kechiktirish + To'lash */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    notify(`Tranzaksiya ${sale.receiptNumber} kechiktirildi`, 'info');
                    navigate('/transactions');
                  }}
                  className="h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Clock className="w-4 h-4" />
                  <span>{t.pos.hold}</span>
                </button>

                <button
                  type="button"
                  disabled={!isCovered || isSubmitting}
                  onClick={handlePayNow}
                  className="h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t.pos.completeSale}</span>
                </button>
              </div>
            </div>
          )
        ) : (
          /* Tafsilotlar Tab */
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Holat</span>
                <span
                  className={`px-2.5 py-1 rounded-lg font-bold ${
                    sale.status === 'completed'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                      : sale.status === 'deferred'
                      ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                      : 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                  }`}
                >
                  {sale.status === 'completed'
                    ? t.transactions.completed
                    : sale.status === 'deferred'
                    ? t.transactions.deferred
                    : sale.status === 'returned'
                    ? t.transactions.returned
                    : t.transactions.partialReturn}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sotuv ID</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">{sale.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t.common.date}</span>
                <span className="font-mono">{formatDateTime(sale.paidAt || sale.createdAt, language)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sotuvchi</span>
                <span className="font-semibold">{sale.cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t.pos.customer}</span>
                <span className="font-semibold">{sale.customerName || t.pos.walkIn}</span>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
              {sale.items.map((it) => (
                <div key={it.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {it.productName}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      <span className="font-mono">{it.sku}</span>
                      {it.variantLabel && <span> · {it.variantLabel}</span>}
                      <span> · {it.qty} × {formatUzsSpaced(it.unitPrice)}</span>
                    </div>
                  </div>
                  <div className="font-mono tabular-nums text-sm font-bold shrink-0">
                    {formatUzsSpaced(it.lineTotal)}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>{t.pos.subtotal}</span>
                <span className="font-mono">{formatUzsSpaced(sale.subtotal)}</span>
              </div>
              {sale.checkDiscountAmount > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>{t.pos.discount}</span>
                  <span className="font-mono">-{formatUzsSpaced(sale.checkDiscountAmount)}</span>
                </div>
              )}
              {sale.loyaltyPointsSpent > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>{t.pos.methods.loyalty}</span>
                  <span className="font-mono">-{formatUzsSpaced(sale.loyaltyPointsSpent)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-100 dark:border-slate-800">
                <span>{t.common.total}</span>
                <span className="font-mono text-blue-600 dark:text-blue-400">
                  {formatUzsSpaced(sale.totalAmount)}
                </span>
              </div>
              {sale.payments.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                  {sale.payments.map((p) => (
                    <div key={p.id} className="flex justify-between text-slate-500">
                      <span>{t.pos.methods[p.method]}</span>
                      <span className="font-mono">{formatUzsSpaced(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detail Tab Actions */}
            {sale.status === 'deferred' ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={async () => {
                    if (isSubmitting) return;
                    setIsSubmitting(true);
                    try {
                      await deleteDeferredTransaction(sale.id);
                      notify("Kechiktirilgan tranzaksiya o'chirildi", 'info');
                      navigate('/transactions');
                    } catch (err) {
                      notify(err instanceof Error ? err.message : "Tranzaksiyani o'chirishda xatolik", 'error');
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  className="h-12 rounded-2xl border border-red-200 dark:border-red-900/60 disabled:opacity-50 text-red-600 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t.common.delete}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('payment')}
                  className="h-12 rounded-2xl bg-blue-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{t.pos.pay}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handlePrint(sale)}
                    className="h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    <span>{t.pos.printReceipt}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare(sale)}
                    className="h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold inline-flex items-center justify-center gap-2"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{t.pos.share}</span>
                  </button>
                </div>

                {(sale.status === 'completed' || sale.status === 'partial_return') && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setReturnModalMode('return')}
                      className="h-11 rounded-2xl border border-red-200 dark:border-red-900/60 text-red-600 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{t.transactions.returnItems}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReturnModalMode('exchange')}
                      className="h-11 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                      <span>{t.transactions.exchangeItems}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Success Sheet after Atomic Payment */}
      {paidSuccessSale && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-5 pb-safe space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                To'lov muvaffaqiyatli!
              </h3>
              <p className="text-xs text-slate-500 font-mono">{paidSuccessSale.sale.receiptNumber}</p>
            </div>

            {/* Thermal Chek Preview */}
            <div className="p-4 rounded-2xl bg-slate-50 text-slate-900 border border-slate-200 font-mono text-[11px] space-y-1.5 max-h-64 overflow-y-auto">
              <div className="text-center font-bold text-xs">{db.settings.brandName}</div>
              {store && <div className="text-center font-semibold">{store.name}</div>}
              {store?.phone && <div className="text-center text-[10px]">Tel: {store.phone}</div>}
              <div className="border-t border-dashed border-slate-300 my-1.5" />
              <div>Chek: {paidSuccessSale.sale.receiptNumber}</div>
              <div>Sana: {formatDateTime(paidSuccessSale.sale.paidAt || paidSuccessSale.sale.createdAt, language)}</div>
              <div>Sotuvchi: {paidSuccessSale.sale.cashierName}</div>
              <div className="border-t border-dashed border-slate-300 my-1.5" />
              {paidSuccessSale.sale.items.map((it) => (
                <div key={it.id} className="flex justify-between gap-2">
                  <span className="truncate">{it.productName} ×{it.qty}</span>
                  <span className="shrink-0 font-bold">{formatUzsSpaced(it.lineTotal)}</span>
                </div>
              ))}
              <div className="border-t border-dashed border-slate-300 my-1.5" />
              <div className="flex justify-between font-bold text-xs">
                <span>JAMI</span>
                <span>{formatUzsSpaced(paidSuccessSale.sale.totalAmount)}</span>
              </div>
              {paidSuccessSale.sale.payments.map((p) => (
                <div key={p.id} className="flex justify-between text-[10px] text-slate-600">
                  <span>{t.pos.methods[p.method]}</span>
                  <span>{formatMoney(p.amount, { lang: language })}</span>
                </div>
              ))}
              <div className="text-center text-[10px] text-slate-500 pt-1">Xaridingiz uchun rahmat!</div>
              {paidSuccessSale.qrUrl && (
                <div className="flex justify-center pt-1.5">
                  <img src={paidSuccessSale.qrUrl} alt="Chek QR" className="w-20 h-20" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handlePrint(paidSuccessSale.sale)}
                className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold inline-flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>{t.pos.printReceipt}</span>
              </button>
              <button
                type="button"
                onClick={() => handleShare(paidSuccessSale.sale)}
                className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold inline-flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-4 h-4" />
                <span>{t.pos.share}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setPaidSuccessSale(null);
                navigate('/pos');
              }}
              className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{t.pos.newSale}</span>
            </button>
          </div>
        </div>
      )}

      {/* Return / Exchange Modal */}
      {returnModalMode && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-5 pb-safe space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">
                {returnModalMode === 'exchange'
                  ? t.transactions.exchangeItems
                  : t.transactions.returnItems}
              </h3>
              <button
                type="button"
                onClick={() => setReturnModalMode(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {sale.items.map((it) => {
                const alreadyRet = db.returns
                  .filter((r) => r.saleId === sale.id)
                  .reduce(
                    (sum, r) =>
                      sum + r.items.filter((ri) => ri.saleItemId === it.id).reduce((s2, ri) => s2 + ri.qty, 0),
                    0
                  );
                const remainingQty = Math.max(0, it.qty - alreadyRet);
                return (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-800 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{it.productName}</div>
                      <div className="text-slate-400">
                        Sotilgan: {it.qty} {alreadyRet > 0 ? `· Qaytgan: ${alreadyRet} · Qoldi: ${remainingQty}` : ''}
                      </div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={remainingQty}
                      disabled={remainingQty === 0}
                      value={returnQtys[it.id] ?? 0}
                      onChange={(e) =>
                        setReturnQtys((prev) => ({
                          ...prev,
                          [it.id]: Math.min(remainingQty, Math.max(0, Number(e.target.value))),
                        }))
                      }
                      className="w-16 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-center font-mono disabled:opacity-40"
                    />
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={returnMethod}
                onChange={(e) => setReturnMethod(e.target.value as PaymentMethod)}
                className="h-10 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="cash">Naqd qaytarish</option>
                <option value="uzcard">Karta qaytarish</option>
              </select>
              <input
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Sababi"
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={async () => {
                if (isSubmitting) return;
                const itemsToReturn = Object.entries(returnQtys)
                  .filter(([, q]) => q > 0)
                  .map(([saleItemId, qty]) => ({ saleItemId, qty }));
                if (itemsToReturn.length === 0) return;
                setIsSubmitting(true);
                try {
                  await processReturn({
                    saleId: sale.id,
                    items: itemsToReturn,
                    refundMethod: returnMethod,
                    reason: returnReason,
                    isExchange: returnModalMode === 'exchange',
                  });
                  const mode = returnModalMode;
                  setReturnModalMode(null);
                  if (mode === 'exchange') {
                    notify("Qaytarish omborga qayd etildi — yangi tovarni Savatchadan tanlang", 'success');
                    navigate('/pos');
                  } else {
                    notify("Qaytarish rasmiylashtirildi", 'success');
                  }
                } catch (err) {
                  notify(err instanceof Error ? err.message : 'Qaytarishda xatolik yuz berdi', 'error');
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="w-full h-11 rounded-xl bg-red-600 disabled:opacity-50 text-white text-xs font-bold"
            >
              {returnModalMode === 'exchange'
                ? "Qaytarib, Savatchaga o'tish"
                : 'Qaytarishni tasdiqlash'}
            </button>
          </div>
        </div>
      )}
      {/* Quick Add Customer Modal (Nasiya / Payment) */}
      {newCustomerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleQuickCreateCustomer}
            className="w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-5 pb-safe space-y-3.5 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Nasiya / Chek uchun yangi mijoz</h3>
              <button
                type="button"
                onClick={() => setNewCustomerModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Mijoz ismi *</label>
              <input
                required
                autoFocus
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="Masalan: Azizbek Rahimov"
                className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Telefon raqami *</label>
              <input
                required
                type="tel"
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                placeholder="+998901234567"
                className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNewCustomerModalOpen(false)}
                className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                Qo'shish va tanlash
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
