import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  UserPlus,
  Percent,
  Clock,
  RotateCcw,
  X,
  Check,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  Users,
} from 'lucide-react';
import { useAppStore, uid } from '../store/useAppStore';
import { formatDateTime, formatMoney, useT } from '../i18n';
import { PaymentMethod, Product, Sale, SaleItem } from '../types/models';
import { formatUzsSpaced } from '../utils/receipt';
import { ProductThumb } from '../components/BarcodeSvg';

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
    };
  }
}

interface SwipeCartRowProps {
  item: SaleItem;
  availableStock: number;
  allowNegative: boolean;
  onQtyChange: (qty: number) => void;
  onDiscountChange: (pct: number) => void;
  onDelete: () => void;
}

const SwipeCartRow: React.FC<SwipeCartRowProps> = ({
  item,
  availableStock,
  allowNegative,
  onQtyChange,
  onDiscountChange,
  onDelete,
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const [editingQty, setEditingQty] = useState(false);
  const [qtyDraft, setQtyDraft] = useState(String(item.qty));
  const [showDiscInput, setShowDiscInput] = useState(false);
  const startXRef = useRef<number | null>(null);

  useEffect(() => {
    setQtyDraft(String(item.qty));
  }, [item.qty]);

  const overStock = item.qty > availableStock;

  const commitQty = () => {
    setEditingQty(false);
    const parsed = parseInt(qtyDraft, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setQtyDraft(String(item.qty));
      return;
    }
    onQtyChange(parsed);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-red-600">
      {/* Revealed delete background when swiping left */}
      <div className="absolute inset-y-0 right-0 w-24 flex items-center justify-center">
        <button
          type="button"
          onClick={onDelete}
          className="w-full h-full flex flex-col items-center justify-center gap-1 text-white text-[11px] font-semibold"
        >
          <Trash2 className="w-4 h-4" />
          <span>O'chirish</span>
        </button>
      </div>

      {/* Foreground card */}
      <div
        onTouchStart={(e) => {
          startXRef.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchMove={(e) => {
          if (startXRef.current === null) return;
          const dx = (e.touches[0]?.clientX ?? startXRef.current) - startXRef.current;
          if (dx < 0) {
            setOffsetX(Math.max(-96, dx));
          } else {
            setOffsetX(0);
          }
        }}
        onTouchEnd={() => {
          if (offsetX < -64) {
            setOffsetX(-88);
          } else {
            setOffsetX(0);
          }
          startXRef.current = null;
        }}
        style={{ transform: `translateX(${offsetX}px)` }}
        className="relative bg-white dark:bg-slate-900 p-3.5 transition-transform duration-150 space-y-2.5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
              {item.productName}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="font-mono">{item.sku}</span>
              {item.variantLabel && <span>· {item.variantLabel}</span>}
              <span>·</span>
              <span className="font-mono tabular-nums">{formatUzsSpaced(item.unitPrice)}</span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white">
              {formatUzsSpaced(item.lineTotal)}
            </div>
            {item.discountAmount > 0 && (
              <div className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                -{item.discountPercent}% (-{formatUzsSpaced(item.discountAmount)})
              </div>
            )}
          </div>
        </div>

        {overStock && (
          <div
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg ${
              allowNegative
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>
              Omborda qoldiq: {availableStock} dona
              {!allowNegative ? " (yetarli emas)" : " (minus qoldiqqa sotiladi)"}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          {/* Quantity Stepper with tap-to-type */}
          <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 overflow-hidden">
            <button
              type="button"
              onClick={() => onQtyChange(item.qty - 1)}
              className="w-10 h-10 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 active:bg-slate-200"
              aria-label="Kamaytirish"
            >
              <Minus className="w-4 h-4" />
            </button>
            {editingQty ? (
              <input
                type="number"
                min={1}
                autoFocus
                value={qtyDraft}
                onChange={(e) => setQtyDraft(e.target.value)}
                onBlur={commitQty}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitQty();
                }}
                className="w-12 h-10 text-center font-mono text-sm font-bold bg-white dark:bg-slate-900 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingQty(true)}
                className="min-w-[44px] h-10 px-2 text-center font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white"
              >
                {item.qty}
              </button>
            )}
            <button
              type="button"
              onClick={() => onQtyChange(item.qty + 1)}
              className="w-10 h-10 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 active:bg-slate-200"
              aria-label="Oshirish"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {showDiscInput ? (
              <div className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-2 h-10">
                <span className="text-[11px] text-slate-400">-%</span>
                <input
                  type="number"
                  min={0}
                  max={90}
                  autoFocus
                  value={item.discountPercent}
                  onChange={(e) => onDiscountChange(Number(e.target.value))}
                  onBlur={() => setShowDiscInput(false)}
                  className="w-12 text-center font-mono text-xs font-semibold bg-transparent focus:outline-none"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDiscInput(true)}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
              >
                <Percent className="w-3.5 h-3.5" />
                <span>{item.discountPercent > 0 ? `${item.discountPercent}%` : 'Chegirma'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onDelete}
              aria-label="O'chirish"
              className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const POSPage: React.FC = () => {
  const db = useAppStore((s) => s.db);
  const activeStoreId = useAppStore((s) => s.activeStoreId);
  const language = useAppStore((s) => s.language);
  const cartItems = useAppStore((s) => s.cartItems);
  const setCartItems = useAppStore((s) => s.setCartItems);
  const cartCustomerId = useAppStore((s) => s.cartCustomerId);
  const setCartCustomerId = useAppStore((s) => s.setCartCustomerId);
  const cartDiscountPercent = useAppStore((s) => s.cartDiscountPercent);
  const setCartDiscountPercent = useAppStore((s) => s.setCartDiscountPercent);
  const cartDiscountFixed = useAppStore((s) => s.cartDiscountFixed);
  const setCartDiscountFixed = useAppStore((s) => s.setCartDiscountFixed);
  const cartPromoCode = useAppStore((s) => s.cartPromoCode);
  const setCartPromoCode = useAppStore((s) => s.setCartPromoCode);
  const cartLoyaltySpent = useAppStore((s) => s.cartLoyaltySpent);
  const setCartLoyaltySpent = useAppStore((s) => s.setCartLoyaltySpent);
  const clearCart = useAppStore((s) => s.clearCart);
  const savatchaMenuOpen = useAppStore((s) => s.savatchaMenuOpen);
  const setSavatchaMenuOpen = useAppStore((s) => s.setSavatchaMenuOpen);

  const getVariantStock = useAppStore((s) => s.getVariantStock);
  const getWarehouseForStore = useAppStore((s) => s.getWarehouseForStore);
  const createDeferredTransaction = useAppStore((s) => s.createDeferredTransaction);
  const upsertProduct = useAppStore((s) => s.upsertProduct);
  const quickAddStock = useAppStore((s) => s.quickAddStock);
  const openShift = useAppStore((s) => s.openShift);
  const recordCashOp = useAppStore((s) => s.recordCashOp);
  const closeShift = useAppStore((s) => s.closeShift);
  const processReturn = useAppStore((s) => s.processReturn);
  const upsertCustomer = useAppStore((s) => s.upsertCustomer);
  const verifyManagerPin = useAppStore((s) => s.verifyManagerPin);
  const notify = useAppStore((s) => s.notify);
  const t = useT();
  const navigate = useNavigate();

  const currentStoreId =
    activeStoreId !== 'all' ? activeStoreId : db?.stores[0]?.id ?? 'store-chilonzor';
  const currentWarehouseId = getWarehouseForStore(currentStoreId);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [rawSearch, setRawSearch] = useState('');
  const [search, setSearch] = useState('');

  // Sheets & modals
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('+99890');
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [deferredModalOpen, setDeferredModalOpen] = useState(false);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [returnsModalOpen, setReturnsModalOpen] = useState(false);

  const [quickCreateBarcode, setQuickCreateBarcode] = useState<string | null>(null);
  const [quickProdName, setQuickProdName] = useState('');
  const [quickProdPrice, setQuickProdPrice] = useState(120000);
  const [quickProdQty, setQuickProdQty] = useState(10);

  const [managerPinPrompt, setManagerPinPrompt] = useState<{ pendingPercent: number } | null>(null);
  const [managerPinVal, setManagerPinVal] = useState('');
  const [promoInput, setPromoInput] = useState(cartPromoCode);

  // Shift form states
  const [startingCash, setStartingCash] = useState(500000);
  const [cashOpType, setCashOpType] = useState<'in' | 'out'>('in');
  const [cashOpAmount, setCashOpAmount] = useState(100000);
  const [cashOpReason, setCashOpReason] = useState('Mayda pul kiritish');
  const [actualClosingCash, setActualClosingCash] = useState(0);

  // Return modal state
  const [returnSearch, setReturnSearch] = useState('');
  const [selectedSaleForReturn, setSelectedSaleForReturn] = useState<Sale | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("O'lchami to'g'ri kelmadi");
  const [returnMethod, setReturnMethod] = useState<PaymentMethod>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const usbBufferRef = useRef('');
  const usbLastTimeRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(rawSearch.trim().toLowerCase()), 100);
    return () => clearTimeout(timer);
  }, [rawSearch]);

  // USB / Bluetooth hardware barcode scanner global keydown buffer
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) return;

      const now = Date.now();
      if (now - usbLastTimeRef.current > 180) {
        usbBufferRef.current = '';
      }
      usbLastTimeRef.current = now;

      if (e.key === 'Enter') {
        if (usbBufferRef.current.length >= 4) {
          e.preventDefault();
          const code = usbBufferRef.current;
          usbBufferRef.current = '';
          handleBarcodeScanned(code);
        } else {
          usbBufferRef.current = '';
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        usbBufferRef.current += e.key;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Camera BarcodeDetector loop
  useEffect(() => {
    if (!scannerOpen) return;
    let stream: MediaStream | null = null;
    let active = true;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if ('BarcodeDetector' in window && window.BarcodeDetector) {
          const detector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a'],
          });
          const tick = async () => {
            if (!active || !videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0 && codes[0].rawValue) {
                handleBarcodeScanned(codes[0].rawValue);
                setScannerOpen(false);
                return;
              }
            } catch {
              // continue scanning
            }
            if (active) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      } catch {
        // Camera unavailable or denied — user can use manual barcode input right in the sheet
      }
    };
    startCamera();

    return () => {
      active = false;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [scannerOpen]);

  const searchResults = useMemo(() => {
    if (!db || !search) return [];
    const list: { product: Product; variant: Product['variants'][0]; stock: number }[] = [];
    db.products.forEach((p) => {
      p.variants.forEach((v) => {
        const match =
          p.name.toLowerCase().includes(search) ||
          v.sku.toLowerCase().includes(search) ||
          v.barcodes.some((b) => b.toLowerCase().includes(search)) ||
          (v.color?.toLowerCase().includes(search) ?? false) ||
          (v.size?.toLowerCase().includes(search) ?? false);
        if (match) {
          list.push({ product: p, variant: v, stock: getVariantStock(v.id, currentWarehouseId) });
        }
      });
    });
    return list.slice(0, 30);
  }, [db, search, currentWarehouseId, getVariantStock]);

  if (!db) return null;

  const activeShift =
    db.cashShifts.find((s) => s.status === 'open' && s.storeId === currentStoreId) ??
    db.cashShifts.find((s) => s.status === 'open');

  const deferredSales = db.sales.filter((s) => s.status === 'deferred');

  const selectedCustomer = db.customers.find((c) => c.id === cartCustomerId);
  const selectedLoyalty = selectedCustomer
    ? db.loyaltyAccounts.find((l) => l.customerId === selectedCustomer.id)
    : undefined;

  const totalUnits = cartItems.reduce((s, it) => s + it.qty, 0);
  const subtotal = cartItems.reduce((s, it) => s + it.lineTotal, 0);
  const promoObj = cartPromoCode
    ? db.promoCodes.find((p) => p.code.toUpperCase() === cartPromoCode.toUpperCase() && p.isActive)
    : undefined;
  const promoDiscount =
    promoObj && subtotal >= promoObj.minOrderAmount
      ? promoObj.discountType === 'percent'
        ? Math.round((subtotal * promoObj.discountValue) / 100)
        : promoObj.discountValue
      : 0;
  const totalCheckDiscount = Math.min(
    subtotal,
    Math.round((subtotal * cartDiscountPercent) / 100) + cartDiscountFixed + promoDiscount
  );
  const maxSpendableCashback = Math.min(
    selectedLoyalty?.pointsBalance ?? 0,
    Math.max(0, subtotal - totalCheckDiscount)
  );
  const effectiveLoyaltySpent = Math.min(cartLoyaltySpent, maxSpendableCashback);
  const finalTotal = Math.max(0, subtotal - totalCheckDiscount - effectiveLoyaltySpent);

  const hasOverStockError =
    !db.settings.allowNegativeStock &&
    cartItems.some((it) => it.qty > getVariantStock(it.variantId, currentWarehouseId));

  const addVariantToCart = (product: Product, variant: Product['variants'][0]) => {
    const stock = getVariantStock(variant.id, currentWarehouseId);
    const existing = cartItems.find((i) => i.variantId === variant.id);
    const nextQty = (existing?.qty ?? 0) + 1;
    if (!db.settings.allowNegativeStock && nextQty > stock) {
      notify(`Omborda yetarli qoldiq yo'q (${stock} ${product.unit})`, 'error');
      return;
    }

    if (existing) {
      setCartItems((prev) =>
        prev.map((it) => {
          if (it.variantId !== variant.id) return it;
          const gross = nextQty * it.unitPrice;
          const disc = Math.round((gross * it.discountPercent) / 100);
          return { ...it, qty: nextQty, discountAmount: disc, lineTotal: gross - disc };
        })
      );
    } else {
      const label = [variant.size, variant.color].filter(Boolean).join(' / ');
      setCartItems((prev) => [
        ...prev,
        {
          id: uid('ci'),
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantLabel: label,
          sku: variant.sku,
          qty: 1,
          unitPrice: variant.retailPrice,
          purchasePrice: variant.purchasePrice,
          discountAmount: 0,
          discountPercent: 0,
          lineTotal: variant.retailPrice,
        },
      ]);
    }
    notify(`${product.name} savatchaga qo'shildi`, 'success');
  };

  const handleBarcodeScanned = (code: string) => {
    const clean = code.trim();
    if (!clean) return;
    for (const p of db.products) {
      for (const v of p.variants) {
        if (v.barcodes.includes(clean) || v.sku.toLowerCase() === clean.toLowerCase()) {
          addVariantToCart(p, v);
          setRawSearch('');
          return;
        }
      }
    }
    // Unknown barcode -> quick create right inside Savatcha
    setQuickCreateBarcode(clean);
    setQuickProdName(`Yangi tovar (${clean.slice(-4)})`);
    setQuickProdPrice(120000);
    setQuickProdQty(10);
  };

  const handleQuickCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCreateBarcode || !quickProdName.trim()) return;
    const nowIso = new Date().toISOString();
    const pId = uid('prod');
    const vId = uid('var');
    const product: Product = {
      id: pId,
      name: quickProdName.trim(),
      categoryId: db.categories[0]?.id ?? 'cat-shirts',
      unit: 'dona',
      tags: ['Tez yaratilgan'],
      isPublishedOnline: false,
      variants: [
        {
          id: vId,
          productId: pId,
          sku: `SBO-${quickCreateBarcode.slice(-5)}`,
          size: 'Standart',
          purchasePrice: Math.round(quickProdPrice * 0.65),
          retailPrice: quickProdPrice,
          wholesalePrice: Math.round(quickProdPrice * 0.85),
          minStock: 2,
          barcodes: [quickCreateBarcode],
          storeId: currentStoreId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: 'usr-cashier',
        },
      ],
      storeId: currentStoreId,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: 'usr-cashier',
    };
    const res = await upsertProduct(product);
    if (!res.ok) {
      notify(res.error || 'Bu mahsulot allaqachon mavjud', 'error');
      return;
    }
    await quickAddStock(pId, vId, currentWarehouseId, Math.max(1, quickProdQty), 'Savatcha tezkor yaratish');
    addVariantToCart(product, product.variants[0]);
    setQuickCreateBarcode(null);
    setRawSearch('');
  };

  const updateItemQty = (itemId: string, nextQty: number) => {
    if (nextQty <= 0) {
      setCartItems((prev) => prev.filter((x) => x.id !== itemId));
      return;
    }
    const target = cartItems.find((it) => it.id === itemId);
    if (!target) return;
    const stock = getVariantStock(target.variantId, currentWarehouseId);
    if (nextQty > target.qty && !db.settings.allowNegativeStock && nextQty > stock) {
      notify(`Omborda faqat ${stock} dona mavjud`, 'error');
      return;
    }
    setCartItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const gross = nextQty * it.unitPrice;
        const disc = Math.round((gross * it.discountPercent) / 100);
        return { ...it, qty: nextQty, discountAmount: disc, lineTotal: gross - disc };
      })
    );
  };

  const updateItemDiscount = (itemId: string, percent: number) => {
    const safePct = Math.max(0, Math.min(90, percent));
    setCartItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const gross = it.qty * it.unitPrice;
        const disc = Math.round((gross * safePct) / 100);
        return { ...it, discountPercent: safePct, discountAmount: disc, lineTotal: gross - disc };
      })
    );
  };

  const requestCheckDiscount = (pct: number) => {
    const safePct = Math.max(0, Math.min(90, pct));
    if (safePct >= db.settings.discountApprovalThresholdPercent) {
      setManagerPinPrompt({ pendingPercent: safePct });
      return;
    }
    setCartDiscountPercent(safePct);
  };

  const handleProceedToPayment = async () => {
    if (isSubmitting || cartItems.length === 0) return;
    if (hasOverStockError) {
      notify("Ba'zi tovarlar qoldig'i omborda yetarli emas", 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const tx = await createDeferredTransaction({
        storeId: currentStoreId,
        warehouseId: currentWarehouseId,
        items: cartItems,
        customerId: cartCustomerId || undefined,
        checkDiscountAmount: totalCheckDiscount,
        checkDiscountPercent: cartDiscountPercent,
        loyaltyPointsSpent: effectiveLoyaltySpent,
        promoCode: cartPromoCode || undefined,
      });
      clearCart();
      navigate(`/transactions/${tx.id}?tab=payment`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCustomers = db.customers.filter((c) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.trim().toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  return (
    <div className="max-w-3xl mx-auto pb-36 lg:pb-24 space-y-3">
      {/* Search Field: "Artikul, shtrix-kod, ism" */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={searchInputRef}
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && rawSearch.trim()) {
              e.preventDefault();
              handleBarcodeScanned(rawSearch);
            }
          }}
          placeholder={t.pos.searchPlaceholder}
          className="w-full h-12 pl-10 pr-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-xs"
        />
        {rawSearch && (
          <button
            type="button"
            onClick={() => {
              setRawSearch('');
              setSearch('');
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 absolute right-2 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Attached customer / discount indicator bar */}
      {(selectedCustomer || totalCheckDiscount > 0 || effectiveLoyaltySpent > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {selectedCustomer && (
            <button
              type="button"
              onClick={() => setCustomerModalOpen(true)}
              className="h-8 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{selectedCustomer.name}</span>
            </button>
          )}
          {totalCheckDiscount > 0 && (
            <button
              type="button"
              onClick={() => setDiscountModalOpen(true)}
              className="h-8 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Percent className="w-3.5 h-3.5" />
              <span>-{formatUzsSpaced(totalCheckDiscount)}</span>
            </button>
          )}
          {effectiveLoyaltySpent > 0 && (
            <span className="h-8 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center">
              Keshbek: -{formatUzsSpaced(effectiveLoyaltySpent)}
            </span>
          )}
        </div>
      )}

      {/* Search Results List (appears when typing in search field) */}
      {search && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-md divide-y divide-slate-100 dark:divide-slate-800">
          {searchResults.length === 0 ? (
            <div className="p-5 text-center space-y-2.5">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                "{rawSearch}" bo'yicha tovar topilmadi
              </div>
              <button
                type="button"
                onClick={() => handleBarcodeScanned(rawSearch)}
                className="h-10 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{t.pos.quickCreate}</span>
              </button>
            </div>
          ) : (
            searchResults.map(({ product, variant, stock }) => {
              const outOfStock = stock <= 0 && !db.settings.allowNegativeStock;
              return (
                <button
                  key={variant.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => {
                    addVariantToCart(product, variant);
                    setRawSearch('');
                    setSearch('');
                  }}
                  className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 transition-colors ${
                    outOfStock
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/70 active:bg-blue-50/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ProductThumb src={product.photoUrl} name={product.name} className="w-10 h-10 rounded-xl" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {product.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        <span className="font-mono">{variant.sku}</span>
                        {(variant.size || variant.color) && (
                          <span> · {[variant.size, variant.color].filter(Boolean).join(' / ')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono tabular-nums text-sm font-bold text-blue-600 dark:text-blue-400">
                      {formatUzsSpaced(variant.retailPrice)}
                    </div>
                    <div
                      className={`text-[11px] font-mono tabular-nums ${
                        stock <= 0 ? 'text-red-500' : stock <= variant.minStock ? 'text-amber-600' : 'text-slate-400'
                      }`}
                    >
                      {stock} {product.unit}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Cart Body: Empty State OR Cart Item Rows */}
      {cartItems.length === 0 && !search ? (
        <div className="min-h-[52vh] flex flex-col items-center justify-center text-center px-6 py-10">
          {/* Faded Barcode Illustration */}
          <div className="w-32 h-24 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center mb-5 text-slate-300 dark:text-slate-700">
            <svg viewBox="0 0 120 64" className="w-24 h-14 fill-current" aria-hidden="true">
              <rect x="6" y="8" width="4" height="48" rx="1" />
              <rect x="14" y="8" width="2" height="48" rx="1" />
              <rect x="20" y="8" width="6" height="48" rx="1" />
              <rect x="30" y="8" width="3" height="48" rx="1" />
              <rect x="38" y="8" width="5" height="48" rx="1" />
              <rect x="47" y="8" width="2" height="48" rx="1" />
              <rect x="53" y="8" width="7" height="48" rx="1" />
              <rect x="64" y="8" width="3" height="48" rx="1" />
              <rect x="72" y="8" width="4" height="48" rx="1" />
              <rect x="80" y="8" width="2" height="48" rx="1" />
              <rect x="86" y="8" width="6" height="48" rx="1" />
              <rect x="96" y="8" width="4" height="48" rx="1" />
              <rect x="104" y="8" width="3" height="48" rx="1" />
              <rect x="111" y="8" width="3" height="48" rx="1" />
            </svg>
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            {t.pos.emptyCart}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mt-1.5 leading-relaxed">
            {t.pos.emptyCartHint}
          </p>
        </div>
      ) : (
        cartItems.length > 0 && (
          <div className="space-y-2.5">
            {cartItems.map((it) => (
              <SwipeCartRow
                key={it.id}
                item={it}
                availableStock={getVariantStock(it.variantId, currentWarehouseId)}
                allowNegative={db.settings.allowNegativeStock}
                onQtyChange={(nextQty) => updateItemQty(it.id, nextQty)}
                onDiscountChange={(pct) => updateItemDiscount(it.id, pct)}
                onDelete={() => setCartItems((prev) => prev.filter((x) => x.id !== it.id))}
              />
            ))}
          </div>
        )
      )}

      {/* Sticky Summary (shown once cart has items, fixed right above Skaner pill & tab bar on mobile) */}
      {cartItems.length > 0 && (
        <div className="fixed left-0 right-0 bottom-[132px] lg:bottom-20 lg:left-64 z-20 px-3 sm:px-4 pointer-events-none">
          <div className="max-w-3xl mx-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xl pointer-events-auto space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {totalUnits} {t.transactions.units} · {t.pos.subtotal}:{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  {formatUzsSpaced(subtotal)}
                </strong>
              </span>
              {totalCheckDiscount + effectiveLoyaltySpent > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-mono tabular-nums font-semibold">
                  {t.pos.discount}: -{formatUzsSpaced(totalCheckDiscount + effectiveLoyaltySpent)}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                  {t.common.total}
                </div>
                <div className="font-display font-mono tabular-nums text-xl font-extrabold text-slate-900 dark:text-white">
                  {formatUzsSpaced(finalTotal)}
                </div>
              </div>

              <button
                type="button"
                disabled={hasOverStockError || isSubmitting}
                onClick={handleProceedToPayment}
                className="h-12 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm transition-colors"
              >
                <span>{t.pos.pay}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Pill Button: "Skaner" (above bottom tab bar) */}
      <div className="fixed left-0 right-0 bottom-[74px] lg:bottom-4 lg:left-64 z-20 flex justify-center pointer-events-none px-4">
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="pointer-events-auto h-12 px-7 rounded-full bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white text-sm font-bold inline-flex items-center gap-2.5 shadow-lg active:scale-[0.98] transition-all"
        >
          <ScanBarcode className="w-5 h-5" />
          <span>{t.pos.scanCamera}</span>
        </button>
      </div>

      {/* "..." Action Bottom Sheet (Mijoz biriktirish, Chegirma, Savatchani tozalash, Kechiktirilgan savatchalar) */}
      {savatchaMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center"
          onClick={() => setSavatchaMenuOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-5 pb-safe space-y-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-2 sm:hidden" />
            <div className="flex items-center justify-between pb-2">
              <h3 className="font-display text-base font-bold">Savatcha amallari</h3>
              <button
                type="button"
                onClick={() => setSavatchaMenuOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setSavatchaMenuOpen(false);
                setCustomerModalOpen(true);
              }}
              className="w-full h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 text-sm font-semibold"
            >
              <UserPlus className="w-4 h-4 text-blue-600" />
              <span>{t.pos.selectCustomer}</span>
              {selectedCustomer && (
                <span className="ml-auto text-xs text-blue-600 font-medium truncate max-w-[140px]">
                  {selectedCustomer.name}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setSavatchaMenuOpen(false);
                setDiscountModalOpen(true);
              }}
              className="w-full h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 text-sm font-semibold"
            >
              <Percent className="w-4 h-4 text-amber-600" />
              <span>{t.pos.discount}</span>
              {totalCheckDiscount > 0 && (
                <span className="ml-auto text-xs text-amber-600 font-mono font-bold">
                  -{formatUzsSpaced(totalCheckDiscount)}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setSavatchaMenuOpen(false);
                setDeferredModalOpen(true);
              }}
              className="w-full h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 text-sm font-semibold"
            >
              <Clock className="w-4 h-4 text-blue-600" />
              <span>{t.pos.heldChecks}</span>
              <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-xs font-mono font-bold">
                {deferredSales.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSavatchaMenuOpen(false);
                setShiftModalOpen(true);
              }}
              className="w-full h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 text-sm font-semibold"
            >
              <Clock className="w-4 h-4 text-slate-500" />
              <span>{t.pos.shift} ({activeShift ? activeShift.number : 'Yopiq'})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSavatchaMenuOpen(false);
                setReturnsModalOpen(true);
              }}
              className="w-full h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 text-sm font-semibold"
            >
              <RotateCcw className="w-4 h-4 text-slate-500" />
              <span>{t.pos.returns}</span>
            </button>

            <button
              type="button"
              disabled={cartItems.length === 0}
              onClick={() => {
                clearCart();
                setSavatchaMenuOpen(false);
                notify('Savatcha tozalandi', 'info');
              }}
              className="w-full h-12 px-4 rounded-xl bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-40 flex items-center gap-3 text-sm font-semibold text-red-600 dark:text-red-400"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t.pos.clearCart}</span>
            </button>
          </div>
        </div>
      )}

      {/* Camera + Manual Barcode Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.pos.scanCamera}</h3>
              <button
                type="button"
                onClick={() => setScannerOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[4/3]">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-56 h-32 border-2 border-blue-400 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
              {!('BarcodeDetector' in window) && (
                <div className="absolute bottom-2 inset-x-3 text-center text-[11px] text-amber-300 bg-black/70 rounded-lg px-2 py-1">
                  Brauzer BarcodeDetector qo'llamaydi — pastda kodni kiriting
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!manualBarcode.trim()) return;
                const code = manualBarcode.trim();
                setManualBarcode('');
                setScannerOpen(false);
                handleBarcodeScanned(code);
              }}
              className="flex gap-2"
            >
              <input
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="Shtrix-kod yoki artikulni kiriting..."
                className="flex-1 h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm"
              />
              <button
                type="submit"
                className="h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold"
              >
                Qo'shish
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Unknown Barcode -> Quick Create Product Modal */}
      {quickCreateBarcode && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold">{t.pos.quickCreate}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.pos.barcodeNotFound}: <span className="font-mono font-semibold">{quickCreateBarcode}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickCreateBarcode(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleQuickCreateAndAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Tovar nomi</label>
                <input
                  value={quickProdName}
                  onChange={(e) => setQuickProdName(e.target.value)}
                  required
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Sotuv narxi (UZS)</label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={quickProdPrice}
                    onChange={(e) => setQuickProdPrice(Number(e.target.value))}
                    required
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Boshlang'ich qoldiq</label>
                  <input
                    type="number"
                    min={1}
                    value={quickProdQty}
                    onChange={(e) => setQuickProdQty(Number(e.target.value))}
                    required
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"
              >
                {t.pos.createAndAdd}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Attach Customer Modal */}
      {customerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-5 space-y-3 shadow-2xl max-h-[82vh] flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold">{t.pos.selectCustomer}</h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setNewCustomerOpen((v) => !v)}
                  className="h-8 px-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Yangi mijoz</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomerModalOpen(false);
                    setNewCustomerOpen(false);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {newCustomerOpen && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newCustName.trim()) return;
                  const nowIso = new Date().toISOString();
                  const created = await upsertCustomer({
                    id: uid('cust'),
                    name: newCustName.trim(),
                    phone: newCustPhone.trim(),
                    tags: [],
                    segment: 'new',
                    totalSpent: 0,
                    ordersCount: 0,
                    debtBalance: 0,
                    storeId: currentStoreId,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    createdBy: 'usr-cashier',
                  });
                  setCartCustomerId(created.id);
                  setCartLoyaltySpent(0);
                  setNewCustName('');
                  setNewCustPhone('+99890');
                  setNewCustomerOpen(false);
                  setCustomerModalOpen(false);
                  notify(`Mijoz "${created.name}" qo'shildi`, 'success');
                }}
                className="p-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 space-y-2 text-xs"
              >
                <div className="font-bold text-blue-800 dark:text-blue-200">Yangi mijoz qo'shish</div>
                <input
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="Ism familiya *"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
                <div className="flex gap-2">
                  <input
                    required
                    type="tel"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    placeholder="+998901234567"
                    className="flex-1 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                  <button
                    type="submit"
                    className="h-9 px-3.5 rounded-lg bg-blue-600 text-white font-semibold"
                  >
                    Saqlash
                  </button>
                </div>
              </form>
            )}

            <input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Ism yoki telefon raqam..."
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              <button
                type="button"
                onClick={() => {
                  setCartCustomerId('');
                  setCartLoyaltySpent(0);
                  setCustomerModalOpen(false);
                }}
                className="w-full py-3 px-2 text-left text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-between"
              >
                <span>{t.pos.walkIn}</span>
                {!cartCustomerId && <Check className="w-4 h-4 text-blue-600" />}
              </button>
              {filteredCustomers.map((c) => {
                const loy = db.loyaltyAccounts.find((l) => l.customerId === c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCartCustomerId(c.id);
                      setCartLoyaltySpent(0);
                      setCustomerModalOpen(false);
                    }}
                    className="w-full py-3 px-2 text-left flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div>
                      <div className="text-sm font-semibold">{c.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{c.phone}</div>
                    </div>
                    <div className="text-right text-xs">
                      {loy && (
                        <div className="text-emerald-600 font-mono font-semibold">
                          {formatUzsSpaced(loy.pointsBalance)}
                        </div>
                      )}
                      {cartCustomerId === c.id && <Check className="w-4 h-4 text-blue-600 ml-auto" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Check Discount Modal */}
      {discountModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.pos.checkDiscount}</h3>
              <button
                type="button"
                onClick={() => setDiscountModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Foiz (%)</label>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={cartDiscountPercent}
                  onChange={(e) => requestCheckDiscount(Number(e.target.value))}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Summa (UZS)</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={cartDiscountFixed}
                  onChange={(e) => setCartDiscountFixed(Math.max(0, Number(e.target.value)))}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t.pos.promoCode}</label>
              <div className="flex gap-2">
                <input
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  placeholder="YANGI10"
                  className="flex-1 h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm uppercase"
                />
                <button
                  type="button"
                  onClick={() => {
                    const found = db.promoCodes.find(
                      (p) => p.code.toUpperCase() === promoInput.trim().toUpperCase() && p.isActive
                    );
                    if (!found) {
                      notify('Promokod topilmadi', 'error');
                      return;
                    }
                    setCartPromoCode(found.code);
                    notify(`Promokod ${found.code} qo'llanildi`, 'success');
                  }}
                  className="h-11 px-4 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold"
                >
                  {t.pos.apply}
                </button>
              </div>
            </div>

            {selectedLoyalty && selectedLoyalty.pointsBalance > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span>
                  {t.pos.availableCashback}:{' '}
                  <strong className="font-mono">{formatUzsSpaced(selectedLoyalty.pointsBalance)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCartLoyaltySpent(effectiveLoyaltySpent > 0 ? 0 : maxSpendableCashback)
                  }
                  className="text-blue-600 font-bold"
                >
                  {effectiveLoyaltySpent > 0 ? t.common.cancel : t.pos.useCashback}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setDiscountModalOpen(false)}
              className="w-full h-11 rounded-xl bg-blue-600 text-white text-sm font-bold"
            >
              {t.common.confirm}
            </button>
          </div>
        </div>
      )}

      {/* Deferred Transactions / Held Carts Modal */}
      {deferredModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-5 space-y-3 shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.pos.heldChecks}</h3>
              <button
                type="button"
                onClick={() => setDeferredModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deferredSales.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                Kechiktirilgan savatchalar yo'q
              </div>
            ) : (
              <div className="space-y-2">
                {deferredSales.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setDeferredModalOpen(false);
                      navigate(`/transactions/${s.id}?tab=payment`);
                    }}
                    className="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-left flex items-center justify-between hover:border-blue-500"
                  >
                    <div>
                      <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
                        {s.receiptNumber}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {s.customerName || t.pos.walkIn} · {s.items.reduce((a, b) => a + b.qty, 0)}{' '}
                        {t.transactions.units}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums text-sm font-bold">
                      {formatUzsSpaced(s.totalAmount)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manager PIN Approval for Big Discount */}
      {managerPinPrompt && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="font-display text-sm font-bold">{t.pos.managerApprovalTitle}</h3>
            </div>
            <p className="text-xs text-slate-500">{t.pos.managerApprovalDesc}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const mgr = verifyManagerPin(managerPinVal.trim());
                if (!mgr) {
                  notify(t.auth.invalidPin, 'error');
                  return;
                }
                setCartDiscountPercent(managerPinPrompt.pendingPercent);
                setManagerPinPrompt(null);
                setManagerPinVal('');
                notify(`Chegirma tasdiqlandi (${mgr.name})`, 'success');
              }}
              className="space-y-3"
            >
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={managerPinVal}
                onChange={(e) => setManagerPinVal(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="•••••"
                className="w-full h-11 text-center font-mono text-lg tracking-[0.4em] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setManagerPinPrompt(null)}
                  className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="h-10 rounded-xl bg-blue-600 text-white text-xs font-semibold"
                >
                  {t.common.confirm}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash Shift Modal */}
      {shiftModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.pos.shift}</h3>
              <button type="button" onClick={() => setShiftModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {!activeShift ? (
              <div className="space-y-3">
                <label className="block text-xs text-slate-500">{t.pos.startingCash}</label>
                <input
                  type="number"
                  value={startingCash}
                  onChange={(e) => setStartingCash(Number(e.target.value))}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                />
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={async () => {
                    if (isSubmitting) return;
                    setIsSubmitting(true);
                    try {
                      await openShift(Math.max(0, startingCash), currentStoreId);
                      notify('Kassa smenasi ochildi', 'success');
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  className="w-full h-11 rounded-xl bg-blue-600 disabled:opacity-50 text-white text-sm font-bold"
                >
                  {t.pos.openShift}
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="flex justify-between font-bold text-sm">
                    <span>{activeShift.number}</span>
                    <span className="text-emerald-600">Ochiq</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Boshlang'ich naqd:</span>
                    <span className="font-mono">{formatMoney(activeShift.startingCash, { lang: language })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Naqd savdo:</span>
                    <span className="font-mono">{formatMoney(activeShift.cashSalesTotal, { lang: language })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Karta savdo:</span>
                    <span className="font-mono">{formatMoney(activeShift.cardSalesTotal, { lang: language })}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span>Kassada kutilgan naqd:</span>
                    <span className="font-mono text-blue-600">
                      {formatMoney(activeShift.expectedCash, { lang: language })}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <div className="font-semibold">{t.pos.cashInOut}</div>
                  <div className="flex gap-2">
                    <select
                      value={cashOpType}
                      onChange={(e) => setCashOpType(e.target.value as 'in' | 'out')}
                      className="h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    >
                      <option value="in">Kirim</option>
                      <option value="out">Chiqim</option>
                    </select>
                    <input
                      type="number"
                      value={cashOpAmount}
                      onChange={(e) => setCashOpAmount(Number(e.target.value))}
                      className="flex-1 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={cashOpReason}
                      onChange={(e) => setCashOpReason(e.target.value)}
                      placeholder="Sabab"
                      className="flex-1 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      disabled={isSubmitting || cashOpAmount <= 0}
                      onClick={async () => {
                        if (isSubmitting || cashOpAmount <= 0) return;
                        setIsSubmitting(true);
                        try {
                          await recordCashOp(activeShift.id, cashOpType, cashOpAmount, cashOpReason);
                          notify('Kassa amaliyoti saqlandi', 'success');
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="h-10 px-4 rounded-lg bg-slate-900 dark:bg-slate-800 disabled:opacity-50 text-white font-semibold"
                    >
                      OK
                    </button>
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <div className="font-semibold">{t.pos.closeShift}</div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={actualClosingCash || activeShift.expectedCash}
                      onChange={(e) => setActualClosingCash(Number(e.target.value))}
                      placeholder="Haqiqiy naqd summa"
                      className="flex-1 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                    />
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        if (isSubmitting) return;
                        setIsSubmitting(true);
                        try {
                          await closeShift(activeShift.id, actualClosingCash || activeShift.expectedCash);
                          setShiftModalOpen(false);
                          notify('Smena yopildi va Z-hisobot saqlandi', 'success');
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="h-10 px-4 rounded-lg bg-red-600 disabled:opacity-50 text-white font-semibold"
                    >
                      Yopish
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Returns Modal */}
      {returnsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.pos.returns}</h3>
              <button
                type="button"
                onClick={() => {
                  setReturnsModalOpen(false);
                  setSelectedSaleForReturn(null);
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {!selectedSaleForReturn ? (
              <div className="space-y-3">
                <input
                  value={returnSearch}
                  onChange={(e) => setReturnSearch(e.target.value)}
                  placeholder="Chek raqami yoki mijoz nomi..."
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                  {db.sales
                    .filter(
                      (s) =>
                        (s.status === 'completed' || s.status === 'partial_return') &&
                        (!returnSearch ||
                          s.receiptNumber.toLowerCase().includes(returnSearch.toLowerCase()) ||
                          (s.customerName?.toLowerCase().includes(returnSearch.toLowerCase()) ?? false))
                    )
                    .slice(0, 15)
                    .map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSaleForReturn(s);
                          const priorReturnedByItem: Record<string, number> = {};
                          db.returns
                            .filter((r) => r.saleId === s.id)
                            .forEach((r) =>
                              r.items.forEach((ri) => {
                                priorReturnedByItem[ri.saleItemId] = (priorReturnedByItem[ri.saleItemId] || 0) + ri.qty;
                              })
                            );
                          const initQ: Record<string, number> = {};
                          s.items.forEach((it) => {
                            initQ[it.id] = Math.max(0, it.qty - (priorReturnedByItem[it.id] || 0));
                          });
                          setReturnQtys(initQ);
                        }}
                        className="w-full py-2.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded-lg text-xs"
                      >
                        <div>
                          <div className="font-mono font-bold">{s.receiptNumber}</div>
                          <div className="text-slate-500">
                            {formatDateTime(s.createdAt, language)} · {s.customerName || t.pos.walkIn}
                          </div>
                        </div>
                        <div className="font-mono font-bold text-blue-600">
                          {formatMoney(s.totalAmount, { lang: language })}
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="font-mono font-bold text-sm">
                  {selectedSaleForReturn.receiptNumber} ·{' '}
                  {formatMoney(selectedSaleForReturn.totalAmount, { lang: language })}
                </div>
                {selectedSaleForReturn.items.map((it) => {
                  const alreadyRet = db.returns
                    .filter((r) => r.saleId === selectedSaleForReturn.id)
                    .reduce(
                      (sum, r) =>
                        sum + r.items.filter((ri) => ri.saleItemId === it.id).reduce((s2, ri) => s2 + ri.qty, 0),
                      0
                    );
                  const remainingQty = Math.max(0, it.qty - alreadyRet);
                  return (
                    <div key={it.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="font-semibold">{it.productName}</div>
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
                          setReturnQtys({
                            ...returnQtys,
                            [it.id]: Math.min(remainingQty, Math.max(0, Number(e.target.value))),
                          })
                        }
                        className="w-16 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-center font-mono disabled:opacity-40"
                      />
                    </div>
                  );
                })}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={returnMethod}
                    onChange={(e) => setReturnMethod(e.target.value as PaymentMethod)}
                    className="h-10 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="cash">Naqd qaytarish</option>
                    <option value="uzcard">Karta qaytarish</option>
                  </select>
                  <input
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="Qaytarish sababi"
                    className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSaleForReturn(null)}
                    className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold"
                  >
                    Orqaga
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={async () => {
                      if (isSubmitting) return;
                      const retItems = Object.entries(returnQtys)
                        .filter(([, q]) => q > 0)
                        .map(([saleItemId, qty]) => ({ saleItemId, qty }));
                      if (retItems.length === 0) return;
                      setIsSubmitting(true);
                      try {
                        await processReturn({
                          saleId: selectedSaleForReturn.id,
                          items: retItems,
                          refundMethod: returnMethod,
                          reason: returnReason,
                        });
                        setReturnsModalOpen(false);
                        setSelectedSaleForReturn(null);
                        notify("Qaytarish rasmiylashtirildi va qoldiq omborga qaytdi", 'success');
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    className="flex-1 h-10 rounded-xl bg-red-600 disabled:opacity-50 text-white font-semibold"
                  >
                    Qaytarishni tasdiqlash
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
