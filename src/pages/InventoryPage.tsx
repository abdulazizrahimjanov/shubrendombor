import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PackageCheck,
  ArrowLeftRight,
  Trash2,
  ClipboardList,
  History,
  Truck,
  Plus,
  Search,
  AlertTriangle,
  Download,
  X,
  Check,
  Edit3,
  FolderCog,
  Warehouse as WarehouseIcon,
  PackagePlus,
} from 'lucide-react';
import { useAppStore, uid } from '../store/useAppStore';
import { formatDate, formatDateTime, formatMoney, useT } from '../i18n';
import { Category, Product, PurchaseReceiptItem, StocktakeItem, TransferItem, Variant, WriteOffItem, WriteOffReason } from '../types/models';
import { exportToExcel } from '../utils/export';
import { generateEAN13 } from '../utils/barcode';

type InvTab = 'stock' | 'receiving' | 'transfers' | 'writeoffs' | 'stocktake' | 'movements' | 'suppliers';

export const InventoryPage: React.FC = () => {
  const db = useAppStore((s) => s.db);
  const can = useAppStore((s) => s.can);
  const currentUser = useAppStore((s) => s.getCurrentUser());
  const language = useAppStore((s) => s.language);
  const getVariantStock = useAppStore((s) => s.getVariantStock);
  const createPurchaseReceipt = useAppStore((s) => s.createPurchaseReceipt);
  const createPurchaseOrder = useAppStore((s) => s.createPurchaseOrder);
  const updatePurchaseOrderStatus = useAppStore((s) => s.updatePurchaseOrderStatus);
  const createTransfer = useAppStore((s) => s.createTransfer);
  const receiveTransfer = useAppStore((s) => s.receiveTransfer);
  const createWriteOff = useAppStore((s) => s.createWriteOff);
  const saveStocktake = useAppStore((s) => s.saveStocktake);
  const applyStocktake = useAppStore((s) => s.applyStocktake);
  const upsertSupplier = useAppStore((s) => s.upsertSupplier);
  const upsertWarehouse = useAppStore((s) => s.upsertWarehouse);
  const upsertProduct = useAppStore((s) => s.upsertProduct);
  const paySupplierDebt = useAppStore((s) => s.paySupplierDebt);
  const isCategoryUsed = useAppStore((s) => s.isCategoryUsed);
  const upsertCategory = useAppStore((s) => s.upsertCategory);
  const deleteCategory = useAppStore((s) => s.deleteCategory);
  const notify = useAppStore((s) => s.notify);
  const t = useT();

  const canManage = can('manage_inventory');
  const canViewCost = can('view_profit_cost');
  const canCreateWarehouse = can('manage_settings') || currentUser?.roleId === 'owner' || currentUser?.roleId === 'admin';
  const canCreateProduct = can('edit_catalog') || can('manage_inventory');

  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as InvTab) || 'stock';
  const [tab, setTab] = useState<InvTab>(initialTab);
  useEffect(() => {
    const qTab = searchParams.get('tab') as InvTab | null;
    if (qTab && ['stock', 'receiving', 'transfers', 'writeoffs', 'stocktake', 'movements', 'suppliers'].includes(qTab)) {
      setTab(qTab);
    }
  }, [searchParams]);
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'dead'>('all');
  const [search, setSearch] = useState('');

  // Receiving modal
  const [recOpen, setRecOpen] = useState(false);
  const [recSupplierId, setRecSupplierId] = useState('');
  const [recWarehouseId, setRecWarehouseId] = useState('');
  const [recCategoryId, setRecCategoryId] = useState('all');
  const [recVariantId, setRecVariantId] = useState('');
  const [recQty, setRecQty] = useState(10);
  const [recPrice, setRecPrice] = useState(100000);
  const [recItems, setRecItems] = useState<PurchaseReceiptItem[]>([]);
  const [recPaid, setRecPaid] = useState(0);

  // Category create/manage modal inside Receiving
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catNameUz, setCatNameUz] = useState('');
  const [catNameRu, setCatNameRu] = useState('');
  const [catError, setCatError] = useState('');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [deleteCatConfirm, setDeleteCatConfirm] = useState<Category | null>(null);

  // Transfer modal
  const [trfOpen, setTrfOpen] = useState(false);
  const [trfFrom, setTrfFrom] = useState('');
  const [trfTo, setTrfTo] = useState('');
  const [trfVariantId, setTrfVariantId] = useState('');
  const [trfQty, setTrfQty] = useState(5);
  const [trfItems, setTrfItems] = useState<TransferItem[]>([]);

  // Write-off modal
  const [woOpen, setWoOpen] = useState(false);
  const [woWarehouse, setWoWarehouse] = useState('');
  const [woReason, setWoReason] = useState<WriteOffReason>('damaged');
  const [woVariantId, setWoVariantId] = useState('');
  const [woQty, setWoQty] = useState(1);
  const [woNote, setWoNote] = useState('');

  // Stocktake state
  const [activeStocktakeWh, setActiveStocktakeWh] = useState('');
  const [stocktakeItems, setStocktakeItems] = useState<StocktakeItem[]>([]);
  const [scanCode, setScanCode] = useState('');

  // Supplier modal
  const [supModalOpen, setSupModalOpen] = useState(false);
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('+99890');
  const [supError, setSupError] = useState('');

  // Quick Warehouse modal (inside Receiving)
  const [whQuickOpen, setWhQuickOpen] = useState(false);
  const [whName, setWhName] = useState('');
  const [whAddress, setWhAddress] = useState('');
  const [whStoreId, setWhStoreId] = useState('');
  const [whError, setWhError] = useState('');

  // Quick Product & Variant modal (inside Receiving)
  const [prodQuickOpen, setProdQuickOpen] = useState(false);
  const [prodName, setProdName] = useState('');
  const [prodCategoryId, setProdCategoryId] = useState('');
  const [prodUnit, setProdUnit] = useState<Product['unit']>('dona');
  const [prodSize, setProdSize] = useState('');
  const [prodColor, setProdColor] = useState('');
  const [prodPurchasePrice, setProdPurchasePrice] = useState(100000);
  const [prodRetailPrice, setProdRetailPrice] = useState(160000);
  const [prodError, setProdError] = useState('');

  // PO modal
  const [poOpen, setPoOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poVariantId, setPoVariantId] = useState('');
  const [poQty, setPoQty] = useState(15);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const variantLookup = useMemo(() => {
    const map = new Map<string, { product: Product; variant: Variant }>();
    if (!db) return map;
    db.products.forEach((p) => p.variants.forEach((v) => map.set(v.id, { product: p, variant: v })));
    return map;
  }, [db]);

  // 30-day sales velocity per variant
  const velocityMap = useMemo(() => {
    if (!db) return new Map<string, number>();
    const cutoff = Date.now() - 30 * 86400000;
    const map = new Map<string, number>();
    db.sales.forEach((s) => {
      if (s.status !== 'deferred' && s.status !== 'returned' && new Date(s.createdAt).getTime() >= cutoff) {
        s.items.forEach((it) => map.set(it.variantId, (map.get(it.variantId) ?? 0) + it.qty));
      }
    });
    return map;
  }, [db]);

  const stockRows = useMemo(() => {
    if (!db) return [];
    const rows: {
      product: Product;
      variant: Variant;
      qty: number;
      sold30d: number;
      reorderQty: number;
    }[] = [];

    db.products.forEach((p) => {
      p.variants.forEach((v) => {
        const qty =
          warehouseFilter === 'all' ? getVariantStock(v.id) : getVariantStock(v.id, warehouseFilter);
        const sold30d = velocityMap.get(v.id) ?? 0;
        const isLow = qty <= v.minStock;
        const isDead = sold30d === 0 && qty > 0;
        if (stockFilter === 'low' && !isLow) return;
        if (stockFilter === 'dead' && !isDead) return;
        if (search) {
          const q = search.toLowerCase();
          if (
            !p.name.toLowerCase().includes(q) &&
            !v.sku.toLowerCase().includes(q) &&
            !v.barcodes.some((b) => b.includes(q))
          ) {
            return;
          }
        }
        const dailyVel = sold30d / 30;
        const reorderQty = isLow ? Math.max(v.minStock * 2 - qty, Math.ceil(dailyVel * 14)) : 0;
        rows.push({ product: p, variant: v, qty, sold30d, reorderQty });
      });
    });
    return rows;
  }, [db, warehouseFilter, stockFilter, search, getVariantStock, velocityMap]);

  const receivingFilteredVariants = useMemo(() => {
    if (!db) return [];
    return db.products
      .filter((p) => recCategoryId === 'all' || p.categoryId === recCategoryId)
      .flatMap((p) => p.variants.map((v) => ({ product: p, variant: v })));
  }, [db, recCategoryId]);

  if (!db) return null;

  const initReceivingModal = () => {
    const firstVar = db.products[0]?.variants[0];
    setRecSupplierId(db.suppliers[0]?.id ?? '');
    setRecWarehouseId(db.warehouses[0]?.id ?? '');
    setRecCategoryId('all');
    setRecVariantId(firstVar?.id ?? '');
    setRecPrice(firstVar?.purchasePrice ?? 100000);
    setRecQty(10);
    setRecItems([]);
    setRecPaid(0);
    setRecOpen(true);
  };

  const handleRecCategoryChange = (nextCatId: string) => {
    setRecCategoryId(nextCatId);
    const matching = db.products
      .filter((p) => nextCatId === 'all' || p.categoryId === nextCatId)
      .flatMap((p) => p.variants);
    const firstMatch = matching[0];
    if (firstMatch) {
      setRecVariantId(firstMatch.id);
      setRecPrice(firstMatch.purchasePrice);
    } else {
      setRecVariantId('');
    }
  };

  const addReceivingItem = () => {
    const found = variantLookup.get(recVariantId);
    if (!found || recQty <= 0) return;
    const total = recQty * recPrice;
    const item: PurchaseReceiptItem = {
      productId: found.product.id,
      variantId: found.variant.id,
      productName: found.product.name,
      variantLabel: [found.variant.size, found.variant.color].filter(Boolean).join(' / ') || found.variant.sku,
      qty: recQty,
      purchasePrice: recPrice,
      total,
    };
    const next = [...recItems, item];
    setRecItems(next);
    setRecPaid(next.reduce((s, i) => s + i.total, 0));
  };

  const startNewStocktake = (whId: string) => {
    const list: StocktakeItem[] = [];
    db.products.forEach((p) => {
      p.variants.forEach((v) => {
        const sysQty = getVariantStock(v.id, whId);
        list.push({
          productId: p.id,
          variantId: v.id,
          productName: p.name,
          variantLabel: [v.size, v.color].filter(Boolean).join(' / '),
          sku: v.sku,
          barcode: v.barcodes[0],
          systemQty: sysQty,
          countedQty: sysQty,
          unitCost: v.purchasePrice,
        });
      });
    });
    setActiveStocktakeWh(whId);
    setStocktakeItems(list);
  };

  const handleStocktakeScan = (code: string) => {
    const q = code.trim().toLowerCase();
    if (!q) return;
    const idx = stocktakeItems.findIndex(
      (it) => it.barcode?.toLowerCase() === q || it.sku.toLowerCase() === q
    );
    if (idx < 0) {
      notify('Shtrix-kod topilmadi', 'error');
      return;
    }
    const next = [...stocktakeItems];
    next[idx] = { ...next[idx], countedQty: next[idx].countedQty + 1 };
    setStocktakeItems(next);
    setScanCode('');
    notify(`${next[idx].productName}: ${next[idx].countedQty}`, 'success');
  };

  const tabs: { id: InvTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'stock', label: t.inventory.tabs.stock, icon: PackageCheck },
    { id: 'receiving', label: t.inventory.tabs.receiving, icon: Plus },
    { id: 'transfers', label: t.inventory.tabs.transfers, icon: ArrowLeftRight },
    { id: 'writeoffs', label: t.inventory.tabs.writeoffs, icon: Trash2 },
    { id: 'stocktake', label: t.inventory.tabs.stocktake, icon: ClipboardList },
    { id: 'movements', label: t.inventory.tabs.movements, icon: History },
    { id: 'suppliers', label: t.inventory.tabs.suppliers, icon: Truck },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={`h-10 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                tab === tb.id
                  ? 'bg-teal-700 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tb.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: STOCK BALANCES */}
      {tab === 'stock' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
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
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium"
              >
                <option value="all">Barcha omborlar</option>
                {db.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['all', 'low', 'dead'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStockFilter(f)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      stockFilter === f
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    {f === 'all' ? t.common.all : f === 'low' ? t.inventory.lowStock : t.inventory.deadStock}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  exportToExcel(
                    stockRows.map((r) => ({
                      Mahsulot: r.product.name,
                      Variant: [r.variant.size, r.variant.color].filter(Boolean).join(' / '),
                      SKU: r.variant.sku,
                      Qoldiq: r.qty,
                      MinQoldiq: r.variant.minStock,
                      Sotuv30Kun: r.sold30d,
                      BuyurtmaTavsiya: r.reorderQty,
                    })),
                    'ombor-qoldiq'
                  )
                }
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-slate-500 font-semibold">
                    <th className="py-3 px-3">Mahsulot / Variant</th>
                    <th className="py-3 px-3">SKU</th>
                    <th className="py-3 px-3 text-right">Qoldiq</th>
                    <th className="py-3 px-3 text-right">Min</th>
                    <th className="py-3 px-3 text-right">30 kun sotuv</th>
                    <th className="py-3 px-3 text-right">{t.inventory.reorderAdvice}</th>
                    {canViewCost && <th className="py-3 px-3 text-right">Qiymat (tannarx)</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stockRows.map((r) => {
                    const isLow = r.qty <= r.variant.minStock;
                    return (
                      <tr key={r.variant.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{r.product.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {[r.variant.size, r.variant.color].filter(Boolean).join(' · ') || 'Standart'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{r.variant.sku}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                          <span className={isLow ? 'text-amber-600 dark:text-amber-400' : ''}>
                            {r.qty} {r.product.unit}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">{r.variant.minStock}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{r.sold30d}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {r.reorderQty > 0 ? (
                            <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                              <AlertTriangle className="w-3 h-3" />+{r.reorderQty}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        {canViewCost && (
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {formatMoney(r.qty * r.variant.purchasePrice, { lang: language })}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RECEIVING (KIRIM) */}
      {tab === 'receiving' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-base font-bold">{t.inventory.tabs.receiving}</h2>
            {canManage && (
              <button
                type="button"
                onClick={initReceivingModal}
                className="h-10 px-4 rounded-xl bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{t.inventory.newReceiving}</span>
              </button>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            {db.purchaseReceipts.map((pr) => {
              const sup = db.suppliers.find((s) => s.id === pr.supplierId);
              const wh = db.warehouses.find((w) => w.id === pr.warehouseId);
              const cat = pr.categoryId ? db.categories.find((c) => c.id === pr.categoryId) : undefined;
              return (
                <div key={pr.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold font-mono flex items-center gap-2 flex-wrap">
                      <span>{pr.number} · {sup?.name}</span>
                      {cat && (
                        <span className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-sans text-[11px] font-semibold">
                          {language === 'ru' ? cat.nameRu : cat.nameUz}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {wh?.name} · {pr.items.length} pozitsiya · {formatDateTime(pr.createdAt, language)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-sm">{formatMoney(pr.totalAmount, { lang: language })}</div>
                    <div className="text-xs text-slate-500">
                      To'landi: {formatMoney(pr.paidAmount, { lang: language })} · {pr.paymentStatus}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: TRANSFERS */}
      {tab === 'transfers' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-base font-bold">{t.inventory.tabs.transfers}</h2>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setTrfFrom(db.warehouses[0]?.id ?? '');
                  setTrfTo(db.warehouses[1]?.id ?? db.warehouses[0]?.id ?? '');
                  setTrfVariantId(db.products[0]?.variants[0]?.id ?? '');
                  setTrfItems([]);
                  setTrfOpen(true);
                }}
                className="h-10 px-4 rounded-xl bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{t.inventory.newTransfer}</span>
              </button>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            {db.transfers.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">Hozircha ko'chirishlar yo'q</div>
            ) : (
              db.transfers.map((tr) => {
                const fromW = db.warehouses.find((w) => w.id === tr.fromWarehouseId)?.name;
                const toW = db.warehouses.find((w) => w.id === tr.toWarehouseId)?.name;
                return (
                  <div key={tr.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold font-mono">{tr.number} · {fromW} → {toW}</div>
                      <div className="text-xs text-slate-500">
                        {tr.items.length} ta pozitsiya · {tr.status} · {formatDateTime(tr.createdAt, language)}
                      </div>
                    </div>
                    {tr.status === 'sent' && canManage && (
                      <button
                        type="button"
                        onClick={async () => {
                          await receiveTransfer(
                            tr.id,
                            tr.items.map((it) => ({ variantId: it.variantId, receivedQty: it.sentQty }))
                          );
                          notify("Ko'chirish qabul qilindi", 'success');
                        }}
                        className="px-3 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold"
                      >
                        Qabul qilish
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 4: WRITE-OFFS */}
      {tab === 'writeoffs' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-base font-bold">{t.inventory.tabs.writeoffs}</h2>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setWoWarehouse(db.warehouses[0]?.id ?? '');
                  setWoVariantId(db.products[0]?.variants[0]?.id ?? '');
                  setWoQty(1);
                  setWoOpen(true);
                }}
                className="h-10 px-4 rounded-xl bg-red-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{t.inventory.newWriteOff}</span>
              </button>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            {db.writeOffs.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">Hisobdan chiqarish hujjatlari yo'q</div>
            ) : (
              db.writeOffs.map((wo) => (
                <div key={wo.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold font-mono">{wo.number} · {wo.reason}</div>
                    <div className="text-xs text-slate-500">{wo.note || formatDateTime(wo.createdAt, language)}</div>
                  </div>
                  <div className="font-mono font-bold text-red-600 text-sm">
                    -{formatMoney(wo.totalCost, { lang: language })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: STOCKTAKE (INVENTARIZATSIYA) */}
      {tab === 'stocktake' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                value={activeStocktakeWh || db.warehouses[0]?.id}
                onChange={(e) => setActiveStocktakeWh(e.target.value)}
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium"
              >
                {db.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => startNewStocktake(activeStocktakeWh || db.warehouses[0]?.id || '')}
                className="h-10 px-4 rounded-lg bg-teal-700 text-white text-xs font-semibold"
              >
                {t.inventory.startStocktake}
              </button>
            </div>

            {stocktakeItems.length > 0 && (
              <div className="flex items-center gap-2">
                <input
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleStocktakeScan(scanCode);
                    }
                  }}
                  placeholder="Shtrix-kod skanerlang (+1)..."
                  className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={async () => {
                    if (isSubmitting) return;
                    setIsSubmitting(true);
                    try {
                      const wh = db.warehouses.find((w) => w.id === activeStocktakeWh);
                      const discrepancyVal = stocktakeItems.reduce(
                        (s, it) => s + (it.countedQty - it.systemQty) * it.unitCost,
                        0
                      );
                      const st = await saveStocktake({
                        number: `INV-${String(db.stocktakes.length + 1).padStart(3, '0')}`,
                        warehouseId: activeStocktakeWh,
                        status: 'in_progress',
                        items: stocktakeItems,
                        totalDiscrepancyValue: discrepancyVal,
                        storeId: wh?.storeId ?? db.stores[0].id,
                      });
                      await applyStocktake(st.id);
                      setStocktakeItems([]);
                      notify('Inventarizatsiya tasdiqlandi va qoldiqlar tuzatildi', 'success');
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  className="h-10 px-4 rounded-lg bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Tuzatishni qo'llash</span>
                </button>
              </div>
            )}
          </div>

          {stocktakeItems.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500">
                    <th className="py-2.5 px-3">Mahsulot</th>
                    <th className="py-2.5 px-3 text-right">Tizimda</th>
                    <th className="py-2.5 px-3 text-right">Haqiqiy (Sanov)</th>
                    <th className="py-2.5 px-3 text-right">Farq</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stocktakeItems.map((it, idx) => {
                    const diff = it.countedQty - it.systemQty;
                    return (
                      <tr key={it.variantId}>
                        <td className="py-2 px-3">
                          <div className="font-semibold">{it.productName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{it.sku} · {it.variantLabel}</div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{it.systemQty}</td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            value={it.countedQty}
                            onChange={(e) => {
                              const next = [...stocktakeItems];
                              next[idx] = { ...it, countedQty: Number(e.target.value) };
                              setStocktakeItems(next);
                            }}
                            className="w-20 h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-right font-mono"
                          />
                        </td>
                        <td className={`py-2 px-3 text-right font-mono font-bold ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {db.stocktakes.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
              {db.stocktakes.map((st) => (
                <div key={st.id} className="p-3.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold font-mono">{st.number} · {st.status}</div>
                    <div className="text-slate-500">{formatDateTime(st.createdAt, language)}</div>
                  </div>
                  <div className="font-mono font-bold">
                    Farq qiymati: {formatMoney(st.totalDiscrepancyValue, { lang: language })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: MOVEMENT HISTORY */}
      {tab === 'movements' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500">
                <th className="py-3 px-3">Sana</th>
                <th className="py-3 px-3">Turi</th>
                <th className="py-3 px-3">Mahsulot</th>
                <th className="py-3 px-3">Ombor</th>
                <th className="py-3 px-3 text-right">O'zgarish</th>
                <th className="py-3 px-3 text-right">Qoldiq</th>
                <th className="py-3 px-3">Izoh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {db.stockMovements.slice(0, 80).map((m) => {
                const found = variantLookup.get(m.variantId);
                const wh = db.warehouses.find((w) => w.id === m.warehouseId);
                return (
                  <tr key={m.id}>
                    <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">{formatDateTime(m.createdAt, language)}</td>
                    <td className="py-2 px-3 font-semibold uppercase">{m.type}</td>
                    <td className="py-2 px-3">{found?.product.name ?? m.productId}</td>
                    <td className="py-2 px-3 text-slate-500">{wh?.name}</td>
                    <td className={`py-2 px-3 text-right font-mono font-bold ${m.qtyDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {m.qtyDelta >= 0 ? `+${m.qtyDelta}` : m.qtyDelta}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{m.qtyAfter}</td>
                    <td className="py-2 px-3 text-slate-500 truncate max-w-[200px]">{m.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 7: SUPPLIERS & PURCHASE ORDERS */}
      {tab === 'suppliers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="font-display text-base font-bold">Ta'minotchilar</h2>
            <div className="flex gap-2">
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={() => setSupModalOpen(true)}
                    className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  >
                    + {t.inventory.newSupplier}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPoSupplierId(db.suppliers[0]?.id ?? '');
                      setPoVariantId(db.products[0]?.variants[0]?.id ?? '');
                      setPoOpen(true);
                    }}
                    className="h-9 px-3 rounded-lg bg-teal-700 text-white text-xs font-semibold"
                  >
                    + {t.inventory.newPO}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {db.suppliers.map((sup) => (
              <div key={sup.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">{sup.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{sup.contactName} · <span className="font-mono">{sup.phone}</span></div>
                  <div className="text-xs text-slate-400">{sup.address}</div>
                </div>
                <div className="text-right space-y-1.5">
                  <div className={`font-mono font-bold text-sm ${sup.debtBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatMoney(sup.debtBalance, { lang: language })}
                  </div>
                  {sup.debtBalance > 0 && can('manage_finance') && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        if (isSubmitting) return;
                        setIsSubmitting(true);
                        try {
                          await paySupplierDebt(sup.id, sup.debtBalance, db.accounts[0]?.id ?? 'acc-cash-1');
                          notify("Ta'minotchi qarzi to'landi", 'success');
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-slate-900 dark:bg-slate-700 disabled:opacity-50 text-white text-[11px] font-medium"
                    >
                      Qarzni yopish
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            <div className="px-4 py-3 font-semibold text-xs text-slate-500">Buyurtmalar (Purchase Orders)</div>
            {db.purchaseOrders.map((po) => {
              const sup = db.suppliers.find((s) => s.id === po.supplierId);
              return (
                <div key={po.id} className="p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-bold font-mono">{po.number} · {sup?.name}</div>
                    <div className="text-slate-500">Kutilayotgan sana: {formatDate(po.expectedDate)} · {po.status}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{formatMoney(po.totalAmount, { lang: language })}</span>
                    {po.status === 'ordered' && (
                      <button
                        type="button"
                        onClick={() => updatePurchaseOrderStatus(po.id, 'received')}
                        className="px-2.5 py-1 rounded bg-teal-700 text-white font-medium"
                      >
                        Qabul qilindi
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Receiving Modal */}
      {recOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl max-h-[88vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-display text-base font-bold">{t.inventory.newReceiving}</h3>
              <button type="button" onClick={() => setRecOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Supplier + Quick "+" */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-500">Yetkazib beruvchi</label>
                <div className="flex items-center gap-2">
                  <select
                    value={recSupplierId}
                    onChange={(e) => setRecSupplierId(e.target.value)}
                    className="flex-1 min-w-0 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  >
                    {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setSupName('');
                      setSupContact('');
                      setSupPhone('+99890');
                      setSupError('');
                      setSupModalOpen(true);
                    }}
                    title={t.inventory.newSupplier}
                    aria-label={t.inventory.newSupplier}
                    className="w-10 h-10 shrink-0 rounded-lg bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Warehouse + Quick "+" */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-500">Ombor</label>
                <div className="flex items-center gap-2">
                  <select
                    value={recWarehouseId}
                    onChange={(e) => setRecWarehouseId(e.target.value)}
                    className="flex-1 min-w-0 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  >
                    {db.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  {canCreateWarehouse && (
                    <button
                      type="button"
                      onClick={() => {
                        setWhName('');
                        setWhAddress('');
                        setWhStoreId(db.stores[0]?.id ?? '');
                        setWhError('');
                        setWhQuickOpen(true);
                      }}
                      title="Yangi ombor qo'shish"
                      aria-label="Yangi ombor qo'shish"
                      className="w-10 h-10 shrink-0 rounded-lg bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Category Selector + Quick "+" Add Category Button */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-500">{t.inventory.category}</label>
              <div className="flex items-center gap-2">
                <select
                  value={recCategoryId}
                  onChange={(e) => handleRecCategoryChange(e.target.value)}
                  className="flex-1 min-w-0 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium"
                >
                  <option value="all">{t.inventory.allCategoriesFilter}</option>
                  {db.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {language === 'ru' ? c.nameRu : c.nameUz}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setCatNameUz('');
                    setCatNameRu('');
                    setCatError('');
                    setEditingCat(null);
                    setDeleteCatConfirm(null);
                    setCatModalOpen(true);
                  }}
                  title={t.inventory.createCategoryTitle}
                  aria-label={t.inventory.createCategoryTitle}
                  className="w-10 h-10 shrink-0 rounded-lg bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Product / Variant Selector + Quick "+" Add Product Button */}
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-500">Mahsulot / variant</label>
                <div className="flex items-center gap-2">
                  <select
                    value={recVariantId}
                    onChange={(e) => {
                      setRecVariantId(e.target.value);
                      const found = variantLookup.get(e.target.value);
                      if (found) setRecPrice(found.variant.purchasePrice);
                    }}
                    className="flex-1 min-w-0 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  >
                    {receivingFilteredVariants.length === 0 ? (
                      <option value="">Ushbu kategoriyada mahsulot yo'q</option>
                    ) : (
                      receivingFilteredVariants.map(({ product: p, variant: v }) => (
                        <option key={v.id} value={v.id}>
                          {p.name} ({[v.size, v.color].filter(Boolean).join('/') || v.sku})
                        </option>
                      ))
                    )}
                  </select>
                  {canCreateProduct && (
                    <button
                      type="button"
                      onClick={() => {
                        setProdName('');
                        setProdCategoryId(recCategoryId !== 'all' ? recCategoryId : (db.categories[0]?.id ?? ''));
                        setProdUnit('dona');
                        setProdSize('');
                        setProdColor('');
                        setProdPurchasePrice(100000);
                        setProdRetailPrice(160000);
                        setProdError('');
                        setProdQuickOpen(true);
                      }}
                      title="Yangi mahsulot qo'shish"
                      aria-label="Yangi mahsulot qo'shish"
                      className="w-10 h-10 shrink-0 rounded-lg bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <input
                  type="number"
                  min={1}
                  value={recQty}
                  onChange={(e) => setRecQty(Number(e.target.value))}
                  placeholder="Soni"
                  className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
                <input
                  type="number"
                  min={0}
                  value={recPrice}
                  onChange={(e) => setRecPrice(Number(e.target.value))}
                  placeholder="Kelish narxi"
                  className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
                <button
                  type="button"
                  disabled={!recVariantId}
                  onClick={addReceivingItem}
                  className="col-span-2 sm:col-span-1 h-10 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold disabled:opacity-40"
                >
                  + Qo'shish
                </button>
              </div>
            </div>
            {recCategoryId !== 'all' && receivingFilteredVariants.length === 0 && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-[11px] text-slate-500">
                <span>Tanlangan kategoriyada mahsulotlar hali mavjud emas.</span>
                <button
                  type="button"
                  onClick={() => handleRecCategoryChange('all')}
                  className="text-teal-700 dark:text-teal-400 font-semibold hover:underline"
                >
                  {t.inventory.allCategoriesFilter}
                </button>
              </div>
            )}
            {recItems.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {recItems.map((it, i) => (
                  <div key={i} className="p-2.5 flex justify-between">
                    <span>{it.productName} ({it.variantLabel}) x{it.qty}</span>
                    <span className="font-mono font-bold">{formatMoney(it.total, { lang: language })}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Jami summa</label>
                <div className="h-10 px-3 flex items-center rounded-lg bg-slate-100 dark:bg-slate-950 font-mono font-bold">
                  {formatMoney(recItems.reduce((s, i) => s + i.total, 0), { lang: language })}
                </div>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">To'langan summa (qolgani qarz)</label>
                <input type="number" value={recPaid} onChange={(e) => setRecPaid(Number(e.target.value))} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono" />
              </div>
            </div>
            <button
              type="button"
              disabled={recItems.length === 0 || isSubmitting}
              onClick={async () => {
                if (isSubmitting || recItems.length === 0) return;
                if (!Number.isFinite(recPaid) || recPaid < 0) {
                  notify("To'langan summa manfiy bo'lishi mumkin emas", 'error');
                  return;
                }
                setIsSubmitting(true);
                try {
                  const totalAmount = recItems.reduce((s, i) => s + i.total, 0);
                  const wh = db.warehouses.find((w) => w.id === recWarehouseId);
                  await createPurchaseReceipt({
                    number: `KIR-${String(db.purchaseReceipts.length + 19).padStart(3, '0')}`,
                    supplierId: recSupplierId,
                    warehouseId: recWarehouseId,
                    categoryId: recCategoryId !== 'all' ? recCategoryId : undefined,
                    items: recItems,
                    totalAmount,
                    paidAmount: recPaid,
                    paymentStatus: recPaid >= totalAmount ? 'paid' : recPaid > 0 ? 'partial' : 'debt',
                    storeId: wh?.storeId ?? db.stores[0].id,
                  });
                  notify('Kirim hujjati saqlandi', 'success');
                  setRecOpen(false);
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="w-full h-11 rounded-xl bg-teal-700 text-white text-xs font-semibold disabled:opacity-40"
            >
              Kirimni saqlash
            </button>
          </div>
        </div>
      )}

      {/* Create / Edit / Delete Category Modal inside Receiving */}
      {catModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[86vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FolderCog className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h3 className="font-display text-base font-bold">{t.inventory.createCategoryTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCatModalOpen(false);
                  setEditingCat(null);
                  setDeleteCatConfirm(null);
                  setCatError('');
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* New Category Creation Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setCatError('');
                const cleanUz = catNameUz.trim();
                if (!cleanUz) {
                  setCatError(language === 'ru' ? 'Введите название категории' : 'Kategoriya nomini kiriting');
                  return;
                }
                const cleanRu = catNameRu.trim() || cleanUz;
                const nowIso = new Date().toISOString();
                const newId = uid('cat');
                const wh = db.warehouses.find((w) => w.id === recWarehouseId);
                const res = await upsertCategory({
                  id: newId,
                  nameUz: cleanUz,
                  nameRu: cleanRu,
                  sortOrder: db.categories.length + 1,
                  storeId: wh?.storeId ?? db.stores[0]?.id ?? 'store-chilonzor',
                  createdAt: nowIso,
                  updatedAt: nowIso,
                  createdBy: currentUser?.id ?? 'system',
                });
                if (!res.ok) {
                  setCatError(res.error || t.inventory.categoryDuplicateError);
                  return;
                }
                handleRecCategoryChange(newId);
                setCatNameUz('');
                setCatNameRu('');
                setCatModalOpen(false);
                notify(`"${cleanUz}" kategoriyasi yaratildi`, 'success');
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  {t.inventory.categoryNameLabel} *
                </label>
                <input
                  autoFocus
                  value={catNameUz}
                  onChange={(e) => {
                    setCatNameUz(e.target.value);
                    if (catError) setCatError('');
                  }}
                  placeholder="Masalan: Sport kiyimlar"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-medium mb-1">
                  {t.inventory.categoryNameRuLabel}
                </label>
                <input
                  value={catNameRu}
                  onChange={(e) => setCatNameRu(e.target.value)}
                  placeholder="Спортивная одежда"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              {catError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3 py-2 text-red-600 dark:text-red-400 font-medium">
                  {catError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCatModalOpen(false);
                    setEditingCat(null);
                    setDeleteCatConfirm(null);
                    setCatError('');
                  }}
                  className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 font-medium"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold"
                >
                  {t.common.save}
                </button>
              </div>
            </form>

            {/* Manage Existing Categories (Edit & Delete with usage warning) */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="font-semibold text-slate-600 dark:text-slate-300">
                {t.inventory.manageCategories} ({db.categories.length})
              </div>

              {deleteCatConfirm && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <div className="font-bold">"{deleteCatConfirm.nameUz}"</div>
                      <p className="mt-0.5 leading-relaxed">
                        {isCategoryUsed(deleteCatConfirm.id)
                          ? t.inventory.categoryUsedDeleteWarning
                          : "Ushbu kategoriyani o'chirmoqchimisiz?"}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteCatConfirm(null)}
                      className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await deleteCategory(deleteCatConfirm.id);
                        if (!res.ok) {
                          notify(res.error || "O'chirib bo'lmadi", 'error');
                        } else {
                          if (recCategoryId === deleteCatConfirm.id) {
                            handleRecCategoryChange('all');
                          }
                          notify(`"${deleteCatConfirm.nameUz}" o'chirildi`, 'info');
                        }
                        setDeleteCatConfirm(null);
                      }}
                      className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
                    >
                      {t.common.delete}
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl max-h-56 overflow-y-auto">
                {db.categories.map((c) => {
                  const isEditing = editingCat?.id === c.id;
                  const used = isCategoryUsed(c.id);
                  return (
                    <div key={c.id} className="p-2.5 flex items-center justify-between gap-2">
                      {isEditing ? (
                        <div className="flex-1 flex gap-1.5">
                          <input
                            value={editingCat.nameUz}
                            onChange={(e) =>
                              setEditingCat({ ...editingCat, nameUz: e.target.value, nameRu: e.target.value })
                            }
                            className="flex-1 h-8 px-2.5 rounded-lg border border-teal-500 bg-white dark:bg-slate-950"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await upsertCategory({
                                ...editingCat,
                                nameUz: editingCat.nameUz.trim(),
                                nameRu: editingCat.nameRu.trim() || editingCat.nameUz.trim(),
                              });
                              if (!res.ok) {
                                notify(res.error || t.inventory.categoryDuplicateError, 'error');
                                return;
                              }
                              setEditingCat(null);
                              notify('Kategoriya yangilandi', 'success');
                            }}
                            className="h-8 px-2.5 rounded-lg bg-teal-700 text-white font-semibold"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">
                              {language === 'ru' ? c.nameRu : c.nameUz}
                            </div>
                            {used && (
                              <div className="text-[10px] text-slate-400">
                                Mahsulot yoki hujjatlarda ishlatilgan
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingCat(structuredClone(c))}
                              title={t.common.edit}
                              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {db.categories.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setDeleteCatConfirm(c)}
                                title={t.common.delete}
                                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {trfOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.inventory.newTransfer}</h3>
              <button type="button" onClick={() => setTrfOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={trfFrom} onChange={(e) => setTrfFrom(e.target.value)} className="h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                {db.warehouses.map((w) => <option key={w.id} value={w.id}>Qayerdan: {w.name}</option>)}
              </select>
              <select value={trfTo} onChange={(e) => setTrfTo(e.target.value)} className="h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                {db.warehouses.map((w) => <option key={w.id} value={w.id}>Qayerga: {w.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <select value={trfVariantId} onChange={(e) => setTrfVariantId(e.target.value)} className="flex-1 h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                {db.products.flatMap((p) => p.variants.map((v) => <option key={v.id} value={v.id}>{p.name} ({v.sku})</option>))}
              </select>
              <input type="number" min={1} value={trfQty} onChange={(e) => setTrfQty(Number(e.target.value))} className="w-20 h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
              <button
                type="button"
                onClick={() => {
                  const found = variantLookup.get(trfVariantId);
                  if (!found) return;
                  setTrfItems([...trfItems, { productId: found.product.id, variantId: found.variant.id, productName: found.product.name, variantLabel: found.variant.sku, sentQty: trfQty, receivedQty: 0 }]);
                }}
                className="px-3 h-10 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold"
              >
                +
              </button>
            </div>
            {trfItems.map((it, i) => (
              <div key={i} className="text-xs flex justify-between px-2">
                <span>{it.productName} ({it.variantLabel})</span>
                <span className="font-mono font-bold">{it.sentQty} dona</span>
              </div>
            ))}
            <button
              type="button"
              disabled={trfItems.length === 0 || trfFrom === trfTo || isSubmitting}
              onClick={async () => {
                if (isSubmitting || trfItems.length === 0 || trfFrom === trfTo) return;
                setIsSubmitting(true);
                try {
                  const wh = db.warehouses.find((w) => w.id === trfFrom);
                  await createTransfer({
                    number: `TRF-${String(db.transfers.length + 1).padStart(3, '0')}`,
                    fromWarehouseId: trfFrom,
                    toWarehouseId: trfTo,
                    items: trfItems,
                    storeId: wh?.storeId ?? db.stores[0].id,
                  });
                  notify("Ko'chirish yuborildi", 'success');
                  setTrfOpen(false);
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="w-full h-11 rounded-xl bg-teal-700 text-white text-xs font-semibold disabled:opacity-40"
            >
              Yuborish
            </button>
          </div>
        </div>
      )}

      {/* Write-Off Modal */}
      {woOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.inventory.newWriteOff}</h3>
              <button type="button" onClick={() => setWoOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <select value={woWarehouse} onChange={(e) => setWoWarehouse(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              {db.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <select value={woReason} onChange={(e) => setWoReason(e.target.value as WriteOffReason)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              <option value="damaged">Shikastlangan / Yaroqsiz</option>
              <option value="expired">Muddati o'tgan</option>
              <option value="lost">Yo'qolgan / Kamomad</option>
              <option value="other">Boshqa</option>
            </select>
            <select value={woVariantId} onChange={(e) => setWoVariantId(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              {db.products.flatMap((p) => p.variants.map((v) => <option key={v.id} value={v.id}>{p.name} ({v.sku})</option>))}
            </select>
            <input type="number" min={1} value={woQty} onChange={(e) => setWoQty(Number(e.target.value))} placeholder="Miqdori" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
            <input value={woNote} onChange={(e) => setWoNote(e.target.value)} placeholder="Izoh" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs" />
            <button
              type="button"
              disabled={isSubmitting}
              onClick={async () => {
                if (isSubmitting) return;
                if (!Number.isFinite(woQty) || woQty <= 0) {
                  notify("Miqdor 0 dan katta bo'lishi kerak", 'error');
                  return;
                }
                const found = variantLookup.get(woVariantId);
                if (!found) return;
                setIsSubmitting(true);
                try {
                  const item: WriteOffItem = {
                    productId: found.product.id,
                    variantId: found.variant.id,
                    productName: found.product.name,
                    variantLabel: found.variant.sku,
                    qty: woQty,
                    unitCost: found.variant.purchasePrice,
                  };
                  const wh = db.warehouses.find((w) => w.id === woWarehouse);
                  await createWriteOff({
                    number: `CHI-${String(db.writeOffs.length + 1).padStart(3, '0')}`,
                    warehouseId: woWarehouse,
                    reason: woReason,
                    items: [item],
                    totalCost: item.qty * item.unitCost,
                    note: woNote,
                    storeId: wh?.storeId ?? db.stores[0].id,
                  });
                  notify('Hisobdan chiqarildi', 'info');
                  setWoOpen(false);
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="w-full h-11 rounded-xl bg-red-600 disabled:opacity-50 text-white text-xs font-semibold"
            >
              Hisobdan chiqarish
            </button>
          </div>
        </div>
      )}

      {/* Supplier Modal (shared by Suppliers tab and Receiving "+" button) */}
      {supModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSupError('');
              const cleanName = supName.trim();
              if (!cleanName) {
                setSupError("Ta'minotchi nomini kiriting");
                return;
              }
              const duplicate = db.suppliers.find(
                (s) => s.name.trim().toLowerCase() === cleanName.toLowerCase()
              );
              if (duplicate) {
                setSupError("Bu nomdagi ta'minotchi allaqachon mavjud");
                return;
              }
              const nowIso = new Date().toISOString();
              const newSupId = uid('sup');
              const wh = db.warehouses.find((w) => w.id === recWarehouseId);
              await upsertSupplier({
                id: newSupId,
                name: cleanName,
                contactName: supContact.trim(),
                phone: supPhone.trim(),
                debtBalance: 0,
                storeId: wh?.storeId ?? db.stores[0]?.id ?? 'store-chilonzor',
                createdAt: nowIso,
                updatedAt: nowIso,
                createdBy: currentUser?.id ?? 'system',
              });
              if (recOpen) {
                setRecSupplierId(newSupId);
              }
              notify(`"${cleanName}" ta'minotchisi qo'shildi`, 'success');
              setSupModalOpen(false);
              setSupName('');
              setSupContact('');
              setSupPhone('+99890');
            }}
            className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h3 className="font-display text-base font-bold">{t.inventory.newSupplier}</h3>
              </div>
              <button type="button" onClick={() => setSupModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <input
              autoFocus
              value={supName}
              onChange={(e) => {
                setSupName(e.target.value);
                if (supError) setSupError('');
              }}
              placeholder="Kompaniya yoki shaxs nomi *"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
            <input
              value={supContact}
              onChange={(e) => setSupContact(e.target.value)}
              placeholder="Mas'ul shaxs"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
            <input
              value={supPhone}
              onChange={(e) => setSupPhone(e.target.value)}
              placeholder="Telefon (+99890...)"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
            />
            {supError && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3 py-2 text-red-600 dark:text-red-400 font-medium">
                {supError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSupModalOpen(false)}
                className="h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="h-10 px-5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
              >
                {t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick Warehouse Modal inside Receiving */}
      {whQuickOpen && (
        <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setWhError('');
              const cleanName = whName.trim();
              if (!cleanName) {
                setWhError('Ombor nomini kiriting');
                return;
              }
              const duplicate = db.warehouses.find(
                (w) => w.name.trim().toLowerCase() === cleanName.toLowerCase()
              );
              if (duplicate) {
                setWhError('Bu nomdagi ombor allaqachon mavjud');
                return;
              }
              const nowIso = new Date().toISOString();
              const newWhId = uid('wh');
              const targetStoreId = whStoreId || db.stores[0]?.id || 'store-chilonzor';
              await upsertWarehouse({
                id: newWhId,
                name: cleanName,
                address: whAddress.trim(),
                isMain: false,
                storeId: targetStoreId,
                createdAt: nowIso,
                updatedAt: nowIso,
                createdBy: currentUser?.id ?? 'system',
              });
              setRecWarehouseId(newWhId);
              setWhQuickOpen(false);
              setWhName('');
              setWhAddress('');
              notify(`"${cleanName}" ombori qo'shildi`, 'success');
            }}
            className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <WarehouseIcon className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h3 className="font-display text-base font-bold">Yangi ombor</h3>
              </div>
              <button type="button" onClick={() => setWhQuickOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Ombor nomi *</label>
              <input
                autoFocus
                value={whName}
                onChange={(e) => {
                  setWhName(e.target.value);
                  if (whError) setWhError('');
                }}
                placeholder="Masalan: Yunusobod ombori"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Manzil</label>
              <input
                value={whAddress}
                onChange={(e) => setWhAddress(e.target.value)}
                placeholder="Tuman, ko'cha..."
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Biriktirilgan filial</label>
              <select
                value={whStoreId}
                onChange={(e) => setWhStoreId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                {db.stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            {whError && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3 py-2 text-red-600 dark:text-red-400 font-medium">
                {whError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setWhQuickOpen(false)}
                className="h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="h-10 px-5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
              >
                {t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick Product & Variant Modal inside Receiving */}
      {prodQuickOpen && (
        <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setProdError('');
              const cleanName = prodName.trim();
              if (!cleanName) {
                setProdError('Mahsulot nomini kiriting');
                return;
              }
              const targetCatId = prodCategoryId || db.categories[0]?.id || 'cat-shirts';
              const duplicate = db.products.find(
                (p) => p.name.trim().toLowerCase() === cleanName.toLowerCase()
              );
              if (duplicate) {
                setProdError('Bu nomdagi mahsulot katalogda allaqachon mavjud');
                return;
              }
              const nowIso = new Date().toISOString();
              const newProdId = uid('prod');
              const newVarId = uid('var');
              const wh = db.warehouses.find((w) => w.id === recWarehouseId);
              const storeId = wh?.storeId ?? db.stores[0]?.id ?? 'store-chilonzor';
              const skuPrefix = cleanName
                .replace(/[^a-zA-Z0-9]/g, '')
                .toUpperCase()
                .slice(0, 4) || 'SHU';
              const sku = `${skuPrefix}-${String(Date.now()).slice(-4)}`;
              const buyPrice = Math.max(0, Number(prodPurchasePrice) || 0);
              const sellPrice = Math.max(0, Number(prodRetailPrice) || buyPrice);

              const res = await upsertProduct({
                id: newProdId,
                name: cleanName,
                categoryId: targetCatId,
                unit: prodUnit,
                supplierId: recSupplierId || undefined,
                tags: [],
                isPublishedOnline: true,
                variants: [
                  {
                    id: newVarId,
                    productId: newProdId,
                    sku,
                    ...(prodSize.trim() ? { size: prodSize.trim() } : {}),
                    ...(prodColor.trim() ? { color: prodColor.trim() } : {}),
                    purchasePrice: buyPrice,
                    retailPrice: sellPrice,
                    wholesalePrice: Math.round(sellPrice * 0.9),
                    minStock: 3,
                    barcodes: [generateEAN13()],
                    storeId,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    createdBy: currentUser?.id ?? 'system',
                  },
                ],
                storeId,
                createdAt: nowIso,
                updatedAt: nowIso,
                createdBy: currentUser?.id ?? 'system',
              });

              if (!res.ok) {
                setProdError(res.error || 'Bu nomdagi mahsulot katalogda allaqachon mavjud');
                return;
              }

              if (recCategoryId !== 'all' && recCategoryId !== targetCatId) {
                setRecCategoryId(targetCatId);
              }
              setRecVariantId(newVarId);
              setRecPrice(buyPrice);
              setProdQuickOpen(false);
              setProdName('');
              notify(`"${cleanName}" katalogga qo'shildi`, 'success');
            }}
            className="w-full max-w-md max-h-[88vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <PackagePlus className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h3 className="font-display text-base font-bold">Yangi mahsulot qo'shish</h3>
              </div>
              <button type="button" onClick={() => setProdQuickOpen(false)}><X className="w-4 h-4" /></button>
            </div>

            <div>
              <label className="block text-slate-500 mb-1 font-medium">Mahsulot nomi *</label>
              <input
                autoFocus
                value={prodName}
                onChange={(e) => {
                  setProdName(e.target.value);
                  if (prodError) setProdError('');
                }}
                placeholder="Masalan: Klassik Polo Futbolka"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 mb-1 font-medium">{t.inventory.category}</label>
                <select
                  value={prodCategoryId}
                  onChange={(e) => setProdCategoryId(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                >
                  {db.categories.map((c) => (
                    <option key={c.id} value={c.id}>{language === 'ru' ? c.nameRu : c.nameUz}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1 font-medium">O'lchov birligi</label>
                <select
                  value={prodUnit}
                  onChange={(e) => setProdUnit(e.target.value as Product['unit'])}
                  className="w-full h-10 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                >
                  <option value="dona">dona</option>
                  <option value="juft">juft</option>
                  <option value="quti">quti</option>
                  <option value="kg">kg</option>
                  <option value="metr">metr</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 mb-1 font-medium">O'lcham</label>
                <input
                  value={prodSize}
                  onChange={(e) => setProdSize(e.target.value)}
                  placeholder="L, XL, 42..."
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1 font-medium">Rang</label>
                <input
                  value={prodColor}
                  onChange={(e) => setProdColor(e.target.value)}
                  placeholder="Qora, Oq..."
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 mb-1 font-medium">Kelish narxi (so'm)</label>
                <input
                  type="number"
                  min={0}
                  value={prodPurchasePrice}
                  onChange={(e) => setProdPurchasePrice(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1 font-medium">Sotuv narxi (so'm)</label>
                <input
                  type="number"
                  min={0}
                  value={prodRetailPrice}
                  onChange={(e) => setProdRetailPrice(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
              </div>
            </div>

            {prodError && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3 py-2 text-red-600 dark:text-red-400 font-medium">
                {prodError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setProdQuickOpen(false)}
                className="h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="h-10 px-5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
              >
                {t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PO Modal */}
      {poOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.inventory.newPO}</h3>
              <button type="button" onClick={() => setPoOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <select value={poSupplierId} onChange={(e) => setPoSupplierId(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={poVariantId} onChange={(e) => setPoVariantId(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              {db.products.flatMap((p) => p.variants.map((v) => <option key={v.id} value={v.id}>{p.name} ({v.sku})</option>))}
            </select>
            <input type="number" min={1} value={poQty} onChange={(e) => setPoQty(Number(e.target.value))} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
            <button
              type="button"
              disabled={isSubmitting}
              onClick={async () => {
                if (isSubmitting) return;
                if (!Number.isFinite(poQty) || poQty <= 0) {
                  notify("Buyurtma miqdori 0 dan katta bo'lishi kerak", 'error');
                  return;
                }
                const found = variantLookup.get(poVariantId);
                if (!found) return;
                setIsSubmitting(true);
                try {
                  const total = found.variant.purchasePrice * poQty;
                  await createPurchaseOrder({
                    number: `BUY-${String(db.purchaseOrders.length + 10).padStart(3, '0')}`,
                    supplierId: poSupplierId,
                    warehouseId: db.warehouses[0].id,
                    items: [{ productId: found.product.id, variantId: found.variant.id, productName: found.product.name, variantLabel: found.variant.sku, qty: poQty, purchasePrice: found.variant.purchasePrice, total }],
                    totalAmount: total,
                    status: 'ordered',
                    expectedDate: new Date(Date.now() + 3 * 86400000).toISOString(),
                    storeId: db.stores[0].id,
                  });
                  notify('Buyurtma yaratildi', 'success');
                  setPoOpen(false);
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="w-full h-10 rounded-lg bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold"
            >
              Buyurtma berish
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
