import React, { useMemo, useState } from 'react';
import {
  Search,
  UserPlus,
  Send,
  Download,
  Ticket,
  X,
  CreditCard,
} from 'lucide-react';
import { useAppStore, uid } from '../store/useAppStore';
import { formatDate, formatDateTime, formatMoney, useT } from '../i18n';
import { Customer, CustomerSegment, Debt, PaymentMethod, PromoCode } from '../types/models';
import { exportToCsv } from '../utils/export';
import { notificationProvider } from '../integrations/interfaces';

export const CustomersPage: React.FC = () => {
  const db = useAppStore((s) => s.db);
  const language = useAppStore((s) => s.language);
  const activeStoreId = useAppStore((s) => s.activeStoreId);
  const upsertCustomer = useAppStore((s) => s.upsertCustomer);
  const repayDebt = useAppStore((s) => s.repayDebt);
  const upsertPromoCode = useAppStore((s) => s.upsertPromoCode);
  const notify = useAppStore((s) => s.notify);
  const t = useT();

  const [segment, setSegment] = useState<'all' | CustomerSegment | 'debt'>('all');
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('+99890');
  const [cBirthday, setCBirthday] = useState('');
  const [cNotes, setCNotes] = useState('');

  // Debt repayment modal
  const [repayTarget, setRepayTarget] = useState<Debt | null>(null);
  const [repayAmount, setRepayAmount] = useState(0);
  const [repayMethod, setRepayMethod] = useState<PaymentMethod>('cash');

  // Broadcast modal
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastChannel, setBroadcastChannel] = useState<'sms' | 'telegram'>('sms');
  const [broadcastMsg, setBroadcastMsg] = useState('SHU BREND OMBOR: Siz uchun 10% chegirma! Promokod: YANGI10');

  // Promo modal
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCodeVal, setPromoCodeVal] = useState('');
  const [promoDiscountVal, setPromoDiscountVal] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filtered = useMemo(() => {
    if (!db) return [];
    return db.customers.filter((c) => {
      if (segment === 'debt' && c.debtBalance <= 0) return false;
      if (segment !== 'all' && segment !== 'debt' && c.segment !== segment) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
      }
      return true;
    });
  }, [db, segment, search]);

  if (!db) return null;

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim()) return;
    const nowIso = new Date().toISOString();
    await upsertCustomer({
      id: uid('cust'),
      name: cName.trim(),
      phone: cPhone.trim(),
      birthday: cBirthday || undefined,
      notes: cNotes || undefined,
      tags: [],
      segment: 'new',
      totalSpent: 0,
      ordersCount: 0,
      debtBalance: 0,
      storeId: activeStoreId !== 'all' ? activeStoreId : db.stores[0].id,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: 'usr-cashier',
    });
    notify("Mijoz qo'shildi", 'success');
    setNewCustomerOpen(false);
    setCName('');
    setCPhone('+99890');
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.common.search}
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPromoOpen(true)}
              className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>{t.customers.promoCodes} ({db.promoCodes.length})</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  filtered.map((c) => ({ Ism: c.name, Telefon: c.phone, Segment: c.segment, JamiXarid: c.totalSpent })),
                  'mijozlar-bazasi'
                )
              }
              className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setBroadcastOpen(true)}
              className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t.customers.broadcast}</span>
            </button>
            <button
              type="button"
              onClick={() => setNewCustomerOpen(true)}
              className="h-10 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>{t.customers.addCustomer}</span>
            </button>
          </div>
        </div>

        {/* Segment Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(['all', 'vip', 'regular', 'new', 'sleeping', 'debt'] as const).map((seg) => (
            <button
              key={seg}
              type="button"
              onClick={() => setSegment(seg)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                segment === seg
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {t.customers.segments[seg]}
            </button>
          ))}
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-slate-500 font-semibold">
              <th className="py-3 px-3">Mijoz</th>
              <th className="py-3 px-3">Segment / Daraja</th>
              <th className="py-3 px-3 text-right">{t.customers.totalSpent}</th>
              <th className="py-3 px-3 text-right">{t.customers.avgCheck}</th>
              <th className="py-3 px-3 text-right">{t.customers.cashbackBalance}</th>
              <th className="py-3 px-3 text-right">{t.customers.debtBalance}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((c) => {
              const loy = db.loyaltyAccounts.find((l) => l.customerId === c.id);
              const avg = c.ordersCount > 0 ? Math.round(c.totalSpent / c.ordersCount) : 0;
              return (
                <tr
                  key={c.id}
                  onClick={() => setSelectedCustomer(c)}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-900 dark:text-white">{c.name}</div>
                    <div className="text-[11px] font-mono text-slate-500">{c.phone}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                    {t.customers.segments[c.segment]} · {loy ? `${loy.tier.toUpperCase()} (${loy.cashbackPercent}%)` : '—'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                    {formatMoney(c.totalSpent, { lang: language })}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-500">
                    {formatMoney(avg, { lang: language })}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-teal-700 dark:text-teal-400">
                    {loy ? formatMoney(loy.pointsBalance, { lang: language }) : '—'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {c.debtBalance > 0 ? (
                      <span className="text-red-600 font-bold">{formatMoney(c.debtBalance, { lang: language })}</span>
                    ) : (
                      '0'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Customer Detail Drawer / Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold">{selectedCustomer.name}</h3>
                <div className="text-xs text-slate-500 font-mono">
                  {selectedCustomer.phone} · Tug'ilgan kun: {selectedCustomer.birthday || '—'}
                </div>
              </div>
              <button type="button" onClick={() => setSelectedCustomer(null)}><X className="w-4 h-4" /></button>
            </div>

            {(() => {
              const loy = db.loyaltyAccounts.find((l) => l.customerId === selectedCustomer.id);
              const custDebts = db.debts.filter((d) => d.customerId === selectedCustomer.id && d.remainingAmount > 0);
              const custSales = db.sales.filter((s) => s.customerId === selectedCustomer.id);

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-500">Karta / Keshbek</div>
                      <div className="font-mono font-bold text-sm mt-1">
                        {loy ? `${formatMoney(loy.pointsBalance, { lang: language })}` : '0'}
                      </div>
                      {loy?.expiresAt && (
                        <div className="text-[11px] text-slate-400 mt-0.5">Amal qiladi: {formatDate(loy.expiresAt)}</div>
                      )}
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-500">Xaridlar ({selectedCustomer.ordersCount})</div>
                      <div className="font-mono font-bold text-sm mt-1">
                        {formatMoney(selectedCustomer.totalSpent, { lang: language })}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-500">{t.customers.debtBalance}</div>
                      <div className="font-mono font-bold text-sm text-red-600 mt-1">
                        {formatMoney(selectedCustomer.debtBalance, { lang: language })}
                      </div>
                    </div>
                  </div>

                  {custDebts.length > 0 && (
                    <div className="border border-red-200 dark:border-red-900 rounded-xl p-3 space-y-2">
                      <div className="text-xs font-bold text-red-700 dark:text-red-400">Ochiq qarzlar (Nasiya)</div>
                      {custDebts.map((d) => (
                        <div key={d.id} className="flex items-center justify-between text-xs">
                          <div>
                            <div className="font-mono font-semibold">Qolgan: {formatMoney(d.remainingAmount, { lang: language })}</div>
                            <div className="text-slate-500">Muddat: {formatDate(d.dueDate)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setRepayTarget(d);
                              setRepayAmount(d.remainingAmount);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-teal-700 text-white font-semibold inline-flex items-center gap-1"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>{t.customers.repayDebt}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-semibold mb-2">Xaridlar tarixi</div>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto text-xs">
                      {custSales.length === 0 ? (
                        <div className="p-4 text-center text-slate-400">Cheklar topilmadi</div>
                      ) : (
                        custSales.map((s) => (
                          <div key={s.id} className="p-2.5 flex justify-between">
                            <div>
                              <span className="font-mono font-bold">{s.receiptNumber}</span> · {formatDateTime(s.createdAt, language)}
                            </div>
                            <span className="font-mono font-semibold">{formatMoney(s.totalAmount, { lang: language })}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Debt Repayment Modal */}
      {repayTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.customers.repayDebt}</h3>
              <button type="button" onClick={() => setRepayTarget(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="text-xs text-slate-500">{repayTarget.customerName}</div>
            <input
              type="number"
              min={1}
              max={repayTarget.remainingAmount}
              value={repayAmount}
              onChange={(e) => setRepayAmount(Number(e.target.value))}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
            />
            <select
              value={repayMethod}
              onChange={(e) => setRepayMethod(e.target.value as PaymentMethod)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            >
              <option value="cash">Naqd</option>
              <option value="uzcard">Uzcard</option>
              <option value="humo">Humo</option>
              <option value="click">Click</option>
              <option value="payme">Payme</option>
            </select>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={async () => {
                if (isSubmitting) return;
                if (!Number.isFinite(repayAmount) || repayAmount <= 0 || repayAmount > repayTarget.remainingAmount) {
                  notify(`To'lov summasi 1 dan ${repayTarget.remainingAmount} gacha bo'lishi kerak`, 'error');
                  return;
                }
                setIsSubmitting(true);
                try {
                  await repayDebt(repayTarget.id, repayAmount, repayMethod);
                  notify("Qarz to'lovi qabul qilindi", 'success');
                  setRepayTarget(null);
                  setSelectedCustomer(null);
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="w-full h-10 rounded-lg bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold"
            >
              Tasdiqlash
            </button>
          </div>
        </div>
      )}

      {/* New Customer Modal */}
      {newCustomerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleSaveCustomer} className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.customers.addCustomer}</h3>
              <button type="button" onClick={() => setNewCustomerOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <input required value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Ism familiya" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs" />
            <input required value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="Telefon" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
            <input type="date" value={cBirthday} onChange={(e) => setCBirthday(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs" />
            <input value={cNotes} onChange={(e) => setCNotes(e.target.value)} placeholder="Izoh" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs" />
            <button type="submit" className="w-full h-10 rounded-lg bg-teal-700 text-white text-xs font-semibold">{t.common.save}</button>
          </form>
        </div>
      )}

      {/* Broadcast Modal (Integration-ready interface) */}
      {broadcastOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.customers.broadcast}</h3>
              <button type="button" onClick={() => setBroadcastOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500">
              Tanlangan segment: <strong>{filtered.length} ta mijoz</strong> (Integratsiya interfeysi — Eskiz SMS / Telegram Bot API ulangandan so'ng jonli yuboriladi).
            </p>
            <select value={broadcastChannel} onChange={(e) => setBroadcastChannel(e.target.value as 'sms' | 'telegram')} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              <option value="sms">SMS (Eskiz.uz)</option>
              <option value="telegram">Telegram Bot</option>
            </select>
            <textarea rows={3} value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)} className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs" />
            <button
              type="button"
              onClick={async () => {
                const res = await notificationProvider.sendBroadcast({
                  channel: broadcastChannel,
                  recipients: filtered.map((c) => ({ name: c.name, phone: c.phone })),
                  message: broadcastMsg,
                });
                notify(res.note, 'info');
                setBroadcastOpen(false);
              }}
              className="w-full h-10 rounded-lg bg-teal-700 text-white text-xs font-semibold"
            >
              Xabarnomani sinab yuborish
            </button>
          </div>
        </div>
      )}

      {/* Promo Codes Modal */}
      {promoOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.customers.promoCodes}</h3>
              <button type="button" onClick={() => setPromoOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-2">
              <input value={promoCodeVal} onChange={(e) => setPromoCodeVal(e.target.value.toUpperCase())} placeholder="KOD (mas. BAHOR15)" className="flex-1 h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
              <input type="number" value={promoDiscountVal} onChange={(e) => setPromoDiscountVal(Number(e.target.value))} className="w-16 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
              <button
                type="button"
                disabled={isSubmitting}
                onClick={async () => {
                  if (isSubmitting) return;
                  if (!promoCodeVal.trim()) return;
                  if (!Number.isFinite(promoDiscountVal) || promoDiscountVal <= 0 || promoDiscountVal > 100) {
                    notify("Chegirma foizi 1 dan 100 gacha bo'lishi kerak", 'error');
                    return;
                  }
                  setIsSubmitting(true);
                  try {
                    const nowIso = new Date().toISOString();
                    const p: PromoCode = {
                      id: uid('promo'),
                      code: promoCodeVal.trim(),
                      discountType: 'percent',
                      discountValue: promoDiscountVal,
                      minOrderAmount: 100000,
                      maxUses: 100,
                      usedCount: 0,
                      isActive: true,
                      storeId: db.stores[0].id,
                      createdAt: nowIso,
                      updatedAt: nowIso,
                      createdBy: 'usr-owner',
                    };
                    await upsertPromoCode(p);
                    setPromoCodeVal('');
                    notify('Promokod yaratildi', 'success');
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="px-3 h-9 rounded-lg bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold"
              >
                +
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {db.promoCodes.map((pr) => (
                <div key={pr.id} className="py-2 flex justify-between">
                  <span className="font-mono font-bold">{pr.code}</span>
                  <span>{pr.discountType === 'percent' ? `${pr.discountValue}%` : formatMoney(pr.discountValue, { lang: language })} · {pr.usedCount}/{pr.maxUses}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
