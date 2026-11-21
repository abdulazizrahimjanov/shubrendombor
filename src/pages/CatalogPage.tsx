import React, { useMemo, useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Printer,
  Download,
  Upload,
  Tag,
  PackagePlus,
  Edit3,
  Trash2,
  X,
  Check,
  Barcode as BarcodeIcon,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Grid2x2,
  Layers,
  ImagePlus,
  Camera,
  FolderCog,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { useAppStore, uid } from '../store/useAppStore';
import { formatMoney, useT } from '../i18n';
import { Category, Product, Variant } from '../types/models';
import { generateEAN13, renderBarcodeToSvgString } from '../utils/barcode';
import { exportToCsv, exportToExcel, parseSpreadsheetFile } from '../utils/export';
import { printHtmlDocument } from '../utils/print';
import { BarcodeSvg, ProductThumb } from '../components/BarcodeSvg';

const PRESET_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '38', '39', '40', '41', '42', '43', '44'];
const PRESET_COLORS = ['Qora', 'Oq', 'Sariq', "Ko'k", 'Qizil', 'Kulrang', 'Bej', 'Yashil', 'Jigarrang'];

function getColorSwatch(colorName?: string): string {
  const c = (colorName || '').trim().toLowerCase();
  if (!c) return '#94A3B8';
  if (c.includes('qora') || c.includes('black') || c.includes('черн')) return '#1E293B';
  if (c.includes('oq') || c.includes('white') || c.includes('бел')) return '#F8FAFC';
  if (c.includes("ko'k") || c.includes('kok') || c.includes('blue') || c.includes('син') || c.includes('moviy')) return '#2563EB';
  if (c.includes('qizil') || c.includes('red') || c.includes('крас')) return '#DC2626';
  if (c.includes('yashil') || c.includes('green') || c.includes('зел')) return '#16A34A';
  if (c.includes('bej') || c.includes('beige') || c.includes('крем') || c.includes('qaymoq')) return '#D6C4A8';
  if (c.includes('kul') || c.includes('gray') || c.includes('grey') || c.includes('сер')) return '#64748B';
  if (c.includes('jigar') || c.includes('brown') || c.includes('корич')) return '#78350F';
  if (c.includes('sariq') || c.includes('yellow') || c.includes('желт')) return '#EAB308';
  if (c.includes('pushti') || c.includes('pink') || c.includes('роз')) return '#EC4899';
  return '#0D9488';
}

export const CatalogPage: React.FC = () => {
  const db = useAppStore((s) => s.db);
  const can = useAppStore((s) => s.can);
  const currentUser = useAppStore((s) => s.getCurrentUser());
  const language = useAppStore((s) => s.language);
  const activeStoreId = useAppStore((s) => s.activeStoreId);
  const getVariantStock = useAppStore((s) => s.getVariantStock);
  const getWarehouseForStore = useAppStore((s) => s.getWarehouseForStore);
  const upsertProduct = useAppStore((s) => s.upsertProduct);
  const deleteProduct = useAppStore((s) => s.deleteProduct);
  const bulkUpdatePrices = useAppStore((s) => s.bulkUpdatePrices);
  const quickAddStock = useAppStore((s) => s.quickAddStock);
  const importProducts = useAppStore((s) => s.importProducts);
  const isCategoryUsed = useAppStore((s) => s.isCategoryUsed);
  const upsertCategory = useAppStore((s) => s.upsertCategory);
  const deleteCategory = useAppStore((s) => s.deleteCategory);
  const resetCategoriesToMensClothing = useAppStore((s) => s.resetCategoriesToMensClothing);
  const notify = useAppStore((s) => s.notify);
  const t = useT();

  const canViewCost = can('view_profit_cost');
  const canEdit = can('edit_catalog');
  const canBulk = can('bulk_edit_prices');

  const [rawSearch, setRawSearch] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Billz-style expanded variants view (ON by default so every size/color price & cost is visible)
  const [expandAllVariants, setExpandAllVariants] = useState(true);
  const [collapsedProductIds, setCollapsedProductIds] = useState<Record<string, boolean>>({});
  const [expandedProductIds, setExpandedProductIds] = useState<Record<string, boolean>>({});

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [variantInitialStocks, setVariantInitialStocks] = useState<Record<string, number>>({});

  // Color -> Sizes & Quantities Builder inside Product Modal
  const [activeBuilderColor, setActiveBuilderColor] = useState('Qora');
  const [customSizeInput, setCustomSizeInput] = useState('');
  const [colorSizeDrafts, setColorSizeDrafts] = useState<Record<string, number>>({ M: 3 });
  const [matrixCost, setMatrixCost] = useState(100000);
  const [matrixRetail, setMatrixRetail] = useState(165000);
  const [matrixWholesale, setMatrixWholesale] = useState(140000);

  const [quickStockTarget, setQuickStockTarget] = useState<{ product: Product; variantId: string; qty: number } | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkPercent, setBulkPercent] = useState(5);
  const [bulkField, setBulkField] = useState<'retailPrice' | 'purchasePrice' | 'wholesalePrice'>('retailPrice');
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<Product | null>(null);

  // Label printing studio
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelSize, setLabelSize] = useState<'40x30' | '58x40' | '30x20'>(db?.settings.labelTemplate ?? '40x30');
  const [labelQuantities, setLabelQuantities] = useState<Record<string, number>>({});

  // Categories CRUD modal & quick inline create
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catDeleteConfirm, setCatDeleteConfirm] = useState<Category | null>(null);
  const [inlineNewCatOpen, setInlineNewCatOpen] = useState(false);
  const [inlineNewCatName, setInlineNewCatName] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(rawSearch.trim().toLowerCase()), 180);
    return () => clearTimeout(timer);
  }, [rawSearch]);

  const filteredProducts = useMemo(() => {
    if (!db) return [];
    return db.products.filter((p) => {
      if (categoryFilter !== 'all' && p.categoryId !== categoryFilter) return false;
      if (brandFilter !== 'all' && p.brandId !== brandFilter) return false;
      if (!search) return true;
      const inName = p.name.toLowerCase().includes(search);
      const inVariant = p.variants.some(
        (v) =>
          v.sku.toLowerCase().includes(search) ||
          v.barcodes.some((b) => b.toLowerCase().includes(search)) ||
          (v.size?.toLowerCase().includes(search) ?? false) ||
          (v.color?.toLowerCase().includes(search) ?? false)
      );
      return inName || inVariant;
    });
  }, [db, categoryFilter, brandFilter, search]);

  const stockByVariant = useMemo(() => {
    const map = new Map<string, number>();
    if (!db) return map;
    const targetWhId =
      activeStoreId !== 'all'
        ? db.stores.find((st) => st.id === activeStoreId)?.defaultWarehouseId
        : undefined;
    for (const st of db.stockItems) {
      if (targetWhId && st.warehouseId !== targetWhId) continue;
      map.set(st.variantId, (map.get(st.variantId) ?? 0) + st.qty);
    }
    return map;
  }, [db, activeStoreId]);

  const getCatalogVariantStock = (variantId: string) => stockByVariant.get(variantId) ?? 0;

  if (!db) return null;

  const getCategoryName = (id: string) => {
    const c = db.categories.find((x) => x.id === id);
    return c ? (language === 'ru' ? c.nameRu : c.nameUz) : '—';
  };

  const getBrandName = (id?: string) => db.brands.find((b) => b.id === id)?.name ?? '';

  const isProductExpanded = (productId: string) => {
    if (expandAllVariants) return !collapsedProductIds[productId];
    return Boolean(expandedProductIds[productId]);
  };

  const toggleExpandProduct = (productId: string) => {
    if (expandAllVariants) {
      setCollapsedProductIds((prev) => ({ ...prev, [productId]: !prev[productId] }));
    } else {
      setExpandedProductIds((prev) => ({ ...prev, [productId]: !prev[productId] }));
    }
  };

  const openNewProduct = () => {
    const nowIso = new Date().toISOString();
    const pId = uid('prod');
    const firstVarId = uid('var');
    const storeId = activeStoreId !== 'all' ? activeStoreId : db.stores[0]?.id ?? 'store-chilonzor';
    setVariantInitialStocks({ [firstVarId]: 0 });
    setActiveBuilderColor('Qora');
    setColorSizeDrafts({ M: 3 });
    setCustomSizeInput('');
    setMatrixCost(100000);
    setMatrixRetail(165000);
    setMatrixWholesale(140000);
    setEditingProduct({
      id: pId,
      name: '',
      categoryId: db.categories[0]?.id ?? 'cat-shirts',
      brandId: db.brands[0]?.id,
      collection: '',
      unit: 'dona',
      description: '',
      supplierId: db.suppliers[0]?.id,
      tags: [],
      isPublishedOnline: true,
      variants: [
        {
          id: firstVarId,
          productId: pId,
          sku: `SBO-${Math.floor(100 + Math.random() * 899)}-1`,
          size: 'M',
          color: 'Qora',
          purchasePrice: 100000,
          retailPrice: 165000,
          wholesalePrice: 140000,
          minStock: 5,
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
  };

  const openEditProduct = (p: Product) => {
    const clone = structuredClone(p);
    setEditingProduct(clone);
    setVariantInitialStocks({});
    setActiveBuilderColor(clone.variants[0]?.color || 'Qora');
    setColorSizeDrafts({});
    setCustomSizeInput('');
    if (clone.variants[0]) {
      setMatrixCost(clone.variants[0].purchasePrice);
      setMatrixRetail(clone.variants[0].retailPrice);
      setMatrixWholesale(clone.variants[0].wholesalePrice);
    }
  };

  const toggleBuilderSize = (sz: string) => {
    setColorSizeDrafts((prev) => {
      const next = { ...prev };
      if (sz in next) {
        delete next[sz];
      } else {
        next[sz] = 1;
      }
      return next;
    });
  };

  const setBuilderSizeQty = (sz: string, qty: number) => {
    setColorSizeDrafts((prev) => ({
      ...prev,
      [sz]: Math.max(0, qty),
    }));
  };

  const handleAddCustomSize = () => {
    const clean = customSizeInput.trim();
    if (!clean) return;
    setColorSizeDrafts((prev) => ({
      ...prev,
      [clean]: prev[clean] ?? 1,
    }));
    setCustomSizeInput('');
  };

  const handleAddColorSizes = () => {
    if (!editingProduct) return;
    const color = activeBuilderColor.trim() || 'Asosiy';
    const entries = Object.entries(colorSizeDrafts);
    if (entries.length === 0) {
      notify(`"${color}" rangi uchun kamida 1 ta razmer tanlang`, 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    const baseSkuPrefix = `SBO-${Math.floor(100 + Math.random() * 899)}`;
    const existing = [...editingProduct.variants];
    const nextStockMap = { ...variantInitialStocks };

    const isFreshSinglePlaceholder =
      existing.length === 1 &&
      getVariantStock(existing[0].id) === 0 &&
      (nextStockMap[existing[0].id] ?? 0) === 0 &&
      !db.products.some((pr) => pr.id === editingProduct.id);

    const baseList: Variant[] = isFreshSinglePlaceholder ? [] : existing;
    if (isFreshSinglePlaceholder && existing[0]) {
      delete nextStockMap[existing[0].id];
    }

    let addedCount = 0;
    let updatedCount = 0;

    entries.forEach(([sz, qty]) => {
      const foundIdx = baseList.findIndex(
        (v) =>
          (v.size || '').trim().toLowerCase() === sz.toLowerCase() &&
          (v.color || '').trim().toLowerCase() === color.toLowerCase()
      );
      if (foundIdx >= 0) {
        const target = baseList[foundIdx];
        baseList[foundIdx] = {
          ...target,
          purchasePrice: matrixCost,
          retailPrice: matrixRetail,
          wholesalePrice: matrixWholesale,
          updatedAt: nowIso,
        };
        nextStockMap[target.id] = qty;
        updatedCount += 1;
      } else {
        const vId = uid('var');
        const szTag = sz.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'SZ';
        const colTag = color.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'CL';
        baseList.push({
          id: vId,
          productId: editingProduct.id,
          sku: `${baseSkuPrefix}-${colTag}-${szTag}`,
          size: sz,
          color,
          purchasePrice: matrixCost,
          retailPrice: matrixRetail,
          wholesalePrice: matrixWholesale,
          minStock: 5,
          barcodes: [generateEAN13()],
          storeId: editingProduct.storeId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: currentUser?.id ?? 'system',
        });
        nextStockMap[vId] = qty;
        addedCount += 1;
      }
    });

    setEditingProduct({ ...editingProduct, variants: baseList });
    setVariantInitialStocks(nextStockMap);
    setColorSizeDrafts({});
    const summaryParts = entries.map(([sz, qty]) => `${sz}: ${qty} ta`).join(', ');
    notify(
      `${color} (${summaryParts}) — ${addedCount > 0 ? `${addedCount} ta qo'shildi` : `${updatedCount} ta yangilandi`}`,
      'success'
    );
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editingProduct.name.trim()) return;
    const res = await upsertProduct(editingProduct);
    if (!res.ok) {
      notify(res.error || 'Bu mahsulot allaqachon mavjud', 'error');
      return;
    }

    const whId = getWarehouseForStore(editingProduct.storeId);
    for (const v of editingProduct.variants) {
      const addQty = variantInitialStocks[v.id] ?? 0;
      if (addQty > 0) {
        await quickAddStock(
          editingProduct.id,
          v.id,
          whId,
          addQty,
          `Boshlang'ich kirim (${[v.size, v.color].filter(Boolean).join(' / ')})`
        );
      }
    }

    notify(`${editingProduct.name} (${editingProduct.variants.length} variant) saqlandi`, 'success');
    setEditingProduct(null);
    setVariantInitialStocks({});
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;
    const targetProductId = editingProduct.id;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      const img = new Image();
      img.onload = () => {
        const attempts: [number, number][] = [
          [640, 0.78],
          [560, 0.68],
          [480, 0.56],
          [400, 0.46],
          [320, 0.36],
          [240, 0.3],
        ];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (result.length > 140000) {
            notify("Rasm hajmi juda katta, kichikroq rasm tanlang", 'error');
            return;
          }
          setEditingProduct((prev) =>
            prev && prev.id === targetProductId ? { ...prev, photoUrl: result } : prev
          );
          return;
        }
        let compressed = '';
        for (const [maxSide, quality] of attempts) {
          let { width, height } = img;
          if (width > maxSide || height > maxSide) {
            if (width >= height) {
              height = Math.max(1, Math.round((height * maxSide) / width));
              width = maxSide;
            } else {
              width = Math.max(1, Math.round((width * maxSide) / height));
              height = maxSide;
            }
          }
          canvas.width = width;
          canvas.height = height;
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          compressed = canvas.toDataURL('image/jpeg', quality);
          if (compressed.length <= 140000) break;
        }
        if (!compressed || compressed.length > 140000) {
          notify("Rasm hajmi juda katta (140 KB dan oshmasligi kerak)", 'error');
          return;
        }
        setEditingProduct((prev) =>
          prev && prev.id === targetProductId ? { ...prev, photoUrl: compressed } : prev
        );
      };
      img.onerror = () => {
        notify("Rasm faylini o'qib bo'lmadi — boshqa rasm tanlang", 'error');
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleExport = (type: 'xlsx' | 'csv') => {
    const rows = filteredProducts.flatMap((p) =>
      p.variants.map((v) => ({
        Nomi: p.name,
        Kategoriya: getCategoryName(p.categoryId),
        Brend: getBrandName(p.brandId),
        SKU: v.sku,
        Olcham: v.size ?? '',
        Rang: v.color ?? '',
        ShtrixKod: v.barcodes[0] ?? '',
        ...(canViewCost ? { Tannarx: v.purchasePrice } : {}),
        SotuvNarxi: v.retailPrice,
        UlgurjiNarxi: v.wholesalePrice,
        Qoldiq: getVariantStock(v.id),
      }))
    );
    if (type === 'xlsx') exportToExcel(rows, 'shu-brend-katalog');
    else exportToCsv(rows, 'shu-brend-katalog');
    notify('Eksport tayyorlandi', 'success');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseSpreadsheetFile(file);
      if (rows.length === 0) {
        notify("Fayl bo'sh", 'error');
        return;
      }
      const nowIso = new Date().toISOString();
      const storeId = activeStoreId !== 'all' ? activeStoreId : db.stores[0]?.id ?? 'store-chilonzor';
      const whId = getWarehouseForStore(storeId);
      const groupedMap = new Map<string, Product>();
      const stocks: { productId: string; variantId: string; warehouseId: string; qty: number; unitCost: number }[] = [];

      rows.forEach((r, idx) => {
        const name = String(r['Nomi'] || r['Name'] || r['name'] || `Import Tovar ${idx + 1}`).trim();
        const nameKey = name.toLowerCase();
        const retailRaw = Number(r['SotuvNarxi'] || r['Price'] || r['price'] || 100000);
        const retailPrice = Number.isFinite(retailRaw) && retailRaw > 0 ? retailRaw : 100000;
        const purchaseRaw = Number(r['Tannarx'] || r['Cost'] || r['cost'] || Math.round(retailPrice * 0.65));
        const purchasePrice = Number.isFinite(purchaseRaw) && purchaseRaw >= 0 ? purchaseRaw : Math.round(retailPrice * 0.65);
        const qtyRaw = Number(r['Qoldiq'] || r['Qty'] || r['qty'] || 0);
        const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 0;
        const barcode = String(r['ShtrixKod'] || r['Barcode'] || '').trim() || generateEAN13();
        const sku = String(r['SKU'] || r['sku'] || `IMP-${Date.now().toString().slice(-4)}-${idx}`).trim();

        let existingProd = groupedMap.get(nameKey);
        if (!existingProd) {
          const pId = uid('prod');
          existingProd = {
            id: pId,
            name,
            categoryId: db.categories[0]?.id ?? 'cat-shirts',
            unit: 'dona',
            tags: ['Import'],
            isPublishedOnline: true,
            variants: [],
            storeId,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: currentUser?.id ?? 'system',
          };
          groupedMap.set(nameKey, existingProd);
        }

        const vId = uid('var');
        existingProd.variants.push({
          id: vId,
          productId: existingProd.id,
          sku,
          size: String(r['Olcham'] || r['Size'] || 'Standart').trim(),
          color: String(r['Rang'] || r['Color'] || '').trim(),
          purchasePrice,
          retailPrice,
          wholesalePrice: Math.round(retailPrice * 0.85),
          minStock: 5,
          barcodes: [barcode],
          storeId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: currentUser?.id ?? 'system',
        });

        if (qty > 0) {
          stocks.push({ productId: existingProd.id, variantId: vId, warehouseId: whId, qty, unitCost: purchasePrice });
        }
      });

      const newProducts = Array.from(groupedMap.values());
      const res = await importProducts(newProducts, stocks);
      if (res.added === 0) {
        notify("Barcha mahsulotlar takroriy bo'lgani uchun import qilinmadi", 'error');
      } else if (res.skipped > 0) {
        notify(`${res.added} ta qo'shildi, ${res.skipped} ta takroriy mahsulot o'tkazib yuborildi`, 'info');
      } else {
        notify(`${res.added} ta mahsulot import qilindi`, 'success');
      }
    } catch {
      notify("Import faylini o'qishda xatolik", 'error');
    } finally {
      e.target.value = '';
    }
  };

  const openLabelStudio = (productsToPrint: Product[]) => {
    const initial: Record<string, number> = {};
    productsToPrint.forEach((p) => {
      p.variants.forEach((v) => {
        initial[v.id] = 1;
      });
    });
    setLabelQuantities(initial);
    setLabelModalOpen(true);
  };

  const printLabelsSheet = () => {
    const dim =
      labelSize === '30x20'
        ? { w: '30mm', h: '20mm', font: '9px' }
        : labelSize === '58x40'
        ? { w: '58mm', h: '40mm', font: '12px' }
        : { w: '40mm', h: '30mm', font: '10px' };

    const cards: string[] = [];
    db.products.forEach((p) => {
      p.variants.forEach((v) => {
        const count = labelQuantities[v.id] || 0;
        if (count <= 0) return;
        const code = v.barcodes[0] || v.sku;
        const svg = renderBarcodeToSvgString(code, { width: 1.2, height: 28, fontSize: 9 });
        for (let i = 0; i < count; i++) {
          cards.push(`
            <div style="width:${dim.w};height:${dim.h};border:1px dashed #ccc;padding:3px 4px;display:inline-flex;flex-direction:column;justify-content:space-between;margin:2px;overflow:hidden;page-break-inside:avoid;vertical-align:top;">
              <div style="font-size:${dim.font};font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
              <div style="font-size:9px;color:#444;">${[v.size, v.color, v.sku].filter(Boolean).join(' · ')}</div>
              <div style="text-align:center;line-height:1;">${svg}</div>
              <div style="font-size:12px;font-weight:800;text-align:right;">${formatMoney(v.retailPrice, { lang: language })}</div>
            </div>
          `);
        }
      });
    });

    if (cards.length === 0) {
      notify('Kamida 1 ta yorliq miqdorini kiriting', 'error');
      return;
    }
    printHtmlDocument(`<div>${cards.join('')}</div>`, 'Narx yorliqlari');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Nomi, SKU, shtrix-kod, o'lcham yoki rang..."
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium"
            >
              <option value="all">{t.catalog.allCategories}</option>
              {db.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {language === 'ru' ? c.nameRu : c.nameUz}
                </option>
              ))}
            </select>

            {canEdit && (
              <button
                type="button"
                onClick={() => setCatManagerOpen(true)}
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                title="Kategoriyalarni yaratish, tahrirlash va o'chirish"
              >
                <FolderCog className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                <span>Kategoriyalar</span>
              </button>
            )}

            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium"
            >
              <option value="all">{t.catalog.brands}: {t.common.all}</option>
              {db.brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setExpandAllVariants((v) => !v);
                setCollapsedProductIds({});
                setExpandedProductIds({});
              }}
              className={`h-10 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap ${
                expandAllVariants
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{expandAllVariants ? "O'lcham/Ranglar ochiq" : "O'lcham/Ranglar yig'iq"}</span>
            </button>

            <button
              type="button"
              onClick={() => openLabelStudio(selectedIds.length ? filteredProducts.filter((p) => selectedIds.includes(p.id)) : filteredProducts.slice(0, 8))}
              className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>{t.catalog.printLabels}</span>
            </button>

            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>

            {canEdit && (
              <label className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                <span>Import</span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} className="hidden" />
              </label>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={openNewProduct}
                className="h-10 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>{t.catalog.addProduct}</span>
              </button>
            )}
          </div>
        </div>

        {selectedIds.length > 0 && canBulk && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-teal-700 dark:text-teal-400">
              {selectedIds.length} ta mahsulot tanlandi
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBulkModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-medium inline-flex items-center gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{t.catalog.bulkEdit}</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Billz-Style Products & Variants Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/40">
                <th className="py-3 px-3 w-9">
                  <input
                    type="checkbox"
                    checked={selectedIds.length > 0 && selectedIds.length === filteredProducts.length}
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? filteredProducts.map((p) => p.id) : [])
                    }
                  />
                </th>
                <th className="py-3 px-3">Mahsulot / O'lcham & Rang</th>
                <th className="py-3 px-3">SKU / Shtrix-kod</th>
                {canViewCost && <th className="py-3 px-3 text-right">{t.catalog.purchasePrice}</th>}
                <th className="py-3 px-3 text-right">{t.catalog.retailPrice}</th>
                <th className="py-3 px-3 text-right">{t.catalog.stock}</th>
                <th className="py-3 px-3 text-right">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{t.common.emptyTitle}</div>
                    <div className="text-xs mt-1">{t.common.emptyDesc}</div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const totalStock = p.variants.reduce((sum, v) => sum + getCatalogVariantStock(v.id), 0);
                  const minStock = p.variants.reduce((sum, v) => sum + v.minStock, 0);
                  const isLow = totalStock <= minStock;
                  const expanded = isProductExpanded(p.id);

                  const retailPrices = p.variants.map((v) => v.retailPrice);
                  const minRetail = retailPrices.length ? Math.min(...retailPrices) : 0;
                  const maxRetail = retailPrices.length ? Math.max(...retailPrices) : 0;

                  const costPrices = p.variants.map((v) => v.purchasePrice);
                  const minCost = costPrices.length ? Math.min(...costPrices) : 0;
                  const maxCost = costPrices.length ? Math.max(...costPrices) : 0;

                  return (
                    <React.Fragment key={p.id}>
                      {/* Parent Product Row */}
                      <tr className="bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(p.id)}
                            onChange={() => toggleSelect(p.id)}
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => toggleExpandProduct(p.id)}
                              className="w-6 h-6 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0"
                              title="Variantlarni yoyish / yig'ish"
                            >
                              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            <ProductThumb src={p.photoUrl} name={p.name} className="w-10 h-10 rounded-lg" />
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[260px]">
                                {p.name}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {getCategoryName(p.categoryId)}
                                {p.brandId ? ` · ${getBrandName(p.brandId)}` : ''}
                                {` · ${p.variants.length} variant`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-500">
                          <div>{p.variants.length} ta o'lcham/rang</div>
                        </td>
                        {canViewCost && (
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {minCost === maxCost
                              ? formatMoney(minCost, { lang: language })
                              : `${formatMoney(minCost, { lang: language })} – ${formatMoney(maxCost, { lang: language })}`}
                          </td>
                        )}
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {minRetail === maxRetail
                            ? formatMoney(minRetail, { lang: language })
                            : `${formatMoney(minRetail, { lang: language })} – ${formatMoney(maxRetail, { lang: language })}`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className={isLow ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-800 dark:text-slate-200 font-semibold'}>
                            {totalStock} {p.unit}
                          </span>
                          {isLow && (
                            <div className="text-[11px] text-amber-600 dark:text-amber-400">Kam qolgan</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {can('manage_inventory') && p.variants[0] && (
                              <button
                                type="button"
                                onClick={() => setQuickStockTarget({ product: p, variantId: p.variants[0].id, qty: 10 })}
                                title={t.catalog.quickAddStock}
                                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50"
                              >
                                <PackagePlus className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openLabelStudio([p])}
                              title={t.catalog.printLabels}
                              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <BarcodeIcon className="w-4 h-4" />
                            </button>
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditProduct(p)}
                                  title={t.common.edit}
                                  className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmProduct(p)}
                                  title={t.common.delete}
                                  className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Billz-Style Per-Size & Color Variant Sub-Rows */}
                      {expanded &&
                        p.variants.map((v) => {
                          const vStock = getCatalogVariantStock(v.id);
                          const vLow = vStock <= v.minStock;
                          const matchedSearch =
                            search &&
                            (v.sku.toLowerCase().includes(search) ||
                              (v.size?.toLowerCase().includes(search) ?? false) ||
                              (v.color?.toLowerCase().includes(search) ?? false) ||
                              v.barcodes.some((b) => b.toLowerCase().includes(search)));

                          return (
                            <tr
                              key={v.id}
                              className={`text-xs ${
                                matchedSearch
                                  ? 'bg-amber-50/70 dark:bg-amber-950/20'
                                  : 'bg-slate-50/60 dark:bg-slate-950/40'
                              } hover:bg-slate-100/70 dark:hover:bg-slate-800/30`}
                            >
                              <td className="py-2 px-3" />
                              <td className="py-2 px-3 pl-12">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">
                                    O'lcham: {v.size || 'Standart'}
                                  </span>
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-300">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0"
                                      style={{ backgroundColor: getColorSwatch(v.color) }}
                                    />
                                    <span>{v.color || 'Asosiy'}</span>
                                  </span>
                                </div>
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                <div className="font-semibold text-slate-700 dark:text-slate-300">{v.sku}</div>
                                <div className="text-[10px] text-slate-400">{v.barcodes[0] ?? '—'}</div>
                              </td>
                              {canViewCost && (
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {formatMoney(v.purchasePrice, { lang: language })}
                                </td>
                              )}
                              <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                                {formatMoney(v.retailPrice, { lang: language })}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                <span className={vLow ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-700 dark:text-slate-300'}>
                                  {vStock} {p.unit}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right whitespace-nowrap">
                                {can('manage_inventory') && (
                                  <button
                                    type="button"
                                    onClick={() => setQuickStockTarget({ product: p, variantId: v.id, qty: 5 })}
                                    className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                                  >
                                    + Kirim
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Edit / Create Modal with Billz-Style Size × Color Matrix */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <form
            onSubmit={handleSaveProduct}
            className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="font-display text-lg font-bold">
                {editingProduct.name || t.catalog.addProduct}
              </h2>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Product Photo Section — At the very top */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative shrink-0">
                <ProductThumb
                  src={editingProduct.photoUrl}
                  name={editingProduct.name || 'Mahsulot rasmi'}
                  className="w-24 h-24 rounded-xl"
                />
                {editingProduct.photoUrl && (
                  <button
                    type="button"
                    onClick={() => setEditingProduct({ ...editingProduct, photoUrl: undefined })}
                    title="Rasmni o'chirish"
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-sm hover:bg-red-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex-1 min-w-0 w-full space-y-2 text-xs">
                <div className="font-semibold text-slate-800 dark:text-slate-100">
                  Mahsulot rasmi
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="h-9 px-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                    <ImagePlus className="w-4 h-4" />
                    <span>Galereyadan yuklash</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoFileChange}
                      className="hidden"
                    />
                  </label>
                  <label className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Camera className="w-4 h-4 text-blue-600" />
                    <span>Kameradan olish</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
                <input
                  type="url"
                  value={editingProduct.photoUrl?.startsWith('data:') ? '' : editingProduct.photoUrl ?? ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, photoUrl: e.target.value || undefined })
                  }
                  placeholder="Yoki rasm havolasini (URL) kiriting: https://..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Nomi *</label>
                <input
                  required
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  placeholder="Masalan: Erkaklar klassik ko'ylagi"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t.catalog.categories}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInlineNewCatOpen((v) => !v)}
                      className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      + Yangi
                    </button>
                    <button
                      type="button"
                      onClick={() => setCatManagerOpen(true)}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      Boshqarish
                    </button>
                  </div>
                </div>
                <select
                  value={editingProduct.categoryId}
                  onChange={(e) => setEditingProduct({ ...editingProduct, categoryId: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                >
                  {db.categories.map((c) => (
                    <option key={c.id} value={c.id}>{language === 'ru' ? c.nameRu : c.nameUz}</option>
                  ))}
                </select>
                {inlineNewCatOpen && (
                  <div className="mt-1.5 flex gap-1.5">
                    <input
                      value={inlineNewCatName}
                      onChange={(e) => setInlineNewCatName(e.target.value)}
                      placeholder="Yangi kategoriya nomi..."
                      className="flex-1 h-8 px-2.5 rounded-lg border border-blue-300 dark:border-blue-800 bg-white dark:bg-slate-900 text-xs"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const clean = inlineNewCatName.trim();
                        if (!clean) return;
                        const nowIso = new Date().toISOString();
                        const newCatId = uid('cat');
                        const res = await upsertCategory({
                          id: newCatId,
                          nameUz: clean,
                          nameRu: clean,
                          sortOrder: db.categories.length + 1,
                          storeId: editingProduct.storeId,
                          createdAt: nowIso,
                          updatedAt: nowIso,
                          createdBy: currentUser?.id ?? 'system',
                        });
                        if (!res.ok) {
                          notify(res.error || t.inventory.categoryDuplicateError, 'error');
                          return;
                        }
                        setEditingProduct({ ...editingProduct, categoryId: newCatId });
                        setInlineNewCatName('');
                        setInlineNewCatOpen(false);
                        notify(`"${clean}" kategoriyasi yaratildi`, 'success');
                      }}
                      className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                    >
                      Qo'shish
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.catalog.brands}</label>
                <select
                  value={editingProduct.brandId ?? ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, brandId: e.target.value || undefined })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                >
                  <option value="">—</option>
                  {db.brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.catalog.unit}</label>
                <select
                  value={editingProduct.unit}
                  onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value as Product['unit'] })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                >
                  {['dona', 'juft', 'kg', 'litr', 'quti', 'metr'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Kolleksiya / Mavsum</label>
                <input
                  value={editingProduct.collection ?? ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, collection: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProduct.isPublishedOnline}
                    onChange={(e) => setEditingProduct({ ...editingProduct, isPublishedOnline: e.target.checked })}
                  />
                  <span>Onlayn katalogda ko'rsatish</span>
                </label>
              </div>
            </div>

            {/* Step-by-Step: 1 Color -> Sizes & Exact Quantities in that Color */}
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/70 bg-blue-50/40 dark:bg-blue-950/20 p-3.5 space-y-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-display font-bold text-sm text-blue-900 dark:text-blue-200">
                  <Grid2x2 className="w-4 h-4 text-blue-600" />
                  <span>Rang bo'yicha razmer va sonini qo'shish (Billz uslubi)</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  1 ta rang tanlang → shu rangda bor razmerlar va sonini kiriting → Qo'shish
                </span>
              </div>

              {/* Step 1: Select 1 Color */}
              <div className="space-y-1.5">
                <div className="font-semibold text-slate-700 dark:text-slate-200">
                  1-qadam: Rangni tanlang (1 ta rang)
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESET_COLORS.map((col) => {
                    const isSelected = activeBuilderColor.trim().toLowerCase() === col.toLowerCase();
                    const existingForColor = editingProduct.variants.filter(
                      (v) => (v.color || '').trim().toLowerCase() === col.toLowerCase()
                    ).length;
                    return (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setActiveBuilderColor(col)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                          isSelected
                            ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                          style={{ backgroundColor: getColorSwatch(col) }}
                        />
                        <span>{col}</span>
                        {existingForColor > 0 && (
                          <span
                            className={`px-1 rounded text-[10px] font-mono ${
                              isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            {existingForColor}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <input
                    value={activeBuilderColor}
                    onChange={(e) => setActiveBuilderColor(e.target.value)}
                    placeholder="Boshqa rang..."
                    className="h-8 w-32 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>

              {/* Step 2: Select Sizes available in that Color */}
              <div className="space-y-2">
                <div className="font-semibold text-slate-700 dark:text-slate-200">
                  2-qadam: <span className="text-blue-700 dark:text-blue-400">"{activeBuilderColor || 'Tanlangan rang'}"</span> rangida bor razmerlarni belgilang
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESET_SIZES.map((sz) => {
                    const active = sz in colorSizeDrafts;
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => toggleBuilderSize(sz)}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold transition-colors ${
                          active
                            ? 'border-teal-600 bg-teal-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {sz}
                      </button>
                    );
                  })}
                  <div className="inline-flex items-center gap-1">
                    <input
                      value={customSizeInput}
                      onChange={(e) => setCustomSizeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomSize();
                        }
                      }}
                      placeholder="Boshqa razmer..."
                      className="h-7 w-28 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomSize}
                      className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:bg-slate-100"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Selected Sizes with Exact Per-Size Quantity */}
                {Object.keys(colorSizeDrafts).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                    {Object.entries(colorSizeDrafts).map(([sz, qty]) => (
                      <div
                        key={sz}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-900"
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                            style={{ backgroundColor: getColorSwatch(activeBuilderColor) }}
                          />
                          <span className="font-mono">{sz}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setBuilderSizeQty(sz, Math.max(0, qty - 1))}
                            className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={qty}
                            onChange={(e) => setBuilderSizeQty(sz, Number(e.target.value))}
                            className="w-12 h-6 px-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-center font-mono font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => setBuilderSizeQty(sz, qty + 1)}
                            className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            +
                          </button>
                          <span className="text-[11px] text-slate-400">ta</span>
                          <button
                            type="button"
                            onClick={() => toggleBuilderSize(sz)}
                            className="ml-0.5 text-slate-400 hover:text-red-500"
                            title="Olib tashlash"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Prices + Add Color Batch Button */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end pt-1">
                {canViewCost && (
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">Tannarx (so'm)</label>
                    <input
                      type="number"
                      value={matrixCost}
                      onChange={(e) => setMatrixCost(Number(e.target.value))}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Sotuv narxi (so'm)</label>
                  <input
                    type="number"
                    value={matrixRetail}
                    onChange={(e) => setMatrixRetail(Number(e.target.value))}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Ulgurji narx (so'm)</label>
                  <input
                    type="number"
                    value={matrixWholesale}
                    onChange={(e) => setMatrixWholesale(Number(e.target.value))}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddColorSizes}
                  className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold inline-flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>"{activeBuilderColor || 'Rang'}" ni qo'shish</span>
                </button>
              </div>
            </div>

            {/* Variants List (Each with separate Size, Color, Cost, Retail Price, Initial Stock, SKU, Barcodes) */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {t.catalog.variants} ({editingProduct.variants.length})
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {editingProduct.variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const first = editingProduct.variants[0];
                        if (!first) return;
                        setEditingProduct({
                          ...editingProduct,
                          variants: editingProduct.variants.map((v) => ({
                            ...v,
                            purchasePrice: first.purchasePrice,
                            retailPrice: first.retailPrice,
                            wholesalePrice: first.wholesalePrice,
                          })),
                        });
                        notify('1-variant narxlari barchasiga qo\'llanildi', 'info');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      1-narxni hammasiga qo'llash
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const nowIso = new Date().toISOString();
                      const v: Variant = {
                        id: uid('var'),
                        productId: editingProduct.id,
                        sku: `SBO-${Math.floor(100 + Math.random() * 899)}-${editingProduct.variants.length + 1}`,
                        size: '',
                        color: '',
                        purchasePrice: editingProduct.variants[0]?.purchasePrice ?? 100000,
                        retailPrice: editingProduct.variants[0]?.retailPrice ?? 165000,
                        wholesalePrice: editingProduct.variants[0]?.wholesalePrice ?? 140000,
                        minStock: 5,
                        barcodes: [generateEAN13()],
                        storeId: editingProduct.storeId,
                        createdAt: nowIso,
                        updatedAt: nowIso,
                        createdBy: currentUser?.id ?? 'system',
                      };
                      setEditingProduct({ ...editingProduct, variants: [...editingProduct.variants, v] });
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Variant qo'shish
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {editingProduct.variants.map((v, idx) => {
                  const curStock = getVariantStock(v.id);
                  return (
                    <div
                      key={v.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                          <span className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 font-mono">
                            #{idx + 1}
                          </span>
                          <span
                            className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600"
                            style={{ backgroundColor: getColorSwatch(v.color) }}
                          />
                          <span>{[v.size || 'Standart', v.color || 'Asosiy'].join(' · ')}</span>
                          <span className="text-slate-400 font-normal">(Ombor qoldig'i: {curStock})</span>
                        </div>
                        {editingProduct.variants.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditingProduct({
                                ...editingProduct,
                                variants: editingProduct.variants.filter((item) => item.id !== v.id),
                              })
                            }
                            className="w-7 h-7 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center justify-center"
                            title="Variantni o'chirish"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[11px] text-slate-500">O'lcham</label>
                          <input
                            value={v.size ?? ''}
                            onChange={(e) => {
                              const next = [...editingProduct.variants];
                              next[idx] = { ...v, size: e.target.value };
                              setEditingProduct({ ...editingProduct, variants: next });
                            }}
                            placeholder="Masalan: XL / 42"
                            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">Rang</label>
                          <input
                            value={v.color ?? ''}
                            onChange={(e) => {
                              const next = [...editingProduct.variants];
                              next[idx] = { ...v, color: e.target.value };
                              setEditingProduct({ ...editingProduct, variants: next });
                            }}
                            placeholder="Masalan: Qora"
                            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">SKU</label>
                          <input
                            value={v.sku}
                            onChange={(e) => {
                              const next = [...editingProduct.variants];
                              next[idx] = { ...v, sku: e.target.value };
                              setEditingProduct({ ...editingProduct, variants: next });
                            }}
                            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">{t.catalog.minStock}</label>
                          <input
                            type="number"
                            value={v.minStock}
                            onChange={(e) => {
                              const next = [...editingProduct.variants];
                              next[idx] = { ...v, minStock: Number(e.target.value) };
                              setEditingProduct({ ...editingProduct, variants: next });
                            }}
                            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {canViewCost && (
                          <div>
                            <label className="text-[11px] text-slate-500">{t.catalog.purchasePrice} (Tannarx)</label>
                            <input
                              type="number"
                              value={v.purchasePrice}
                              onChange={(e) => {
                                const next = [...editingProduct.variants];
                                next[idx] = { ...v, purchasePrice: Number(e.target.value) };
                                setEditingProduct({ ...editingProduct, variants: next });
                              }}
                              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                            />
                          </div>
                        )}
                        <div>
                          <label className="text-[11px] text-slate-500">{t.catalog.retailPrice} (Sotuv)</label>
                          <input
                            type="number"
                            value={v.retailPrice}
                            onChange={(e) => {
                              const next = [...editingProduct.variants];
                              next[idx] = { ...v, retailPrice: Number(e.target.value) };
                              setEditingProduct({ ...editingProduct, variants: next });
                            }}
                            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-semibold"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">{t.catalog.wholesalePrice}</label>
                          <input
                            type="number"
                            value={v.wholesalePrice}
                            onChange={(e) => {
                              const next = [...editingProduct.variants];
                              next[idx] = { ...v, wholesalePrice: Number(e.target.value) };
                              setEditingProduct({ ...editingProduct, variants: next });
                            }}
                            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-teal-700 dark:text-teal-400 font-medium">+ Kirim miqdori</label>
                          <input
                            type="number"
                            min={0}
                            value={variantInitialStocks[v.id] ?? 0}
                            onChange={(e) =>
                              setVariantInitialStocks((prev) => ({
                                ...prev,
                                [v.id]: Math.max(0, Number(e.target.value)),
                              }))
                            }
                            className="w-full h-9 px-2.5 rounded-lg border border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-900 text-xs font-mono"
                          />
                        </div>
                      </div>

                      {/* Multiple Barcodes */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[11px] text-slate-500">{t.catalog.barcodes}:</span>
                        {v.barcodes.map((b, bIdx) => (
                          <div
                            key={bIdx}
                            className="inline-flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-0.5 bg-white dark:bg-slate-900 text-xs font-mono"
                          >
                            <input
                              value={b}
                              onChange={(e) => {
                                const next = [...editingProduct.variants];
                                const codes = [...v.barcodes];
                                codes[bIdx] = e.target.value;
                                next[idx] = { ...v, barcodes: codes };
                                setEditingProduct({ ...editingProduct, variants: next });
                              }}
                              className="w-28 bg-transparent focus:outline-none text-xs"
                            />
                            {v.barcodes.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...editingProduct.variants];
                                  next[idx] = { ...v, barcodes: v.barcodes.filter((_, i) => i !== bIdx) };
                                  setEditingProduct({ ...editingProduct, variants: next });
                                }}
                                className="text-slate-400 hover:text-red-500"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...editingProduct.variants];
                            next[idx] = { ...v, barcodes: [...v.barcodes, generateEAN13()] };
                            setEditingProduct({ ...editingProduct, variants: next });
                          }}
                          className="text-xs text-teal-700 dark:text-teal-400 font-medium hover:underline"
                        >
                          + {t.catalog.generateBarcode}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{t.common.save}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick Add Stock Modal */}
      {quickStockTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">{t.catalog.quickAddStock}</h3>
              <button type="button" onClick={() => setQuickStockTarget(null)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-500">{quickStockTarget.product.name}</div>
            <div>
              <label className="block text-xs font-medium mb-1">Variant (O'lcham / Rang)</label>
              <select
                value={quickStockTarget.variantId}
                onChange={(e) => setQuickStockTarget({ ...quickStockTarget, variantId: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                {quickStockTarget.product.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {[v.size, v.color, v.sku].filter(Boolean).join(' · ')} (Qoldiq: {getVariantStock(v.id)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Kirim miqdori</label>
              <input
                type="number"
                min={1}
                value={quickStockTarget.qty}
                onChange={(e) => setQuickStockTarget({ ...quickStockTarget, qty: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                const whId = getWarehouseForStore();
                await quickAddStock(quickStockTarget.product.id, quickStockTarget.variantId, whId, quickStockTarget.qty);
                notify("Ombor qoldig'i yangilandi", 'success');
                setQuickStockTarget(null);
              }}
              className="w-full h-10 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      )}

      {/* Confirm Delete Product Modal */}
      {deleteConfirmProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="font-display text-base font-bold">Mahsulotni o'chirish</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{deleteConfirmProduct.name}</span> mahsulotini va barcha variantlarini o'chirmoqchimisiz?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmProduct(null)}
                className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteProduct(deleteConfirmProduct.id);
                  notify("Mahsulot o'chirildi", 'info');
                  setDeleteConfirmProduct(null);
                }}
                className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Price Change Modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">
                {t.catalog.bulkEdit} ({selectedIds.length})
              </h3>
              <button type="button" onClick={() => setBulkModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Narx turi</label>
              <select
                value={bulkField}
                onChange={(e) => setBulkField(e.target.value as typeof bulkField)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                <option value="retailPrice">{t.catalog.retailPrice}</option>
                <option value="wholesalePrice">{t.catalog.wholesalePrice}</option>
                {canViewCost && <option value="purchasePrice">{t.catalog.purchasePrice}</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Foiz o'zgarishi (+10 yoki -10)</label>
              <input
                type="number"
                value={bulkPercent}
                onChange={(e) => setBulkPercent(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                await bulkUpdatePrices(selectedIds, bulkPercent, bulkField);
                notify('Narxlar ommaviy yangilandi', 'success');
                setBulkModalOpen(false);
                setSelectedIds([]);
              }}
              className="w-full h-10 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
            >
              {t.pos.apply}
            </button>
          </div>
        </div>
      )}

      {/* Label Printing Studio Modal */}
      {labelModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-display text-base font-bold">{t.catalog.printLabels}</h3>
                <p className="text-xs text-slate-500">EAN-13 / Code128 shtrix-kod va narx yorliqlari</p>
              </div>
              <button type="button" onClick={() => setLabelModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Yorliq o'lchami:</span>
              {(['30x20', '40x30', '58x40'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setLabelSize(sz)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border ${
                    labelSize === sz
                      ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {sz} mm
                </button>
              ))}
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl max-h-80 overflow-y-auto">
              {db.products
                .filter((p) => p.variants.some((v) => v.id in labelQuantities))
                .map((p) =>
                  p.variants.map((v) => (
                    <div key={v.id} className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{p.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {[v.size, v.color, v.sku].filter(Boolean).join(' · ')} · {formatMoney(v.retailPrice, { lang: language })}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <BarcodeSvg code={v.barcodes[0] || v.sku} width={1.1} height={24} fontSize={9} />
                        <input
                          type="number"
                          min={0}
                          max={200}
                          value={labelQuantities[v.id] ?? 0}
                          onChange={(e) =>
                            setLabelQuantities((prev) => ({ ...prev, [v.id]: Number(e.target.value) }))
                          }
                          className="w-16 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-center"
                        />
                      </div>
                    </div>
                  ))
                )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLabelModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                {t.common.close}
              </button>
              <button
                type="button"
                onClick={printLabelsSheet}
                className="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>{t.common.print}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Categories Manager Modal (Create, Edit, Delete, Men's Clothing Preset) */}
      {catManagerOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-display text-base font-bold">Kategoriyalar (Kataloglar)</h3>
                <p className="text-[11px] text-slate-500">
                  Yangi kategoriya yarating, tahrirlang yoki keraksizlarini o'chiring
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCatManagerOpen(false);
                  setEditingCat(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Add New Category */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const clean = newCatName.trim();
                if (!clean) return;
                const nowIso = new Date().toISOString();
                const newId = uid('cat');
                const res = await upsertCategory({
                  id: newId,
                  nameUz: clean,
                  nameRu: clean,
                  sortOrder: db.categories.length + 1,
                  storeId: activeStoreId !== 'all' ? activeStoreId : db.stores[0]?.id ?? 'store-chilonzor',
                  createdAt: nowIso,
                  updatedAt: nowIso,
                  createdBy: currentUser?.id ?? 'system',
                });
                if (!res.ok) {
                  notify(res.error || t.inventory.categoryDuplicateError, 'error');
                  return;
                }
                if (editingProduct) {
                  setEditingProduct({ ...editingProduct, categoryId: newId });
                }
                setNewCatName('');
                notify(`"${clean}" kategoriyasi qo'shildi`, 'success');
              }}
              className="flex gap-2"
            >
              <input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Yangi kategoriya nomi (masalan: Sport kiyimlar)"
                className="flex-1 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
              <button
                type="submit"
                className="h-10 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>{t.common.save}</span>
              </button>
            </form>

            {catDeleteConfirm && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 p-3 space-y-2">
                <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <div className="font-bold">"{catDeleteConfirm.nameUz}"</div>
                    <p className="mt-0.5 leading-relaxed">
                      {isCategoryUsed(catDeleteConfirm.id)
                        ? t.inventory.categoryUsedDeleteWarning
                        : "Ushbu kategoriyani o'chirmoqchimisiz?"}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCatDeleteConfirm(null)}
                    className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await deleteCategory(catDeleteConfirm.id);
                      if (!res.ok) notify(res.error || "O'chirib bo'lmadi", 'error');
                      else {
                        if (categoryFilter === catDeleteConfirm.id) setCategoryFilter('all');
                        notify(`"${catDeleteConfirm.nameUz}" o'chirildi`, 'info');
                      }
                      setCatDeleteConfirm(null);
                    }}
                    className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
                  >
                    {t.common.delete}
                  </button>
                </div>
              </div>
            )}

            {/* Category List with Edit & Delete */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl max-h-72 overflow-y-auto">
              {db.categories.map((c) => {
                const count = db.products.filter((p) => p.categoryId === c.id).length;
                const isEditing = editingCat?.id === c.id;
                return (
                  <div key={c.id} className="p-2.5 flex items-center justify-between gap-2">
                    {isEditing ? (
                      <div className="flex-1 flex gap-1.5">
                        <input
                          value={editingCat.nameUz}
                          onChange={(e) =>
                            setEditingCat({ ...editingCat, nameUz: e.target.value, nameRu: e.target.value })
                          }
                          className="flex-1 h-8 px-2.5 rounded-lg border border-blue-400 bg-white dark:bg-slate-950"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!editingCat.nameUz.trim()) return;
                            const res = await upsertCategory({
                              ...editingCat,
                              nameUz: editingCat.nameUz.trim(),
                              nameRu: editingCat.nameUz.trim(),
                            });
                            if (!res.ok) {
                              notify(res.error || t.inventory.categoryDuplicateError, 'error');
                              return;
                            }
                            setEditingCat(null);
                            notify('Kategoriya yangilandi', 'success');
                          }}
                          className="h-8 px-2.5 rounded-lg bg-blue-600 text-white font-semibold"
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
                          <div className="text-[11px] text-slate-400">{count} ta mahsulot</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingCat(structuredClone(c))}
                            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Tahrirlash"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {db.categories.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setCatDeleteConfirm(c)}
                              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                              title="O'chirish"
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

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={async () => {
                  await resetCategoriesToMensClothing();
                  setCategoryFilter('all');
                  notify("Erkaklar kiyim do'koni kategoriyalari qo'llanildi", 'success');
                }}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Erkaklar kiyimi standarti</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCatManagerOpen(false);
                  setEditingCat(null);
                  setCatDeleteConfirm(null);
                }}
                className="h-9 px-4 rounded-lg bg-slate-900 dark:bg-slate-800 text-white font-semibold"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
