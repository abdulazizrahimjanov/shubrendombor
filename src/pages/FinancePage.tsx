import React, { useMemo, useState } from 'react';
import { Plus, ArrowRightLeft, Printer, Download, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { formatDate, formatMoney, useT } from '../i18n';
import { Expense } from '../types/models';
import { exportToExcel } from '../utils/export';
import { printHtmlDocument } from '../utils/print';

export const FinancePage: React.FC = () => {
  const db = useAppStore((s) => s.db);
  const language = useAppStore((s) => s.language);
  const activeStoreId = useAppStore((s) => s.activeStoreId);
  const addExpense = useAppStore((s) => s.addExpense);
  const transferFunds = useAppStore((s) => s.transferFunds);
  const notify = useAppStore((s) => s.notify);
  const t = useT();

  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('month');
  const [expOpen, setExpOpen] = useState(false);
  const [trfOpen, setTrfOpen] = useState(false);

  const [expAccount, setExpAccount] = useState('');
  const [expCategory, setExpCategory] = useState<Expense['category']>('rent');
  const [expAmount, setExpAmount] = useState(500000);
  const [expDesc, setExpDesc] = useState('');
  const [expRecurring, setExpRecurring] = useState(false);

  const [trfFrom, setTrfFrom] = useState('');
  const [trfTo, setTrfTo] = useState('');
  const [trfAmount, setTrfAmount] = useState(1000000);
  const [trfNote, setTrfNote] = useState('Inkassatsiya');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pnl = useMemo(() => {
    if (!db) return { revenue: 0, cogs: 0, gross: 0, expenses: 0, net: 0, cashIn: 0, cashOut: 0 };
    const cutoff =
      period === 'week'
        ? Date.now() - 7 * 86400000
        : period === 'month'
        ? Date.now() - 30 * 86400000
        : 0;

    const sales = db.sales.filter(
      (s) =>
        s.status !== 'deferred' &&
        (activeStoreId === 'all' || s.storeId === activeStoreId) &&
        new Date(s.createdAt).getTime() >= cutoff
    );
    const returns = db.returns.filter(
      (r) =>
        (activeStoreId === 'all' || r.storeId === activeStoreId) &&
        new Date(r.createdAt).getTime() >= cutoff
    );
    const expenses = db.expenses.filter(
      (e) =>
        (activeStoreId === 'all' || e.storeId === activeStoreId) &&
        new Date(e.date).getTime() >= cutoff
    );

    const retRevenue = returns.reduce((sum, r) => sum + r.totalRefund, 0);
    const retCogs = returns.reduce(
      (sum, r) => sum + r.items.reduce((s2, ri) => s2 + ri.purchasePrice * ri.qty, 0),
      0
    );

    const revenue = sales.reduce((sum, s) => sum + s.totalAmount, 0) - retRevenue;
    const cogs = sales.reduce((sum, s) => sum + s.costTotal, 0) - retCogs;
    const gross = revenue - cogs;
    const expTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
    const net = gross - expTotal;
    const cashIn = sales.reduce((sum, s) => sum + s.paidAmount, 0);
    const cashOut = expTotal + retRevenue;
    return { revenue, cogs, gross, expenses: expTotal, net, cashIn, cashOut };
  }, [db, period, activeStoreId]);

  if (!db) return null;

  const customerDebtTotal = db.debts.reduce((s, d) => s + d.remainingAmount, 0);
  const supplierDebtTotal = db.suppliers.reduce((s, sup) => s + sup.debtBalance, 0);

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
          {(['week', 'month', 'all'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                period === p ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {p === 'week' ? t.common.week : p === 'month' ? t.common.month : t.common.all}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setTrfFrom(db.accounts[0]?.id ?? '');
              setTrfTo(db.accounts[1]?.id ?? db.accounts[0]?.id ?? '');
              setTrfOpen(true);
            }}
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>{t.finance.transferFunds}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setExpAccount(db.accounts[0]?.id ?? '');
              setExpOpen(true);
            }}
            className="h-9 px-3.5 rounded-lg bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.finance.addExpense}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportToExcel(
                db.expenses.map((e) => ({ Sana: formatDate(e.date), Kategoriya: e.category, Summa: e.amount, Izoh: e.description })),
                'moliya-xarajatlar'
              )
            }
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={() =>
              printHtmlDocument(
                `<h2>Foyda va Zarar (P&L) · SHU BREND OMBOR</h2>
                 <table>
                   <tr><td>Tushum</td><td class="num">${formatMoney(pnl.revenue, { lang: language })}</td></tr>
                   <tr><td>Tannarx (COGS)</td><td class="num">-${formatMoney(pnl.cogs, { lang: language })}</td></tr>
                   <tr><td><b>Yalpi foyda</b></td><td class="num"><b>${formatMoney(pnl.gross, { lang: language })}</b></td></tr>
                   <tr><td>Xarajatlar</td><td class="num">-${formatMoney(pnl.expenses, { lang: language })}</td></tr>
                   <tr><td><b>Sof foyda</b></td><td class="num"><b>${formatMoney(pnl.net, { lang: language })}</b></td></tr>
                 </table>`,
                'P&L Hisobot'
              )
            }
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Accounts Balances */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {db.accounts.map((acc) => (
          <div key={acc.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">{acc.name} · {acc.type}</div>
            <div className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-white mt-1.5">
              {formatMoney(acc.balance, { lang: language })}
            </div>
          </div>
        ))}
      </div>

      {/* P&L and Debts Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="font-display text-base font-bold">{t.finance.pnl} & {t.finance.cashFlow}</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">{t.dashboard.revenue}</span>
              <span className="font-mono font-semibold">{formatMoney(pnl.revenue, { lang: language })}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">{t.finance.cogs}</span>
              <span className="font-mono text-slate-500">-{formatMoney(pnl.cogs, { lang: language })}</span>
            </div>
            <div className="py-2.5 flex justify-between font-semibold">
              <span>{t.finance.grossProfit}</span>
              <span className="font-mono">{formatMoney(pnl.gross, { lang: language })}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">{t.finance.expensesTotal}</span>
              <span className="font-mono text-red-600">-{formatMoney(pnl.expenses, { lang: language })}</span>
            </div>
            <div className="py-3 flex justify-between text-base font-bold">
              <span>{t.finance.netProfit}</span>
              <span className={`font-mono ${pnl.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatMoney(pnl.net, { lang: language })}
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-xs text-slate-500">
            <span>Cash In: <strong className="font-mono text-emerald-600">{formatMoney(pnl.cashIn, { lang: language })}</strong></span>
            <span>Cash Out: <strong className="font-mono text-red-600">{formatMoney(pnl.cashOut, { lang: language })}</strong></span>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="font-display text-base font-bold">{t.dashboard.debtsSummary}</h2>
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <div className="text-xs text-slate-500">{t.dashboard.customerDebts}</div>
                <div className="font-mono font-bold text-base text-teal-700 dark:text-teal-400 mt-0.5">
                  +{formatMoney(customerDebtTotal, { lang: language })}
                </div>
              </div>
              <span className="text-xs text-slate-400">{db.debts.filter((d) => d.remainingAmount > 0).length} ta</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <div className="text-xs text-slate-500">{t.dashboard.supplierDebts}</div>
                <div className="font-mono font-bold text-base text-red-600 mt-0.5">
                  -{formatMoney(supplierDebtTotal, { lang: language })}
                </div>
              </div>
              <span className="text-xs text-slate-400">{db.suppliers.filter((s) => s.debtBalance > 0).length} ta</span>
            </div>
          </div>
        </div>
      </div>

      {/* Expenses & Transactions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm">Xarajatlar jurnali</div>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-slate-500">
              <th className="py-2.5 px-3">Sana</th>
              <th className="py-2.5 px-3">Kategoriya</th>
              <th className="py-2.5 px-3">Izoh</th>
              <th className="py-2.5 px-3">Takroriy</th>
              <th className="py-2.5 px-3 text-right">Summa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {db.expenses.map((e) => (
              <tr key={e.id}>
                <td className="py-2.5 px-3 font-mono text-slate-500">{formatDate(e.date)}</td>
                <td className="py-2.5 px-3 font-semibold uppercase">{e.category}</td>
                <td className="py-2.5 px-3">{e.description}</td>
                <td className="py-2.5 px-3 text-slate-500">{e.isRecurring ? 'Har oy' : 'Bir martalik'}</td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600">
                  -{formatMoney(e.amount, { lang: language })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Expense Modal */}
      {expOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.finance.addExpense}</h3>
              <button type="button" onClick={() => setExpOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <select value={expAccount} onChange={(e) => setExpAccount(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              {db.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={expCategory} onChange={(e) => setExpCategory(e.target.value as Expense['category'])} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              <option value="rent">Ijara (Rent)</option>
              <option value="salary">Oylik maosh</option>
              <option value="utilities">Kommunal</option>
              <option value="delivery">Yetkazib berish</option>
              <option value="marketing">Marketing</option>
              <option value="taxes">Soliqlar</option>
              <option value="other">Boshqa</option>
            </select>
            <input type="number" min={1} value={expAmount} onChange={(e) => setExpAmount(Number(e.target.value))} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono" />
            <input value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Tavsif" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs" />
            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" checked={expRecurring} onChange={(e) => setExpRecurring(e.target.checked)} />
              <span>Takroriy oylik xarajat</span>
            </label>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={async () => {
                if (isSubmitting) return;
                if (!Number.isFinite(expAmount) || expAmount <= 0) {
                  notify("Xarajat summasi 0 dan katta bo'lishi kerak", 'error');
                  return;
                }
                setIsSubmitting(true);
                try {
                  await addExpense({
                    accountId: expAccount,
                    category: expCategory,
                    amount: expAmount,
                    description: expDesc || expCategory,
                    isRecurring: expRecurring,
                    date: new Date().toISOString(),
                    storeId: activeStoreId !== 'all' ? activeStoreId : db.stores[0].id,
                  });
                  notify('Xarajat saqlandi', 'success');
                  setExpOpen(false);
                  setExpDesc('');
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="w-full h-10 rounded-lg bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      )}

      {/* Transfer Funds Modal */}
      {trfOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.finance.transferFunds}</h3>
              <button type="button" onClick={() => setTrfOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <select value={trfFrom} onChange={(e) => setTrfFrom(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              {db.accounts.map((a) => <option key={a.id} value={a.id}>Qayerdan: {a.name}</option>)}
            </select>
            <select value={trfTo} onChange={(e) => setTrfTo(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              {db.accounts.map((a) => <option key={a.id} value={a.id}>Qayerga: {a.name}</option>)}
            </select>
            <input type="number" min={1} value={trfAmount} onChange={(e) => setTrfAmount(Number(e.target.value))} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono" />
            <input value={trfNote} onChange={(e) => setTrfNote(e.target.value)} placeholder="Izoh" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs" />
            <button
              type="button"
              disabled={isSubmitting}
              onClick={async () => {
                if (isSubmitting) return;
                if (!Number.isFinite(trfAmount) || trfAmount <= 0) {
                  notify("O'tkazma summasi 0 dan katta bo'lishi kerak", 'error');
                  return;
                }
                if (!trfFrom || !trfTo || trfFrom === trfTo) {
                  notify("O'tkazma uchun ikki xil hisob tanlang", 'error');
                  return;
                }
                setIsSubmitting(true);
                try {
                  await transferFunds(trfFrom, trfTo, trfAmount, trfNote);
                  notify("O'tkazma bajarildi", 'success');
                  setTrfOpen(false);
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="w-full h-10 rounded-lg bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold"
            >
              O'tkazish
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
