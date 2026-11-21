import { create } from 'zustand';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  Account,
  AppSettings,
  AuditLog,
  CashOperation,
  CashShift,
  Category,
  Customer,
  DatabaseSnapshot,
  Debt,
  Employee,
  Expense,
  HeldCart,
  OfflineSyncItem,
  OnlineOrder,
  Payment,
  PaymentMethod,
  Permission,
  Product,
  PromoCode,
  PurchaseOrder,
  PurchaseReceipt,
  Return,
  Role,
  RoleId,
  Sale,
  SaleItem,
  StockItem,
  StockMovement,
  StockMovementType,
  Stocktake,
  Store,
  Supplier,
  Target,
  Transfer,
  User,
  Warehouse,
  WriteOff,
} from '../types/models';
import { repository } from '../data/repository';
import { getMensClothingCategories } from '../data/seed';
import { Language } from '../i18n';
import {
  auth,
  createStaffWithEmailPassword,
  deriveFirebaseAuthPassword,
  ensureFirestoreNetwork,
  formatFirebaseError,
  normalizePhoneDigits,
  phoneToInternalEmail,
  probeFirestoreConnection,
  provisionStaffAccountOnSecondaryApp,
  signInStaffWithEmailPassword,
  signOutFirebase,
  watchAuthState,
} from '../firebase';
import {
  ADMIN_BOOTSTRAPPED_EMAILS,
  BusinessRuleError,
  isBootstrappedAdminEmail,
  bootstrapOrJoinWorkspace,
  checkWorkspaceSyncHealth,
  clearWorkspaceOperationalData,
  hasCustomLocalMigrationCandidates,
  hashStaffSecret,
  migrateLocalAdditionsToWorkspace,
  pushSyncItemToFirestore,
  savePreCloudSafetyBackup,
  stockItemDocId,
  subscribeWorkspaceRealtime,
  WorkspaceContext,
} from '../data/firebaseSync';

const SESSION_KEY = 'shu_brend_session_v1';
const THEME_KEY = 'shu_brend_theme_v1';
const LANG_KEY = 'shu_brend_lang_v1';
const HELD_CARTS_KEY = 'shu_brend_held_carts_v1';

let unsubscribeRealtime: (() => void) | null = null;
let unsubscribeAuth: (() => void) | null = null;
let activeInitPromise: Promise<void> | null = null;
let activeConnectPromise: Promise<WorkspaceContext | null> | null = null;
let activeSyncQueuePromise: Promise<number> | null = null;

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

interface AppState {
  db: DatabaseSnapshot | null;
  initialized: boolean;
  currentUserId: string | null;
  activeStoreId: string; // 'all' or specific storeId
  language: Language;
  theme: 'light' | 'dark';
  isOnline: boolean;
  heldCarts: HeldCart[];
  toasts: ToastMessage[];
  showOnboarding: boolean;

  // Cloud / Firebase Sync State
  cloudConnected: boolean;
  cloudConnecting: boolean;
  cloudError: string | null;
  firebaseUid: string | null;
  firebaseEmail: string | null;
  workspaceContext: WorkspaceContext | null;
  syncStatus: 'online' | 'offline' | 'syncing';
  lastSyncAt: string | null;
  lastSyncCheckAt: string | null;
  isSyncingQueue: boolean;
  fatalSyncError: Error | null;

  // Shared Savatcha Cart state
  cartItems: SaleItem[];
  cartCustomerId: string;
  cartDiscountPercent: number;
  cartDiscountFixed: number;
  cartPromoCode: string;
  cartLoyaltySpent: number;
  savatchaMenuOpen: boolean;

  setCartItems: (items: SaleItem[] | ((prev: SaleItem[]) => SaleItem[])) => void;
  setCartCustomerId: (id: string) => void;
  setCartDiscountPercent: (pct: number) => void;
  setCartDiscountFixed: (amt: number) => void;
  setCartPromoCode: (code: string) => void;
  setCartLoyaltySpent: (pts: number) => void;
  setSavatchaMenuOpen: (open: boolean) => void;
  clearCart: () => void;

  init: () => Promise<void>;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setActiveStoreId: (storeId: string) => void;
  setOnline: (online: boolean) => void;
  setShowOnboarding: (open: boolean) => void;
  notify: (text: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;

  // Auth & Permissions
  getCurrentUser: () => User | null;
  can: (perm: Permission) => boolean;
  canAccessStore: (storeId: string) => boolean;
  loginWithPhone: (phone: string, password: string) => Promise<boolean>;
  switchUserByPin: (pin: string) => User | null;
  verifyManagerPin: (pin: string) => User | null;
  logout: () => void;
  checkAndSyncNow: () => Promise<void>;
  clearCloudError: () => void;

  // Held Carts
  addHeldCart: (cart: HeldCart) => void;
  removeHeldCart: (id: string) => void;

  // Stock Helper
  getVariantStock: (variantId: string, warehouseId?: string) => number;
  getWarehouseForStore: (storeId?: string) => string;
  getSharedWarehouseId: () => string;

  // Mutations
  upsertProduct: (product: Product) => Promise<{ ok: boolean; error?: string }>;
  deleteProduct: (productId: string) => Promise<void>;
  bulkUpdatePrices: (
    productIds: string[],
    percentChange: number,
    field: 'retailPrice' | 'purchasePrice' | 'wholesalePrice'
  ) => Promise<void>;
  quickAddStock: (
    productId: string,
    variantId: string,
    warehouseId: string,
    qty: number,
    note?: string
  ) => Promise<void>;
  importProducts: (
    products: Product[],
    initialStocks: { productId: string; variantId: string; warehouseId: string; qty: number; unitCost: number }[]
  ) => Promise<{ added: number; skipped: number; skippedNames: string[] }>;

  // POS & Cash Shifts
  openShift: (startingCash: number, storeId: string) => Promise<CashShift>;
  recordCashOp: (shiftId: string, type: 'in' | 'out', amount: number, reason: string) => Promise<void>;
  closeShift: (shiftId: string, actualCash: number, notes?: string) => Promise<void>;
  createDeferredTransaction: (input: {
    storeId: string;
    warehouseId: string;
    items: SaleItem[];
    customerId?: string;
    checkDiscountAmount: number;
    checkDiscountPercent: number;
    loyaltyPointsSpent: number;
    promoCode?: string;
    note?: string;
  }) => Promise<Sale>;
  payDeferredTransaction: (
    saleId: string,
    input: {
      payments: { method: PaymentMethod; amount: number }[];
      cashGiven?: number;
      changeAmount?: number;
      customerId?: string;
      loyaltyPointsSpent?: number;
    }
  ) => Promise<Sale>;
  deleteDeferredTransaction: (saleId: string) => Promise<void>;
  completeSale: (input: {
    saleId?: string;
    idempotencyKey?: string;
    storeId: string;
    warehouseId: string;
    items: SaleItem[];
    customerId?: string;
    checkDiscountAmount: number;
    checkDiscountPercent: number;
    loyaltyPointsSpent: number;
    promoCode?: string;
    payments: { method: PaymentMethod; amount: number }[];
    cashGiven?: number;
    changeAmount?: number;
    note?: string;
  }) => Promise<Sale>;
  processReturn: (input: {
    saleId: string;
    items: { saleItemId: string; qty: number }[];
    refundMethod: PaymentMethod;
    reason: string;
    isExchange?: boolean;
  }) => Promise<Return>;
  syncOfflineQueue: () => Promise<number>;

  // Inventory
  createPurchaseReceipt: (receipt: Omit<PurchaseReceipt, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  createPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  updatePurchaseOrderStatus: (poId: string, status: PurchaseOrder['status']) => Promise<void>;
  createTransfer: (transfer: Omit<Transfer, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'status'>) => Promise<void>;
  receiveTransfer: (transferId: string, receivedItems: { variantId: string; receivedQty: number }[]) => Promise<void>;
  createWriteOff: (wo: Omit<WriteOff, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  saveStocktake: (st: Omit<Stocktake, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: string }) => Promise<Stocktake>;
  applyStocktake: (stocktakeId: string) => Promise<void>;
  upsertSupplier: (supplier: Supplier) => Promise<void>;
  paySupplierDebt: (supplierId: string, amount: number, accountId: string) => Promise<void>;

  // CRM & Loyalty & Debts
  upsertCustomer: (customer: Customer) => Promise<Customer>;
  repayDebt: (debtId: string, amount: number, method: PaymentMethod, note?: string) => Promise<void>;
  upsertPromoCode: (promo: PromoCode) => Promise<void>;

  // Finance
  addExpense: (exp: Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  transferFunds: (fromAccountId: string, toAccountId: string, amount: number, note: string) => Promise<void>;
  upsertAccount: (acc: Account) => Promise<void>;

  // Employees & Targets
  upsertEmployee: (
    emp: Employee,
    userUpdates?: Partial<User>,
    options?: { clearCustomPermissions?: boolean }
  ) => Promise<void>;
  deleteEmployee: (empId: string) => Promise<{ ok: boolean; error?: string }>;
  updateUserCredentials: (
    userId: string,
    input: { currentPassword?: string; newPassword?: string; newPin?: string; name?: string }
  ) => Promise<{ ok: boolean; error?: string }>;
  upsertTarget: (target: Target) => Promise<void>;

  // Online Orders
  createOnlineOrder: (
    order: Omit<OnlineOrder, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'createdBy' | 'status'>
  ) => Promise<OnlineOrder>;
  updateOnlineOrderStatus: (orderId: string, status: OnlineOrder['status']) => Promise<{ ok: boolean; error?: string }>;

  // Categories CRUD
  isCategoryUsed: (catId: string) => boolean;
  upsertCategory: (cat: Category) => Promise<{ ok: boolean; error?: string }>;
  deleteCategory: (catId: string) => Promise<{ ok: boolean; error?: string }>;
  resetCategoriesToMensClothing: () => Promise<void>;

  // Settings & Stores & Roles & Backup
  upsertStore: (store: Store) => Promise<void>;
  deleteStore: (storeId: string) => Promise<{ ok: boolean; error?: string }>;
  upsertWarehouse: (wh: Warehouse) => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  updateRolePermissions: (roleId: RoleId, permissions: Permission[]) => Promise<void>;
  upsertRole: (role: Role) => Promise<{ ok: boolean; error?: string }>;
  deleteRole: (roleId: RoleId) => Promise<{ ok: boolean; error?: string }>;
  resetDemoData: () => Promise<void>;
  clearAllTestData: () => Promise<void>;
  importBackupJson: (
    json: string
  ) => Promise<{ uploadedCount: number; skippedDuplicates: number; syncedToCloud: boolean }>;
  migrateLocalDataToCloud: () => Promise<{
    ok: boolean;
    uploadedCount: number;
    skippedDuplicates: number;
    error?: string;
  }>;
}

function applyThemeToDOM(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function mutateStock(
  db: DatabaseSnapshot,
  params: {
    productId: string;
    variantId: string;
    warehouseId: string;
    storeId: string;
    qtyDelta: number;
    type: StockMovementType;
    unitCost: number;
    userId: string;
    referenceId?: string;
    referenceType?: string;
    note?: string;
  }
): StockMovement {
  const nowIso = new Date().toISOString();
  let item: StockItem | undefined = db.stockItems.find(
    (s) => s.variantId === params.variantId && s.warehouseId === params.warehouseId
  );
  if (!item) {
    item = {
      id: stockItemDocId(params.warehouseId, params.variantId),
      productId: params.productId,
      variantId: params.variantId,
      warehouseId: params.warehouseId,
      qty: 0,
      storeId: params.storeId,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: params.userId,
    };
    db.stockItems.push(item);
  }
  item.qty = Number((item.qty + params.qtyDelta).toFixed(3));
  item.updatedAt = nowIso;

  const movement: StockMovement = {
    id: uid('mov'),
    productId: params.productId,
    variantId: params.variantId,
    warehouseId: params.warehouseId,
    type: params.type,
    qtyDelta: params.qtyDelta,
    qtyAfter: item.qty,
    unitCost: params.unitCost,
    referenceId: params.referenceId,
    referenceType: params.referenceType,
    note: params.note,
    storeId: params.storeId,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: params.userId,
  };
  db.stockMovements.unshift(movement);
  return movement;
}

function appendAudit(
  db: DatabaseSnapshot,
  user: User | null,
  action: AuditLog['action'],
  entityType: string,
  entityId: string,
  summary: string,
  storeId: string
): string {
  const nowIso = new Date().toISOString();
  const auditId = uid('aud');
  db.auditLogs.unshift({
    id: auditId,
    userId: user?.id ?? 'system',
    userName: user?.name ?? 'Tizim',
    action,
    entityType,
    entityId,
    summary,
    details: summary,
    storeId,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: user?.id ?? 'system',
  });
  return auditId;
}

function resolveDefaultStoreForUser(user: User, db: DatabaseSnapshot): string {
  const isAdmin = user.roleId === 'owner' || user.roleId === 'admin';
  if (isAdmin) {
    return user.assignedStoreIds.length === 1 ? user.assignedStoreIds[0] : 'all';
  }
  const validAssigned = (user.assignedStoreIds || []).filter((id) =>
    db.stores.some((s) => s.id === id)
  );
  if (validAssigned.length === 1) return validAssigned[0];
  if (validAssigned.length > 1) return validAssigned[0];
  return db.stores[0]?.id ?? 'all';
}

function isPermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const low = msg.toLowerCase();
  return low.includes('permission') || low.includes('insufficient') || low.includes('authinfo');
}

function isNetworkFailureError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    msg.includes('unavailable') ||
    msg.includes('client is offline') ||
    msg.includes('network-request-failed') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch')
  );
}

function phoneFromInternalEmail(email?: string | null): string {
  const m = String(email || '').trim().toLowerCase().match(/^staff\.([0-9]{4,18})@shubrend\.internal$/);
  return m ? m[1] : '';
}

function phonesMatch(a: string, b: string): boolean {
  const d1 = normalizePhoneDigits(a);
  const d2 = normalizePhoneDigits(b);
  if (!d1 || !d2) return false;
  return d1 === d2;
}

function matchesSecret(plain: string | undefined, hash: string | undefined, input: string): boolean {
  const clean = input.trim();
  if (!clean) return false;
  if (plain && plain === clean) return true;
  if (hash && hash === hashStaffSecret(clean)) return true;
  return false;
}

function normalizeProductName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function nextSeqNumber(existingNumbers: string[], tailRegex: RegExp, minStart: number): number {
  let maxVal = minStart - 1;
  for (const numStr of existingNumbers) {
    const m = String(numStr || '').match(tailRegex);
    if (m && m[1]) {
      const parsed = Number.parseInt(m[1], 10);
      if (Number.isFinite(parsed) && parsed > maxVal) {
        maxVal = parsed;
      }
    }
  }
  return maxVal + 1;
}

export function findDuplicateProductReason(
  existingProducts: Product[],
  candidate: Product,
  lang: Language
): string | null {
  const cleanName = normalizeProductName(candidate.name);
  if (!cleanName) {
    return lang === 'ru' ? 'Введите название товара' : 'Mahsulot nomini kiriting';
  }

  const nameMatch = existingProducts.find(
    (p) => p.id !== candidate.id && normalizeProductName(p.name) === cleanName
  );
  if (nameMatch) {
    return lang === 'ru'
      ? `Товар с таким названием («${nameMatch.name}») уже существует`
      : `Bu nomdagi mahsulot («${nameMatch.name}») allaqachon mavjud`;
  }

  // Intra-product duplicate checks across candidate variants
  const ownSkus = new Set<string>();
  const ownBarcodes = new Set<string>();
  const ownAttrs = new Set<string>();
  for (const v of candidate.variants) {
    const sku = String(v.sku || '').trim().toLowerCase();
    if (sku) {
      if (ownSkus.has(sku)) {
        return lang === 'ru'
          ? `Дублирующийся артикул (SKU: ${v.sku}) внутри товара`
          : `Mahsulot ichida takroriy artikul (SKU: ${v.sku}) mavjud`;
      }
      ownSkus.add(sku);
    }
    for (const b of v.barcodes || []) {
      const cleanBc = String(b || '').trim();
      if (cleanBc) {
        if (ownBarcodes.has(cleanBc)) {
          return lang === 'ru'
            ? `Дублирующийся штрих-код (${cleanBc}) внутри товара`
            : `Mahsulot ichida takroriy shtrix-kod (${cleanBc}) mavjud`;
        }
        ownBarcodes.add(cleanBc);
      }
    }
    if (candidate.variants.length > 1) {
      const sizeKey = String(v.size || '').trim().toLowerCase();
      const colorKey = String(v.color || '').trim().toLowerCase();
      const attrKey = `${sizeKey}|${colorKey}`;
      if ((sizeKey || colorKey) && ownAttrs.has(attrKey)) {
        return lang === 'ru'
          ? `Дублирующийся вариант (${[v.size, v.color].filter(Boolean).join(' / ')}) внутри товара`
          : `Mahsulot ichida takroriy variant (${[v.size, v.color].filter(Boolean).join(' / ')}) mavjud`;
      }
      ownAttrs.add(attrKey);
    }
  }

  const candidateSkus = ownSkus;
  const candidateBarcodes = ownBarcodes;

  for (const existing of existingProducts) {
    if (existing.id === candidate.id) continue;
    for (const v of existing.variants) {
      const sku = String(v.sku || '').trim().toLowerCase();
      if (sku && candidateSkus.has(sku)) {
        return lang === 'ru'
          ? `Артикул (SKU: ${v.sku}) уже используется в товаре «${existing.name}»`
          : `Bu artikul (SKU: ${v.sku}) «${existing.name}» mahsulotida band`;
      }
      for (const b of v.barcodes || []) {
        const cleanBc = String(b || '').trim();
        if (cleanBc && candidateBarcodes.has(cleanBc)) {
          return lang === 'ru'
            ? `Штрих-код (${cleanBc}) уже используется в товаре «${existing.name}»`
            : `Bu shtrix-kod (${cleanBc}) «${existing.name}» mahsulotida allaqachon mavjud`;
        }
      }
    }
  }

  return null;
}

let migratedOwnerCloudOnce = false;
let migratedNamesCloudOnce = false;

export const useAppStore = create<AppState>((set, get) => {
  const syncOrEnqueue = async (
    nextDb: DatabaseSnapshot,
    opInput: Omit<OfflineSyncItem, 'idempotencyKey'>,
    options?: { strict?: boolean }
  ) => {
    const op: OfflineSyncItem = {
      ...opInput,
      idempotencyKey: opInput.id,
    };
    const { cloudConnected, workspaceContext, isOnline } = get();

    // Strict financial/stock operations (sales, returns, deferred payments):
    // When online & connected, commit atomically to Firestore BEFORE mutating local stock/sales state!
    if (options?.strict && isOnline && cloudConnected && workspaceContext) {
      set({ syncStatus: 'syncing' });
      try {
        await pushSyncItemToFirestore(workspaceContext, op, nextDb);
        await repository.save(nextDb);
        const syncedAt = new Date().toISOString();
        set({
          db: nextDb,
          syncStatus: get().isOnline ? 'online' : 'offline',
          lastSyncAt: syncedAt,
          lastSyncCheckAt: syncedAt,
          cloudError: null,
        });
        return;
      } catch (err) {
        set({ syncStatus: get().isOnline ? 'online' : 'offline' });
        if (err instanceof BusinessRuleError) {
          throw err;
        }
        if (isPermissionError(err)) {
          const msg =
            get().language === 'ru'
              ? 'У вас недостаточно прав для этой операции'
              : 'Ushbu amalni bulutga yozish uchun ruxsatingiz yetarli emas';
          set({ cloudError: msg });
          throw new Error(msg);
        }
        if (!isNetworkFailureError(err)) {
          throw new Error(formatFirebaseError(err, get().language));
        }
        // Real offline/network drop -> fall through to queue locally
        nextDb.sales = nextDb.sales.map((s) =>
          s.id === (op.payload as Record<string, unknown>)?.saleId
            ? { ...s, offlineCreated: true, syncedAt: undefined }
            : s
        );
      }
    }

    // Offline or fallback queue path
    if (!isOnline || (options?.strict && cloudConnected && workspaceContext)) {
      if (!nextDb.offlineQueue.some((q) => q.id === op.id)) {
        nextDb.offlineQueue.push(op);
      }
      await repository.save(nextDb);
      set({ db: nextDb, syncStatus: 'offline' });
      return;
    }

    await repository.save(nextDb);
    set({ db: nextDb });

    if (cloudConnected && workspaceContext) {
      set({ syncStatus: 'syncing' });
      try {
        await pushSyncItemToFirestore(workspaceContext, op, nextDb);
        const syncedAt = new Date().toISOString();
        set({
          syncStatus: get().isOnline ? 'online' : 'offline',
          lastSyncAt: syncedAt,
          lastSyncCheckAt: syncedAt,
          cloudError: null,
        });
      } catch (err) {
        if (err instanceof BusinessRuleError) {
          throw err;
        }
        if (isPermissionError(err)) {
          const msg =
            get().language === 'ru'
              ? 'У вас недостаточно прав для этой операции'
              : "Ushbu amalni bulutga yozish uchun ruxsatingiz yetarli emas";
          get().notify(msg, 'error');
          set({ syncStatus: get().isOnline ? 'online' : 'offline', cloudError: msg });
        } else {
          // Transient / network issue -> queue for auto-sync when connection stabilizes
          const latestDb = structuredClone(get().db ?? nextDb);
          if (!latestDb.offlineQueue.some((q) => q.id === op.id)) {
            latestDb.offlineQueue.push({ ...op, attempts: (op.attempts || 0) + 1 });
          }
          await repository.save(latestDb);
          set({
            db: latestDb,
            syncStatus: get().isOnline ? 'online' : 'offline',
            cloudError: formatFirebaseError(err, get().language),
          });
        }
      }
    }
  };

  const matchOrBindUserFromFirebase = (
    snapshot: DatabaseSnapshot,
    fbUser: FirebaseUser,
    ctx: WorkspaceContext
  ): { user: User | null; mutatedSnapshot: boolean } => {
    const email = (fbUser.email || '').trim().toLowerCase();
    const internalPhoneDigits = phoneFromInternalEmail(email);
    let mutated = false;
    let matched =
      (internalPhoneDigits
        ? snapshot.users.find((u) => u.isActive && phonesMatch(u.phone, internalPhoneDigits))
        : undefined) ??
      snapshot.users.find((u) => u.isActive && u.googleEmail?.trim().toLowerCase() === email) ??
      (ctx.staffId
        ? snapshot.users.find(
            (u) =>
              u.id === ctx.staffId ||
              snapshot.employees.some((e) => e.id === ctx.staffId && e.userId === u.id)
          )
        : undefined);

    if (!matched && isBootstrappedAdminEmail(email)) {
      matched = snapshot.users.find((u) => u.isActive && u.roleId === 'owner') ?? snapshot.users[0];
    }

    if (!matched && ctx.uid) {
      const nowIso = new Date().toISOString();
      const newUserId = ctx.staffId || `usr-${ctx.uid.slice(0, 10)}`;
      const fallbackStoreId = ctx.assignedStoreIds[0] || snapshot.stores[0]?.id || 'store-chilonzor';
      const generatedPin = String(Math.floor(1000 + Math.random() * 8999));
      matched = {
        id: newUserId,
        name: fbUser.displayName || (internalPhoneDigits ? `+${internalPhoneDigits}` : email.split('@')[0]) || 'Xodim',
        phone: internalPhoneDigits ? `+${internalPhoneDigits}` : '',
        password: '',
        pin: generatedPin,
        pinHash: hashStaffSecret(generatedPin),
        hashAlgo: 'sha256',
        authMigrated: true,
        roleId: ctx.roleId,
        assignedStoreIds: ctx.assignedStoreIds.length ? ctx.assignedStoreIds : [fallbackStoreId],
        isActive: true,
        storeId: fallbackStoreId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: ctx.ownerUid,
      };
      snapshot.users.push(matched);
      mutated = true;
    }

    return { user: matched ?? null, mutatedSnapshot: mutated };
  };

  const connectFirebaseUser = async (
    fbUser: FirebaseUser,
    options?: { setSessionIfMissing?: boolean; forceInteractiveLogin?: boolean }
  ): Promise<WorkspaceContext | null> => {
    if (
      !options?.forceInteractiveLogin &&
      get().cloudConnected &&
      get().firebaseUid === fbUser.uid &&
      unsubscribeRealtime &&
      get().workspaceContext
    ) {
      return get().workspaceContext;
    }
    if (activeConnectPromise) return activeConnectPromise;

    const run = async (): Promise<WorkspaceContext | null> => {
      set({ cloudConnecting: true, cloudError: null });
      let currentDb = get().db;
      if (!currentDb) {
        currentDb = await repository.load();
        set({ db: currentDb });
      }

      try {
        await ensureFirestoreNetwork();
        const ctx = await bootstrapOrJoinWorkspace(fbUser, currentDb);
        if (unsubscribeRealtime) {
          unsubscribeRealtime();
          unsubscribeRealtime = null;
        }

        const localCopy = structuredClone(get().db ?? currentDb);
        const { user: matchedUser, mutatedSnapshot } = matchOrBindUserFromFirebase(localCopy, fbUser, ctx);
        if (mutatedSnapshot) {
          await repository.save(localCopy);
          set({ db: localCopy });
        }

        const currentSession = get().currentUserId;
        const hasValidSession = Boolean(
          currentSession && localCopy.users.some((u) => u.id === currentSession && u.isActive)
        );
        const nextSessionId =
          options?.forceInteractiveLogin && matchedUser
            ? matchedUser.id
            : (!hasValidSession || options?.setSessionIfMissing) && matchedUser
            ? matchedUser.id
            : currentSession;

        if (nextSessionId) {
          localStorage.setItem(SESSION_KEY, nextSessionId);
        }

        const effectiveUser =
          (nextSessionId ? localCopy.users.find((u) => u.id === nextSessionId) : null) ?? matchedUser;

        const nowIso = new Date().toISOString();
        set({
          cloudConnected: true,
          cloudConnecting: false,
          cloudError: null,
          firebaseUid: fbUser.uid,
          firebaseEmail: ctx.email,
          workspaceContext: ctx,
          syncStatus: get().isOnline ? 'online' : 'offline',
          lastSyncAt: nowIso,
          lastSyncCheckAt: nowIso,
          ...(nextSessionId ? { currentUserId: nextSessionId } : {}),
          ...(effectiveUser && (options?.forceInteractiveLogin || options?.setSessionIfMissing)
            ? { activeStoreId: resolveDefaultStoreForUser(effectiveUser, localCopy) }
            : {}),
        });

        // Safe incremental migration of user-created/modified local records BEFORE realtime listener hydrates cloud state
        savePreCloudSafetyBackup(localCopy);
        if (ctx.isWsAdmin && hasCustomLocalMigrationCandidates(localCopy)) {
          try {
            const migRes = await migrateLocalAdditionsToWorkspace(ctx, localCopy, {
              includeSeedLike: false,
            });
            if (migRes.uploadedCount > 0) {
              get().notify(
                get().language === 'ru'
                  ? `${migRes.uploadedCount} локальных записей синхронизированы в облако`
                  : `${migRes.uploadedCount} ta lokal yozuv bulutga ko'chirildi`,
                'success'
              );
            }
          } catch {
            // Non-blocking: local pre-cloud safety backup remains preserved in localStorage
          }
        }

        unsubscribeRealtime = subscribeWorkspaceRealtime(
          ctx,
          () => get().db,
          (hydratedDb, metaUpdate) => {
            const prevCtx = get().workspaceContext;
            const nextCtx = prevCtx && metaUpdate ? { ...prevCtx, ...metaUpdate } : prevCtx;

            const activeUserId = get().currentUserId;
            let resolvedUser = activeUserId
              ? hydratedDb.users.find((u) => u.id === activeUserId && u.isActive) ?? null
              : null;

            if (!resolvedUser && fbUser.email) {
              const email = fbUser.email.trim().toLowerCase();
              const internalDigits = phoneFromInternalEmail(email);
              resolvedUser =
                (internalDigits
                  ? hydratedDb.users.find((u) => u.isActive && phonesMatch(u.phone, internalDigits))
                  : undefined) ??
                hydratedDb.users.find((u) => u.isActive && u.googleEmail?.trim().toLowerCase() === email) ??
                (isBootstrappedAdminEmail(email)
                  ? hydratedDb.users.find((u) => u.isActive && u.roleId === 'owner') ?? null
                  : null);
              if (resolvedUser) {
                localStorage.setItem(SESSION_KEY, resolvedUser.id);
              }
            }

            let nextStoreId = get().activeStoreId;
            if (resolvedUser && resolvedUser.roleId !== 'owner' && resolvedUser.roleId !== 'admin') {
              const allowed = resolvedUser.assignedStoreIds || [];
              if (allowed.length > 0 && (nextStoreId === 'all' || !allowed.includes(nextStoreId))) {
                nextStoreId = allowed[0];
              }
            }

            if (!migratedOwnerCloudOnce && ctx.isWsAdmin) {
              const ownerUser = hydratedDb.users.find((u) => u.id === 'usr-owner' || u.roleId === 'owner');
              if (ownerUser && ownerUser.phone === '+998901112233' && ownerUser.pin === '1111') {
                migratedOwnerCloudOnce = true;
                ownerUser.phone = '+998889260404';
                ownerUser.password = '51111';
                ownerUser.pin = '51111';
                ownerUser.passwordHash = hashStaffSecret('51111');
                ownerUser.pinHash = hashStaffSecret('51111');
                ownerUser.hashAlgo = 'sha256';
                ownerUser.authMigrated = true;
                if (!ownerUser.googleEmail) ownerUser.googleEmail = ADMIN_BOOTSTRAPPED_EMAILS[0];
                ownerUser.updatedAt = new Date().toISOString();
                const ownerEmp = hydratedDb.employees.find((e) => e.userId === ownerUser.id);
                if (ownerEmp) {
                  ownerEmp.phone = '+998889260404';
                  if (!ownerEmp.googleEmail) ownerEmp.googleEmail = ownerUser.googleEmail;
                  ownerEmp.updatedAt = ownerUser.updatedAt;
                }
                void pushSyncItemToFirestore(
                  ctx,
                  {
                    id: uid('sync'),
                    idempotencyKey: `migrate-owner-${ownerUser.id}`,
                    type: 'employee',
                    payload: { empId: ownerEmp?.id ?? ownerUser.id, userId: ownerUser.id, storeId: ownerUser.storeId },
                    createdAt: ownerUser.updatedAt,
                    attempts: 0,
                  },
                  hydratedDb
                ).catch(() => {
                  // ignore transient error
                });
              }
            }

            if (!migratedNamesCloudOnce && ctx.isWsAdmin) {
              migratedNamesCloudOnce = true;
              const nowIso = new Date().toISOString();
              const ownerUser = hydratedDb.users.find((u) => u.id === 'usr-owner' || u.roleId === 'owner');
              if (ownerUser && ownerUser.name === 'Sardorbek Karimov') {
                ownerUser.name = 'ISLOMBEK';
                ownerUser.updatedAt = nowIso;
                const ownerEmp = hydratedDb.employees.find((e) => e.userId === ownerUser.id);
                if (ownerEmp) {
                  ownerEmp.name = 'ISLOMBEK';
                  ownerEmp.updatedAt = nowIso;
                }
                void pushSyncItemToFirestore(
                  ctx,
                  {
                    id: uid('sync'),
                    idempotencyKey: `migrate-owner-name-v5-${ownerUser.id}`,
                    type: 'employee',
                    payload: { empId: ownerEmp?.id ?? ownerUser.id, userId: ownerUser.id, storeId: ownerUser.storeId },
                    createdAt: nowIso,
                    attempts: 0,
                  },
                  hydratedDb
                ).catch(() => {});
              }

              const st1 = hydratedDb.stores.find((s) => s.id === 'store-chilonzor');
              if (st1 && st1.name === 'Chilonzor Flagman') {
                st1.name = 'SHU BREND TORAQORGON';
                st1.address = "To'raqo'rg'on";
                st1.updatedAt = nowIso;
                void pushSyncItemToFirestore(
                  ctx,
                  {
                    id: uid('sync'),
                    idempotencyKey: 'migrate-store-v5-chilonzor',
                    type: 'store',
                    payload: { storeId: st1.id },
                    createdAt: nowIso,
                    attempts: 0,
                  },
                  hydratedDb
                ).catch(() => {});
              }

              const st2 = hydratedDb.stores.find((s) => s.id === 'store-samdarvoza');
              if (st2 && st2.name === 'Samarqand Darvoza') {
                st2.name = 'SHU BREND MINGBULOQ';
                st2.address = 'Mingbuloq';
                st2.updatedAt = nowIso;
                void pushSyncItemToFirestore(
                  ctx,
                  {
                    id: uid('sync'),
                    idempotencyKey: 'migrate-store-v5-samdarvoza',
                    type: 'store',
                    payload: { storeId: st2.id },
                    createdAt: nowIso,
                    attempts: 0,
                  },
                  hydratedDb
                ).catch(() => {});
              }

              const wh1 = hydratedDb.warehouses.find((w) => w.id === 'wh-chilonzor');
              if (wh1 && wh1.name.includes('Chilonzor')) {
                wh1.name = 'Ombor — SHU BREND TORAQORGON';
                wh1.address = "To'raqo'rg'on";
                wh1.updatedAt = nowIso;
                void pushSyncItemToFirestore(
                  ctx,
                  {
                    id: uid('sync'),
                    idempotencyKey: 'migrate-wh-v5-chilonzor',
                    type: 'warehouse',
                    payload: { warehouseId: wh1.id, storeId: wh1.storeId },
                    createdAt: nowIso,
                    attempts: 0,
                  },
                  hydratedDb
                ).catch(() => {});
              }

              const wh2 = hydratedDb.warehouses.find((w) => w.id === 'wh-samdarvoza');
              if (wh2 && wh2.name.includes('SamDarvoza')) {
                wh2.name = 'Ombor — SHU BREND MINGBULOQ';
                wh2.address = 'Mingbuloq';
                wh2.updatedAt = nowIso;
                void pushSyncItemToFirestore(
                  ctx,
                  {
                    id: uid('sync'),
                    idempotencyKey: 'migrate-wh-v5-samdarvoza',
                    type: 'warehouse',
                    payload: { warehouseId: wh2.id, storeId: wh2.storeId },
                    createdAt: nowIso,
                    attempts: 0,
                  },
                  hydratedDb
                ).catch(() => {});
              }
            }

            const hydratedIso = new Date().toISOString();
            void repository.save(hydratedDb);
            set({
              db: hydratedDb,
              workspaceContext: nextCtx,
              ...(resolvedUser ? { currentUserId: resolvedUser.id } : {}),
              activeStoreId: nextStoreId,
              lastSyncAt: hydratedIso,
              lastSyncCheckAt: hydratedIso,
              cloudError: null,
            });
          },
          (fatalErr) => {
            set({
              fatalSyncError: fatalErr,
              cloudError: formatFirebaseError(fatalErr, get().language),
              syncStatus: 'offline',
            });
          },
          (warnErr) => {
            set({
              cloudError: formatFirebaseError(warnErr, get().language),
            });
          }
        );

        // Flush any queued offline operations now that we are connected
        if (get().isOnline && (get().db?.offlineQueue.length ?? 0) > 0) {
          void get().syncOfflineQueue();
        }

        return ctx;
      } catch (err) {
        const msg = formatFirebaseError(err, get().language);
        set({
          cloudConnected: false,
          cloudConnecting: false,
          cloudError: msg,
          syncStatus: get().isOnline ? 'online' : 'offline',
        });
        if (options?.forceInteractiveLogin) {
          throw new Error(msg);
        }
        return null;
      } finally {
        activeConnectPromise = null;
      }
    };

    activeConnectPromise = run();
    return activeConnectPromise;
  };

  return {
    db: null,
    initialized: false,
    currentUserId: typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null,
    activeStoreId: 'all',
    language: (typeof localStorage !== 'undefined' && (localStorage.getItem(LANG_KEY) as Language)) || 'uz',
    theme: (typeof localStorage !== 'undefined' && (localStorage.getItem(THEME_KEY) as 'light' | 'dark')) || 'light',
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    heldCarts: (() => {
      try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(HELD_CARTS_KEY) : null;
        return raw ? (JSON.parse(raw) as HeldCart[]) : [];
      } catch {
        return [];
      }
    })(),
    toasts: [],
    showOnboarding: false,

    cloudConnected: false,
    cloudConnecting: false,
    cloudError: null,
    firebaseUid: null,
    firebaseEmail: null,
    workspaceContext: null,
    syncStatus: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online',
    lastSyncAt: null,
    lastSyncCheckAt: null,
    isSyncingQueue: false,
    fatalSyncError: null,

    cartItems: [],
    cartCustomerId: '',
    cartDiscountPercent: 0,
    cartDiscountFixed: 0,
    cartPromoCode: '',
    cartLoyaltySpent: 0,
    savatchaMenuOpen: false,

    setCartItems: (itemsOrUpdater) =>
      set((s) => ({
        cartItems: typeof itemsOrUpdater === 'function' ? itemsOrUpdater(s.cartItems) : itemsOrUpdater,
      })),
    setCartCustomerId: (cartCustomerId) => set({ cartCustomerId }),
    setCartDiscountPercent: (cartDiscountPercent) => set({ cartDiscountPercent }),
    setCartDiscountFixed: (cartDiscountFixed) => set({ cartDiscountFixed }),
    setCartPromoCode: (cartPromoCode) => set({ cartPromoCode }),
    setCartLoyaltySpent: (cartLoyaltySpent) => set({ cartLoyaltySpent }),
    setSavatchaMenuOpen: (savatchaMenuOpen) => set({ savatchaMenuOpen }),
    clearCart: () =>
      set({
        cartItems: [],
        cartCustomerId: '',
        cartDiscountPercent: 0,
        cartDiscountFixed: 0,
        cartPromoCode: '',
        cartLoyaltySpent: 0,
      }),

    init: async () => {
      if (get().initialized) return;
      if (activeInitPromise) return activeInitPromise;

      activeInitPromise = (async () => {
      const theme = get().theme;
      applyThemeToDOM(theme);
      void probeFirestoreConnection(get().language).then((probe) => {
        set({
          lastSyncCheckAt: new Date().toISOString(),
          ...(!probe.ok && probe.error ? { cloudError: probe.error } : {}),
        });
      });

      const db = await repository.load();
      let changed = false;
      const storeColors = ['#2563EB', '#16A34A', '#9333EA', '#EA580C'];
      db.stores.forEach((st, idx) => {
        if (!st.storeCode) {
          st.storeCode = String(idx + 1).padStart(2, '0');
          changed = true;
        }
        if (!st.color) {
          st.color = storeColors[idx % storeColors.length];
          changed = true;
        }
      });
      if ((db.version ?? 1) < 2) {
        const m = db.settings.enabledPaymentMethods;
        if (!m.includes('card')) m.splice(1, 0, 'card');
        if (!m.includes('unionpay')) {
          const mcIdx = m.indexOf('mastercard');
          if (mcIdx >= 0) m.splice(mcIdx + 1, 0, 'unionpay');
          else m.push('unionpay');
        }
        db.version = 2;
        changed = true;
      }
      if ((db.version ?? 1) < 3) {
        const removedIds = new Set(['cat-clothing', 'cat-cosmetics', 'cat-electronics', 'cat-home', 'cat-stationery', 'cat-grocery']);
        const customCats = db.categories.filter(
          (c) => !removedIds.has(c.id) && c.id !== 'cat-shoes' && c.id !== 'cat-accessories'
        );
        const mensCats = getMensClothingCategories(db.stores[0]?.id ?? 'store-chilonzor');
        const seen = new Set(mensCats.map((c) => c.id));
        const merged = [...mensCats, ...customCats.filter((c) => !seen.has(c.id))];
        db.categories = merged;
        const validIds = new Set(merged.map((c) => c.id));
        db.products.forEach((p) => {
          if (!validIds.has(p.categoryId)) {
            p.categoryId = p.categoryId === 'cat-clothing' ? 'cat-shirts' : merged[0]?.id ?? 'cat-shirts';
          }
        });
        db.version = 3;
        changed = true;
      }
      if ((db.version ?? 1) < 4) {
        const ownerUser = db.users.find((u) => u.id === 'usr-owner' || u.roleId === 'owner');
        if (ownerUser) {
          if (ownerUser.phone === '+998901112233' || ownerUser.pin === '1111') {
            ownerUser.phone = '+998889260404';
            ownerUser.password = '51111';
            ownerUser.pin = '51111';
          }
          if (!ownerUser.googleEmail) {
            ownerUser.googleEmail = ADMIN_BOOTSTRAPPED_EMAILS[0];
          }
          const ownerEmp = db.employees.find((e) => e.userId === ownerUser.id);
          if (ownerEmp && ownerEmp.phone === '+998901112233') {
            ownerEmp.phone = '+998889260404';
            if (!ownerEmp.googleEmail) ownerEmp.googleEmail = ownerUser.googleEmail;
          }
        }
        db.version = 4;
        changed = true;
      }
      if ((db.version ?? 1) < 5) {
        const nowIso = new Date().toISOString();
        const ownerUser = db.users.find((u) => u.id === 'usr-owner' || u.roleId === 'owner');
        if (ownerUser) {
          if (ownerUser.name === 'Sardorbek Karimov') {
            ownerUser.name = 'ISLOMBEK';
            ownerUser.updatedAt = nowIso;
          }
          const ownerEmp = db.employees.find((e) => e.userId === ownerUser.id);
          if (ownerEmp && ownerEmp.name === 'Sardorbek Karimov') {
            ownerEmp.name = 'ISLOMBEK';
            ownerEmp.updatedAt = nowIso;
          }
        }
        db.auditLogs.forEach((a) => {
          if (a.userId === 'usr-owner' && a.userName === 'Sardorbek Karimov') {
            a.userName = 'ISLOMBEK';
          }
        });
        const st1 = db.stores.find((s) => s.id === 'store-chilonzor');
        if (st1 && st1.name === 'Chilonzor Flagman') {
          st1.name = 'SHU BREND TORAQORGON';
          st1.address = "To'raqo'rg'on";
          st1.updatedAt = nowIso;
        }
        const st2 = db.stores.find((s) => s.id === 'store-samdarvoza');
        if (st2 && st2.name === 'Samarqand Darvoza') {
          st2.name = 'SHU BREND MINGBULOQ';
          st2.address = 'Mingbuloq';
          st2.updatedAt = nowIso;
        }
        const wh1 = db.warehouses.find((w) => w.id === 'wh-chilonzor');
        if (wh1 && wh1.name.includes('Chilonzor')) {
          wh1.name = 'Ombor — SHU BREND TORAQORGON';
          wh1.address = "To'raqo'rg'on";
          wh1.updatedAt = nowIso;
        }
        const wh2 = db.warehouses.find((w) => w.id === 'wh-samdarvoza');
        if (wh2 && wh2.name.includes('SamDarvoza')) {
          wh2.name = 'Ombor — SHU BREND MINGBULOQ';
          wh2.address = 'Mingbuloq';
          wh2.updatedAt = nowIso;
        }
        if (db.settings.receiptHeader.includes('Chilonzor Flagman')) {
          db.settings.receiptHeader = db.settings.receiptHeader.replace(
            /Chilonzor Flagman( do'koni)?/g,
            'SHU BREND TORAQORGON'
          );
        }
        db.version = 5;
        changed = true;
      }
      db.roles.forEach((role) => {
        if (!role.permissions.includes('use_pos')) {
          role.permissions = [...role.permissions, 'use_pos'];
          changed = true;
        }
      });
      db.users.forEach((u) => {
        if (Array.isArray(u.customPermissions) && !u.customPermissions.includes('use_pos')) {
          u.customPermissions = [...u.customPermissions, 'use_pos'];
          changed = true;
        }
      });
      if (changed) {
        await repository.save(db);
      }

      const initialUserId = get().currentUserId;
      const initialUser = initialUserId ? db.users.find((u) => u.id === initialUserId && u.isActive) : null;
      set({
        db,
        initialized: true,
        ...(initialUser ? { activeStoreId: resolveDefaultStoreForUser(initialUser, db) } : {}),
      });

      if (!unsubscribeAuth) {
        unsubscribeAuth = watchAuthState((fbUser) => {
          if (fbUser) {
            void connectFirebaseUser(fbUser, { setSessionIfMissing: true });
          } else {
            if (unsubscribeRealtime) {
              unsubscribeRealtime();
              unsubscribeRealtime = null;
            }
            set({
              cloudConnected: false,
              cloudConnecting: false,
              firebaseUid: null,
              firebaseEmail: null,
              workspaceContext: null,
            });
          }
        });
      }
      })().finally(() => {
        activeInitPromise = null;
      });
      return activeInitPromise;
    },

    setLanguage: (language) => {
      localStorage.setItem(LANG_KEY, language);
      set({ language });
    },

    setTheme: (theme) => {
      localStorage.setItem(THEME_KEY, theme);
      applyThemeToDOM(theme);
      set({ theme });
    },

    setActiveStoreId: (storeId) => {
      const user = get().getCurrentUser();
      const db = get().db;
      if (user && user.roleId !== 'owner' && user.roleId !== 'admin' && user.assignedStoreIds.length > 0) {
        if (storeId === 'all' || !user.assignedStoreIds.includes(storeId)) {
          set({ activeStoreId: user.assignedStoreIds[0] });
          return;
        }
      }
      if (storeId !== 'all' && db && !db.stores.some((s) => s.id === storeId)) {
        return;
      }
      set({ activeStoreId: storeId });
    },

    setOnline: (isOnline) => {
      set({
        isOnline,
        syncStatus: isOnline ? 'online' : 'offline',
      });
      if (isOnline) {
        void ensureFirestoreNetwork()
          .then(() => probeFirestoreConnection(get().language))
          .then((probe) => {
            set({
              lastSyncCheckAt: new Date().toISOString(),
              cloudError: probe.ok ? null : probe.error ?? null,
            });
            if (probe.ok) {
              if (!get().cloudConnected && !get().cloudConnecting && auth.currentUser) {
                void connectFirebaseUser(auth.currentUser, { setSessionIfMissing: true });
              } else if (get().cloudConnected && (get().db?.offlineQueue.length ?? 0) > 0) {
                void get().syncOfflineQueue();
              }
            }
          });
      }
    },

    setShowOnboarding: (showOnboarding) => set({ showOnboarding }),

    notify: (text, type = 'info') => {
      const id = uid('toast');
      set((s) => ({ toasts: [...s.toasts, { id, text, type }] }));
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, 3500);
    },

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    getCurrentUser: () => {
      const { db, currentUserId } = get();
      if (!db || !currentUserId) return null;
      return db.users.find((u) => u.id === currentUserId && u.isActive) ?? null;
    },

    can: (perm) => {
      const { db } = get();
      const user = get().getCurrentUser();
      if (!db || !user) return false;
      // Every active logged-in employee (owner, admin, manager, cashier, warehouse, guard, custom roles) can sell
      if (perm === 'use_pos') return true;
      if (user.roleId === 'owner') return true;
      if (Array.isArray(user.customPermissions)) {
        return user.customPermissions.includes(perm);
      }
      const role = db.roles.find((r) => r.id === user.roleId);
      return role ? role.permissions.includes(perm) : false;
    },

    canAccessStore: (storeId) => {
      const user = get().getCurrentUser();
      if (!user) return false;
      if (user.roleId === 'owner' || user.roleId === 'admin') return true;
      if (!user.assignedStoreIds || user.assignedStoreIds.length === 0) return true;
      return user.assignedStoreIds.includes(storeId);
    },

    loginWithPhone: async (phone, password) => {
      const { db, isOnline } = get();
      if (!db) return false;
      const secret = password.trim();
      const digits = normalizePhoneDigits(phone);
      if (!secret || !digits) return false;

      const localMatch = db.users.find(
        (u) =>
          u.isActive &&
          phonesMatch(u.phone, phone) &&
          (matchesSecret(u.password, u.passwordHash, secret) ||
            matchesSecret(u.pin, u.pinHash, secret))
      );

      // Offline fallback when local credentials exist on device
      if (!isOnline) {
        if (!localMatch) return false;
        localStorage.setItem(SESSION_KEY, localMatch.id);
        set({
          currentUserId: localMatch.id,
          activeStoreId: resolveDefaultStoreForUser(localMatch, db),
        });
        return true;
      }

      const internalEmail = phoneToInternalEmail(phone);
      const authPass = deriveFirebaseAuthPassword(phone, secret);
      let fbUser: FirebaseUser | null = null;

      try {
        fbUser = await signInStaffWithEmailPassword(internalEmail, authPass);
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';

        if (localMatch) {
          // Try alternate secret if account was registered with password while PIN was typed (or vice versa)
          const altSecrets = [localMatch.password, localMatch.pin]
            .map((s) => (s || '').trim())
            .filter((s) => s && s !== secret);
          for (const alt of altSecrets) {
            try {
              fbUser = await signInStaffWithEmailPassword(
                internalEmail,
                deriveFirebaseAuthPassword(phone, alt)
              );
              break;
            } catch {
              // continue trying
            }
          }
          // First-time staff provisioning into Firebase Auth when local record matches
          if (!fbUser && (code === 'auth/user-not-found' || code === 'auth/invalid-credential')) {
            try {
              fbUser = await createStaffWithEmailPassword(internalEmail, authPass);
            } catch {
              // Ignore if password on Auth differs or creation blocked; localMatch fallback handles below
            }
          }
        }
      }

      if (fbUser) {
        if (localMatch) {
          localStorage.setItem(SESSION_KEY, localMatch.id);
          set({
            currentUserId: localMatch.id,
            activeStoreId: resolveDefaultStoreForUser(localMatch, db),
          });
        }
        try {
          await connectFirebaseUser(fbUser, {
            forceInteractiveLogin: !localMatch,
            setSessionIfMissing: true,
          });
          return true;
        } catch (err) {
          if (!localMatch) {
            set({ cloudError: formatFirebaseError(err, get().language) });
            return false;
          }
        }
      }

      if (!localMatch) return false;

      localStorage.setItem(SESSION_KEY, localMatch.id);
      const currentFb = auth.currentUser;
      const currentFbEmail = currentFb?.email?.trim().toLowerCase() || '';
      if (currentFb && currentFbEmail !== internalEmail) {
        await signOutFirebase();
      }
      set({
        currentUserId: localMatch.id,
        activeStoreId: resolveDefaultStoreForUser(localMatch, db),
      });
      if (currentFb && currentFbEmail === internalEmail && !get().cloudConnected && !get().cloudConnecting) {
        void connectFirebaseUser(currentFb, { setSessionIfMissing: false });
      }
      return true;
    },

    clearCloudError: () => set({ cloudError: null }),

    checkAndSyncNow: async () => {
      const online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
      if (!online) {
        set({ isOnline: false, syncStatus: 'offline' });
        return;
      }
      if (!get().isOnline) {
        set({ isOnline: true });
      }
      const { cloudConnected, cloudConnecting, workspaceContext, db } = get();
      if (cloudConnected && workspaceContext) {
        const health = await checkWorkspaceSyncHealth(workspaceContext);
        set({ lastSyncCheckAt: new Date().toISOString() });
        if (!health.ok) {
          set({ cloudError: health.error ?? null });
          return;
        }
        if (db && db.offlineQueue.length > 0) {
          await get().syncOfflineQueue();
        }
        const syncedAt = new Date().toISOString();
        set({
          cloudError: null,
          lastSyncAt: syncedAt,
          lastSyncCheckAt: syncedAt,
          syncStatus: get().isOnline ? 'online' : 'offline',
        });
      } else if (auth.currentUser && !cloudConnecting) {
        await connectFirebaseUser(auth.currentUser, { setSessionIfMissing: false });
      } else if (!auth.currentUser) {
        set({
          cloudConnected: false,
          firebaseUid: null,
          firebaseEmail: null,
          workspaceContext: null,
          syncStatus: 'online',
        });
      }
    },

    switchUserByPin: (pin) => {
      const { db } = get();
      if (!db) return null;
      const user = db.users.find((u) => u.isActive && matchesSecret(u.pin, u.pinHash, pin));
      if (!user) return null;
      localStorage.setItem(SESSION_KEY, user.id);
      const fbUser = auth.currentUser;
      set({
        currentUserId: user.id,
        activeStoreId: resolveDefaultStoreForUser(user, db),
        ...(!fbUser
          ? {
              cloudConnected: false,
              firebaseUid: null,
              firebaseEmail: null,
              workspaceContext: null,
              lastSyncAt: null,
            }
          : {}),
      });
      if (fbUser && !get().cloudConnected && !get().cloudConnecting && get().isOnline) {
        void connectFirebaseUser(fbUser, { setSessionIfMissing: false });
      }
      return user;
    },

    verifyManagerPin: (pin) => {
      const { db } = get();
      if (!db) return null;
      return (
        db.users.find(
          (u) =>
            u.isActive &&
            matchesSecret(u.pin, u.pinHash, pin) &&
            (u.roleId === 'owner' || u.roleId === 'admin' || u.roleId === 'manager')
        ) ?? null
      );
    },

    logout: () => {
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
        unsubscribeRealtime = null;
      }
      void signOutFirebase();
      localStorage.removeItem(SESSION_KEY);
      set({
        currentUserId: null,
        cloudConnected: false,
        cloudError: null,
        lastSyncAt: null,
        fatalSyncError: null,
        firebaseUid: null,
        firebaseEmail: null,
        workspaceContext: null,
        syncStatus: get().isOnline ? 'online' : 'offline',
      });
    },

    addHeldCart: (cart) => {
      const next = [cart, ...get().heldCarts];
      localStorage.setItem(HELD_CARTS_KEY, JSON.stringify(next));
      set({ heldCarts: next });
    },

    removeHeldCart: (id) => {
      const next = get().heldCarts.filter((c) => c.id !== id);
      localStorage.setItem(HELD_CARTS_KEY, JSON.stringify(next));
      set({ heldCarts: next });
    },

    getVariantStock: (variantId, warehouseId) => {
      const { db, activeStoreId } = get();
      if (!db) return 0;
      if (warehouseId) {
        return db.stockItems.find((s) => s.variantId === variantId && s.warehouseId === warehouseId)?.qty ?? 0;
      }
      if (activeStoreId !== 'all') {
        const store = db.stores.find((st) => st.id === activeStoreId);
        if (store) {
          return db.stockItems.find((s) => s.variantId === variantId && s.warehouseId === store.defaultWarehouseId)?.qty ?? 0;
        }
      }
      return db.stockItems
        .filter((s) => s.variantId === variantId)
        .reduce((sum, s) => sum + s.qty, 0);
    },

    getWarehouseForStore: (storeId) => {
      const { db, activeStoreId } = get();
      if (!db) return 'wh-chilonzor';
      const targetStoreId = storeId && storeId !== 'all' ? storeId : activeStoreId !== 'all' ? activeStoreId : db.stores[0]?.id;
      const store = db.stores.find((s) => s.id === targetStoreId) ?? db.stores[0];
      return store?.defaultWarehouseId ?? db.warehouses[0]?.id ?? 'wh-chilonzor';
    },

    getSharedWarehouseId: () => {
      const { db } = get();
      if (!db) return 'wh-chilonzor';
      const main = db.warehouses.find((w) => w.isMain) ?? db.warehouses[0];
      return main?.id ?? 'wh-chilonzor';
    },

    upsertProduct: async (product) => {
      const { db, language } = get();
      if (!db) return { ok: false, error: 'DB not loaded' };
      if (!get().can('edit_catalog') && !get().can('manage_inventory')) {
        return { ok: false, error: language === 'ru' ? 'Недостаточно прав' : "Ruxsat yo'q" };
      }
      const cleanName = product.name.trim();
      const cleanProduct: Product = { ...product, name: cleanName };
      const dupError = findDuplicateProductReason(db.products, cleanProduct, language);
      if (dupError) {
        return { ok: false, error: dupError };
      }

      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const idx = nextDb.products.findIndex((p) => p.id === cleanProduct.id);
      let auditId: string | undefined;
      if (idx >= 0) {
        const prev = nextDb.products[idx];
        const prevPrice = prev.variants[0]?.retailPrice;
        const newPrice = cleanProduct.variants[0]?.retailPrice;
        if (prevPrice !== undefined && newPrice !== undefined && prevPrice !== newPrice) {
          auditId = appendAudit(
            nextDb,
            user,
            'price_change',
            'Product',
            cleanProduct.id,
            `${cleanProduct.name} narxi o'zgartirildi: ${prevPrice} -> ${newPrice}`,
            cleanProduct.storeId
          );
        }
        nextDb.products[idx] = { ...cleanProduct, updatedAt: nowIso };
      } else {
        nextDb.products.unshift({ ...cleanProduct, createdAt: cleanProduct.createdAt || nowIso, updatedAt: nowIso });
      }
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'product',
        payload: { productId: cleanProduct.id, auditId, storeId: cleanProduct.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
      return { ok: true };
    },

    deleteProduct: async (productId) => {
      const { db } = get();
      if (!db || !get().can('edit_catalog')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const target = nextDb.products.find((p) => p.id === productId);
      let auditId: string | undefined;
      if (target) {
        auditId = appendAudit(
          nextDb,
          user,
          'product_delete',
          'Product',
          productId,
          `Mahsulot o'chirildi: ${target.name}`,
          target.storeId
        );
      }
      const deletedStockIds = nextDb.stockItems
        .filter((s) => s.productId === productId)
        .map((s) => stockItemDocId(s.warehouseId, s.variantId));
      nextDb.products = nextDb.products.filter((p) => p.id !== productId);
      nextDb.stockItems = nextDb.stockItems.filter((s) => s.productId !== productId);

      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'product_delete',
        payload: {
          productId,
          deletedStockIds,
          auditId,
          storeId: target?.storeId ?? nextDb.stores[0]?.id ?? 'store-chilonzor',
        },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    bulkUpdatePrices: async (productIds, percentChange, field) => {
      const { db } = get();
      if (!db || !get().can('bulk_edit_prices')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const factor = 1 + percentChange / 100;
      const step = nextDb.settings.roundingStep || 100;
      nextDb.products.forEach((p) => {
        if (productIds.includes(p.id)) {
          p.variants.forEach((v) => {
            const raw = v[field] * factor;
            v[field] = Math.max(0, Math.round(raw / step) * step);
            v.updatedAt = nowIso;
          });
          p.updatedAt = nowIso;
        }
      });
      const storeId = nextDb.stores[0]?.id ?? 'store-chilonzor';
      const auditId = appendAudit(
        nextDb,
        user,
        'price_change',
        'Product',
        productIds.join(','),
        `${productIds.length} ta mahsulot (${field}) narxi ${percentChange > 0 ? '+' : ''}${percentChange}% ga o'zgartirildi`,
        storeId
      );
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'bulk_prices',
        payload: { productIds, auditId, storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    quickAddStock: async (productId, variantId, warehouseId, qty, note) => {
      const { db } = get();
      if (!db || qty <= 0) return;
      if (!get().can('edit_catalog') && !get().can('manage_inventory')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const prod = nextDb.products.find((p) => p.id === productId);
      const variant = prod?.variants.find((v) => v.id === variantId);
      const wh = nextDb.warehouses.find((w) => w.id === warehouseId);
      const storeId = wh?.storeId ?? nextDb.stores[0]?.id ?? 'store-chilonzor';
      const mov = mutateStock(nextDb, {
        productId,
        variantId,
        warehouseId,
        storeId,
        qtyDelta: qty,
        type: 'kirim',
        unitCost: variant?.purchasePrice ?? 0,
        userId: user?.id ?? 'system',
        note: note ?? "Mahsulot kartasidan tezkor kirim",
      });
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'quick_stock',
        payload: { movementId: mov.id, storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    importProducts: async (products, initialStocks) => {
      const { db, language } = get();
      if (!db || !get().can('edit_catalog')) {
        return { added: 0, skipped: products.length, skippedNames: products.map((p) => p.name) };
      }
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();

      const addedProducts: Product[] = [];
      const skippedNames: string[] = [];
      for (const prod of products) {
        const cleanProd: Product = { ...prod, name: prod.name.trim() };
        const pool = [...nextDb.products, ...addedProducts];
        const dup = findDuplicateProductReason(pool, cleanProd, language);
        if (dup) {
          skippedNames.push(cleanProd.name || prod.id);
        } else {
          addedProducts.push(cleanProd);
        }
      }

      if (addedProducts.length === 0) {
        return { added: 0, skipped: skippedNames.length, skippedNames };
      }

      const addedIds = new Set(addedProducts.map((p) => p.id));
      nextDb.products.unshift(...addedProducts);
      const movementIds: string[] = [];
      initialStocks.forEach((st) => {
        if (st.qty > 0 && addedIds.has(st.productId)) {
          const wh = nextDb.warehouses.find((w) => w.id === st.warehouseId);
          const mov = mutateStock(nextDb, {
            productId: st.productId,
            variantId: st.variantId,
            warehouseId: st.warehouseId,
            storeId: wh?.storeId ?? nextDb.stores[0]?.id ?? 'store-chilonzor',
            qtyDelta: st.qty,
            type: 'kirim',
            unitCost: st.unitCost,
            userId: user?.id ?? 'system',
            note: "Excel/CSV import qoldig'i",
          });
          movementIds.push(mov.id);
        }
      });
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'import_products',
        payload: {
          productIds: addedProducts.map((p) => p.id),
          movementIds,
          storeId: addedProducts[0]?.storeId ?? nextDb.stores[0]?.id ?? 'store-chilonzor',
        },
        createdAt: nowIso,
        attempts: 0,
      });
      return { added: addedProducts.length, skipped: skippedNames.length, skippedNames };
    },

    openShift: async (startingCash, storeId) => {
      const { db } = get();
      if (!db) throw new Error('DB not loaded');
      if (!get().can('manage_shifts') && !get().can('use_pos')) throw new Error("Ruxsat yo'q");
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const shiftSeq = nextSeqNumber(
        nextDb.cashShifts.map((s) => s.number),
        /^SM-(\d+)$/i,
        43
      );
      const shift: CashShift = {
        id: uid('shift'),
        number: `SM-${String(shiftSeq).padStart(3, '0')}`,
        cashierId: user?.id ?? 'system',
        cashierName: user?.name ?? 'Kassir',
        openedAt: nowIso,
        startingCash,
        cashSalesTotal: 0,
        cardSalesTotal: 0,
        otherSalesTotal: 0,
        cashRefundsTotal: 0,
        cashInTotal: 0,
        cashOutTotal: 0,
        expectedCash: startingCash,
        status: 'open',
        storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      };
      nextDb.cashShifts.unshift(shift);
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'shift_open',
        payload: { shiftId: shift.id, storeId },
        createdAt: nowIso,
        attempts: 0,
      });
      return shift;
    },

    recordCashOp: async (shiftId, type, amount, reason) => {
      const { db } = get();
      if (!db || amount <= 0) return;
      if (!get().can('manage_shifts') && !get().can('use_pos')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const shift = nextDb.cashShifts.find((s) => s.id === shiftId);
      if (!shift) return;
      const nowIso = new Date().toISOString();
      const op: CashOperation = {
        id: uid('cop'),
        shiftId,
        type,
        amount,
        reason,
        storeId: shift.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      };
      nextDb.cashOperations.unshift(op);
      if (type === 'in') {
        shift.cashInTotal += amount;
        shift.expectedCash += amount;
      } else {
        shift.cashOutTotal += amount;
        shift.expectedCash -= amount;
      }
      shift.updatedAt = nowIso;
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'cash_op',
        payload: {
          opId: op.id,
          shiftId: shift.id,
          shiftCashInDelta: type === 'in' ? amount : 0,
          shiftCashOutDelta: type === 'out' ? amount : 0,
          shiftExpectedCashDelta: type === 'in' ? amount : -amount,
          storeId: shift.storeId,
        },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    closeShift: async (shiftId, actualCash, notes) => {
      const { db } = get();
      if (!db) return;
      if (!get().can('manage_shifts') && !get().can('use_pos')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const shift = nextDb.cashShifts.find((s) => s.id === shiftId);
      if (!shift) return;
      const nowIso = new Date().toISOString();
      shift.closedAt = nowIso;
      shift.actualCash = actualCash;
      shift.discrepancy = actualCash - shift.expectedCash;
      shift.status = 'closed';
      shift.notes = notes;
      shift.updatedAt = nowIso;
      const auditId = appendAudit(
        nextDb,
        user,
        'shift_close',
        'CashShift',
        shift.id,
        `Smena ${shift.number} yopildi. Kutilgan: ${shift.expectedCash}, Haqiqiy: ${actualCash}`,
        shift.storeId
      );
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'shift_close',
        payload: { shiftId: shift.id, auditId, storeId: shift.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    createDeferredTransaction: async (input) => {
      const { db, isOnline } = get();
      if (!db) throw new Error('DB not loaded');
      if (!get().can('use_pos')) throw new Error("Sotuvga ruxsat yo'q");
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const saleId = uid('sale');

      const storeIdx = Math.max(0, nextDb.stores.findIndex((s) => s.id === input.storeId));
      const store = nextDb.stores[storeIdx];
      const storeCode = store?.storeCode || String(storeIdx + 1).padStart(2, '0');
      const seqNum = nextSeqNumber(
        nextDb.sales.map((s) => s.receiptNumber),
        /010104(\d+)$/,
        286
      );
      const receiptNumber = `#${storeCode}010104${String(seqNum).padStart(4, '0')}`;

      const subtotal = input.items.reduce((s, it) => s + it.lineTotal, 0);
      const costTotal = input.items.reduce((s, it) => s + it.purchasePrice * it.qty, 0);
      const afterDiscount = Math.max(0, subtotal - input.checkDiscountAmount - input.loyaltyPointsSpent);
      const vatAmount = nextDb.settings.vatEnabled
        ? Math.round((afterDiscount * nextDb.settings.vatRate) / (100 + nextDb.settings.vatRate))
        : 0;
      const totalAmount = afterDiscount;
      const customer = input.customerId ? nextDb.customers.find((c) => c.id === input.customerId) : undefined;

      const sale: Sale = {
        id: saleId,
        receiptNumber,
        warehouseId: input.warehouseId,
        cashierId: user?.id ?? 'system',
        cashierName: user?.name ?? 'Kassir',
        customerId: customer?.id,
        customerName: customer?.name,
        items: input.items,
        subtotal,
        checkDiscountAmount: input.checkDiscountAmount,
        checkDiscountPercent: input.checkDiscountPercent,
        loyaltyPointsSpent: input.loyaltyPointsSpent,
        loyaltyPointsEarned: 0,
        promoCode: input.promoCode,
        vatAmount,
        totalAmount,
        costTotal,
        payments: [],
        paidAmount: 0,
        debtAmount: 0,
        status: 'deferred',
        offlineCreated: !isOnline,
        fiscalStatus: 'not_configured',
        note: input.note,
        storeId: input.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      };

      nextDb.sales.unshift(sale);
      await syncOrEnqueue(
        nextDb,
        {
          id: uid('sync'),
          type: 'sale_deferred',
          payload: { saleId, storeId: input.storeId },
          createdAt: nowIso,
          attempts: 0,
        },
        { strict: true }
      );
      return sale;
    },

    payDeferredTransaction: async (saleId, input) => {
      const { db, isOnline } = get();
      if (!db) throw new Error('DB not loaded');
      if (!get().can('use_pos')) throw new Error("Sotuvga ruxsat yo'q");
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const sale = nextDb.sales.find((s) => s.id === saleId);
      if (!sale) throw new Error('Transaction not found');
      if (sale.status !== 'deferred') return sale;

      const nowIso = new Date().toISOString();
      if (input.customerId !== undefined) {
        const custOverride = input.customerId
          ? nextDb.customers.find((c) => c.id === input.customerId)
          : undefined;
        sale.customerId = custOverride?.id;
        sale.customerName = custOverride?.name;
      }
      if (input.loyaltyPointsSpent !== undefined) {
        sale.loyaltyPointsSpent = input.loyaltyPointsSpent;
        sale.totalAmount = Math.max(0, sale.subtotal - sale.checkDiscountAmount - sale.loyaltyPointsSpent);
        sale.vatAmount = nextDb.settings.vatEnabled
          ? Math.round((sale.totalAmount * nextDb.settings.vatRate) / (100 + nextDb.settings.vatRate))
          : 0;
      }

      const totalAmount = sale.totalAmount;
      const payments: Payment[] = input.payments
        .filter((p) => p.amount > 0)
        .map((p) => ({
          id: uid('pay'),
          saleId: sale.id,
          method: p.method,
          amount: p.amount,
          storeId: sale.storeId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: user?.id ?? 'system',
        }));

      const debtAmount = payments
        .filter((p) => p.method === 'debt')
        .reduce((s, p) => s + p.amount, 0);
      const paidAmount = Math.max(0, totalAmount - debtAmount);

      const customer = sale.customerId ? nextDb.customers.find((c) => c.id === sale.customerId) : undefined;
      const loyaltyAcc = customer ? nextDb.loyaltyAccounts.find((l) => l.customerId === customer.id) : undefined;
      const loyaltyTxIds: string[] = [];
      let debtId: string | undefined;

      let earnedPoints = 0;
      let loyaltyPointsDelta = 0;
      if (customer && loyaltyAcc) {
        if (sale.loyaltyPointsSpent > 0) {
          const prevPts = loyaltyAcc.pointsBalance;
          loyaltyAcc.pointsBalance = Math.max(0, loyaltyAcc.pointsBalance - sale.loyaltyPointsSpent);
          loyaltyPointsDelta += loyaltyAcc.pointsBalance - prevPts;
          const ltxId = uid('ltx');
          loyaltyTxIds.push(ltxId);
          nextDb.loyaltyTransactions.unshift({
            id: ltxId,
            customerId: customer.id,
            loyaltyAccountId: loyaltyAcc.id,
            type: 'spend',
            points: -sale.loyaltyPointsSpent,
            saleId: sale.id,
            note: `Chek ${sale.receiptNumber} da ishlatildi`,
            storeId: sale.storeId,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: user?.id ?? 'system',
          });
        }

        earnedPoints = Math.round((paidAmount * loyaltyAcc.cashbackPercent) / 100);
        if (earnedPoints > 0) {
          const expDate = new Date();
          expDate.setDate(expDate.getDate() + (nextDb.settings.cashbackExpiryDays || 180));
          loyaltyAcc.pointsBalance += earnedPoints;
          loyaltyPointsDelta += earnedPoints;
          loyaltyAcc.expiresAt = expDate.toISOString();
          const ltxId = uid('ltx');
          loyaltyTxIds.push(ltxId);
          nextDb.loyaltyTransactions.unshift({
            id: ltxId,
            customerId: customer.id,
            loyaltyAccountId: loyaltyAcc.id,
            type: 'earn',
            points: earnedPoints,
            saleId: sale.id,
            expiresAt: expDate.toISOString(),
            note: `Chek ${sale.receiptNumber} keshbek`,
            storeId: sale.storeId,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: user?.id ?? 'system',
          });
        }

        customer.totalSpent += totalAmount;
        customer.ordersCount += 1;
        customer.lastPurchaseAt = nowIso;
        if (customer.totalSpent >= 3000000) customer.segment = 'vip';
        else if (customer.ordersCount >= 3) customer.segment = 'regular';

        const tiers = [...nextDb.settings.loyaltyTiers].sort((a, b) => b.minSpend - a.minSpend);
        const matched = tiers.find((t) => customer.totalSpent >= t.minSpend);
        if (matched) {
          loyaltyAcc.tier = matched.tier;
          loyaltyAcc.cashbackPercent = matched.cashbackPercent;
        }

        if (debtAmount > 0) {
          customer.debtBalance += debtAmount;
          const due = new Date();
          due.setDate(due.getDate() + 14);
          debtId = uid('debt');
          nextDb.debts.unshift({
            id: debtId,
            customerId: customer.id,
            customerName: customer.name,
            saleId: sale.id,
            originalAmount: debtAmount,
            remainingAmount: debtAmount,
            dueDate: due.toISOString(),
            status: 'open',
            payments: [],
            storeId: sale.storeId,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: user?.id ?? 'system',
          });
        }
      }

      let promoUsedDelta = 0;
      if (sale.promoCode) {
        const promo = nextDb.promoCodes.find((pr) => pr.code.toUpperCase() === sale.promoCode?.toUpperCase());
        if (promo) {
          promo.usedCount += 1;
          promoUsedDelta = 1;
        }
      }

      // Pre-validate available stock per variant before mutating stock/accounts
      if (!nextDb.settings.allowNegativeStock) {
        const neededByVariant = new Map<string, { qty: number; name: string }>();
        for (const it of sale.items) {
          const prev = neededByVariant.get(it.variantId);
          neededByVariant.set(it.variantId, {
            qty: (prev?.qty ?? 0) + it.qty,
            name: it.productName,
          });
        }
        for (const [variantId, need] of neededByVariant.entries()) {
          const available =
            nextDb.stockItems.find(
              (s) => s.variantId === variantId && s.warehouseId === sale.warehouseId
            )?.qty ?? 0;
          if (available < need.qty) {
            throw new Error(
              `"${need.name}" omborda yetarli emas (Qoldiq: ${available}, So'ralgan: ${need.qty}).`
            );
          }
        }
      }

      const movementIds: string[] = [];
      sale.items.forEach((it) => {
        const mov = mutateStock(nextDb, {
          productId: it.productId,
          variantId: it.variantId,
          warehouseId: sale.warehouseId,
          storeId: sale.storeId,
          qtyDelta: -it.qty,
          type: 'sotuv',
          unitCost: it.purchasePrice,
          userId: user?.id ?? 'system',
          referenceId: sale.id,
          referenceType: 'Sale',
          note: `Sotuv ${sale.receiptNumber}`,
        });
        movementIds.push(mov.id);
      });

      const activeShift = nextDb.cashShifts.find(
        (s) => s.status === 'open' && s.storeId === sale.storeId
      );
      const cashPaid = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
      const cardPaid = payments
        .filter((p) => ['card', 'uzcard', 'humo', 'visa', 'mastercard', 'unionpay'].includes(p.method))
        .reduce((s, p) => s + p.amount, 0);
      const otherPaid = payments
        .filter((p) => ['transfer', 'click', 'payme', 'uzum'].includes(p.method))
        .reduce((s, p) => s + p.amount, 0);

      if (activeShift) {
        activeShift.cashSalesTotal += cashPaid;
        activeShift.cardSalesTotal += cardPaid;
        activeShift.otherSalesTotal += otherPaid;
        activeShift.expectedCash += cashPaid;
        activeShift.updatedAt = nowIso;
      }

      const touchedAccountIds: string[] = [];
      const accountDeltas: Record<string, number> = {};
      const cashAcc = nextDb.accounts.find((a) => a.type === 'cash');
      const cardAcc = nextDb.accounts.find((a) => a.type === 'card_terminal');
      const bankAcc = nextDb.accounts.find((a) => a.type === 'bank');
      if (cashAcc && cashPaid > 0) {
        cashAcc.balance += cashPaid;
        touchedAccountIds.push(cashAcc.id);
        accountDeltas[cashAcc.id] = (accountDeltas[cashAcc.id] ?? 0) + cashPaid;
      }
      if (cardAcc && cardPaid > 0) {
        cardAcc.balance += cardPaid;
        touchedAccountIds.push(cardAcc.id);
        accountDeltas[cardAcc.id] = (accountDeltas[cardAcc.id] ?? 0) + cardPaid;
      }
      if (bankAcc && otherPaid > 0) {
        bankAcc.balance += otherPaid;
        touchedAccountIds.push(bankAcc.id);
        accountDeltas[bankAcc.id] = (accountDeltas[bankAcc.id] ?? 0) + otherPaid;
      }

      let auditId: string | undefined;
      if (sale.checkDiscountPercent >= nextDb.settings.discountApprovalThresholdPercent) {
        auditId = appendAudit(
          nextDb,
          user,
          'big_discount',
          'Sale',
          sale.id,
          `Chek ${sale.receiptNumber} da ${sale.checkDiscountPercent}% chegirma qo'llanildi`,
          sale.storeId
        );
      }

      sale.shiftId = activeShift?.id;
      sale.cashierId = user?.id ?? sale.cashierId;
      sale.cashierName = user?.name ?? sale.cashierName;
      sale.loyaltyPointsEarned = earnedPoints;
      sale.payments = payments;
      sale.paidAmount = paidAmount;
      sale.debtAmount = debtAmount;
      sale.cashGiven = input.cashGiven;
      sale.changeAmount = input.changeAmount;
      sale.paidAt = nowIso;
      sale.status = 'completed';
      sale.offlineCreated = !isOnline;
      sale.syncedAt = isOnline ? nowIso : undefined;
      sale.updatedAt = nowIso;

      await syncOrEnqueue(
        nextDb,
        {
          id: uid('sync'),
          type: 'sale_pay_deferred',
          payload: {
            saleId: sale.id,
            receiptNumber: sale.receiptNumber,
            movementIds,
            loyaltyTxIds,
            debtId,
            accountIds: touchedAccountIds,
            accountDeltas,
            customerSpentDelta: customer ? totalAmount : 0,
            customerOrdersDelta: customer ? 1 : 0,
            customerDebtDelta: customer ? debtAmount : 0,
            loyaltyPointsDelta,
            promoUsedDelta,
            shiftDeltas: activeShift
              ? { cashSales: cashPaid, cardSales: cardPaid, otherSales: otherPaid, expectedCash: cashPaid }
              : undefined,
            auditId,
            storeId: sale.storeId,
          },
          createdAt: nowIso,
          attempts: 0,
        },
        { strict: true }
      );
      return sale;
    },

    deleteDeferredTransaction: async (saleId) => {
      const { db } = get();
      if (!db || !get().can('use_pos')) return;
      const target = db.sales.find((s) => s.id === saleId);
      if (!target || target.status !== 'deferred') return;
      const nextDb: DatabaseSnapshot = structuredClone(db);
      nextDb.sales = nextDb.sales.filter((s) => s.id !== saleId);
      await syncOrEnqueue(
        nextDb,
        {
          id: uid('sync'),
          type: 'sale_delete_deferred',
          payload: { saleId, storeId: target.storeId },
          createdAt: new Date().toISOString(),
          attempts: 0,
        },
        { strict: true }
      );
    },

    completeSale: async (input) => {
      const { db, isOnline } = get();
      if (!db) throw new Error('DB not loaded');
      if (!get().can('use_pos')) throw new Error("Sotuvga ruxsat yo'q");
      if (!input.items.length) throw new Error("Savat bo'sh");
      if (!db.settings.allowNegativeStock) {
        const neededByVariant = new Map<string, { qty: number; name: string }>();
        for (const it of input.items) {
          const prev = neededByVariant.get(it.variantId);
          neededByVariant.set(it.variantId, {
            qty: (prev?.qty ?? 0) + it.qty,
            name: it.productName,
          });
        }
        for (const [variantId, need] of neededByVariant.entries()) {
          const available =
            db.stockItems.find(
              (s) => s.variantId === variantId && s.warehouseId === input.warehouseId
            )?.qty ?? 0;
          if (available < need.qty) {
            throw new Error(
              `"${need.name}" omborda yetarli emas (Qoldiq: ${available}, So'ralgan: ${need.qty}).`
            );
          }
        }
      }
      const user = get().getCurrentUser();
      const saleId = input.saleId || uid('sale');
      const alreadyExists = db.sales.find((s) => s.id === saleId);
      if (alreadyExists) return alreadyExists;

      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();

      const storeIdx = Math.max(0, nextDb.stores.findIndex((s) => s.id === input.storeId));
      const store = nextDb.stores[storeIdx];
      const storeCode = store?.storeCode || String(storeIdx + 1).padStart(2, '0');
      const seqNum = nextSeqNumber(
        nextDb.sales.map((s) => s.receiptNumber),
        /010104(\d+)$/,
        286
      );
      const receiptNumber = `#${storeCode}010104${String(seqNum).padStart(4, '0')}`;

      const subtotal = input.items.reduce((s, it) => s + it.lineTotal, 0);
      const costTotal = input.items.reduce((s, it) => s + it.purchasePrice * it.qty, 0);
      const afterDiscount = Math.max(0, subtotal - input.checkDiscountAmount - input.loyaltyPointsSpent);
      const vatAmount = nextDb.settings.vatEnabled
        ? Math.round((afterDiscount * nextDb.settings.vatRate) / (100 + nextDb.settings.vatRate))
        : 0;
      const totalAmount = afterDiscount;

      const payments: Payment[] = input.payments
        .filter((p) => p.amount > 0)
        .map((p) => ({
          id: uid('pay'),
          saleId,
          method: p.method,
          amount: p.amount,
          storeId: input.storeId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: user?.id ?? 'system',
        }));

      const debtAmount = payments
        .filter((p) => p.method === 'debt')
        .reduce((s, p) => s + p.amount, 0);
      const paidAmount = Math.max(0, totalAmount - debtAmount);

      const customer = input.customerId ? nextDb.customers.find((c) => c.id === input.customerId) : undefined;
      const loyaltyAcc = customer ? nextDb.loyaltyAccounts.find((l) => l.customerId === customer.id) : undefined;
      const loyaltyTxIds: string[] = [];
      let debtId: string | undefined;

      let earnedPoints = 0;
      let loyaltyPointsDelta = 0;
      if (customer && loyaltyAcc) {
        if (input.loyaltyPointsSpent > 0) {
          const prevPts = loyaltyAcc.pointsBalance;
          loyaltyAcc.pointsBalance = Math.max(0, loyaltyAcc.pointsBalance - input.loyaltyPointsSpent);
          loyaltyPointsDelta += loyaltyAcc.pointsBalance - prevPts;
          const ltxId = uid('ltx');
          loyaltyTxIds.push(ltxId);
          nextDb.loyaltyTransactions.unshift({
            id: ltxId,
            customerId: customer.id,
            loyaltyAccountId: loyaltyAcc.id,
            type: 'spend',
            points: -input.loyaltyPointsSpent,
            saleId,
            note: `Chek ${receiptNumber} da ishlatildi`,
            storeId: input.storeId,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: user?.id ?? 'system',
          });
        }

        earnedPoints = Math.round((paidAmount * loyaltyAcc.cashbackPercent) / 100);
        if (earnedPoints > 0) {
          const expDate = new Date();
          expDate.setDate(expDate.getDate() + (nextDb.settings.cashbackExpiryDays || 180));
          loyaltyAcc.pointsBalance += earnedPoints;
          loyaltyPointsDelta += earnedPoints;
          loyaltyAcc.expiresAt = expDate.toISOString();
          const ltxId = uid('ltx');
          loyaltyTxIds.push(ltxId);
          nextDb.loyaltyTransactions.unshift({
            id: ltxId,
            customerId: customer.id,
            loyaltyAccountId: loyaltyAcc.id,
            type: 'earn',
            points: earnedPoints,
            saleId,
            expiresAt: expDate.toISOString(),
            note: `Chek ${receiptNumber} keshbek`,
            storeId: input.storeId,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: user?.id ?? 'system',
          });
        }

        customer.totalSpent += totalAmount;
        customer.ordersCount += 1;
        customer.lastPurchaseAt = nowIso;
        if (customer.totalSpent >= 3000000) customer.segment = 'vip';
        else if (customer.ordersCount >= 3) customer.segment = 'regular';

        const tiers = [...nextDb.settings.loyaltyTiers].sort((a, b) => b.minSpend - a.minSpend);
        const matched = tiers.find((t) => customer.totalSpent >= t.minSpend);
        if (matched) {
          loyaltyAcc.tier = matched.tier;
          loyaltyAcc.cashbackPercent = matched.cashbackPercent;
        }

        if (debtAmount > 0) {
          customer.debtBalance += debtAmount;
          const due = new Date();
          due.setDate(due.getDate() + 14);
          debtId = uid('debt');
          nextDb.debts.unshift({
            id: debtId,
            customerId: customer.id,
            customerName: customer.name,
            saleId,
            originalAmount: debtAmount,
            remainingAmount: debtAmount,
            dueDate: due.toISOString(),
            status: 'open',
            payments: [],
            storeId: input.storeId,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: user?.id ?? 'system',
          });
        }
      }

      let promoUsedDelta = 0;
      if (input.promoCode) {
        const promo = nextDb.promoCodes.find((pr) => pr.code.toUpperCase() === input.promoCode?.toUpperCase());
        if (promo) {
          promo.usedCount += 1;
          promoUsedDelta = 1;
        }
      }

      const movementIds: string[] = [];
      input.items.forEach((it) => {
        const mov = mutateStock(nextDb, {
          productId: it.productId,
          variantId: it.variantId,
          warehouseId: input.warehouseId,
          storeId: input.storeId,
          qtyDelta: -it.qty,
          type: 'sotuv',
          unitCost: it.purchasePrice,
          userId: user?.id ?? 'system',
          referenceId: saleId,
          referenceType: 'Sale',
          note: `Chek ${receiptNumber}`,
        });
        movementIds.push(mov.id);
      });

      const activeShift = nextDb.cashShifts.find(
        (s) => s.status === 'open' && s.storeId === input.storeId
      );
      const cashPaid = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
      const cardPaid = payments
        .filter((p) => ['card', 'uzcard', 'humo', 'visa', 'mastercard', 'unionpay'].includes(p.method))
        .reduce((s, p) => s + p.amount, 0);
      const otherPaid = payments
        .filter((p) => ['transfer', 'click', 'payme', 'uzum'].includes(p.method))
        .reduce((s, p) => s + p.amount, 0);

      if (activeShift) {
        activeShift.cashSalesTotal += cashPaid;
        activeShift.cardSalesTotal += cardPaid;
        activeShift.otherSalesTotal += otherPaid;
        activeShift.expectedCash += cashPaid;
        activeShift.updatedAt = nowIso;
      }

      const touchedAccountIds: string[] = [];
      const accountDeltas: Record<string, number> = {};
      const cashAcc = nextDb.accounts.find((a) => a.type === 'cash');
      const cardAcc = nextDb.accounts.find((a) => a.type === 'card_terminal');
      const bankAcc = nextDb.accounts.find((a) => a.type === 'bank');
      if (cashAcc && cashPaid > 0) {
        cashAcc.balance += cashPaid;
        touchedAccountIds.push(cashAcc.id);
        accountDeltas[cashAcc.id] = (accountDeltas[cashAcc.id] ?? 0) + cashPaid;
      }
      if (cardAcc && cardPaid > 0) {
        cardAcc.balance += cardPaid;
        touchedAccountIds.push(cardAcc.id);
        accountDeltas[cardAcc.id] = (accountDeltas[cardAcc.id] ?? 0) + cardPaid;
      }
      if (bankAcc && otherPaid > 0) {
        bankAcc.balance += otherPaid;
        touchedAccountIds.push(bankAcc.id);
        accountDeltas[bankAcc.id] = (accountDeltas[bankAcc.id] ?? 0) + otherPaid;
      }

      let auditId: string | undefined;
      if (input.checkDiscountPercent >= nextDb.settings.discountApprovalThresholdPercent) {
        auditId = appendAudit(
          nextDb,
          user,
          'big_discount',
          'Sale',
          saleId,
          `Chek ${receiptNumber} da ${input.checkDiscountPercent}% chegirma qo'llanildi`,
          input.storeId
        );
      }

      const sale: Sale = {
        id: saleId,
        receiptNumber,
        warehouseId: input.warehouseId,
        shiftId: activeShift?.id,
        cashierId: user?.id ?? 'system',
        cashierName: user?.name ?? 'Kassir',
        customerId: customer?.id,
        customerName: customer?.name,
        items: input.items,
        subtotal,
        checkDiscountAmount: input.checkDiscountAmount,
        checkDiscountPercent: input.checkDiscountPercent,
        loyaltyPointsSpent: input.loyaltyPointsSpent,
        loyaltyPointsEarned: earnedPoints,
        promoCode: input.promoCode,
        vatAmount,
        totalAmount,
        costTotal,
        payments,
        paidAmount,
        debtAmount,
        ...(input.cashGiven !== undefined ? { cashGiven: input.cashGiven } : {}),
        ...(input.changeAmount !== undefined ? { changeAmount: input.changeAmount } : {}),
        paidAt: nowIso,
        status: 'completed',
        offlineCreated: !isOnline,
        syncedAt: isOnline ? nowIso : undefined,
        fiscalStatus: 'not_configured',
        note: input.note,
        storeId: input.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      };

      nextDb.sales.unshift(sale);
      await syncOrEnqueue(
        nextDb,
        {
          id: input.idempotencyKey || uid('sync'),
          type: 'sale',
          payload: {
            saleId,
            receiptNumber,
            movementIds,
            loyaltyTxIds,
            debtId,
            accountIds: touchedAccountIds,
            accountDeltas,
            customerSpentDelta: customer ? totalAmount : 0,
            customerOrdersDelta: customer ? 1 : 0,
            customerDebtDelta: customer ? debtAmount : 0,
            loyaltyPointsDelta,
            promoUsedDelta,
            shiftDeltas: activeShift
              ? { cashSales: cashPaid, cardSales: cardPaid, otherSales: otherPaid, expectedCash: cashPaid }
              : undefined,
            auditId,
            storeId: input.storeId,
          },
          createdAt: nowIso,
          attempts: 0,
        },
        { strict: true }
      );
      return sale;
    },

    processReturn: async (input) => {
      const { db } = get();
      if (!db) throw new Error('DB not loaded');
      if (!get().can('process_returns')) throw new Error("Qaytarishga ruxsat yo'q");
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const sale = nextDb.sales.find((s) => s.id === input.saleId);
      if (!sale) throw new Error('Sale not found');
      if (sale.status === 'returned' || sale.status === 'deferred') {
        throw new Error('Bu chek uchun qaytarish mumkin emas');
      }

      const prevReturnsForSale = nextDb.returns.filter((r) => r.saleId === sale.id);
      const alreadyReturnedByItem = new Map<string, number>();
      let prevReturnedQtyTotal = 0;
      let prevRefundedTotal = 0;
      prevReturnsForSale.forEach((r) => {
        prevRefundedTotal += r.totalRefund;
        r.items.forEach((ri) => {
          alreadyReturnedByItem.set(ri.saleItemId, (alreadyReturnedByItem.get(ri.saleItemId) ?? 0) + ri.qty);
          prevReturnedQtyTotal += ri.qty;
        });
      });

      const netFactor = sale.subtotal > 0 ? sale.totalAmount / sale.subtotal : 1;
      const nowIso = new Date().toISOString();
      const retId = uid('ret');
      const retSeq = nextSeqNumber(
        nextDb.returns.map((r) => r.number),
        /^QAY-(\d+)$/i,
        101
      );
      const retNum = `QAY-${retSeq}`;
      const movementIds: string[] = [];

      const returnItems: Return['items'] = [];
      let remainingRefundCap = Math.max(0, sale.totalAmount - prevRefundedTotal);
      for (const it of input.items) {
        if (it.qty <= 0) continue;
        const sItem = sale.items.find((si) => si.id === it.saleItemId);
        if (!sItem) continue;
        const already = alreadyReturnedByItem.get(sItem.id) ?? 0;
        const availableToReturn = Math.max(0, sItem.qty - already);
        const safeQty = Math.min(it.qty, availableToReturn);
        if (safeQty <= 0) continue;

        const perUnitNet = sItem.qty > 0 ? (sItem.lineTotal / sItem.qty) * netFactor : 0;
        const rawRefund = Math.round(perUnitNet * safeQty);
        const refundAmount = Math.min(rawRefund, remainingRefundCap);
        remainingRefundCap = Math.max(0, remainingRefundCap - refundAmount);

        const mov = mutateStock(nextDb, {
          productId: sItem.productId,
          variantId: sItem.variantId,
          warehouseId: sale.warehouseId,
          storeId: sale.storeId,
          qtyDelta: safeQty,
          type: 'qaytarish',
          unitCost: sItem.purchasePrice,
          userId: user?.id ?? 'system',
          referenceId: retId,
          referenceType: 'Return',
          note: `Qaytarish ${retNum} (Chek ${sale.receiptNumber})`,
        });
        movementIds.push(mov.id);
        returnItems.push({
          saleItemId: sItem.id,
          productId: sItem.productId,
          variantId: sItem.variantId,
          productName: sItem.productName,
          variantLabel: sItem.variantLabel,
          qty: safeQty,
          refundAmount,
          purchasePrice: sItem.purchasePrice,
        });
      }

      if (returnItems.length === 0) {
        throw new Error('Qaytarish uchun yaroqli mahsulot tanlanmadi');
      }

      const totalRefund = returnItems.reduce((s, it) => s + it.refundAmount, 0);
      const totalSoldQty = sale.items.reduce((s, it) => s + it.qty, 0);
      const currentReturnedQty = returnItems.reduce((s, it) => s + it.qty, 0);
      const cumulativeReturnedQty = prevReturnedQtyTotal + currentReturnedQty;
      sale.status = cumulativeReturnedQty >= totalSoldQty ? 'returned' : 'partial_return';
      sale.updatedAt = nowIso;

      let touchedShiftId: string | undefined;
      let shiftCashRefundDelta = 0;
      let touchedAccountId: string | undefined;
      let accountDelta = 0;

      if (input.refundMethod === 'cash') {
        const shift = nextDb.cashShifts.find(
          (s) => s.status === 'open' && s.storeId === sale.storeId
        );
        if (shift) {
          shift.cashRefundsTotal += totalRefund;
          shift.expectedCash -= totalRefund;
          shift.updatedAt = nowIso;
          touchedShiftId = shift.id;
          shiftCashRefundDelta = totalRefund;
        }
        const cashAcc = nextDb.accounts.find((a) => a.type === 'cash') ?? nextDb.accounts[0];
        if (cashAcc) {
          cashAcc.balance -= totalRefund;
          touchedAccountId = cashAcc.id;
          accountDelta = -totalRefund;
        }
      } else if (['card', 'uzcard', 'humo', 'visa', 'mastercard', 'unionpay'].includes(input.refundMethod)) {
        const cardAcc =
          nextDb.accounts.find((a) => a.type === 'card_terminal') ??
          nextDb.accounts.find((a) => a.type === 'cash') ??
          nextDb.accounts[0];
        if (cardAcc) {
          cardAcc.balance -= totalRefund;
          touchedAccountId = cardAcc.id;
          accountDelta = -totalRefund;
        }
      } else {
        const bankAcc =
          nextDb.accounts.find((a) => a.type === 'bank') ??
          nextDb.accounts.find((a) => a.type === 'card_terminal') ??
          nextDb.accounts[0];
        if (bankAcc) {
          bankAcc.balance -= totalRefund;
          touchedAccountId = bankAcc.id;
          accountDelta = -totalRefund;
        }
      }

      const ret: Return = {
        id: retId,
        number: retNum,
        saleId: sale.id,
        receiptNumber: sale.receiptNumber,
        warehouseId: sale.warehouseId,
        items: returnItems,
        totalRefund,
        refundMethod: input.refundMethod,
        reason: input.reason,
        isExchange: input.isExchange,
        storeId: sale.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      };

      nextDb.returns.unshift(ret);
      const auditId = appendAudit(
        nextDb,
        user,
        'sale_return',
        'Return',
        retId,
        `Qaytarish ${retNum}: Chek ${sale.receiptNumber}, summa ${totalRefund}`,
        sale.storeId
      );
      await syncOrEnqueue(
        nextDb,
        {
          id: uid('sync'),
          type: 'return',
          payload: {
            returnId: retId,
            saleId: sale.id,
            movementIds,
            shiftId: touchedShiftId,
            shiftCashRefundDelta,
            accountId: touchedAccountId,
            accountDelta,
            auditId,
            storeId: sale.storeId,
          },
          createdAt: nowIso,
          attempts: 0,
        },
        { strict: true }
      );
      return ret;
    },

    syncOfflineQueue: async () => {
      if (activeSyncQueuePromise) return activeSyncQueuePromise;

      const run = async (): Promise<number> => {
        const { db, cloudConnected, workspaceContext, isOnline } = get();
        if (!db || db.offlineQueue.length === 0) return 0;

        if (!cloudConnected || !workspaceContext) {
          return 0;
        }

        if (!isOnline) return 0;
        set({ syncStatus: 'syncing', isSyncingQueue: true });

        const remaining: OfflineSyncItem[] = [];
        let syncedCount = 0;
        let lastErr: unknown = null;
        const workingDb: DatabaseSnapshot = structuredClone(db);
        const nowIso = new Date().toISOString();

        for (const item of workingDb.offlineQueue) {
          try {
            await pushSyncItemToFirestore(workspaceContext, item, workingDb);
            syncedCount += 1;
            if (item.type === 'sale' || item.type === 'sale_pay_deferred') {
              const sId = String((item.payload as Record<string, unknown>)?.saleId || '');
              const s = workingDb.sales.find((x) => x.id === sId);
              if (s) s.syncedAt = nowIso;
            }
          } catch (err) {
            if (isPermissionError(err) || err instanceof BusinessRuleError) {
              if (err instanceof BusinessRuleError) {
                get().notify(err.message, 'error');
              }
              // Drop rejected/invalid operations so queue never loops infinitely
              continue;
            }
            lastErr = err;
            remaining.push({ ...item, attempts: (item.attempts || 0) + 1 });
          }
        }

        // Preserve any brand-new items appended locally while pushing earlier items
        const latestQueue = get().db?.offlineQueue ?? [];
        const pushedIds = new Set(workingDb.offlineQueue.map((q) => q.id));
        const concurrentAdditions = latestQueue.filter((q) => !pushedIds.has(q.id));
        workingDb.offlineQueue = [...remaining, ...concurrentAdditions];

        await repository.save(workingDb);
        const doneIso = new Date().toISOString();
        set({
          db: workingDb,
          isSyncingQueue: false,
          syncStatus: get().isOnline ? 'online' : 'offline',
          lastSyncCheckAt: doneIso,
          ...(syncedCount > 0 || remaining.length === 0 ? { lastSyncAt: doneIso } : {}),
          cloudError: remaining.length > 0 && lastErr ? formatFirebaseError(lastErr, get().language) : null,
        });
        return syncedCount;
      };

      activeSyncQueuePromise = run().finally(() => {
        activeSyncQueuePromise = null;
      });
      return activeSyncQueuePromise;
    },

    createPurchaseReceipt: async (receipt) => {
      const { db } = get();
      if (!db || !get().can('manage_inventory')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const id = uid('pr');
      const fullReceipt: PurchaseReceipt = {
        ...receipt,
        id,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      };
      nextDb.purchaseReceipts.unshift(fullReceipt);

      const movementIds: string[] = [];
      receipt.items.forEach((it) => {
        const mov = mutateStock(nextDb, {
          productId: it.productId,
          variantId: it.variantId,
          warehouseId: receipt.warehouseId,
          storeId: receipt.storeId,
          qtyDelta: it.qty,
          type: 'kirim',
          unitCost: it.purchasePrice,
          userId: user?.id ?? 'system',
          referenceId: id,
          referenceType: 'PurchaseReceipt',
          note: `Kirim ${receipt.number}`,
        });
        movementIds.push(mov.id);
        const prod = nextDb.products.find((p) => p.id === it.productId);
        const variant = prod?.variants.find((v) => v.id === it.variantId);
        if (variant && it.purchasePrice > 0) variant.purchasePrice = it.purchasePrice;
      });

      const debt = Math.max(0, receipt.totalAmount - receipt.paidAmount);
      if (debt > 0) {
        const sup = nextDb.suppliers.find((s) => s.id === receipt.supplierId);
        if (sup) sup.debtBalance += debt;
      }
      let paidAccId: string | undefined;
      if (receipt.paidAmount > 0) {
        const cashAcc = nextDb.accounts.find((a) => a.type === 'cash') ?? nextDb.accounts[0];
        if (cashAcc) {
          cashAcc.balance -= receipt.paidAmount;
          paidAccId = cashAcc.id;
        }
      }

      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'purchase_receipt',
        payload: {
          receiptId: id,
          supplierId: receipt.supplierId,
          supplierDebtDelta: debt,
          movementIds,
          accountId: paidAccId,
          accountDelta: paidAccId ? -receipt.paidAmount : 0,
          storeId: receipt.storeId,
        },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    createPurchaseOrder: async (po) => {
      const { db } = get();
      if (!db || !get().can('manage_inventory')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const poId = uid('po');
      nextDb.purchaseOrders.unshift({
        ...po,
        id: poId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      });
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'purchase_order',
        payload: { poId, storeId: po.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    updatePurchaseOrderStatus: async (poId, status) => {
      const { db } = get();
      if (!db || !get().can('manage_inventory')) return;
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const po = nextDb.purchaseOrders.find((p) => p.id === poId);
      if (!po) return;
      po.status = status;
      po.updatedAt = nowIso;
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'purchase_order_status',
        payload: { poId, storeId: po.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    createTransfer: async (transfer) => {
      const { db } = get();
      if (!db || !get().can('manage_inventory')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const id = uid('trf');
      const full: Transfer = {
        ...transfer,
        id,
        status: 'sent',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      };
      nextDb.transfers.unshift(full);

      const movementIds: string[] = [];
      transfer.items.forEach((it) => {
        const prod = nextDb.products.find((p) => p.id === it.productId);
        const variant = prod?.variants.find((v) => v.id === it.variantId);
        const mov = mutateStock(nextDb, {
          productId: it.productId,
          variantId: it.variantId,
          warehouseId: transfer.fromWarehouseId,
          storeId: transfer.storeId,
          qtyDelta: -it.sentQty,
          type: 'kochirish_out',
          unitCost: variant?.purchasePrice ?? 0,
          userId: user?.id ?? 'system',
          referenceId: id,
          referenceType: 'Transfer',
          note: `Ko'chirish ${transfer.number} (chiqish)`,
        });
        movementIds.push(mov.id);
      });

      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'transfer',
        payload: { transferId: id, movementIds, storeId: transfer.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    receiveTransfer: async (transferId, receivedItems) => {
      const { db } = get();
      if (!db || !get().can('manage_inventory')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const trf = nextDb.transfers.find((t) => t.id === transferId);
      if (!trf || trf.status !== 'sent') return;

      const nowIso = new Date().toISOString();
      const movementIds: string[] = [];
      let hasDiscrepancy = false;
      trf.items.forEach((it) => {
        const rec = receivedItems.find((r) => r.variantId === it.variantId);
        const recQty = rec ? rec.receivedQty : it.sentQty;
        it.receivedQty = recQty;
        if (recQty !== it.sentQty) hasDiscrepancy = true;
        const prod = nextDb.products.find((p) => p.id === it.productId);
        const variant = prod?.variants.find((v) => v.id === it.variantId);
        const mov = mutateStock(nextDb, {
          productId: it.productId,
          variantId: it.variantId,
          warehouseId: trf.toWarehouseId,
          storeId: trf.storeId,
          qtyDelta: recQty,
          type: 'kochirish_in',
          unitCost: variant?.purchasePrice ?? 0,
          userId: user?.id ?? 'system',
          referenceId: trf.id,
          referenceType: 'Transfer',
          note: `Ko'chirish ${trf.number} (qabul)`,
        });
        movementIds.push(mov.id);
      });
      trf.status = hasDiscrepancy ? 'discrepancy' : 'received';
      trf.updatedAt = nowIso;

      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'transfer_receive',
        payload: { transferId, movementIds, storeId: trf.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    createWriteOff: async (wo) => {
      const { db } = get();
      if (!db || !get().can('manage_inventory')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const id = uid('wo');
      nextDb.writeOffs.unshift({
        ...wo,
        id,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      });
      const movementIds: string[] = [];
      wo.items.forEach((it) => {
        const mov = mutateStock(nextDb, {
          productId: it.productId,
          variantId: it.variantId,
          warehouseId: wo.warehouseId,
          storeId: wo.storeId,
          qtyDelta: -it.qty,
          type: 'chiqim',
          unitCost: it.unitCost,
          userId: user?.id ?? 'system',
          referenceId: id,
          referenceType: 'WriteOff',
          note: `Hisobdan chiqarish ${wo.number}: ${wo.reason}`,
        });
        movementIds.push(mov.id);
      });
      const auditId = appendAudit(
        nextDb,
        user,
        'stock_writeoff',
        'WriteOff',
        id,
        `Hisobdan chiqarish ${wo.number} (${wo.reason}), tannarx: ${wo.totalCost}`,
        wo.storeId
      );
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'write_off',
        payload: { writeOffId: id, movementIds, auditId, storeId: wo.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    saveStocktake: async (st) => {
      const { db } = get();
      if (!db) throw new Error('DB not loaded');
      if (!get().can('manage_inventory')) throw new Error("Ruxsat yo'q");
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const id = st.id || uid('inv');
      const full: Stocktake = {
        ...st,
        id,
        createdAt: st.id ? nextDb.stocktakes.find((x) => x.id === st.id)?.createdAt ?? nowIso : nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      };
      const idx = nextDb.stocktakes.findIndex((x) => x.id === id);
      if (idx >= 0) nextDb.stocktakes[idx] = full;
      else nextDb.stocktakes.unshift(full);
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'stocktake',
        payload: { stocktakeId: id, storeId: full.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
      return full;
    },

    applyStocktake: async (stocktakeId) => {
      const { db } = get();
      if (!db || !get().can('manage_inventory')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const st = nextDb.stocktakes.find((x) => x.id === stocktakeId);
      if (!st || st.status === 'completed') return;

      const nowIso = new Date().toISOString();
      const movementIds: string[] = [];
      st.items.forEach((it) => {
        const currentSys =
          nextDb.stockItems.find((s) => s.variantId === it.variantId && s.warehouseId === st.warehouseId)?.qty ?? 0;
        const diff = it.countedQty - currentSys;
        if (diff !== 0) {
          const mov = mutateStock(nextDb, {
            productId: it.productId,
            variantId: it.variantId,
            warehouseId: st.warehouseId,
            storeId: st.storeId,
            qtyDelta: diff,
            type: 'inventarizatsiya',
            unitCost: it.unitCost,
            userId: user?.id ?? 'system',
            referenceId: st.id,
            referenceType: 'Stocktake',
            note: `Inventarizatsiya ${st.number}`,
          });
          movementIds.push(mov.id);
        }
      });
      st.status = 'completed';
      st.updatedAt = nowIso;
      const auditId = appendAudit(
        nextDb,
        user,
        'stocktake_apply',
        'Stocktake',
        st.id,
        `Inventarizatsiya ${st.number} tasdiqlandi va qoldiqlar tuzatildi`,
        st.storeId
      );
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'stocktake_apply',
        payload: { stocktakeId: st.id, movementIds, auditId, storeId: st.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    upsertSupplier: async (supplier) => {
      const { db } = get();
      if (!db || !get().can('manage_inventory')) return;
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const idx = nextDb.suppliers.findIndex((s) => s.id === supplier.id);
      if (idx >= 0) nextDb.suppliers[idx] = { ...supplier, updatedAt: nowIso };
      else nextDb.suppliers.unshift(supplier);
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'supplier',
        payload: { supplierId: supplier.id, storeId: supplier.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    paySupplierDebt: async (supplierId, amount, accountId) => {
      const { db } = get();
      if (!db || amount <= 0 || !get().can('manage_finance')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const sup = nextDb.suppliers.find((s) => s.id === supplierId);
      const acc = nextDb.accounts.find((a) => a.id === accountId);
      if (!sup || !acc) return;
      const prevDebt = sup.debtBalance;
      sup.debtBalance = Math.max(0, sup.debtBalance - amount);
      const debtDelta = sup.debtBalance - prevDebt;
      acc.balance -= amount;
      const nowIso = new Date().toISOString();
      const trxId = uid('trx');
      nextDb.transactions.unshift({
        id: trxId,
        accountId: acc.id,
        type: 'expense',
        category: 'supplier_payment',
        amount,
        description: `Ta'minotchiga to'lov: ${sup.name}`,
        referenceId: sup.id,
        storeId: acc.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      });
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'supplier_debt_pay',
        payload: {
          supplierId,
          supplierDebtDelta: debtDelta,
          accountId: acc.id,
          accountDelta: -amount,
          transactionId: trxId,
          storeId: acc.storeId,
        },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    upsertCustomer: async (customer) => {
      const { db } = get();
      if (!db) throw new Error('DB not loaded');
      if (!get().can('manage_customers') && !get().can('use_pos')) throw new Error("Ruxsat yo'q");
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const idx = nextDb.customers.findIndex((c) => c.id === customer.id);
      const nowIso = new Date().toISOString();
      let loyId: string | undefined;
      if (idx >= 0) {
        nextDb.customers[idx] = { ...customer, updatedAt: nowIso };
      } else {
        nextDb.customers.unshift(customer);
        const exp = new Date();
        exp.setDate(exp.getDate() + (nextDb.settings.cashbackExpiryDays || 180));
        loyId = uid('loy');
        const loySeq = nextSeqNumber(
          nextDb.loyaltyAccounts.map((l) => l.cardNumber),
          /^SHU-(\d+)$/i,
          1001
        );
        nextDb.loyaltyAccounts.unshift({
          id: loyId,
          customerId: customer.id,
          tier: 'bronze',
          cashbackPercent: nextDb.settings.loyaltyTiers[0]?.cashbackPercent ?? 2,
          pointsBalance: 0,
          cardNumber: `SHU-${loySeq}`,
          expiresAt: exp.toISOString(),
          storeId: customer.storeId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: user?.id ?? 'system',
        });
      }
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'customer',
        payload: { customerId: customer.id, loyaltyAccountId: loyId, storeId: customer.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
      return customer;
    },

    repayDebt: async (debtId, amount, method, note) => {
      const { db } = get();
      if (!db || amount <= 0) return;
      if (!get().can('manage_debts') && !get().can('manage_customers')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const debt = nextDb.debts.find((d) => d.id === debtId);
      if (!debt) return;
      const applied = Math.min(amount, debt.remainingAmount);
      const nowIso = new Date().toISOString();
      debt.remainingAmount -= applied;
      debt.status = debt.remainingAmount <= 0 ? 'paid' : 'partial';
      debt.payments.push({ id: uid('dp'), amount: applied, method, paidAt: nowIso, note });
      debt.updatedAt = nowIso;

      const cust = nextDb.customers.find((c) => c.id === debt.customerId);
      let cDebtDelta = 0;
      if (cust) {
        const prevCDebt = cust.debtBalance;
        cust.debtBalance = Math.max(0, cust.debtBalance - applied);
        cDebtDelta = cust.debtBalance - prevCDebt;
      }

      const acc =
        nextDb.accounts.find((a) =>
          method === 'cash'
            ? a.type === 'cash'
            : ['transfer', 'click', 'payme', 'uzum'].includes(method)
            ? a.type === 'bank'
            : a.type === 'card_terminal'
        ) ?? nextDb.accounts[0];
      let trxId: string | undefined;
      if (acc) {
        acc.balance += applied;
        trxId = uid('trx');
        nextDb.transactions.unshift({
          id: trxId,
          accountId: acc.id,
          type: 'income',
          category: 'debt_repayment',
          amount: applied,
          description: `Nasiya to'lovi: ${debt.customerName}`,
          referenceId: debt.id,
          storeId: debt.storeId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: user?.id ?? 'system',
        });
      }
      const auditId = appendAudit(
        nextDb,
        user,
        'debt_repay',
        'Debt',
        debt.id,
        `${debt.customerName} qarzidan ${applied} so'm to'landi`,
        debt.storeId
      );
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'debt_pay',
        payload: {
          debtId: debt.id,
          customerId: debt.customerId,
          customerDebtDelta: cDebtDelta,
          accountId: acc?.id,
          accountDelta: acc ? applied : 0,
          transactionId: trxId,
          auditId,
          storeId: debt.storeId,
        },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    upsertPromoCode: async (promo) => {
      const { db } = get();
      if (!db || !get().can('manage_customers')) return;
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const idx = nextDb.promoCodes.findIndex((p) => p.id === promo.id);
      if (idx >= 0) nextDb.promoCodes[idx] = { ...promo, updatedAt: nowIso };
      else nextDb.promoCodes.unshift(promo);
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'promo',
        payload: { promoId: promo.id, storeId: promo.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    addExpense: async (exp) => {
      const { db } = get();
      if (!db || exp.amount <= 0 || !get().can('manage_finance')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const id = uid('exp');
      const trxId = uid('trx');
      nextDb.expenses.unshift({
        ...exp,
        id,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      });
      const acc = nextDb.accounts.find((a) => a.id === exp.accountId);
      if (acc) acc.balance -= exp.amount;
      nextDb.transactions.unshift({
        id: trxId,
        accountId: exp.accountId,
        type: 'expense',
        category: exp.category,
        amount: exp.amount,
        description: exp.description,
        referenceId: id,
        storeId: exp.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      });
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'expense',
        payload: {
          expenseId: id,
          accountId: exp.accountId,
          accountDelta: acc ? -exp.amount : 0,
          transactionId: trxId,
          storeId: exp.storeId,
        },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    transferFunds: async (fromAccountId, toAccountId, amount, note) => {
      const { db } = get();
      if (!db || amount <= 0 || fromAccountId === toAccountId || !get().can('manage_finance')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const from = nextDb.accounts.find((a) => a.id === fromAccountId);
      const to = nextDb.accounts.find((a) => a.id === toAccountId);
      if (!from || !to) return;
      from.balance -= amount;
      to.balance += amount;
      const nowIso = new Date().toISOString();
      const trxId = uid('trx');
      nextDb.transactions.unshift({
        id: trxId,
        accountId: from.id,
        toAccountId: to.id,
        type: 'transfer',
        category: 'transfer',
        amount,
        description: note || `${from.name} -> ${to.name}`,
        storeId: from.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.id ?? 'system',
      });
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'finance_transfer',
        payload: {
          fromAccountId,
          toAccountId,
          fromDelta: -amount,
          toDelta: amount,
          transactionId: trxId,
          storeId: from.storeId,
        },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    upsertAccount: async (acc) => {
      const { db } = get();
      if (!db || !get().can('manage_finance')) return;
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const idx = nextDb.accounts.findIndex((a) => a.id === acc.id);
      if (idx >= 0) nextDb.accounts[idx] = { ...acc, updatedAt: nowIso };
      else nextDb.accounts.push(acc);
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'account',
        payload: { accountId: acc.id, storeId: acc.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    upsertEmployee: async (emp, userUpdates, options) => {
      const { db, isOnline } = get();
      if (!db || !get().can('manage_employees')) return;
      const currentUser = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const idx = nextDb.employees.findIndex((e) => e.id === emp.id);
      const existingEmp = idx >= 0 ? nextDb.employees[idx] : undefined;
      const uIdx = nextDb.users.findIndex((u) => u.id === emp.userId);
      const existingUser = uIdx >= 0 ? nextDb.users[uIdx] : undefined;
      const previousGoogleEmail =
        (existingEmp?.googleEmail || existingUser?.googleEmail || '').trim().toLowerCase() || undefined;
      const previousPhone = (existingEmp?.phone || existingUser?.phone || '').trim() || undefined;
      const prevSecretCandidates = Array.from(
        new Set([existingUser?.password, existingUser?.pin].map((s) => (s || '').trim()).filter(Boolean))
      );

      const cleanEmail = emp.googleEmail?.trim().toLowerCase() || userUpdates?.googleEmail?.trim().toLowerCase() || undefined;
      const empToSave: Employee = {
        ...emp,
        ...(cleanEmail ? { googleEmail: cleanEmail } : {}),
        updatedAt: nowIso,
      };
      if (idx >= 0) nextDb.employees[idx] = empToSave;
      else nextDb.employees.unshift(empToSave);

      let targetSecretForAuth = '';
      if (uIdx >= 0 && existingUser) {
        const nextPassword = userUpdates?.password?.trim()
          ? userUpdates.password.trim()
          : existingUser.password;
        const nextPin = userUpdates?.pin?.trim()
          ? userUpdates.pin.trim()
          : existingUser.pin;
        const nextPasswordHash = userUpdates?.password?.trim()
          ? hashStaffSecret(userUpdates.password.trim())
          : existingUser.passwordHash || (nextPassword ? hashStaffSecret(nextPassword) : undefined);
        const nextPinHash = userUpdates?.pin?.trim()
          ? hashStaffSecret(userUpdates.pin.trim())
          : existingUser.pinHash || (nextPin ? hashStaffSecret(nextPin) : undefined);
        targetSecretForAuth = (nextPassword || nextPin || '').trim();
        const normalizedCustomPerms = userUpdates?.customPermissions
          ? Array.from(new Set<Permission>([...userUpdates.customPermissions, 'use_pos']))
          : existingUser.customPermissions
          ? Array.from(new Set<Permission>([...existingUser.customPermissions, 'use_pos']))
          : undefined;
        const updatedUser: User = {
          ...existingUser,
          name: emp.name,
          phone: emp.phone,
          roleId: emp.roleId,
          ...userUpdates,
          ...(normalizedCustomPerms ? { customPermissions: normalizedCustomPerms } : {}),
          password: nextPassword,
          pin: nextPin,
          ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {}),
          ...(nextPinHash ? { pinHash: nextPinHash } : {}),
          hashAlgo: 'sha256',
          authMigrated: true,
          ...(cleanEmail ? { googleEmail: cleanEmail } : {}),
          updatedAt: nowIso,
        };
        if (!cleanEmail && existingUser.googleEmail && userUpdates && 'googleEmail' in userUpdates && !userUpdates.googleEmail) {
          delete updatedUser.googleEmail;
        }
        if (options?.clearCustomPermissions) {
          delete updatedUser.customPermissions;
        }
        nextDb.users[uIdx] = updatedUser;
      } else {
        const initPassword = userUpdates?.password?.trim() || '';
        const initPin = userUpdates?.pin?.trim() || String(Math.floor(1000 + Math.random() * 8999));
        targetSecretForAuth = (initPassword || initPin).trim();
        const newUser: User = {
          id: emp.userId,
          name: emp.name,
          phone: emp.phone,
          password: initPassword,
          pin: initPin,
          ...(initPassword ? { passwordHash: hashStaffSecret(initPassword) } : {}),
          ...(initPin ? { pinHash: hashStaffSecret(initPin) } : {}),
          hashAlgo: 'sha256',
          authMigrated: true,
          ...(cleanEmail ? { googleEmail: cleanEmail } : {}),
          roleId: emp.roleId,
          assignedStoreIds: userUpdates?.assignedStoreIds?.length ? userUpdates.assignedStoreIds : [emp.storeId],
          isActive: userUpdates?.isActive ?? true,
          storeId: emp.storeId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: currentUser?.id ?? 'system',
        };
        if (!options?.clearCustomPermissions && userUpdates?.customPermissions) {
          newUser.customPermissions = Array.from(new Set<Permission>([...userUpdates.customPermissions, 'use_pos']));
        }
        nextDb.users.push(newUser);
      }

      if (isOnline && emp.phone && targetSecretForAuth) {
        const authEmail = phoneToInternalEmail(emp.phone);
        if (authEmail) {
          const prevPasswords = prevSecretCandidates.map((s) =>
            deriveFirebaseAuthPassword(previousPhone || emp.phone, s)
          );
          const provRes = await provisionStaffAccountOnSecondaryApp(
            authEmail,
            deriveFirebaseAuthPassword(emp.phone, targetSecretForAuth),
            prevPasswords
          );
          if (!provRes.ok && provRes.code === 'auth/operation-not-allowed' && provRes.error) {
            get().notify(provRes.error, 'error');
          }
        }
      }

      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'employee',
        payload: {
          empId: emp.id,
          userId: emp.userId,
          storeId: emp.storeId,
          ...(previousGoogleEmail ? { previousGoogleEmail } : {}),
          ...(previousPhone && previousPhone !== emp.phone ? { previousPhone } : {}),
        },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    deleteEmployee: async (empId) => {
      const { db, currentUserId } = get();
      if (!db) return { ok: false, error: 'DB not loaded' };
      if (!get().can('manage_employees')) return { ok: false, error: "Ruxsat yo'q" };
      const emp = db.employees.find((e) => e.id === empId);
      if (!emp) return { ok: false, error: 'Xodim topilmadi' };
      if (emp.userId === 'usr-owner' || emp.roleId === 'owner') {
        return { ok: false, error: "Asosiy do'kon egasini o'chirib bo'lmaydi" };
      }
      if (emp.userId === currentUserId) {
        return { ok: false, error: "Joriy tizimga kirgan o'z hisobingizni o'chira olmaysiz" };
      }
      const linkedUser = db.users.find((u) => u.id === emp.userId);
      const deletedGoogleEmail =
        (emp.googleEmail || linkedUser?.googleEmail || '').trim().toLowerCase() || undefined;
      const deletedPhone = (emp.phone || linkedUser?.phone || '').trim() || undefined;
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const deletedTargetIds = nextDb.targets
        .filter((tg) => tg.employeeId === empId)
        .map((tg) => tg.id);
      nextDb.employees = nextDb.employees.filter((e) => e.id !== empId);
      nextDb.users = nextDb.users.filter((u) => u.id !== emp.userId);
      nextDb.targets = nextDb.targets.filter((tg) => tg.employeeId !== empId);
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'employee_delete',
        payload: {
          empId,
          deletedUserId: emp.userId,
          deletedTargetIds,
          storeId: emp.storeId,
          ...(deletedGoogleEmail ? { deletedGoogleEmail } : {}),
          ...(deletedPhone ? { deletedPhone } : {}),
        },
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
      return { ok: true };
    },

    updateUserCredentials: async (userId, input) => {
      const { db, isOnline } = get();
      if (!db) return { ok: false, error: 'DB not loaded' };
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const user = nextDb.users.find((u) => u.id === userId);
      if (!user) return { ok: false, error: 'Foydalanuvchi topilmadi' };
      const prevSecret = (user.password || user.pin || '').trim();
      const prevSecretCandidates = Array.from(
        new Set([user.password, user.pin].map((s) => (s || '').trim()).filter(Boolean))
      );

      if (
        input.currentPassword !== undefined &&
        (user.password || user.passwordHash) &&
        !matchesSecret(user.password, user.passwordHash, input.currentPassword)
      ) {
        return { ok: false, error: "Joriy parol noto'g'ri" };
      }
      if (input.newPin !== undefined) {
        const cleanPin = input.newPin.trim();
        if (!/^\d{4,6}$/.test(cleanPin)) {
          return { ok: false, error: "PIN-kod 4–6 ta raqamdan iborat bo'lishi kerak" };
        }
        const duplicate = nextDb.users.find(
          (u) => u.id !== userId && u.isActive && matchesSecret(u.pin, u.pinHash, cleanPin)
        );
        if (duplicate) {
          return { ok: false, error: `Bu PIN-kod (${cleanPin}) boshqa xodimda band` };
        }
        user.pin = cleanPin;
        user.pinHash = hashStaffSecret(cleanPin);
        user.hashAlgo = 'sha256';
        user.authMigrated = true;
      }
      if (input.newPassword !== undefined) {
        const cleanPass = input.newPassword.trim();
        if (cleanPass.length < 4) {
          return { ok: false, error: "Yangi parol kamida 4 ta belgidan iborat bo'lishi kerak" };
        }
        user.password = cleanPass;
        user.passwordHash = hashStaffSecret(cleanPass);
        user.hashAlgo = 'sha256';
        user.authMigrated = true;
      }
      if (input.name !== undefined && input.name.trim()) {
        user.name = input.name.trim();
        const emp = nextDb.employees.find((e) => e.userId === userId);
        if (emp) emp.name = user.name;
      }
      const nextSecret = (user.password || user.pin || '').trim();
      if (isOnline && user.phone && nextSecret && nextSecret !== prevSecret) {
        const authEmail = phoneToInternalEmail(user.phone);
        if (authEmail) {
          const prevPasswords = prevSecretCandidates.map((s) =>
            deriveFirebaseAuthPassword(user.phone, s)
          );
          await provisionStaffAccountOnSecondaryApp(
            authEmail,
            deriveFirebaseAuthPassword(user.phone, nextSecret),
            prevPasswords
          );
        }
      }
      const nowIso = new Date().toISOString();
      user.updatedAt = nowIso;
      const emp = nextDb.employees.find((e) => e.userId === userId);
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'employee',
        payload: { empId: emp?.id ?? userId, userId, storeId: user.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
      return { ok: true };
    },

    upsertTarget: async (target) => {
      const { db } = get();
      if (!db || !get().can('manage_employees')) return;
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const idx = nextDb.targets.findIndex((t) => t.id === target.id);
      if (idx >= 0) nextDb.targets[idx] = { ...target, updatedAt: nowIso };
      else nextDb.targets.unshift(target);
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'target',
        payload: { targetId: target.id, storeId: target.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    createOnlineOrder: async (orderInput) => {
      const { db, cloudConnected } = get();
      if (!db) throw new Error('DB not loaded');
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const webSeq = nextSeqNumber(
        nextDb.onlineOrders.map((o) => o.orderNumber),
        /^WEB-(\d+)$/i,
        205
      );
      const order: OnlineOrder = {
        ...orderInput,
        id: uid('ord'),
        orderNumber: `WEB-${webSeq}`,
        status: 'new',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: 'web-guest',
      };
      nextDb.onlineOrders.unshift(order);
      if (cloudConnected) {
        await syncOrEnqueue(nextDb, {
          id: uid('sync'),
          type: 'online_order',
          payload: { orderId: order.id, storeId: order.storeId },
          createdAt: nowIso,
          attempts: 0,
        });
      } else {
        await repository.save(nextDb);
        set({ db: nextDb });
      }
      return order;
    },

    updateOnlineOrderStatus: async (orderId, status) => {
      const { db } = get();
      if (!db || !get().can('manage_online_orders')) {
        return { ok: false, error: "Ruxsat yo'q" };
      }
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const ord = nextDb.onlineOrders.find((o) => o.id === orderId);
      if (!ord) return { ok: false, error: 'Buyurtma topilmadi' };
      const prevStatus = ord.status;
      if (prevStatus === status) return { ok: true };

      const whId = get().getWarehouseForStore(ord.storeId);
      if (prevStatus === 'new' && status === 'confirmed' && !nextDb.settings.allowNegativeStock) {
        for (const it of ord.items) {
          const available =
            nextDb.stockItems.find((s) => s.variantId === it.variantId && s.warehouseId === whId)?.qty ?? 0;
          if (it.qty > available) {
            return {
              ok: false,
              error: `"${it.productName}" omborda yetarli emas (${available} ta qolgan)`,
            };
          }
        }
      }

      const nowIso = new Date().toISOString();
      ord.status = status;
      ord.updatedAt = nowIso;

      const movementIds: string[] = [];
      if (prevStatus === 'new' && status === 'confirmed') {
        ord.items.forEach((it) => {
          const prod = nextDb.products.find((p) => p.id === it.productId);
          const variant = prod?.variants.find((v) => v.id === it.variantId);
          const mov = mutateStock(nextDb, {
            productId: it.productId,
            variantId: it.variantId,
            warehouseId: whId,
            storeId: ord.storeId,
            qtyDelta: -it.qty,
            type: 'online_sotuv',
            unitCost: variant?.purchasePrice ?? 0,
            userId: user?.id ?? 'system',
            referenceId: ord.id,
            referenceType: 'OnlineOrder',
            note: `Onlayn buyurtma ${ord.orderNumber}`,
          });
          movementIds.push(mov.id);
        });
      } else if (prevStatus === 'confirmed' && status === 'canceled') {
        ord.items.forEach((it) => {
          const prod = nextDb.products.find((p) => p.id === it.productId);
          const variant = prod?.variants.find((v) => v.id === it.variantId);
          const mov = mutateStock(nextDb, {
            productId: it.productId,
            variantId: it.variantId,
            warehouseId: whId,
            storeId: ord.storeId,
            qtyDelta: it.qty,
            type: 'qaytarish',
            unitCost: variant?.purchasePrice ?? 0,
            userId: user?.id ?? 'system',
            referenceId: ord.id,
            referenceType: 'OnlineOrder',
            note: `Bekor qilingan buyurtma ${ord.orderNumber}`,
          });
          movementIds.push(mov.id);
        });
      }

      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'online_order_status',
        payload: { orderId, movementIds, storeId: ord.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
      return { ok: true };
    },

    upsertStore: async (store) => {
      const { db } = get();
      if (!db || !get().can('manage_settings')) return;
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const idx = nextDb.stores.findIndex((s) => s.id === store.id);
      if (idx >= 0) nextDb.stores[idx] = { ...store, updatedAt: nowIso };
      else nextDb.stores.push(store);
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'store',
        payload: { storeId: store.id },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    deleteStore: async (storeId) => {
      const { db, activeStoreId } = get();
      if (!db) return { ok: false, error: 'DB not loaded' };
      if (!get().can('manage_settings')) return { ok: false, error: "Ruxsat yo'q" };
      if (db.stores.length <= 1) {
        return { ok: false, error: "Kamida 1 ta filial qolishi shart" };
      }
      const store = db.stores.find((s) => s.id === storeId);
      if (!store) return { ok: false, error: 'Filial topilmadi' };

      const nextDb: DatabaseSnapshot = structuredClone(db);
      nextDb.stores = nextDb.stores.filter((s) => s.id !== storeId);
      let deletedWarehouseId: string | undefined;
      if (nextDb.warehouses.length > 1) {
        deletedWarehouseId = store.defaultWarehouseId;
        nextDb.warehouses = nextDb.warehouses.filter((w) => w.id !== store.defaultWarehouseId);
      }
      const fallbackStoreId = nextDb.stores[0].id;
      nextDb.users.forEach((u) => {
        u.assignedStoreIds = u.assignedStoreIds.filter((id) => id !== storeId);
        if (u.assignedStoreIds.length === 0) {
          u.assignedStoreIds = [fallbackStoreId];
        }
        if (u.storeId === storeId) u.storeId = fallbackStoreId;
      });
      nextDb.employees.forEach((e) => {
        if (e.storeId === storeId) e.storeId = fallbackStoreId;
      });

      set({ activeStoreId: activeStoreId === storeId ? 'all' : activeStoreId });
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'store_delete',
        payload: { storeId, deletedWarehouseId },
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
      return { ok: true };
    },

    upsertWarehouse: async (wh) => {
      const { db } = get();
      const user = get().getCurrentUser();
      if (!db || (!get().can('manage_settings') && user?.roleId !== 'owner' && user?.roleId !== 'admin')) return;
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const idx = nextDb.warehouses.findIndex((w) => w.id === wh.id);
      if (idx >= 0) nextDb.warehouses[idx] = { ...wh, updatedAt: nowIso };
      else nextDb.warehouses.push(wh);
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'warehouse',
        payload: { warehouseId: wh.id, storeId: wh.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    updateSettings: async (partial) => {
      const { db } = get();
      if (!db || !get().can('manage_settings')) return;
      const user = get().getCurrentUser();
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      nextDb.settings = { ...nextDb.settings, ...partial };
      const storeId = nextDb.stores[0]?.id ?? 'store-chilonzor';
      const auditId = appendAudit(
        nextDb,
        user,
        'settings_change',
        'AppSettings',
        'settings',
        'Tizim sozlamalari yangilandi',
        storeId
      );
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'settings',
        payload: { auditId, storeId },
        createdAt: nowIso,
        attempts: 0,
      });
    },

    isCategoryUsed: (catId) => {
      const { db } = get();
      if (!db) return false;
      if (db.products.some((p) => p.categoryId === catId)) return true;
      return db.purchaseReceipts.some(
        (pr) =>
          pr.categoryId === catId ||
          pr.items.some((it) => db.products.find((p) => p.id === it.productId)?.categoryId === catId)
      );
    },

    upsertCategory: async (cat) => {
      const { db, language } = get();
      if (!db) return { ok: false, error: 'DB not loaded' };
      if (!get().can('edit_catalog') && !get().can('manage_inventory') && !get().can('manage_settings')) {
        return { ok: false, error: language === 'ru' ? 'Недостаточно прав' : "Ruxsat yo'q" };
      }
      const cleanUz = cat.nameUz.trim();
      const cleanRu = (cat.nameRu || cat.nameUz).trim();
      if (!cleanUz) {
        return {
          ok: false,
          error: language === 'ru' ? 'Введите название категории' : 'Kategoriya nomini kiriting',
        };
      }
      const duplicate = db.categories.find(
        (c) =>
          c.id !== cat.id &&
          (c.nameUz.trim().toLowerCase() === cleanUz.toLowerCase() ||
            c.nameRu.trim().toLowerCase() === cleanRu.toLowerCase())
      );
      if (duplicate) {
        return {
          ok: false,
          error:
            language === 'ru'
              ? 'Категория с таким названием уже существует'
              : 'Bu nomdagi kategoriya allaqachon mavjud',
        };
      }

      const nextDb: DatabaseSnapshot = structuredClone(db);
      const nowIso = new Date().toISOString();
      const savedCat: Category = {
        ...cat,
        nameUz: cleanUz,
        nameRu: cleanRu,
        updatedAt: nowIso,
      };
      const idx = nextDb.categories.findIndex((c) => c.id === cat.id);
      if (idx >= 0) nextDb.categories[idx] = savedCat;
      else nextDb.categories.push(savedCat);

      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'category',
        payload: { categoryId: savedCat.id, storeId: savedCat.storeId },
        createdAt: nowIso,
        attempts: 0,
      });
      return { ok: true };
    },

    deleteCategory: async (catId) => {
      const { db } = get();
      if (!db) return { ok: false, error: 'DB not loaded' };
      if (!get().can('edit_catalog') && !get().can('manage_inventory') && !get().can('manage_settings')) {
        return { ok: false, error: "Ruxsat yo'q" };
      }
      if (db.categories.length <= 1) {
        return { ok: false, error: "Kamida 1 ta kategoriya qolishi shart" };
      }
      const nextDb: DatabaseSnapshot = structuredClone(db);
      nextDb.categories = nextDb.categories.filter((c) => c.id !== catId);
      const fallbackCatId = nextDb.categories[0].id;
      const reassignedProductIds: string[] = [];
      nextDb.products.forEach((p) => {
        if (p.categoryId === catId) {
          p.categoryId = fallbackCatId;
          reassignedProductIds.push(p.id);
        }
      });
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'category_delete',
        payload: {
          categoryId: catId,
          reassignedProductIds,
          storeId: nextDb.stores[0]?.id ?? 'store-chilonzor',
        },
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
      return { ok: true };
    },

    resetCategoriesToMensClothing: async () => {
      const { db } = get();
      if (!db || !get().can('edit_catalog')) return;
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const storeId = nextDb.stores[0]?.id ?? 'store-chilonzor';
      const mensCats = getMensClothingCategories(storeId);
      nextDb.categories = mensCats;
      const validIds = new Set(mensCats.map((c) => c.id));
      nextDb.products.forEach((p) => {
        if (!validIds.has(p.categoryId)) {
          p.categoryId = mensCats[0].id;
        }
      });
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'categories_reset',
        payload: { storeId },
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    },

    updateRolePermissions: async (roleId, permissions) => {
      const { db } = get();
      if (!db || (!get().can('manage_settings') && !get().can('manage_employees'))) return;
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const role = nextDb.roles.find((r) => r.id === roleId);
      if (role) role.permissions = Array.from(new Set<Permission>([...permissions, 'use_pos']));
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'roles',
        payload: { storeId: nextDb.stores[0]?.id ?? 'store-chilonzor' },
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    },

    upsertRole: async (role) => {
      const { db, language } = get();
      if (!db) return { ok: false, error: 'DB not loaded' };
      if (!get().can('manage_settings') && !get().can('manage_employees')) {
        return { ok: false, error: language === 'ru' ? 'Недостаточно прав' : "Ruxsat yo'q" };
      }
      const cleanUz = role.nameUz.trim();
      const cleanRu = (role.nameRu || role.nameUz).trim();
      if (!cleanUz) {
        return { ok: false, error: language === 'ru' ? 'Введите название роли' : 'Rol nomini kiriting' };
      }
      const duplicate = db.roles.find(
        (r) =>
          r.id !== role.id &&
          (r.nameUz.trim().toLowerCase() === cleanUz.toLowerCase() ||
            r.nameRu.trim().toLowerCase() === cleanRu.toLowerCase())
      );
      if (duplicate) {
        return {
          ok: false,
          error: language === 'ru' ? 'Роль с таким названием уже существует' : 'Bu nomdagi rol allaqachon mavjud',
        };
      }
      const isExisting = db.roles.some((r) => r.id === role.id);
      if (!isExisting && db.roles.length >= 20) {
        return {
          ok: false,
          error: language === 'ru' ? 'Максимум 20 ролей' : 'Maksimum 20 ta rol yaratish mumkin',
        };
      }
      const nextDb: DatabaseSnapshot = structuredClone(db);
      const savedRole: Role = {
        ...role,
        nameUz: cleanUz.slice(0, 80),
        nameRu: cleanRu.slice(0, 80),
        permissions: Array.from(new Set<Permission>([...role.permissions, 'use_pos'])).slice(0, 30),
      };
      const idx = nextDb.roles.findIndex((r) => r.id === savedRole.id);
      if (idx >= 0) nextDb.roles[idx] = savedRole;
      else nextDb.roles.push(savedRole);
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'roles',
        payload: { storeId: nextDb.stores[0]?.id ?? 'store-chilonzor' },
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
      return { ok: true };
    },

    deleteRole: async (roleId) => {
      const { db } = get();
      if (!db) return { ok: false, error: 'DB not loaded' };
      if (!get().can('manage_settings') && !get().can('manage_employees')) {
        return { ok: false, error: "Ruxsat yo'q" };
      }
      if (roleId === 'owner') {
        return { ok: false, error: "Egasi (Owner) rolini o'chirib bo'lmaydi" };
      }
      if (db.roles.length <= 2) {
        return { ok: false, error: "Kamida 2 ta rol qolishi kerak" };
      }
      const nextDb: DatabaseSnapshot = structuredClone(db);
      nextDb.roles = nextDb.roles.filter((r) => r.id !== roleId);
      const fallbackRole =
        nextDb.roles.find((r) => r.id === 'cashier')?.id ??
        nextDb.roles.find((r) => r.id !== 'owner')?.id ??
        nextDb.roles[0].id;
      nextDb.users.forEach((u) => {
        if (u.roleId === roleId) u.roleId = fallbackRole;
      });
      nextDb.employees.forEach((e) => {
        if (e.roleId === roleId) e.roleId = fallbackRole;
      });
      await syncOrEnqueue(nextDb, {
        id: uid('sync'),
        type: 'roles',
        payload: { storeId: nextDb.stores[0]?.id ?? 'store-chilonzor' },
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
      return { ok: true };
    },

    resetDemoData: async () => {
      const fresh = await repository.resetToDemo();
      set({ db: fresh });
      const { cloudConnected, workspaceContext, isOnline } = get();
      if (cloudConnected && workspaceContext?.isWsAdmin && isOnline) {
        try {
          await migrateLocalAdditionsToWorkspace(workspaceContext, fresh, {
            includeSeedLike: true,
          });
        } catch {
          // ignore if cloud sync fails; local reset succeeded
        }
      }
    },

    clearAllTestData: async () => {
      const { db, cloudConnected, workspaceContext, isOnline } = get();
      if (!db || !get().can('manage_settings')) return;
      const nextDb: DatabaseSnapshot = structuredClone(db);
      nextDb.products = [];
      nextDb.stockItems = [];
      nextDb.stockMovements = [];
      nextDb.purchaseReceipts = [];
      nextDb.purchaseOrders = [];
      nextDb.transfers = [];
      nextDb.writeOffs = [];
      nextDb.stocktakes = [];
      nextDb.sales = [];
      nextDb.returns = [];
      nextDb.cashShifts = [];
      nextDb.cashOperations = [];
      nextDb.transactions = [];
      nextDb.expenses = [];
      nextDb.customers = [];
      nextDb.loyaltyAccounts = [];
      nextDb.loyaltyTransactions = [];
      nextDb.debts = [];
      nextDb.promoCodes = [];
      nextDb.onlineOrders = [];
      nextDb.auditLogs = [];
      nextDb.offlineQueue = [];
      nextDb.targets = [];
      nextDb.accounts = nextDb.accounts.map((a) => ({ ...a, balance: 0 }));
      nextDb.suppliers = nextDb.suppliers.map((s) => ({ ...s, debtBalance: 0 }));
      localStorage.removeItem(HELD_CARTS_KEY);
      await repository.save(nextDb);
      set({
        db: nextDb,
        heldCarts: [],
        cartItems: [],
        cartCustomerId: '',
        cartDiscountPercent: 0,
        cartDiscountFixed: 0,
        cartPromoCode: '',
        cartLoyaltySpent: 0,
      });
      if (cloudConnected && workspaceContext && isOnline) {
        await clearWorkspaceOperationalData(workspaceContext, nextDb);
      }
    },

    importBackupJson: async (json) => {
      const imported = await repository.importJson(json);
      // Normalize legacy branch/owner defaults if present in older backup files
      const nowIso = new Date().toISOString();
      let normalized = false;
      const ownerUser = imported.users.find((u) => u.id === 'usr-owner' || u.roleId === 'owner');
      if (ownerUser && ownerUser.name === 'Sardorbek Karimov') {
        ownerUser.name = 'ISLOMBEK';
        ownerUser.updatedAt = nowIso;
        normalized = true;
      }
      const ownerEmp = imported.employees.find((e) => e.id === 'emp-owner' || e.roleId === 'owner');
      if (ownerEmp && ownerEmp.name === 'Sardorbek Karimov') {
        ownerEmp.name = 'ISLOMBEK';
        ownerEmp.updatedAt = nowIso;
        normalized = true;
      }
      const st1 = imported.stores.find((s) => s.id === 'store-chilonzor');
      if (st1 && st1.name === 'Chilonzor Flagman') {
        st1.name = 'SHU BREND TORAQORGON';
        st1.address = "To'raqo'rg'on";
        st1.updatedAt = nowIso;
        normalized = true;
      }
      const st2 = imported.stores.find((s) => s.id === 'store-samdarvoza');
      if (st2 && st2.name === 'Samarqand Darvoza') {
        st2.name = 'SHU BREND MINGBULOQ';
        st2.address = 'Mingbuloq';
        st2.updatedAt = nowIso;
        normalized = true;
      }
      if (normalized) {
        await repository.save(imported);
      }
      set({ db: imported });

      const { cloudConnected, workspaceContext, isOnline } = get();
      if (cloudConnected && workspaceContext?.isWsAdmin && isOnline) {
        const res = await migrateLocalAdditionsToWorkspace(workspaceContext, imported, {
          includeSeedLike: true,
        });
        await get().syncOfflineQueue();
        return {
          uploadedCount: res.uploadedCount,
          skippedDuplicates: res.skippedDuplicates,
          syncedToCloud: true,
        };
      }
      return { uploadedCount: 0, skippedDuplicates: 0, syncedToCloud: false };
    },

    migrateLocalDataToCloud: async () => {
      const { db, cloudConnected, workspaceContext, isOnline } = get();
      if (!db) {
        return { ok: false, uploadedCount: 0, skippedDuplicates: 0, error: 'Baza yuklanmagan' };
      }
      if (!isOnline) {
        return { ok: false, uploadedCount: 0, skippedDuplicates: 0, error: "Internet aloqasi yo'q" };
      }
      if (!cloudConnected || !workspaceContext) {
        return {
          ok: false,
          uploadedCount: 0,
          skippedDuplicates: 0,
          error: "Bulutga sinxronlash uchun internet aloqasini tekshiring va tizimga qayta kiring",
        };
      }
      if (!workspaceContext.isWsAdmin) {
        return {
          ok: false,
          uploadedCount: 0,
          skippedDuplicates: 0,
          error: "Faqat administrator lokal ma'lumotlarni bulutga ko'chira oladi",
        };
      }
      try {
        const res = await migrateLocalAdditionsToWorkspace(workspaceContext, db, {
          includeSeedLike: true,
        });
        await get().syncOfflineQueue();
        return {
          ok: true,
          uploadedCount: res.uploadedCount,
          skippedDuplicates: res.skippedDuplicates,
        };
      } catch (err) {
        return {
          ok: false,
          uploadedCount: 0,
          skippedDuplicates: 0,
          error: formatFirebaseError(err, get().language),
        };
      }
    },
  };
});
