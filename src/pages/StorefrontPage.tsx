import React, { useMemo, useState } from 'react';
import {
  ShoppingBag,
  QrCode,
  Search,
  Plus,
  Minus,
  X,
  CheckCircle2,
  Send,
  Copy,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { formatDateTime, formatMoney, useT } from '../i18n';
import { MEDIA } from '../assets/media';
import { ProductThumb } from '../components/BarcodeSvg';
import { generateQrDataUrl } from '../utils/barcode';
import { OnlineOrderItem, Product } from '../types/models';
import { paymentGateway } from '../integrations/interfaces';

export const StorefrontPage: React.FC<{ publicStandalone?: boolean; onBackToLogin?: () => void }> = ({
  publicStandalone = false,
  onBackToLogin,
}) => {
  const db = useAppStore((s) => s.db);
  const can = useAppStore((s) => s.can);
  const language = useAppStore((s) => s.language);
  const getVariantStock = useAppStore((s) => s.getVariantStock);
  const createOnlineOrder = useAppStore((s) => s.createOnlineOrder);
  const updateOnlineOrderStatus = useAppStore((s) => s.updateOnlineOrderStatus);
  const notify = useAppStore((s) => s.notify);
  const t = useT();

  const canManageOrders = !publicStandalone && can('manage_online_orders');

  const [viewMode, setViewMode] = useState<'catalog' | 'orders'>('catalog');
  const [catFilter, setCatFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [bag, setBag] = useState<OnlineOrderItem[]>([]);
  const [bagOpen, setBagOpen] = useState(false);

  // Order checkout fields
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('+99890');
  const [custAddress, setCustAddress] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [payMethod, setPayMethod] = useState<'cash_on_delivery' | 'online_placeholder'>('cash_on_delivery');
  const [placedOrderNum, setPlacedOrderNum] = useState<string | null>(null);

  // Share QR modal
  const [shareOpen, setShareOpen] = useState(false);
  const [shareQrUrl, setShareQrUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const catalogProducts = useMemo(() => {
    if (!db) return [];
    return db.products.filter((p) => {
      if (!p.isPublishedOnline) return false;
      if (catFilter !== 'all' && p.categoryId !== catFilter) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [db, catFilter, search]);

  if (!db) return null;

  const catalogUrl = typeof window !== 'undefined' ? `${window.location.origin}/#/shop` : 'https://shubrend.uz/shop';
  const telegramDeepLink = `https://t.me/${db.settings.telegramChannelHandle.replace('@', '')}`;

  const addToBag = (p: Product) => {
    const vId = selectedVariants[p.id] || p.variants[0]?.id;
    const v = p.variants.find((x) => x.id === vId) ?? p.variants[0];
    if (!v) return;
    const stock = getVariantStock(v.id);
    if (stock <= 0) {
      notify('Ushbu variant hozircha tugagan', 'error');
      return;
    }
    setBag((prev) => {
      const idx = prev.findIndex((x) => x.variantId === v.id);
      if (idx >= 0) {
        const next = [...prev];
        const qty = next[idx].qty + 1;
        next[idx] = { ...next[idx], qty, lineTotal: qty * v.retailPrice };
        return next;
      }
      return [
        ...prev,
        {
          productId: p.id,
          variantId: v.id,
          productName: p.name,
          variantLabel: [v.size, v.color].filter(Boolean).join(' / ') || v.sku,
          qty: 1,
          unitPrice: v.retailPrice,
          lineTotal: v.retailPrice,
        },
      ];
    });
    notify(`${p.name} savatga qo'shildi`, 'success');
  };

  const bagTotal = bag.reduce((s, i) => s + i.lineTotal, 0);
  const bagCount = bag.reduce((s, i) => s + i.qty, 0);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || bag.length === 0 || !custName.trim() || !custPhone.trim()) return;
    setIsSubmitting(true);
    try {
      if (payMethod === 'online_placeholder') {
        const res = await paymentGateway.createPaymentLink({ orderId: 'temp', amount: bagTotal, provider: 'click' });
        notify(res.note, 'info');
      }
      const order = await createOnlineOrder({
        customerName: custName.trim(),
        customerPhone: custPhone.trim(),
        deliveryAddress: deliveryMethod === 'pickup' ? 'Do\'kondan olib ketish' : custAddress.trim(),
        deliveryMethod,
        paymentMethod: payMethod,
        items: bag,
        totalAmount: bagTotal,
        storeId: db.stores[0].id,
      });
      setBag([]);
      setPlacedOrderNum(order.orderNumber);
      notify(`Buyurtma #${order.orderNumber} yuborildi`, 'success');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={publicStandalone ? 'min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 max-w-6xl mx-auto space-y-5' : 'space-y-4'}>
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {publicStandalone && (
            <img
              src="/assets/aistudio/IMG_20261007_140535_653_64e97dff.jpg"
              alt="SHU BREND OMBOR"
              className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-800"
            />
          )}
          {canManageOrders ? (
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('catalog')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                  viewMode === 'catalog' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
                }`}
              >
                {t.storefront.publicView}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('orders')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                  viewMode === 'orders' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
                }`}
              >
                {t.storefront.ordersManagement} ({db.onlineOrders.filter((o) => o.status === 'new').length})
              </button>
            </div>
          ) : (
            <h2 className="font-display text-lg font-bold">{db.settings.brandName} · {t.storefront.title}</h2>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onBackToLogin && (
            <button
              type="button"
              onClick={onBackToLogin}
              className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              Xodim kirishi
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              const qr = await generateQrDataUrl(catalogUrl, 200);
              setShareQrUrl(qr);
              setShareOpen(true);
            }}
            className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium inline-flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4" />
            <span className="hidden sm:inline">{t.storefront.shareCatalog}</span>
          </button>
          <button
            type="button"
            onClick={() => setBagOpen(true)}
            className="h-10 px-4 rounded-lg bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Savat ({bagCount})</span>
          </button>
        </div>
      </div>

      {/* PUBLIC CATALOG VIEW */}
      {viewMode === 'catalog' && (
        <div className="space-y-5">
          {/* Editorial Storefront Hero */}
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 h-48 sm:h-64">
            <img
              src={MEDIA.storefrontHero}
              alt="SHU BREND OMBOR"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent flex flex-col justify-end p-5 sm:p-7">
              <div className="text-xs font-medium text-teal-300">Toshkent · Chilonzor & Samarqand Darvoza</div>
              <h2 className="font-display text-xl sm:text-3xl font-bold text-white mt-1">
                {db.settings.brandName}
              </h2>
              <p className="text-xs sm:text-sm text-slate-200 mt-1 max-w-xl">
                Ombordagi mavjud barcha mahsulotlar jonli qoldiq bilan. Buyurtma bering — tez yetkazib beramiz.
              </p>
            </div>
          </div>

          {/* Search & Category Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.common.search}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCatFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                  catFilter === 'all' ? 'bg-teal-700 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {t.common.all}
              </button>
              {db.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCatFilter(c.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                    catFilter === c.id ? 'bg-teal-700 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {language === 'ru' ? c.nameRu : c.nameUz}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalogProducts.map((p) => {
              const activeVarId = selectedVariants[p.id] || p.variants[0]?.id;
              const activeVar = p.variants.find((v) => v.id === activeVarId) ?? p.variants[0];
              const stock = activeVar ? getVariantStock(activeVar.id) : 0;
              return (
                <div
                  key={p.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <ProductThumb src={p.photoUrl} name={p.name} className="w-full h-44 rounded-none border-0" />
                    <div className="p-4 space-y-2">
                      <div className="text-[11px] text-slate-400">
                        {p.collection || 'Katalog'} · {stock > 0 ? `Mavjud (${stock})` : 'Tugagan'}
                      </div>
                      <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">{p.name}</h3>
                      {p.variants.length > 1 && (
                        <select
                          value={activeVarId}
                          onChange={(e) => setSelectedVariants({ ...selectedVariants, [p.id]: e.target.value })}
                          className="w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                        >
                          {p.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {[v.size, v.color].filter(Boolean).join(' / ') || v.sku} — {formatMoney(v.retailPrice, { lang: language })}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="px-4 pb-4 flex items-center justify-between gap-2">
                    <span className="font-mono tabular-nums font-bold text-sm text-teal-700 dark:text-teal-400">
                      {activeVar ? formatMoney(activeVar.retailPrice, { lang: language }) : '—'}
                    </span>
                    <button
                      type="button"
                      disabled={stock <= 0}
                      onClick={() => addToBag(p)}
                      className="h-9 px-3.5 rounded-lg bg-slate-900 dark:bg-teal-700 hover:opacity-90 disabled:opacity-40 text-white text-xs font-semibold"
                    >
                      {t.storefront.addToBag}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ADMIN: ONLINE ORDERS MANAGEMENT */}
      {viewMode === 'orders' && canManageOrders && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
          {db.onlineOrders.map((ord) => (
            <div key={ord.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-mono font-bold text-sm">{ord.orderNumber} · {ord.customerName}</div>
                <div className="text-slate-500 mt-0.5">
                  {ord.customerPhone} · {ord.deliveryAddress} · {formatDateTime(ord.createdAt, language)}
                </div>
                <div className="text-slate-600 dark:text-slate-300 mt-1">
                  {ord.items.map((i) => `${i.productName} (${i.variantLabel}) x${i.qty}`).join(', ')}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="font-mono font-bold text-sm">{formatMoney(ord.totalAmount, { lang: language })}</div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold uppercase text-slate-500 mr-1">{ord.status}</span>
                  {ord.status === 'new' && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        if (isSubmitting) return;
                        setIsSubmitting(true);
                        try {
                          const res = await updateOnlineOrderStatus(ord.id, 'confirmed');
                          if (!res.ok) {
                            notify(res.error || "Omborda yetarli qoldiq yo'q", 'error');
                            return;
                          }
                          notify('Buyurtma tasdiqlandi va ombordan yechildi', 'success');
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-teal-700 disabled:opacity-50 text-white font-semibold"
                    >
                      Tasdiqlash
                    </button>
                  )}
                  {ord.status === 'confirmed' && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        if (isSubmitting) return;
                        setIsSubmitting(true);
                        try {
                          await updateOnlineOrderStatus(ord.id, 'delivered');
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-emerald-600 disabled:opacity-50 text-white font-semibold"
                    >
                      Yetkazildi
                    </button>
                  )}
                  {(ord.status === 'new' || ord.status === 'confirmed') && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        if (isSubmitting) return;
                        setIsSubmitting(true);
                        try {
                          await updateOnlineOrderStatus(ord.id, 'canceled');
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="px-2.5 py-1 rounded border border-red-300 disabled:opacity-50 text-red-600 font-semibold"
                    >
                      Bekor qilish
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Shopping Bag & Checkout Drawer */}
      {bagOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full overflow-y-auto p-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-display text-base font-bold">Buyurtma savati ({bagCount})</h3>
                <button type="button" onClick={() => { setBagOpen(false); setPlacedOrderNum(null); }}><X className="w-5 h-5" /></button>
              </div>

              {placedOrderNum ? (
                <div className="py-10 text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                  <div className="font-display text-lg font-bold">{t.storefront.orderConfirmed}</div>
                  <div className="font-mono text-sm text-slate-500">Buyurtma raqami: #{placedOrderNum}</div>
                </div>
              ) : bag.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">Savat bo'sh</div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {bag.map((it) => (
                      <div key={it.variantId} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <div className="font-semibold">{it.productName}</div>
                          <div className="text-slate-500">{it.variantLabel} · {formatMoney(it.unitPrice, { lang: language })}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setBag((prev) =>
                                prev
                                  .map((x) =>
                                    x.variantId === it.variantId
                                      ? x.qty > 1
                                        ? { ...x, qty: x.qty - 1, lineTotal: (x.qty - 1) * x.unitPrice }
                                        : null
                                      : x
                                  )
                                  .filter(Boolean) as OnlineOrderItem[]
                              )
                            }
                            className="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center font-mono font-bold">{it.qty}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setBag((prev) =>
                                prev.map((x) =>
                                  x.variantId === it.variantId
                                    ? { ...x, qty: x.qty + 1, lineTotal: (x.qty + 1) * x.unitPrice }
                                    : x
                                )
                              )
                            }
                            className="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handlePlaceOrder} className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <input required value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Ismingiz *" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs" />
                    <input required value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="Telefon *" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
                    <select value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value as 'delivery' | 'pickup')} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                      <option value="delivery">Kuryer orqali yetkazish</option>
                      <option value="pickup">Do'kondan olib ketish</option>
                    </select>
                    {deliveryMethod === 'delivery' && (
                      <input required value={custAddress} onChange={(e) => setCustAddress(e.target.value)} placeholder="Yetkazib berish manzili *" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs" />
                    )}
                    <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'cash_on_delivery' | 'online_placeholder')} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                      <option value="cash_on_delivery">Qabul qilganda to'lash (Naqd/Karta)</option>
                      <option value="online_placeholder">Click / Payme / Uzum (Integratsiya tayyor)</option>
                    </select>

                    <div className="flex justify-between font-bold text-sm pt-2">
                      <span>Jami</span>
                      <span className="font-mono text-teal-700 dark:text-teal-400">{formatMoney(bagTotal, { lang: language })}</span>
                    </div>
                    <button type="submit" disabled={isSubmitting} className="w-full h-11 rounded-xl bg-teal-700 disabled:opacity-50 text-white text-xs font-bold">
                      {t.storefront.checkout}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share Link & QR Modal */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 text-center">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.storefront.shareCatalog}</h3>
              <button type="button" onClick={() => setShareOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            {shareQrUrl && <img src={shareQrUrl} alt="Catalog QR" className="w-44 h-44 mx-auto rounded-lg border border-slate-200 p-2 bg-white" />}
            <div className="flex items-center gap-1.5">
              <input readOnly value={catalogUrl} className="flex-1 h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(catalogUrl);
                  notify('Havola nusxalandi', 'success');
                }}
                className="h-9 px-3 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <a
              href={telegramDeepLink}
              target="_blank"
              rel="noreferrer"
              className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Send className="w-3.5 h-3.5 text-sky-600" />
              <span>Telegram kanal / buyurtma ({db.settings.telegramChannelHandle})</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
