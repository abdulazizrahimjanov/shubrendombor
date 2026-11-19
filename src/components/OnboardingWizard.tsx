import React, { useState } from 'react';
import { Check, Store, Package, UserPlus, ShoppingCart, X } from 'lucide-react';
import { useAppStore, uid } from '../store/useAppStore';
import { generateEAN13 } from '../utils/barcode';

export const OnboardingWizard: React.FC<{ onGoToPos: () => void }> = ({ onGoToPos }) => {
  const db = useAppStore((s) => s.db);
  const showOnboarding = useAppStore((s) => s.showOnboarding);
  const setShowOnboarding = useAppStore((s) => s.setShowOnboarding);
  const upsertStore = useAppStore((s) => s.upsertStore);
  const upsertWarehouse = useAppStore((s) => s.upsertWarehouse);
  const upsertProduct = useAppStore((s) => s.upsertProduct);
  const quickAddStock = useAppStore((s) => s.quickAddStock);
  const upsertEmployee = useAppStore((s) => s.upsertEmployee);
  const notify = useAppStore((s) => s.notify);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [storeName, setStoreName] = useState('Yangi Filial');
  const [storeAddress, setStoreAddress] = useState('Toshkent sh., Amir Temur 108');
  const [storePhone, setStorePhone] = useState('+998 90 500 10 20');

  const [prodName, setProdName] = useState('Yangi Klassik Ko\'ylak');
  const [prodBuy, setProdBuy] = useState(120000);
  const [prodSell, setProdSell] = useState(210000);
  const [prodQty, setProdQty] = useState(15);

  const [cashierName, setCashierName] = useState('Aziza Kassir');
  const [cashierPhone, setCashierPhone] = useState('+998907778899');
  const [cashierPin, setCashierPin] = useState('7777');

  if (!showOnboarding || !db) return null;

  const handleSaveStore = async () => {
    if (!storeName.trim()) return;
    const nowIso = new Date().toISOString();
    const sId = uid('store');
    const wId = uid('wh');
    await upsertWarehouse({
      id: wId,
      name: `${storeName} Ombori`,
      address: storeAddress,
      isMain: false,
      storeId: sId,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: 'usr-owner',
    });
    await upsertStore({
      id: sId,
      name: storeName,
      address: storeAddress,
      phone: storePhone,
      isActive: true,
      defaultWarehouseId: wId,
      storeId: sId,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: 'usr-owner',
    });
    notify("Do'kon yaratildi", 'success');
    setStep(2);
  };

  const handleSaveProduct = async () => {
    if (!prodName.trim()) return;
    const nowIso = new Date().toISOString();
    const pId = uid('prod');
    const vId = uid('var');
    const storeId = db.stores[0]?.id ?? 'store-chilonzor';
    const whId = db.stores[0]?.defaultWarehouseId ?? 'wh-chilonzor';
    const res = await upsertProduct({
      id: pId,
      name: prodName,
      categoryId: db.categories[0]?.id ?? 'cat-shirts',
      unit: 'dona',
      tags: ['Yangi'],
      isPublishedOnline: true,
      variants: [
        {
          id: vId,
          productId: pId,
          sku: `SBO-${Math.floor(100 + Math.random() * 899)}`,
          size: 'Standart',
          color: 'Asosiy',
          purchasePrice: prodBuy,
          retailPrice: prodSell,
          wholesalePrice: Math.round(prodSell * 0.85),
          minStock: 5,
          barcodes: [generateEAN13()],
          storeId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: 'usr-owner',
        },
      ],
      storeId,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: 'usr-owner',
    });
    if (!res.ok) {
      notify(res.error || "Mahsulot qo'shilmadi", 'error');
      return;
    }
    await quickAddStock(pId, vId, whId, prodQty, "Usta orqali boshlang'ich qoldiq");
    notify("Mahsulot qo'shildi", 'success');
    setStep(3);
  };

  const handleSaveCashier = async () => {
    if (!cashierName.trim()) return;
    const nowIso = new Date().toISOString();
    await upsertEmployee(
      {
        id: uid('emp'),
        userId: uid('usr'),
        name: cashierName,
        phone: cashierPhone,
        roleId: 'cashier',
        baseSalary: 3500000,
        commissionPercent: 1.5,
        schedule: '2/2 smena',
        hiredAt: nowIso,
        storeId: db.stores[0]?.id ?? 'store-chilonzor',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: 'usr-owner',
      },
      { pin: cashierPin, password: '123456' }
    );
    notify("Kassir qo'shildi", 'success');
    setStep(4);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Tezkor ishga tushirish ustasi
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {step}-qadam / 4 · Do'kon → Mahsulot → Kassir → Birinchi sotuv
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowOnboarding(false)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 my-4">
          {[
            { n: 1, label: "Do'kon", icon: Store },
            { n: 2, label: 'Mahsulot', icon: Package },
            { n: 3, label: 'Kassir', icon: UserPlus },
            { n: 4, label: 'Sotuv', icon: ShoppingCart },
          ].map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => setStep(s.n as 1 | 2 | 3 | 4)}
              className={`p-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                step === s.n
                  ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300'
                  : step > s.n
                  ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500'
              }`}
            >
              {step > s.n ? <Check className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Do'kon nomi</label>
              <input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Manzil</label>
              <input
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Telefon</label>
              <input
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
              />
            </div>
            <div className="flex justify-between pt-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                O'tkazib yuborish
              </button>
              <button
                type="button"
                onClick={handleSaveStore}
                className="px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
              >
                Saqlash va davom etish
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Mahsulot nomi</label>
              <input
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Tannarx (so'm)</label>
                <input
                  type="number"
                  value={prodBuy}
                  onChange={(e) => setProdBuy(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Sotuv narxi</label>
                <input
                  type="number"
                  value={prodSell}
                  onChange={(e) => setProdSell(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Boshlang'ich soni</label>
                <input
                  type="number"
                  value={prodQty}
                  onChange={(e) => setProdQty(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex justify-between pt-3">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                O'tkazib yuborish
              </button>
              <button
                type="button"
                onClick={handleSaveProduct}
                className="px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
              >
                Mahsulotni saqlash
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Kassir F.I.Sh.</label>
              <input
                value={cashierName}
                onChange={(e) => setCashierName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Telefon</label>
                <input
                  value={cashierPhone}
                  onChange={(e) => setCashierPhone(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Tezkor PIN (4–6 raqam)</label>
                <input
                  value={cashierPin}
                  maxLength={6}
                  inputMode="numeric"
                  onChange={(e) => setCashierPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex justify-between pt-3">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                O'tkazib yuborish
              </button>
              <button
                type="button"
                onClick={handleSaveCashier}
                className="px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
              >
                Kassirni saqlash
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-4 space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Tizim sotuvga tayyor!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Kassa (POS) ekranini ochib birinchi chekni urishingiz mumkin.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowOnboarding(false);
                onGoToPos();
              }}
              className="px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold"
            >
              Kassani ochish (POS)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
