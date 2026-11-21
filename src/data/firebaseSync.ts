import {
  User as FirebaseUser,
} from 'firebase/auth';
import {
  FieldValue,
  Timestamp,
  WriteBatch,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  getDocFromServer,
} from 'firebase/firestore';
import {
  firestoreDb,
  formatFirebaseErrorMessage,
  handleFirestoreError,
  OperationType,
  phoneToInternalEmail,
} from '../firebase';
import {
  Account,
  AppSettings,
  AuditLog,
  Brand,
  CashOperation,
  CashShift,
  Category,
  Customer,
  DatabaseSnapshot,
  Debt,
  Employee,
  Expense,
  LoyaltyAccount,
  LoyaltyTransaction,
  OfflineSyncItem,
  OnlineOrder,
  Permission,
  Product,
  PromoCode,
  PurchaseOrder,
  PurchaseReceipt,
  Return,
  Role,
  RoleId,
  Sale,
  StockItem,
  StockMovement,
  Stocktake,
  Store,
  Supplier,
  Target,
  Transaction,
  Transfer,
  User,
  Warehouse,
  WriteOff,
} from '../types/models';

export const PRIMARY_WORKSPACE_ID = 'ws-shubrend-main';
export const ADMIN_BOOTSTRAPPED_EMAILS = [
  'assalomu408@gmail.com',
  'assdsh993@gmail.com',
  'a1sanjar73@gmail.com',
  'a40921995@gmail.com',
  'staff.998889260404@shubrend.internal',
] as const;
export const ADMIN_BOOTSTRAPPED_EMAIL = ADMIN_BOOTSTRAPPED_EMAILS[0];

export class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessRuleError';
  }
}

export function isBootstrappedAdminEmail(email?: string | null): boolean {
  const normalized = (email || '').trim().toLowerCase();
  return (ADMIN_BOOTSTRAPPED_EMAILS as readonly string[]).includes(normalized);
}

// Pure-JS FIPS 180-4 SHA-256 so hashing works synchronously in all browser/test contexts
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256HexSync(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const withOneLen = bytes.length + 1;
  const padLen = withOneLen % 64 <= 56 ? 56 - (withOneLen % 64) : 120 - (withOneLen % 64);
  const totalLen = withOneLen + padLen + 8;
  const buf = new Uint8Array(totalLen);
  buf.set(bytes, 0);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalLen - 4, bitLen >>> 0, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  return Array.from(h)
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
}

export async function sha256Hex(raw: string): Promise<string> {
  const normalized = String(raw || '').trim().toLowerCase();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const data = new TextEncoder().encode(normalized);
      const hashBuf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback to pure-JS implementation
    }
  }
  return sha256HexSync(normalized);
}

export function hashStaffSecret(raw: string): string {
  const clean = String(raw || '').trim();
  if (!clean) return '';
  return `sha256:${sha256HexSync(clean)}`;
}

const SECRET_INTEGRATION_KEYS = [
  'ofdApiKey',
  'clickSecretKey',
  'paymeSecretKey',
  'uzumApiKey',
  'smsApiKey',
  'telegramBotToken',
  'externalApiKey',
  'marketplaceApiKey',
] as const;

export interface WorkspaceContext {
  workspaceId: string;
  uid: string;
  email: string;
  displayName: string;
  ownerUid: string;
  memberUids: string[];
  adminUids: string[];
  invitedEmails: string[];
  isWsAdmin: boolean;
  isPlatformAdmin: boolean;
  roleId: RoleId;
  assignedStoreIds: string[];
  staffId?: string;
}

export function sanitizeId(raw: string): string {
  const clean = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return clean || 'doc';
}

export function stockItemDocId(warehouseId: string, variantId: string): string {
  return `${sanitizeId(warehouseId)}__${sanitizeId(variantId)}`.slice(0, 128);
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== 'object') return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

function toIsoString(val: unknown, fallback?: string): string {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) return val;
  return fallback || new Date().toISOString();
}

function clampStr(val: unknown, max: number, fallback = ''): string {
  const str = typeof val === 'string' ? val : val == null ? fallback : String(val);
  return str.slice(0, max);
}

function nonEmptyStr(val: unknown, max: number, fallback: string): string {
  const s = clampStr(val, max, fallback).trim();
  return s.length > 0 ? s : fallback.slice(0, max);
}

export function mapAppPermissionsToRuleTokens(
  perms: Permission[],
  roleId?: RoleId
): string[] {
  const tokens = new Set<string>();
  if (roleId === 'owner' || roleId === 'admin') {
    return [
      'manage_products',
      'manage_stock',
      'sell',
      'refund',
      'manage_finance',
      'manage_customers',
      'manage_marketing',
      'manage_employees',
    ];
  }
  const has = (p: Permission) => perms.includes(p);
  if (has('edit_catalog') || has('bulk_edit_prices')) tokens.add('manage_products');
  if (has('manage_inventory')) tokens.add('manage_stock');
  // Every active staff role receives 'sell' token automatically
  tokens.add('sell');
  if (has('process_returns')) tokens.add('refund');
  if (has('manage_finance') || has('manage_settings')) tokens.add('manage_finance');
  if (has('manage_customers') || has('manage_debts')) tokens.add('manage_customers');
  if (has('manage_customers')) tokens.add('manage_marketing');
  if (has('manage_employees')) tokens.add('manage_employees');
  return Array.from(tokens);
}

export function stripIntegrationSecrets(integrations: AppSettings['integrations']): AppSettings['integrations'] {
  const copy: Record<string, unknown> = { ...integrations };
  for (const key of SECRET_INTEGRATION_KEYS) {
    delete copy[key];
  }
  return stripUndefinedDeep(copy) as AppSettings['integrations'];
}

function extractIntegrationSecrets(integrations: AppSettings['integrations']): Partial<AppSettings['integrations']> {
  const out: Record<string, unknown> = {};
  for (const key of SECRET_INTEGRATION_KEYS) {
    if (integrations[key] !== undefined) {
      out[key] = integrations[key];
    }
  }
  return stripUndefinedDeep(out) as Partial<AppSettings['integrations']>;
}

function sanitizeSettingsForWorkspace(settings: AppSettings): AppSettings {
  return stripUndefinedDeep({
    ...settings,
    integrations: stripIntegrationSecrets(settings.integrations),
  });
}

function sanitizeRolesForWorkspace(roles: Role[]): Role[] {
  return roles.slice(0, 20).map((r) =>
    stripUndefinedDeep({
      id: r.id,
      nameUz: nonEmptyStr(r.nameUz, 80, r.id),
      nameRu: nonEmptyStr(r.nameRu, 80, r.nameUz || r.id),
      permissions: Array.isArray(r.permissions) ? r.permissions.slice(0, 30) : [],
    })
  );
}

// --- Serializers aligned 1:1 with firestore.rules ---

function withTenantCreate<T extends Record<string, unknown>>(
  base: T,
  ctx: { ownerUid: string; memberUids: string[]; uid: string },
  storeId: string
): T & {
  storeId: string;
  ownerUid: string;
  memberUids: string[];
  createdBy: string;
  createdAt: FieldValue;
  updatedAt: FieldValue;
} {
  return {
    ...stripUndefinedDeep(base),
    storeId: nonEmptyStr(storeId, 128, 'store-chilonzor'),
    ownerUid: ctx.ownerUid,
    memberUids: Array.from(new Set([ctx.ownerUid, ...ctx.memberUids])).slice(0, 50),
    createdBy: nonEmptyStr(base.createdBy || ctx.uid, 128, ctx.uid),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as T & {
    storeId: string;
    ownerUid: string;
    memberUids: string[];
    createdBy: string;
    createdAt: FieldValue;
    updatedAt: FieldValue;
  };
}

function serializeStore(s: Store, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(s.id),
      name: nonEmptyStr(s.name, 120, 'Store'),
      address: clampStr(s.address, 300, ''),
      phone: clampStr(s.phone, 40, ''),
      isActive: Boolean(s.isActive),
      defaultWarehouseId: clampStr(s.defaultWarehouseId, 128, ''),
      ...(s.storeCode ? { storeCode: clampStr(s.storeCode, 20) } : {}),
      ...(s.color ? { color: clampStr(s.color, 20) } : {}),
      createdBy: s.createdBy || ctx.uid,
    },
    ctx,
    s.storeId || s.id
  );
}

function serializeWarehouse(w: Warehouse, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(w.id),
      name: nonEmptyStr(w.name, 120, 'Ombor'),
      address: clampStr(w.address, 300, ''),
      isMain: Boolean(w.isMain),
      createdBy: w.createdBy || ctx.uid,
    },
    ctx,
    w.storeId
  );
}

function serializeCategory(c: Category, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  const nameUz = nonEmptyStr(c.nameUz, 120, 'Kategoriya');
  const nameRu = nonEmptyStr(c.nameRu, 120, nameUz);
  return withTenantCreate(
    {
      id: sanitizeId(c.id),
      nameUz,
      nameRu,
      ...(c.parentId ? { parentId: clampStr(c.parentId, 128) } : {}),
      sortOrder: Number(c.sortOrder) || 0,
      createdBy: c.createdBy || ctx.uid,
    },
    ctx,
    c.storeId
  );
}

function serializeBrand(b: Brand, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(b.id),
      name: nonEmptyStr(b.name, 120, 'Brend'),
      ...(b.country ? { country: clampStr(b.country, 80) } : {}),
      createdBy: b.createdBy || ctx.uid,
    },
    ctx,
    b.storeId
  );
}

function serializeProduct(p: Product, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  const variants = (p.variants || []).slice(0, 50).map((v) =>
    stripUndefinedDeep({
      id: sanitizeId(v.id),
      productId: sanitizeId(p.id),
      sku: nonEmptyStr(v.sku, 80, 'SKU'),
      ...(v.size ? { size: clampStr(v.size, 60) } : {}),
      ...(v.color ? { color: clampStr(v.color, 60) } : {}),
      purchasePrice: Number(v.purchasePrice) || 0,
      retailPrice: Number(v.retailPrice) || 0,
      wholesalePrice: Number(v.wholesalePrice) || 0,
      minStock: Number(v.minStock) || 0,
      barcodes: Array.isArray(v.barcodes) ? v.barcodes.slice(0, 20).map(String) : [],
      storeId: nonEmptyStr(v.storeId || p.storeId, 128, p.storeId),
      createdAt: v.createdAt || p.createdAt || new Date().toISOString(),
      updatedAt: v.updatedAt || p.updatedAt || new Date().toISOString(),
      createdBy: v.createdBy || p.createdBy || ctx.uid,
    })
  );
  if (variants.length === 0) {
    const nowIso = new Date().toISOString();
    variants.push({
      id: `var-${sanitizeId(p.id)}`,
      productId: sanitizeId(p.id),
      sku: `SKU-${sanitizeId(p.id).slice(-6)}`,
      purchasePrice: 0,
      retailPrice: 0,
      wholesalePrice: 0,
      minStock: 0,
      barcodes: [],
      storeId: p.storeId,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: ctx.uid,
    });
  }
  const safePhoto =
    typeof p.photoUrl === 'string' && p.photoUrl.length > 0 && p.photoUrl.length <= 150000
      ? p.photoUrl
      : undefined;

  return withTenantCreate(
    {
      id: sanitizeId(p.id),
      name: nonEmptyStr(p.name, 200, 'Mahsulot'),
      categoryId: nonEmptyStr(p.categoryId, 128, 'cat-shirts'),
      ...(p.brandId ? { brandId: clampStr(p.brandId, 128) } : {}),
      ...(p.collection ? { collection: clampStr(p.collection, 120) } : {}),
      unit: ['dona', 'juft', 'kg', 'litr', 'quti', 'metr'].includes(p.unit) ? p.unit : 'dona',
      ...(p.description ? { description: clampStr(p.description, 1000) } : {}),
      ...(safePhoto ? { photoUrl: safePhoto } : {}),
      ...(p.supplierId ? { supplierId: clampStr(p.supplierId, 128) } : {}),
      tags: Array.isArray(p.tags) ? p.tags.slice(0, 30).map(String) : [],
      isPublishedOnline: Boolean(p.isPublishedOnline),
      variants,
      createdBy: p.createdBy || ctx.uid,
    },
    ctx,
    p.storeId
  );
}

function serializeSupplier(s: Supplier, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(s.id),
      name: nonEmptyStr(s.name, 150, "Ta'minotchi"),
      contactName: clampStr(s.contactName, 120, ''),
      phone: clampStr(s.phone, 40, ''),
      ...(s.address ? { address: clampStr(s.address, 300) } : {}),
      ...(s.notes ? { notes: clampStr(s.notes, 500) } : {}),
      debtBalance: Number(s.debtBalance) || 0,
      createdBy: s.createdBy || ctx.uid,
    },
    ctx,
    s.storeId
  );
}

function serializeStockItem(si: StockItem, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  const docId = stockItemDocId(si.warehouseId, si.variantId);
  return withTenantCreate(
    {
      id: docId,
      productId: clampStr(si.productId, 128),
      variantId: clampStr(si.variantId, 128),
      warehouseId: clampStr(si.warehouseId, 128),
      qty: Number(si.qty) || 0,
      createdBy: si.createdBy || ctx.uid,
    },
    ctx,
    si.storeId
  );
}

function serializeStockMovement(m: StockMovement, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(m.id),
      productId: clampStr(m.productId, 128),
      variantId: clampStr(m.variantId, 128),
      warehouseId: clampStr(m.warehouseId, 128),
      type: clampStr(m.type, 40, 'kirim'),
      qtyDelta: Number(m.qtyDelta) || 0,
      qtyAfter: Number(m.qtyAfter) || 0,
      unitCost: Number(m.unitCost) || 0,
      ...(m.referenceId ? { referenceId: clampStr(m.referenceId, 128) } : {}),
      ...(m.referenceType ? { referenceType: clampStr(m.referenceType, 64) } : {}),
      ...(m.note ? { note: clampStr(m.note, 500) } : {}),
      createdBy: m.createdBy || ctx.uid,
    },
    ctx,
    m.storeId
  );
}

function serializePurchaseReceipt(pr: PurchaseReceipt, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(pr.id),
      number: nonEmptyStr(pr.number, 64, 'KIR-001'),
      supplierId: clampStr(pr.supplierId, 128),
      warehouseId: clampStr(pr.warehouseId, 128),
      ...(pr.categoryId ? { categoryId: clampStr(pr.categoryId, 128) } : {}),
      items: (pr.items || []).slice(0, 200),
      totalAmount: Math.max(0, Number(pr.totalAmount) || 0),
      paidAmount: Math.max(0, Number(pr.paidAmount) || 0),
      paymentStatus: pr.paymentStatus,
      ...(pr.note ? { note: clampStr(pr.note, 500) } : {}),
      createdBy: pr.createdBy || ctx.uid,
    },
    ctx,
    pr.storeId
  );
}

function serializePurchaseOrder(po: PurchaseOrder, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(po.id),
      number: nonEmptyStr(po.number, 64, 'BUY-001'),
      supplierId: clampStr(po.supplierId, 128),
      warehouseId: clampStr(po.warehouseId, 128),
      items: (po.items || []).slice(0, 200),
      totalAmount: Math.max(0, Number(po.totalAmount) || 0),
      status: po.status,
      ...(po.expectedDate ? { expectedDate: clampStr(po.expectedDate, 64) } : {}),
      ...(po.note ? { note: clampStr(po.note, 500) } : {}),
      createdBy: po.createdBy || ctx.uid,
    },
    ctx,
    po.storeId
  );
}

function serializeTransfer(tr: Transfer, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(tr.id),
      number: nonEmptyStr(tr.number, 64, 'TRF-001'),
      fromWarehouseId: clampStr(tr.fromWarehouseId, 128),
      toWarehouseId: clampStr(tr.toWarehouseId, 128),
      items: (tr.items || []).slice(0, 200),
      status: tr.status,
      ...(tr.note ? { note: clampStr(tr.note, 500) } : {}),
      createdBy: tr.createdBy || ctx.uid,
    },
    ctx,
    tr.storeId
  );
}

function serializeWriteOff(wo: WriteOff, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(wo.id),
      number: nonEmptyStr(wo.number, 64, 'CHI-001'),
      warehouseId: clampStr(wo.warehouseId, 128),
      reason: wo.reason,
      items: (wo.items || []).slice(0, 200),
      totalCost: Math.max(0, Number(wo.totalCost) || 0),
      ...(wo.note ? { note: clampStr(wo.note, 500) } : {}),
      createdBy: wo.createdBy || ctx.uid,
    },
    ctx,
    wo.storeId
  );
}

function serializeStocktake(st: Stocktake, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(st.id),
      number: nonEmptyStr(st.number, 64, 'INV-001'),
      warehouseId: clampStr(st.warehouseId, 128),
      status: st.status,
      items: (st.items || []).slice(0, 500),
      totalDiscrepancyValue: Number(st.totalDiscrepancyValue) || 0,
      ...(st.note ? { note: clampStr(st.note, 500) } : {}),
      createdBy: st.createdBy || ctx.uid,
    },
    ctx,
    st.storeId
  );
}

function serializeSale(s: Sale, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(s.id),
      receiptNumber: nonEmptyStr(s.receiptNumber, 64, '#0001'),
      warehouseId: clampStr(s.warehouseId, 128),
      ...(s.shiftId ? { shiftId: clampStr(s.shiftId, 128) } : {}),
      cashierId: clampStr(s.cashierId, 128),
      cashierName: clampStr(s.cashierName, 120, 'Kassir'),
      ...(s.customerId ? { customerId: clampStr(s.customerId, 128) } : {}),
      ...(s.customerName ? { customerName: clampStr(s.customerName, 120) } : {}),
      items: (s.items || []).slice(0, 200),
      subtotal: Math.max(0, Number(s.subtotal) || 0),
      checkDiscountAmount: Math.max(0, Number(s.checkDiscountAmount) || 0),
      checkDiscountPercent: Math.max(0, Number(s.checkDiscountPercent) || 0),
      loyaltyPointsSpent: Math.max(0, Number(s.loyaltyPointsSpent) || 0),
      loyaltyPointsEarned: Math.max(0, Number(s.loyaltyPointsEarned) || 0),
      ...(s.promoCode ? { promoCode: clampStr(s.promoCode, 64) } : {}),
      vatAmount: Math.max(0, Number(s.vatAmount) || 0),
      totalAmount: Math.max(0, Number(s.totalAmount) || 0),
      costTotal: Math.max(0, Number(s.costTotal) || 0),
      payments: (s.payments || []).slice(0, 20),
      paidAmount: Math.max(0, Number(s.paidAmount) || 0),
      debtAmount: Math.max(0, Number(s.debtAmount) || 0),
      ...(s.cashGiven !== undefined ? { cashGiven: Number(s.cashGiven) } : {}),
      ...(s.changeAmount !== undefined ? { changeAmount: Number(s.changeAmount) } : {}),
      ...(s.paidAt ? { paidAt: clampStr(s.paidAt, 64) } : {}),
      status: s.status,
      ...(s.offlineCreated !== undefined ? { offlineCreated: Boolean(s.offlineCreated) } : {}),
      ...(s.syncedAt ? { syncedAt: clampStr(s.syncedAt, 64) } : {}),
      fiscalStatus: s.fiscalStatus || 'not_configured',
      ...(s.fiscalReceiptId ? { fiscalReceiptId: clampStr(s.fiscalReceiptId, 128) } : {}),
      ...(s.note ? { note: clampStr(s.note, 500) } : {}),
      createdBy: s.createdBy || ctx.uid,
    },
    ctx,
    s.storeId
  );
}

function serializeReturnDoc(r: Return, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(r.id),
      number: nonEmptyStr(r.number, 64, 'QAY-001'),
      saleId: clampStr(r.saleId, 128),
      receiptNumber: clampStr(r.receiptNumber, 64),
      warehouseId: clampStr(r.warehouseId, 128),
      items: (r.items || []).slice(0, 200),
      totalRefund: Math.max(0, Number(r.totalRefund) || 0),
      refundMethod: clampStr(r.refundMethod, 32, 'cash'),
      reason: clampStr(r.reason, 300, ''),
      ...(r.isExchange !== undefined ? { isExchange: Boolean(r.isExchange) } : {}),
      createdBy: r.createdBy || ctx.uid,
    },
    ctx,
    r.storeId
  );
}

function serializeCashShift(sh: CashShift, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(sh.id),
      number: clampStr(sh.number, 64, 'SM-001'),
      cashierId: clampStr(sh.cashierId, 128),
      cashierName: clampStr(sh.cashierName, 120, 'Kassir'),
      openedAt: clampStr(sh.openedAt, 64),
      ...(sh.closedAt ? { closedAt: clampStr(sh.closedAt, 64) } : {}),
      startingCash: Number(sh.startingCash) || 0,
      cashSalesTotal: Number(sh.cashSalesTotal) || 0,
      cardSalesTotal: Number(sh.cardSalesTotal) || 0,
      otherSalesTotal: Number(sh.otherSalesTotal) || 0,
      cashRefundsTotal: Number(sh.cashRefundsTotal) || 0,
      cashInTotal: Number(sh.cashInTotal) || 0,
      cashOutTotal: Number(sh.cashOutTotal) || 0,
      expectedCash: Number(sh.expectedCash) || 0,
      ...(sh.actualCash !== undefined ? { actualCash: Number(sh.actualCash) } : {}),
      ...(sh.discrepancy !== undefined ? { discrepancy: Number(sh.discrepancy) } : {}),
      status: sh.status,
      ...(sh.notes ? { notes: clampStr(sh.notes, 500) } : {}),
      createdBy: sh.createdBy || ctx.uid,
    },
    ctx,
    sh.storeId
  );
}

function serializeCashOperation(op: CashOperation, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(op.id),
      shiftId: clampStr(op.shiftId, 128),
      type: op.type,
      amount: Math.max(0, Number(op.amount) || 0),
      reason: clampStr(op.reason, 300, ''),
      createdBy: op.createdBy || ctx.uid,
    },
    ctx,
    op.storeId
  );
}

function serializeAccount(acc: Account, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(acc.id),
      name: nonEmptyStr(acc.name, 120, 'Hisob'),
      type: acc.type,
      balance: Number(acc.balance) || 0,
      ...(acc.isDefault !== undefined ? { isDefault: Boolean(acc.isDefault) } : {}),
      createdBy: acc.createdBy || ctx.uid,
    },
    ctx,
    acc.storeId
  );
}

function serializeFinanceTransaction(tr: Transaction, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(tr.id),
      accountId: clampStr(tr.accountId, 128),
      ...(tr.toAccountId ? { toAccountId: clampStr(tr.toAccountId, 128) } : {}),
      type: tr.type,
      category: clampStr(tr.category, 80, ''),
      amount: Math.max(0, Number(tr.amount) || 0),
      description: clampStr(tr.description, 300, ''),
      ...(tr.referenceId ? { referenceId: clampStr(tr.referenceId, 128) } : {}),
      createdBy: tr.createdBy || ctx.uid,
    },
    ctx,
    tr.storeId
  );
}

function serializeExpense(exp: Expense, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(exp.id),
      accountId: clampStr(exp.accountId, 128),
      category: exp.category,
      amount: Math.max(0, Number(exp.amount) || 0),
      description: clampStr(exp.description, 300, ''),
      isRecurring: Boolean(exp.isRecurring),
      ...(exp.recurringDay !== undefined ? { recurringDay: Number(exp.recurringDay) } : {}),
      date: clampStr(exp.date, 64),
      createdBy: exp.createdBy || ctx.uid,
    },
    ctx,
    exp.storeId
  );
}

function serializeCustomer(c: Customer, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(c.id),
      name: nonEmptyStr(c.name, 120, 'Mijoz'),
      phone: clampStr(c.phone, 40, ''),
      ...(c.birthday ? { birthday: clampStr(c.birthday, 32) } : {}),
      ...(c.gender ? { gender: c.gender } : {}),
      ...(c.notes ? { notes: clampStr(c.notes, 500) } : {}),
      tags: Array.isArray(c.tags) ? c.tags.slice(0, 30).map(String) : [],
      segment: c.segment || 'new',
      totalSpent: Math.max(0, Number(c.totalSpent) || 0),
      ordersCount: Math.max(0, Number(c.ordersCount) || 0),
      ...(c.lastPurchaseAt ? { lastPurchaseAt: clampStr(c.lastPurchaseAt, 64) } : {}),
      debtBalance: Number(c.debtBalance) || 0,
      createdBy: c.createdBy || ctx.uid,
    },
    ctx,
    c.storeId
  );
}

function serializeLoyaltyAccount(la: LoyaltyAccount, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(la.id),
      customerId: clampStr(la.customerId, 128),
      tier: la.tier,
      cashbackPercent: Math.max(0, Number(la.cashbackPercent) || 0),
      pointsBalance: Number(la.pointsBalance) || 0,
      cardNumber: clampStr(la.cardNumber, 64, ''),
      ...(la.expiresAt ? { expiresAt: clampStr(la.expiresAt, 64) } : {}),
      createdBy: la.createdBy || ctx.uid,
    },
    ctx,
    la.storeId
  );
}

function serializeLoyaltyTransaction(lt: LoyaltyTransaction, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(lt.id),
      customerId: clampStr(lt.customerId, 128),
      loyaltyAccountId: clampStr(lt.loyaltyAccountId, 128),
      type: lt.type,
      points: Number(lt.points) || 0,
      ...(lt.saleId ? { saleId: clampStr(lt.saleId, 128) } : {}),
      ...(lt.expiresAt ? { expiresAt: clampStr(lt.expiresAt, 64) } : {}),
      ...(lt.note ? { note: clampStr(lt.note, 300) } : {}),
      createdBy: lt.createdBy || ctx.uid,
    },
    ctx,
    lt.storeId
  );
}

function serializeDebt(d: Debt, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(d.id),
      customerId: clampStr(d.customerId, 128),
      customerName: clampStr(d.customerName, 120, ''),
      ...(d.saleId ? { saleId: clampStr(d.saleId, 128) } : {}),
      originalAmount: Math.max(0, Number(d.originalAmount) || 0),
      remainingAmount: Math.max(0, Number(d.remainingAmount) || 0),
      ...(d.dueDate ? { dueDate: clampStr(d.dueDate, 64) } : {}),
      status: d.status,
      payments: (d.payments || []).slice(0, 100),
      createdBy: d.createdBy || ctx.uid,
    },
    ctx,
    d.storeId
  );
}

function serializePromoCode(p: PromoCode, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(p.id),
      code: nonEmptyStr(p.code, 64, 'PROMO'),
      discountType: p.discountType,
      discountValue: Math.max(0, Number(p.discountValue) || 0),
      minOrderAmount: Math.max(0, Number(p.minOrderAmount) || 0),
      maxUses: Math.max(0, Number(p.maxUses) || 0),
      usedCount: Math.max(0, Number(p.usedCount) || 0),
      ...(p.expiresAt ? { expiresAt: clampStr(p.expiresAt, 64) } : {}),
      isActive: Boolean(p.isActive),
      createdBy: p.createdBy || ctx.uid,
    },
    ctx,
    p.storeId
  );
}

function serializeStaffDirectoryEntry(
  user: User,
  emp: Employee | undefined,
  ctx: { ownerUid: string; memberUids: string[]; uid: string }
) {
  const staffId = sanitizeId(emp?.id || user.id);
  return withTenantCreate(
    {
      id: staffId,
      userId: sanitizeId(user.id),
      name: nonEmptyStr(emp?.name || user.name, 120, 'Xodim'),
      roleId: clampStr(emp?.roleId || user.roleId, 64, 'cashier'),
      assignedStoreIds: Array.isArray(user.assignedStoreIds)
        ? user.assignedStoreIds.slice(0, 20).map(String)
        : [emp?.storeId || user.storeId],
      ...(Array.isArray(user.customPermissions)
        ? { customPermissions: user.customPermissions.slice(0, 30) }
        : {}),
      isActive: Boolean(user.isActive),
      ...(user.avatarColor ? { avatarColor: clampStr(user.avatarColor, 20) } : {}),
      schedule: clampStr(emp?.schedule, 120, '2/2 smena'),
      createdBy: emp?.createdBy || user.createdBy || ctx.uid,
    },
    ctx,
    emp?.storeId || user.storeId
  );
}

function serializeStaffCredential(
  user: User,
  emp: Employee | undefined,
  ctx: { ownerUid: string; adminUids: string[]; uid: string }
) {
  const staffId = sanitizeId(emp?.id || user.id);
  const googleEmail = (emp?.googleEmail || user.googleEmail || '').trim().toLowerCase();
  const passwordHash = user.password?.trim()
    ? hashStaffSecret(user.password)
    : user.passwordHash || hashStaffSecret('123456');
  const pinHash = user.pin?.trim()
    ? hashStaffSecret(user.pin)
    : user.pinHash || hashStaffSecret('0000');

  return {
    id: staffId,
    userId: sanitizeId(user.id),
    phone: clampStr(emp?.phone || user.phone, 40, ''),
    passwordHash: clampStr(passwordHash, 256),
    pinHash: clampStr(pinHash, 256),
    hashAlgo: 'sha256' as const,
    authMigrated: true,
    ...(googleEmail ? { googleEmail: clampStr(googleEmail, 200) } : {}),
    baseSalary: Math.max(0, Number(emp?.baseSalary) || 0),
    commissionPercent: Math.max(0, Number(emp?.commissionPercent) || 0),
    hiredAt: clampStr(emp?.hiredAt || user.createdAt || new Date().toISOString(), 64),
    storeId: nonEmptyStr(emp?.storeId || user.storeId, 128, 'store-chilonzor'),
    ownerUid: ctx.ownerUid,
    adminUids: Array.from(new Set([ctx.ownerUid, ...ctx.adminUids])).slice(0, 20),
    createdBy: ctx.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function serializeStaffInvite(
  user: User,
  emp: Employee | undefined,
  roles: Role[],
  ctx: { ownerUid: string; adminUids: string[]; uid: string },
  emailHash: string
) {
  const staffId = sanitizeId(emp?.id || user.id);
  const effectiveRoleId = clampStr(emp?.roleId || user.roleId, 64, 'cashier') as RoleId;
  const effectiveRoleIdForInvite = (effectiveRoleId === 'owner' ? 'admin' : effectiveRoleId) as RoleId;
  const rolePerms =
    user.customPermissions ?? roles.find((r) => r.id === effectiveRoleId)?.permissions ?? [];
  const storeList =
    Array.isArray(user.assignedStoreIds) && user.assignedStoreIds.length > 0
      ? user.assignedStoreIds.slice(0, 20).map(String)
      : [nonEmptyStr(emp?.storeId || user.storeId, 128, 'store-chilonzor')];

  return {
    id: emailHash,
    staffId,
    userId: sanitizeId(user.id),
    roleId: effectiveRoleIdForInvite,
    assignedStoreIds: storeList,
    permissions: mapAppPermissionsToRuleTokens(rolePerms, effectiveRoleIdForInvite),
    ownerUid: ctx.ownerUid,
    adminUids: Array.from(new Set([ctx.ownerUid, ...ctx.adminUids])).slice(0, 20),
    createdBy: ctx.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function serializeTarget(tg: Target, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(tg.id),
      ...(tg.employeeId ? { employeeId: clampStr(tg.employeeId, 128) } : {}),
      month: clampStr(tg.month, 16),
      targetAmount: Math.max(0, Number(tg.targetAmount) || 0),
      createdBy: tg.createdBy || ctx.uid,
    },
    ctx,
    tg.storeId
  );
}

function serializeOnlineOrder(o: OnlineOrder, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(o.id),
      orderNumber: clampStr(o.orderNumber, 64, 'WEB-001'),
      customerName: nonEmptyStr(o.customerName, 120, 'Xaridor'),
      customerPhone: clampStr(o.customerPhone, 40, ''),
      deliveryAddress: clampStr(o.deliveryAddress, 300, ''),
      deliveryMethod: o.deliveryMethod,
      paymentMethod: o.paymentMethod,
      items: (o.items || []).slice(0, 100),
      totalAmount: Math.max(0, Number(o.totalAmount) || 0),
      status: o.status,
      ...(o.note ? { note: clampStr(o.note, 500) } : {}),
      createdBy: o.createdBy || ctx.uid,
    },
    ctx,
    o.storeId
  );
}

function serializeAuditLog(a: AuditLog, ctx: { ownerUid: string; memberUids: string[]; uid: string }) {
  return withTenantCreate(
    {
      id: sanitizeId(a.id),
      userId: clampStr(a.userId, 128, ctx.uid),
      userName: clampStr(a.userName, 120, 'Tizim'),
      action: clampStr(a.action, 80, 'settings_change'),
      entityType: clampStr(a.entityType, 64, 'System'),
      entityId: clampStr(a.entityId, 128, '0'),
      details: clampStr(a.details || a.summary || a.action, 500, ''),
      createdBy: a.createdBy || ctx.uid,
    },
    ctx,
    a.storeId
  );
}

// --- Batch Helper (keeps batches <= 350 writes) ---

class ChunkedBatchWriter {
  private ops: { fn: (batch: WriteBatch) => void }[] = [];

  add(fn: (batch: WriteBatch) => void) {
    this.ops.push({ fn });
  }

  async commitAll(pathLabel: string): Promise<void> {
    const CHUNK = 350;
    for (let i = 0; i < this.ops.length; i += CHUNK) {
      const slice = this.ops.slice(i, i + CHUNK);
      const batch = writeBatch(firestoreDb);
      for (const op of slice) {
        op.fn(batch);
      }
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, pathLabel);
      }
    }
  }
}

function buildInvitedEmailsFromSnapshot(snapshot: DatabaseSnapshot): string[] {
  const emails = new Set<string>(ADMIN_BOOTSTRAPPED_EMAILS);
  snapshot.users.forEach((u) => {
    if (!u.isActive) return;
    const phoneEmail = phoneToInternalEmail(u.phone);
    if (phoneEmail) emails.add(phoneEmail);
    if (u.googleEmail && u.googleEmail.trim()) {
      emails.add(u.googleEmail.trim().toLowerCase());
    }
  });
  snapshot.employees.forEach((e) => {
    const phoneEmail = phoneToInternalEmail(e.phone);
    if (phoneEmail) emails.add(phoneEmail);
    if (e.googleEmail && e.googleEmail.trim()) {
      emails.add(e.googleEmail.trim().toLowerCase());
    }
  });
  return Array.from(emails).slice(0, 50);
}

// --- Bootstrap / Join Workspace ---

export async function bootstrapOrJoinWorkspace(
  fbUser: FirebaseUser,
  localSnapshot: DatabaseSnapshot
): Promise<WorkspaceContext> {
  const uid = fbUser.uid;
  const email = (fbUser.email || '').trim().toLowerCase();
  const displayName = nonEmptyStr(fbUser.displayName || email.split('@')[0] || 'Xodim', 120, 'Xodim');

  // 1. Bootstrap platform admin record if bootstrapped owner email or resolve existing admin record
  let isPlatformAdmin = isBootstrappedAdminEmail(email);
  const adminRef = doc(firestoreDb, 'admins', uid);
  if (isPlatformAdmin) {
    try {
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists()) {
        await setDoc(adminRef, {
          id: uid,
          email,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `admins/${uid}`);
    }
  } else {
    try {
      const adminSnap = await getDoc(adminRef);
      isPlatformAdmin = adminSnap.exists();
    } catch {
      isPlatformAdmin = false;
    }
  }

  // 2. Upsert userProfile & private info
  const profileRef = doc(firestoreDb, 'userProfiles', uid);
  try {
    const profSnap = await getDoc(profileRef);
    if (!profSnap.exists()) {
      await setDoc(profileRef, {
        id: uid,
        displayName,
        activeWorkspaceId: PRIMARY_WORKSPACE_ID,
        workspaceIds: [PRIMARY_WORKSPACE_ID],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const pd = profSnap.data();
      const existingWsIds = Array.isArray(pd?.workspaceIds)
        ? pd.workspaceIds.map((w: unknown) => String(w)).filter(Boolean)
        : [];
      const nextWsIds = existingWsIds.includes(PRIMARY_WORKSPACE_ID)
        ? existingWsIds.slice(0, 20)
        : [PRIMARY_WORKSPACE_ID, ...existingWsIds].slice(0, 20);
      await updateDoc(profileRef, {
        displayName,
        activeWorkspaceId: PRIMARY_WORKSPACE_ID,
        workspaceIds: nextWsIds,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `userProfiles/${uid}`);
  }

  const privateInfoRef = doc(firestoreDb, 'userProfiles', uid, 'private', 'info');
  try {
    await setDoc(privateInfoRef, {
      id: uid,
      email,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `userProfiles/${uid}/private/info`);
  }

  // 3. Check primary shared workspace
  const wsRef = doc(firestoreDb, 'workspaces', PRIMARY_WORKSPACE_ID);
  let wsSnap;
  try {
    wsSnap = await getDoc(wsRef);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('insufficient')) {
      throw new Error(
        "Ushbu xodim hisobi hali umumiy ish maydoniga biriktirilmagan. Admindan Xodimlar bo'limidan ruxsat berishini so'rang."
      );
    }
    handleFirestoreError(err, OperationType.GET, `workspaces/${PRIMARY_WORKSPACE_ID}`);
  }

  // Case A: Workspace does not exist yet -> only owner initializes & migrates snapshot
  if (!wsSnap.exists()) {
    if (!isBootstrappedAdminEmail(email)) {
      throw new Error(
        "Umumiy baza hali yaratilmagan. Avval do'kon egasi (+998 88 926 04 04) tizimga kirishi kerak."
      );
    }

    const invitedEmails = buildInvitedEmailsFromSnapshot(localSnapshot);
    const ownerStaffId = sanitizeId(
      localSnapshot.employees.find((e) => e.roleId === 'owner')?.id || 'usr-owner'
    );
    const ownerRole = localSnapshot.roles.find((r) => r.id === 'owner');
    const ownerPerms = mapAppPermissionsToRuleTokens(ownerRole?.permissions ?? [], 'owner');

    try {
      await setDoc(wsRef, {
        id: PRIMARY_WORKSPACE_ID,
        name: nonEmptyStr(localSnapshot.settings.brandName, 120, 'SHU BREND OMBOR'),
        ownerUid: uid,
        ownerEmail: email,
        memberUids: [uid],
        adminUids: [uid],
        invitedEmails,
        roles: sanitizeRolesForWorkspace(localSnapshot.roles),
        settings: sanitizeSettingsForWorkspace(localSnapshot.settings),
        version: Math.max(1, Number(localSnapshot.version) || 3),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(firestoreDb, 'workspaces', PRIMARY_WORKSPACE_ID, 'members', uid), {
        uid,
        staffId: ownerStaffId,
        displayName,
        roleId: 'owner',
        assignedStoreIds: [],
        permissions: ownerPerms,
        isActive: true,
        ownerUid: uid,
        memberUids: [uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(firestoreDb, 'workspaces', PRIMARY_WORKSPACE_ID, 'privateSettings', 'integrations'), {
        id: 'integrations',
        integrations: stripUndefinedDeep(localSnapshot.settings.integrations || {}),
        ownerUid: uid,
        adminUids: [uid],
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `workspaces/${PRIMARY_WORKSPACE_ID}`);
    }

    await migrateSnapshotToWorkspace(
      {
        ownerUid: uid,
        memberUids: [uid],
        adminUids: [uid],
        uid,
        workspaceId: PRIMARY_WORKSPACE_ID,
      },
      localSnapshot
    );

    return {
      workspaceId: PRIMARY_WORKSPACE_ID,
      uid,
      email,
      displayName,
      ownerUid: uid,
      memberUids: [uid],
      adminUids: [uid],
      invitedEmails,
      isWsAdmin: true,
      isPlatformAdmin,
      roleId: 'owner',
      assignedStoreIds: [],
      staffId: ownerStaffId,
    };
  }

  // Case B: Workspace exists -> Verify membership or claim seat via invitedEmails
  const wsData = wsSnap.data();
  const ownerUid = String(wsData.ownerUid || uid);
  let memberUids: string[] = Array.isArray(wsData.memberUids) ? [...wsData.memberUids] : [];
  let adminUids: string[] = Array.isArray(wsData.adminUids) ? [...wsData.adminUids] : [];
  const invitedEmails: string[] = Array.isArray(wsData.invitedEmails)
    ? wsData.invitedEmails.map((e: string) => String(e).toLowerCase())
    : [];

  const isOwner = ownerUid === uid || isBootstrappedAdminEmail(email);
  const isAdminMember = isOwner || adminUids.includes(uid);
  const isInvited = invitedEmails.includes(email);

  if (!isOwner && !memberUids.includes(uid) && !adminUids.includes(uid) && !isInvited) {
    throw new Error(
      "Sizning xodim hisobingiz ushbu ish maydoniga biriktirilmagan. Administrator bilan bog'laning."
    );
  }

  // Ensure UID is in memberUids (and adminUids if owner/bootstrapped admin)
  if (!memberUids.includes(uid) || (isOwner && !adminUids.includes(uid))) {
    memberUids = Array.from(new Set([...memberUids, uid]));
    if (isOwner && !adminUids.includes(uid)) {
      adminUids = Array.from(new Set([...adminUids, uid]));
    }
    try {
      await updateDoc(wsRef, {
        memberUids,
        ...(isOwner ? { adminUids } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `workspaces/${PRIMARY_WORKSPACE_ID}`);
    }
  }

  // Ensure member doc exists
  const memberRef = doc(firestoreDb, 'workspaces', PRIMARY_WORKSPACE_ID, 'members', uid);
  let roleId: RoleId = isOwner ? 'owner' : 'cashier';
  let assignedStoreIds: string[] = [];
  let staffId: string | undefined;

  try {
    const mSnap = await getDoc(memberRef);
    if (!mSnap.exists()) {
      let matchedRole: RoleId = isOwner ? 'owner' : 'cashier';
      let inviteStoreIds: string[] = [];
      let invitePerms: string[] | null = null;
      staffId = isOwner ? 'usr-owner' : sanitizeId(`staff-${uid.slice(0, 12)}`);

      if (!isOwner && email) {
        try {
          const emailHash = await sha256Hex(email);
          const inviteSnap = await getDoc(
            doc(firestoreDb, 'workspaces', PRIMARY_WORKSPACE_ID, 'staffInvites', emailHash)
          );
          if (inviteSnap.exists()) {
            const inv = inviteSnap.data();
            if (inv.staffId) staffId = sanitizeId(String(inv.staffId));
            if (inv.roleId && inv.roleId !== 'owner') {
              matchedRole = String(inv.roleId) as RoleId;
            }
            if (Array.isArray(inv.assignedStoreIds)) {
              inviteStoreIds = inv.assignedStoreIds.slice(0, 20).map(String);
            }
            if (Array.isArray(inv.permissions)) {
              invitePerms = inv.permissions.slice(0, 30).map(String);
            }
          }
        } catch {
          // fallback if staffInvites doc does not exist yet
        }
      }

      if (!isOwner && inviteStoreIds.length === 0) {
        inviteStoreIds = [localSnapshot.stores[0]?.id || 'store-chilonzor'];
      }

      const defaultPerms =
        invitePerms ??
        (isOwner
          ? mapAppPermissionsToRuleTokens([], matchedRole)
          : ['sell', 'manage_customers']);

      await setDoc(memberRef, {
        uid,
        staffId,
        displayName,
        roleId: matchedRole,
        assignedStoreIds: inviteStoreIds,
        permissions: defaultPerms,
        isActive: true,
        ownerUid,
        memberUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      roleId = matchedRole;
      assignedStoreIds = inviteStoreIds;
    } else {
      const md = mSnap.data();
      if (md.isActive === false) {
        throw new Error("Sizning xodim hisobingiz faolsizlantirilgan. Administrator bilan bog'laning.");
      }
      roleId = (md.roleId as RoleId) || roleId;
      assignedStoreIds = Array.isArray(md.assignedStoreIds) ? md.assignedStoreIds : [];
      staffId = md.staffId ? String(md.staffId) : undefined;
      if (
        (isAdminMember || roleId === 'owner' || roleId === 'admin') &&
        (!Array.isArray(md.permissions) || !md.permissions.includes('sell'))
      ) {
        try {
          await updateDoc(memberRef, {
            permissions: mapAppPermissionsToRuleTokens([], roleId),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // non-fatal self-heal
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('faolsizlantirilgan')) throw err;
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${PRIMARY_WORKSPACE_ID}/members/${uid}`);
  }

  const finalIsAdmin = isAdminMember || roleId === 'owner' || roleId === 'admin';

  // Ensure adminUids stays synchronized if member holds admin/owner role
  if (finalIsAdmin && !adminUids.includes(uid)) {
    adminUids = Array.from(new Set([...adminUids, uid]));
    try {
      await updateDoc(wsRef, { adminUids, updatedAt: serverTimestamp() });
    } catch {
      // non-fatal
    }
  }

  return {
    workspaceId: PRIMARY_WORKSPACE_ID,
    uid,
    email,
    displayName,
    ownerUid,
    memberUids,
    adminUids,
    invitedEmails,
    isWsAdmin: finalIsAdmin,
    isPlatformAdmin,
    roleId,
    assignedStoreIds,
    staffId,
  };
}

export async function migrateSnapshotToWorkspace(
  ctx: { workspaceId: string; ownerUid: string; memberUids: string[]; adminUids: string[]; uid: string },
  snapshot: DatabaseSnapshot
): Promise<void> {
  const writer = new ChunkedBatchWriter();
  const wsPath = `workspaces/${ctx.workspaceId}`;

  snapshot.stores.forEach((s) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'stores', sanitizeId(s.id)), serializeStore(s, ctx)));
  });
  snapshot.warehouses.forEach((w) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'warehouses', sanitizeId(w.id)), serializeWarehouse(w, ctx)));
  });
  snapshot.categories.forEach((c) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'categories', sanitizeId(c.id)), serializeCategory(c, ctx)));
  });
  snapshot.brands.forEach((br) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'brands', sanitizeId(br.id)), serializeBrand(br, ctx)));
  });
  snapshot.products.forEach((p) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'products', sanitizeId(p.id)), serializeProduct(p, ctx)));
  });
  snapshot.suppliers.forEach((sup) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'suppliers', sanitizeId(sup.id)), serializeSupplier(sup, ctx)));
  });

  // Deduplicate stockItems by warehouseId__variantId
  const seenStock = new Set<string>();
  snapshot.stockItems.forEach((si) => {
    const id = stockItemDocId(si.warehouseId, si.variantId);
    if (seenStock.has(id)) return;
    seenStock.add(id);
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'stockItems', id), serializeStockItem(si, ctx)));
  });

  snapshot.stockMovements.slice(0, 300).forEach((m) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'stockMovements', sanitizeId(m.id)), serializeStockMovement(m, ctx)));
  });
  snapshot.purchaseReceipts.forEach((pr) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'purchaseReceipts', sanitizeId(pr.id)), serializePurchaseReceipt(pr, ctx)));
  });
  snapshot.purchaseOrders.forEach((po) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'purchaseOrders', sanitizeId(po.id)), serializePurchaseOrder(po, ctx)));
  });
  snapshot.transfers.forEach((tr) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'transfers', sanitizeId(tr.id)), serializeTransfer(tr, ctx)));
  });
  snapshot.writeOffs.forEach((wo) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'writeOffs', sanitizeId(wo.id)), serializeWriteOff(wo, ctx)));
  });
  snapshot.stocktakes.forEach((st) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'stocktakes', sanitizeId(st.id)), serializeStocktake(st, ctx)));
  });
  snapshot.sales.forEach((s) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'sales', sanitizeId(s.id)), serializeSale(s, ctx)));
  });
  snapshot.returns.forEach((r) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'returns', sanitizeId(r.id)), serializeReturnDoc(r, ctx)));
  });
  snapshot.cashShifts.forEach((sh) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'cashShifts', sanitizeId(sh.id)), serializeCashShift(sh, ctx)));
  });
  snapshot.cashOperations.forEach((cop) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'cashOperations', sanitizeId(cop.id)), serializeCashOperation(cop, ctx)));
  });
  snapshot.accounts.forEach((acc) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'accounts', sanitizeId(acc.id)), serializeAccount(acc, ctx)));
  });
  snapshot.transactions.forEach((trx) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'transactions', sanitizeId(trx.id)), serializeFinanceTransaction(trx, ctx)));
  });
  snapshot.expenses.forEach((exp) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'expenses', sanitizeId(exp.id)), serializeExpense(exp, ctx)));
  });
  snapshot.customers.forEach((c) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'customers', sanitizeId(c.id)), serializeCustomer(c, ctx)));
  });
  snapshot.loyaltyAccounts.forEach((la) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'loyaltyAccounts', sanitizeId(la.id)), serializeLoyaltyAccount(la, ctx)));
  });
  snapshot.loyaltyTransactions.forEach((lt) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'loyaltyTransactions', sanitizeId(lt.id)), serializeLoyaltyTransaction(lt, ctx)));
  });
  snapshot.debts.forEach((d) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'debts', sanitizeId(d.id)), serializeDebt(d, ctx)));
  });
  snapshot.promoCodes.forEach((pr) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'promoCodes', sanitizeId(pr.id)), serializePromoCode(pr, ctx)));
  });

  // Staff split: directory (non-PII) + credentials (admin-only PII, hashed) + invites (zero-PII role bindings)
  const seenStaffUserIds = new Set<string>();
  const inviteEntries: { emailHash: string; data: ReturnType<typeof serializeStaffInvite> }[] = [];

  for (const emp of snapshot.employees) {
    seenStaffUserIds.add(emp.userId);
    const linkedUser = snapshot.users.find((u) => u.id === emp.userId);
    const userObj: User = linkedUser || {
      id: emp.userId,
      name: emp.name,
      phone: emp.phone,
      password: '123456',
      pin: '4444',
      googleEmail: emp.googleEmail,
      roleId: emp.roleId,
      assignedStoreIds: [emp.storeId],
      isActive: true,
      storeId: emp.storeId,
      createdAt: emp.createdAt,
      updatedAt: emp.updatedAt,
      createdBy: emp.createdBy,
    };
    const staffId = sanitizeId(emp.id);
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'staffDirectory', staffId), serializeStaffDirectoryEntry(userObj, emp, ctx)));
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'staffCredentials', staffId), serializeStaffCredential(userObj, emp, ctx)));
    const candidateEmails = Array.from(
      new Set([
        phoneToInternalEmail(emp.phone || userObj.phone),
        (emp.googleEmail || userObj.googleEmail || '').trim().toLowerCase(),
      ].filter(Boolean))
    );
    for (const candidateEmail of candidateEmails) {
      const emailHash = await sha256Hex(candidateEmail);
      inviteEntries.push({
        emailHash,
        data: serializeStaffInvite(userObj, emp, snapshot.roles, ctx, emailHash),
      });
    }
  }
  for (const u of snapshot.users) {
    if (seenStaffUserIds.has(u.id)) continue;
    const staffId = sanitizeId(u.id);
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'staffDirectory', staffId), serializeStaffDirectoryEntry(u, undefined, ctx)));
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'staffCredentials', staffId), serializeStaffCredential(u, undefined, ctx)));
    const candidateEmails = Array.from(
      new Set([
        phoneToInternalEmail(u.phone),
        (u.googleEmail || '').trim().toLowerCase(),
      ].filter(Boolean))
    );
    for (const candidateEmail of candidateEmails) {
      const emailHash = await sha256Hex(candidateEmail);
      inviteEntries.push({
        emailHash,
        data: serializeStaffInvite(u, undefined, snapshot.roles, ctx, emailHash),
      });
    }
  }
  const seenInviteHashes = new Set<string>();
  for (const inv of inviteEntries) {
    if (seenInviteHashes.has(inv.emailHash)) continue;
    seenInviteHashes.add(inv.emailHash);
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'staffInvites', inv.emailHash), inv.data));
  }

  snapshot.targets.forEach((tg) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'targets', sanitizeId(tg.id)), serializeTarget(tg, ctx)));
  });
  snapshot.onlineOrders.forEach((ord) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'onlineOrders', sanitizeId(ord.id)), serializeOnlineOrder(ord, ctx)));
  });
  snapshot.auditLogs.slice(0, 200).forEach((aud) => {
    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'auditLogs', sanitizeId(aud.id)), serializeAuditLog(aud, ctx)));
  });

  await writer.commitAll(wsPath);
}

const PRE_CLOUD_BACKUP_KEY = 'shu_brend_pre_cloud_backup_v1';

const SEED_RECORD_ID_EXACT = new Set([
  'store-chilonzor',
  'store-samdarvoza',
  'wh-chilonzor',
  'wh-samdarvoza',
  'cat-shirts',
  'cat-pants',
  'cat-suits',
  'cat-tshirts',
  'cat-knitwear',
  'cat-outerwear',
  'cat-shoes',
  'cat-accessories',
  'acc-cash',
  'acc-card',
  'acc-bank',
  'usr-owner',
  'usr-admin',
  'usr-cashier1',
  'usr-cashier2',
  'emp-owner',
  'emp-admin',
  'emp-cashier1',
  'emp-cashier2',
]);

const SEED_RECORD_ID_REGEX =
  /^(?:br-\d+|prod-\d{2}|sup-\d+|si-\d+|mov-\d+|pr-\d+|po-\d+|sale-\d+|shift-\d+|cop-\d+|trx-\d+|exp-\d+|cust-\d+|la-\d+|lt-\d+|debt-\d+|promo-\d+|tg-\d+|ord-\d+|aud-\d+|(?:wh-chilonzor|wh-samdarvoza)__prod-\d{2}(?:-v\d+)?)$/;

export function isUntouchedSeedRecord(
  id: string,
  createdAt?: string,
  updatedAt?: string
): boolean {
  const cleanId = id.trim();
  const matchesSeedId = SEED_RECORD_ID_EXACT.has(cleanId) || SEED_RECORD_ID_REGEX.test(cleanId);
  if (!matchesSeedId) return false;
  if (createdAt && updatedAt && createdAt !== updatedAt) {
    return false;
  }
  return true;
}

export function hasCustomLocalMigrationCandidates(snapshot: DatabaseSnapshot): boolean {
  const checkList = <T extends { id: string; createdAt?: string; updatedAt?: string }>(
    items: T[]
  ) => items.some((item) => !isUntouchedSeedRecord(item.id, item.createdAt, item.updatedAt));

  return (
    checkList(snapshot.products) ||
    checkList(snapshot.categories) ||
    checkList(snapshot.brands) ||
    checkList(snapshot.suppliers) ||
    checkList(snapshot.customers) ||
    checkList(snapshot.sales) ||
    checkList(snapshot.returns) ||
    checkList(snapshot.purchaseReceipts) ||
    checkList(snapshot.purchaseOrders) ||
    checkList(snapshot.transfers) ||
    checkList(snapshot.writeOffs) ||
    checkList(snapshot.stocktakes) ||
    checkList(snapshot.expenses) ||
    checkList(snapshot.debts) ||
    checkList(snapshot.promoCodes) ||
    checkList(snapshot.onlineOrders) ||
    checkList(snapshot.targets) ||
    checkList(snapshot.employees) ||
    checkList(snapshot.stores)
  );
}

export function savePreCloudSafetyBackup(snapshot: DatabaseSnapshot, forceOverwrite = false): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    if (!forceOverwrite && localStorage.getItem(PRE_CLOUD_BACKUP_KEY)) {
      return false;
    }
    localStorage.setItem(
      PRE_CLOUD_BACKUP_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        snapshot,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export interface LocalToCloudMigrationResult {
  uploadedCount: number;
  skippedDuplicates: number;
  backedUpLocally: boolean;
}

export async function migrateLocalAdditionsToWorkspace(
  ctx: WorkspaceContext,
  snapshot: DatabaseSnapshot,
  options?: { includeSeedLike?: boolean }
): Promise<LocalToCloudMigrationResult> {
  if (!ctx.isWsAdmin) {
    throw new Error("Faqat administrator lokal ma'lumotlarni bulutga ko'chira oladi.");
  }

  const includeSeedLike = Boolean(options?.includeSeedLike);
  const backedUpLocally = savePreCloudSafetyBackup(snapshot, includeSeedLike);
  const wsPath = `workspaces/${ctx.workspaceId}`;
  const writer = new ChunkedBatchWriter();
  let uploadedCount = 0;
  let skippedDuplicates = 0;

  const shouldConsider = (item: { id: string; createdAt?: string; updatedAt?: string }) =>
    includeSeedLike || !isUntouchedSeedRecord(item.id, item.createdAt, item.updatedAt);

  const fetchExistingIds = async (colName: string): Promise<Set<string>> => {
    const snap = await getDocs(collection(firestoreDb, wsPath, colName));
    return new Set(snap.docs.map((d) => d.id));
  };

  // 1. Fetch existing products & build duplicate guards (id, name, sku, barcode)
  const existingProductSnap = await getDocs(collection(firestoreDb, wsPath, 'products'));
  const existingProductIds = new Set<string>();
  const existingProductNames = new Set<string>();
  const existingSkus = new Set<string>();
  const existingBarcodes = new Set<string>();
  const validVariantIds = new Set<string>();

  existingProductSnap.docs.forEach((d) => {
    existingProductIds.add(d.id);
    const pData = d.data();
    const pName = String(pData.name || '').trim().toLowerCase();
    if (pName) existingProductNames.add(pName);
    if (Array.isArray(pData.variants)) {
      pData.variants.forEach((v: Record<string, unknown>) => {
        const vid = String(v.id || '').trim();
        if (vid) validVariantIds.add(vid);
        const sku = String(v.sku || '').trim().toLowerCase();
        if (sku) existingSkus.add(sku);
        if (Array.isArray(v.barcodes)) {
          v.barcodes.forEach((b) => {
            const cleanB = String(b || '').trim();
            if (cleanB) existingBarcodes.add(cleanB);
          });
        }
      });
    }
  });

  // Upload missing non-duplicate products
  for (const p of snapshot.products) {
    if (!shouldConsider(p)) continue;
    const docId = sanitizeId(p.id);
    const normName = p.name.trim().toLowerCase();
    const variantSkus = (p.variants || []).map((v) => v.sku.trim().toLowerCase()).filter(Boolean);
    const variantBarcodes = (p.variants || [])
      .flatMap((v) => v.barcodes || [])
      .map((b) => b.trim())
      .filter(Boolean);

    const isDuplicate =
      existingProductIds.has(docId) ||
      (normName.length > 0 && existingProductNames.has(normName)) ||
      variantSkus.some((s) => existingSkus.has(s)) ||
      variantBarcodes.some((b) => existingBarcodes.has(b));

    if (isDuplicate) {
      skippedDuplicates += 1;
      continue;
    }

    existingProductIds.add(docId);
    if (normName) existingProductNames.add(normName);
    variantSkus.forEach((s) => existingSkus.add(s));
    variantBarcodes.forEach((b) => existingBarcodes.add(b));
    (p.variants || []).forEach((v) => {
      if (v.id) validVariantIds.add(v.id);
    });

    writer.add((b) => b.set(doc(firestoreDb, wsPath, 'products', docId), serializeProduct(p, ctx)));
    uploadedCount += 1;
  }

  // Helper for standard collections (skip existing docs, never overwrite remote)
  const migrateMissingCollection = async <T extends { id: string; createdAt?: string; updatedAt?: string }>(
    colName: string,
    items: T[],
    serialize: (item: T) => Record<string, unknown>
  ) => {
    const candidates = items.filter(shouldConsider);
    if (candidates.length === 0) return;
    const existing = await fetchExistingIds(colName);
    for (const item of candidates) {
      const docId = sanitizeId(item.id);
      if (existing.has(docId)) continue;
      existing.add(docId);
      writer.add((b) => b.set(doc(firestoreDb, wsPath, colName, docId), serialize(item)));
      uploadedCount += 1;
    }
  };

  await migrateMissingCollection('stores', snapshot.stores, (s) => serializeStore(s, ctx));
  await migrateMissingCollection('warehouses', snapshot.warehouses, (w) => serializeWarehouse(w, ctx));
  await migrateMissingCollection('categories', snapshot.categories, (c) => serializeCategory(c, ctx));
  await migrateMissingCollection('brands', snapshot.brands, (br) => serializeBrand(br, ctx));
  await migrateMissingCollection('suppliers', snapshot.suppliers, (sup) => serializeSupplier(sup, ctx));
  await migrateMissingCollection('accounts', snapshot.accounts, (acc) => serializeAccount(acc, ctx));

  // Stock items: only migrate missing warehouseId__variantId docs linked to active/migrated variants
  const stockCandidates = snapshot.stockItems.filter((si) => {
    if (!shouldConsider(si)) return false;
    return validVariantIds.size === 0 || validVariantIds.has(si.variantId);
  });
  if (stockCandidates.length > 0) {
    const existingStock = await fetchExistingIds('stockItems');
    for (const si of stockCandidates) {
      const docId = stockItemDocId(si.warehouseId, si.variantId);
      if (existingStock.has(docId)) continue;
      existingStock.add(docId);
      writer.add((b) => b.set(doc(firestoreDb, wsPath, 'stockItems', docId), serializeStockItem(si, ctx)));
      uploadedCount += 1;
    }
  }

  await migrateMissingCollection('stockMovements', snapshot.stockMovements.slice(0, 300), (m) =>
    serializeStockMovement(m, ctx)
  );
  await migrateMissingCollection('purchaseReceipts', snapshot.purchaseReceipts, (pr) =>
    serializePurchaseReceipt(pr, ctx)
  );
  await migrateMissingCollection('purchaseOrders', snapshot.purchaseOrders, (po) =>
    serializePurchaseOrder(po, ctx)
  );
  await migrateMissingCollection('transfers', snapshot.transfers, (tr) => serializeTransfer(tr, ctx));
  await migrateMissingCollection('writeOffs', snapshot.writeOffs, (wo) => serializeWriteOff(wo, ctx));
  await migrateMissingCollection('stocktakes', snapshot.stocktakes, (st) => serializeStocktake(st, ctx));
  await migrateMissingCollection('sales', snapshot.sales, (s) => serializeSale(s, ctx));
  await migrateMissingCollection('returns', snapshot.returns, (r) => serializeReturnDoc(r, ctx));
  await migrateMissingCollection('cashShifts', snapshot.cashShifts, (sh) => serializeCashShift(sh, ctx));
  await migrateMissingCollection('cashOperations', snapshot.cashOperations, (cop) =>
    serializeCashOperation(cop, ctx)
  );
  await migrateMissingCollection('transactions', snapshot.transactions, (trx) =>
    serializeFinanceTransaction(trx, ctx)
  );
  await migrateMissingCollection('expenses', snapshot.expenses, (exp) => serializeExpense(exp, ctx));
  await migrateMissingCollection('customers', snapshot.customers, (c) => serializeCustomer(c, ctx));
  await migrateMissingCollection('loyaltyAccounts', snapshot.loyaltyAccounts, (la) =>
    serializeLoyaltyAccount(la, ctx)
  );
  await migrateMissingCollection('loyaltyTransactions', snapshot.loyaltyTransactions, (lt) =>
    serializeLoyaltyTransaction(lt, ctx)
  );
  await migrateMissingCollection('debts', snapshot.debts, (d) => serializeDebt(d, ctx));
  await migrateMissingCollection('promoCodes', snapshot.promoCodes, (pr) => serializePromoCode(pr, ctx));
  await migrateMissingCollection('targets', snapshot.targets, (tg) => serializeTarget(tg, ctx));
  await migrateMissingCollection('onlineOrders', snapshot.onlineOrders, (ord) =>
    serializeOnlineOrder(ord, ctx)
  );
  await migrateMissingCollection('auditLogs', snapshot.auditLogs.slice(0, 200), (aud) =>
    serializeAuditLog(aud, ctx)
  );

  // Staff records (non-seed or explicit includeSeedLike)
  const staffCandidates = snapshot.employees.filter(shouldConsider);
  if (staffCandidates.length > 0) {
    const existingStaffIds = await fetchExistingIds('staffDirectory');
    const existingInviteIds = await fetchExistingIds('staffInvites');
    const newInviteEmails: string[] = [];

    for (const emp of staffCandidates) {
      const staffId = sanitizeId(emp.id);
      if (existingStaffIds.has(staffId)) continue;
      existingStaffIds.add(staffId);
      const linkedUser = snapshot.users.find((u) => u.id === emp.userId);
      const userObj: User = linkedUser || {
        id: emp.userId,
        name: emp.name,
        phone: emp.phone,
        password: '123456',
        pin: '4444',
        googleEmail: emp.googleEmail,
        roleId: emp.roleId,
        assignedStoreIds: [emp.storeId],
        isActive: true,
        storeId: emp.storeId,
        createdAt: emp.createdAt,
        updatedAt: emp.updatedAt,
        createdBy: emp.createdBy,
      };
      writer.add((b) =>
        b.set(doc(firestoreDb, wsPath, 'staffDirectory', staffId), serializeStaffDirectoryEntry(userObj, emp, ctx))
      );
      writer.add((b) =>
        b.set(doc(firestoreDb, wsPath, 'staffCredentials', staffId), serializeStaffCredential(userObj, emp, ctx))
      );
      uploadedCount += 1;
      const phoneInviteEmail = phoneToInternalEmail(emp.phone || userObj.phone);
      const legacyInviteEmail = (emp.googleEmail || userObj.googleEmail || '').trim().toLowerCase();
      const candidateEmails = Array.from(new Set([phoneInviteEmail, legacyInviteEmail].filter(Boolean)));
      for (const cleanEmail of candidateEmails) {
        const emailHash = await sha256Hex(cleanEmail);
        if (!existingInviteIds.has(emailHash)) {
          existingInviteIds.add(emailHash);
          newInviteEmails.push(cleanEmail);
          writer.add((b) =>
            b.set(
              doc(firestoreDb, wsPath, 'staffInvites', emailHash),
              serializeStaffInvite(userObj, emp, snapshot.roles, ctx, emailHash)
            )
          );
        }
      }
    }

    if (newInviteEmails.length > 0) {
      const mergedInvites = Array.from(new Set([...ctx.invitedEmails, ...newInviteEmails])).slice(0, 50);
      writer.add((b) =>
        b.update(doc(firestoreDb, wsPath), {
          invitedEmails: mergedInvites,
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  if (uploadedCount > 0) {
    await writer.commitAll(wsPath);
  }

  return { uploadedCount, skippedDuplicates, backedUpLocally };
}

// --- Real-time Subscriptions ---

interface SyncBucket {
  workspaceMeta?: {
    ownerUid: string;
    memberUids: string[];
    adminUids: string[];
    invitedEmails: string[];
    roles?: Role[];
    settings?: AppSettings;
    version?: number;
  };
  privateIntegrations?: AppSettings['integrations'];
  stores?: Store[];
  warehouses?: Warehouse[];
  categories?: Category[];
  brands?: Brand[];
  products?: Product[];
  suppliers?: Supplier[];
  stockItems?: StockItem[];
  stockMovements?: StockMovement[];
  purchaseReceipts?: PurchaseReceipt[];
  purchaseOrders?: PurchaseOrder[];
  transfers?: Transfer[];
  writeOffs?: WriteOff[];
  stocktakes?: Stocktake[];
  sales?: Sale[];
  returns?: Return[];
  cashShifts?: CashShift[];
  cashOperations?: CashOperation[];
  accounts?: Account[];
  transactions?: Transaction[];
  expenses?: Expense[];
  customers?: Customer[];
  loyaltyAccounts?: LoyaltyAccount[];
  loyaltyTransactions?: LoyaltyTransaction[];
  debts?: Debt[];
  promoCodes?: PromoCode[];
  staffDirectory?: (Record<string, unknown> & { id: string })[];
  staffCredentials?: (Record<string, unknown> & { id: string })[];
  targets?: Target[];
  onlineOrders?: OnlineOrder[];
  auditLogs?: AuditLog[];
}

function normalizeDocDates<T extends Record<string, unknown>>(raw: T): T {
  const copy: Record<string, unknown> = { ...raw };
  if ('createdAt' in copy) copy.createdAt = toIsoString(copy.createdAt);
  if ('updatedAt' in copy) copy.updatedAt = toIsoString(copy.updatedAt);
  return copy as T;
}

const TENANT_SUBCOLLECTIONS_FOR_MEMBER_PROPAGATION = [
  'stores',
  'warehouses',
  'categories',
  'brands',
  'products',
  'suppliers',
  'stockItems',
  'stockMovements',
  'purchaseReceipts',
  'purchaseOrders',
  'transfers',
  'writeOffs',
  'stocktakes',
  'sales',
  'returns',
  'cashShifts',
  'cashOperations',
  'accounts',
  'transactions',
  'expenses',
  'customers',
  'loyaltyAccounts',
  'loyaltyTransactions',
  'debts',
  'promoCodes',
  'staffDirectory',
  'targets',
  'onlineOrders',
  'auditLogs',
] as const;

let propagationInFlight = false;

async function propagateMembersIfNeeded(
  wsId: string,
  memberUids: string[],
  rawDocsByCollection: Record<string, { id: string; memberUids?: string[] }[]>
) {
  if (propagationInFlight || memberUids.length <= 1) return;
  const missing: { col: string; id: string }[] = [];
  for (const colName of TENANT_SUBCOLLECTIONS_FOR_MEMBER_PROPAGATION) {
    const list = rawDocsByCollection[colName] || [];
    for (const d of list) {
      const cur = Array.isArray(d.memberUids) ? d.memberUids : [];
      if (memberUids.some((u) => !cur.includes(u))) {
        missing.push({ col: colName, id: d.id });
      }
    }
  }
  if (missing.length === 0) return;
  propagationInFlight = true;
  try {
    const CHUNK = 350;
    for (let i = 0; i < missing.length; i += CHUNK) {
      const batch = writeBatch(firestoreDb);
      for (const item of missing.slice(i, i + CHUNK)) {
        batch.update(doc(firestoreDb, 'workspaces', wsId, item.col, item.id), {
          memberUids,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch {
    // non-fatal background propagation
  } finally {
    propagationInFlight = false;
  }
}

function mergePendingCollection<T extends { id: string; updatedAt?: string }>(
  remoteItems: T[],
  localItems: T[],
  upsertIds: Set<string>,
  deleteIds: Set<string> = new Set()
): T[] {
  if (upsertIds.size === 0 && deleteIds.size === 0) return remoteItems;
  const localMap = new Map(localItems.map((it) => [it.id, it]));
  const result: T[] = [];
  const seen = new Set<string>();

  for (const item of remoteItems) {
    if (deleteIds.has(item.id)) continue;
    seen.add(item.id);
    if (upsertIds.has(item.id)) {
      const localItem = localMap.get(item.id);
      if (localItem) {
        const localTs = String(localItem.updatedAt || '');
        const remoteTs = String(item.updatedAt || '');
        result.push(localTs >= remoteTs ? localItem : item);
        continue;
      }
    }
    result.push(item);
  }

  for (const id of upsertIds) {
    if (!seen.has(id) && !deleteIds.has(id)) {
      const localItem = localMap.get(id);
      if (localItem) result.unshift(localItem);
    }
  }
  return result;
}

export function reconcilePendingOfflineEdits(
  base: DatabaseSnapshot,
  incoming: DatabaseSnapshot
): DatabaseSnapshot {
  if (!base.offlineQueue || base.offlineQueue.length === 0) return incoming;

  const productUpserts = new Set<string>();
  const productDeletes = new Set<string>();
  const categoryUpserts = new Set<string>();
  const categoryDeletes = new Set<string>();
  const supplierUpserts = new Set<string>();
  const customerUpserts = new Set<string>();
  const loyaltyAccountUpserts = new Set<string>();
  const loyaltyTxUpserts = new Set<string>();
  const receiptUpserts = new Set<string>();
  const poUpserts = new Set<string>();
  const transferUpserts = new Set<string>();
  const writeOffUpserts = new Set<string>();
  const stocktakeUpserts = new Set<string>();
  const saleUpserts = new Set<string>();
  const saleDeletes = new Set<string>();
  const returnUpserts = new Set<string>();
  const shiftUpserts = new Set<string>();
  const cashOpUpserts = new Set<string>();
  const accountUpserts = new Set<string>();
  const trxUpserts = new Set<string>();
  const expenseUpserts = new Set<string>();
  const debtUpserts = new Set<string>();
  const promoUpserts = new Set<string>();
  const targetUpserts = new Set<string>();
  const targetDeletes = new Set<string>();
  const orderUpserts = new Set<string>();
  const auditUpserts = new Set<string>();
  const storeUpserts = new Set<string>();
  const storeDeletes = new Set<string>();
  const whUpserts = new Set<string>();
  const whDeletes = new Set<string>();
  const pendingMovementIds = new Set<string>();
  const deletedStockDocIds = new Set<string>();
  let keepSettings = false;
  let keepRoles = false;
  let hasEmployeePending = false;

  for (const q of base.offlineQueue) {
    const p = (q.payload || {}) as Record<string, unknown>;
    const addMoves = () => {
      if (typeof p.movementId === 'string') pendingMovementIds.add(p.movementId);
      if (Array.isArray(p.movementIds)) {
        p.movementIds.forEach((id) => {
          if (typeof id === 'string') pendingMovementIds.add(id);
        });
      }
    };
    const addAudit = () => {
      if (typeof p.auditId === 'string') auditUpserts.add(p.auditId);
    };
    switch (q.type) {
      case 'category':
        if (typeof p.categoryId === 'string') categoryUpserts.add(p.categoryId);
        break;
      case 'category_delete':
        if (typeof p.categoryId === 'string') categoryDeletes.add(p.categoryId);
        if (Array.isArray(p.reassignedProductIds)) {
          p.reassignedProductIds.forEach((id) => {
            if (typeof id === 'string') productUpserts.add(id);
          });
        }
        break;
      case 'categories_reset':
        base.categories.forEach((c) => categoryUpserts.add(c.id));
        base.products.forEach((pr) => productUpserts.add(pr.id));
        break;
      case 'product':
        if (typeof p.productId === 'string') productUpserts.add(p.productId);
        addAudit();
        break;
      case 'product_delete':
        if (typeof p.productId === 'string') productDeletes.add(p.productId);
        if (Array.isArray(p.deletedStockIds)) {
          p.deletedStockIds.forEach((id) => {
            if (typeof id === 'string') deletedStockDocIds.add(id);
          });
        }
        addAudit();
        break;
      case 'bulk_prices':
        if (Array.isArray(p.productIds)) {
          p.productIds.forEach((id) => {
            if (typeof id === 'string') productUpserts.add(id);
          });
        }
        addAudit();
        break;
      case 'import_products':
        if (Array.isArray(p.productIds)) {
          p.productIds.forEach((id) => {
            if (typeof id === 'string') productUpserts.add(id);
          });
        }
        addMoves();
        break;
      case 'quick_stock':
        addMoves();
        break;
      case 'purchase_receipt':
        if (typeof p.receiptId === 'string') {
          receiptUpserts.add(p.receiptId);
          const rec = base.purchaseReceipts.find((r) => r.id === p.receiptId);
          if (rec) {
            if (rec.supplierId) supplierUpserts.add(rec.supplierId);
            rec.items.forEach((it) => productUpserts.add(it.productId));
          }
        }
        if (typeof p.supplierId === 'string') supplierUpserts.add(p.supplierId);
        if (typeof p.accountId === 'string') accountUpserts.add(p.accountId);
        addMoves();
        break;
      case 'purchase_order':
      case 'purchase_order_status':
        if (typeof p.poId === 'string') poUpserts.add(p.poId);
        break;
      case 'transfer':
      case 'transfer_receive':
        if (typeof p.transferId === 'string') transferUpserts.add(p.transferId);
        addMoves();
        break;
      case 'write_off':
        if (typeof p.writeOffId === 'string') writeOffUpserts.add(p.writeOffId);
        addMoves();
        addAudit();
        break;
      case 'stocktake':
      case 'stocktake_apply':
        if (typeof p.stocktakeId === 'string') stocktakeUpserts.add(p.stocktakeId);
        addMoves();
        addAudit();
        break;
      case 'supplier':
        if (typeof p.supplierId === 'string') supplierUpserts.add(p.supplierId);
        break;
      case 'supplier_debt_pay':
        if (typeof p.supplierId === 'string') supplierUpserts.add(p.supplierId);
        if (typeof p.accountId === 'string') accountUpserts.add(p.accountId);
        if (typeof p.transactionId === 'string') trxUpserts.add(p.transactionId);
        break;
      case 'sale':
      case 'sale_pay_deferred':
      case 'sale_deferred':
        if (typeof p.saleId === 'string') {
          saleUpserts.add(p.saleId);
          const localSale = base.sales.find((s) => s.id === p.saleId);
          if (localSale) {
            if (localSale.customerId) {
              customerUpserts.add(localSale.customerId);
              const loy = base.loyaltyAccounts.find((l) => l.customerId === localSale.customerId);
              if (loy) loyaltyAccountUpserts.add(loy.id);
            }
            if (localSale.shiftId) shiftUpserts.add(localSale.shiftId);
            if (localSale.promoCode) {
              const promo = base.promoCodes.find(
                (pr) => pr.code.toUpperCase() === localSale.promoCode?.toUpperCase()
              );
              if (promo) promoUpserts.add(promo.id);
            }
          }
        }
        if (typeof p.debtId === 'string') debtUpserts.add(p.debtId);
        if (Array.isArray(p.loyaltyTxIds)) {
          p.loyaltyTxIds.forEach((id) => {
            if (typeof id === 'string') loyaltyTxUpserts.add(id);
          });
        }
        if (Array.isArray(p.accountIds)) {
          p.accountIds.forEach((id) => {
            if (typeof id === 'string') accountUpserts.add(id);
          });
        }
        addMoves();
        addAudit();
        break;
      case 'sale_delete_deferred':
        if (typeof p.saleId === 'string') saleDeletes.add(p.saleId);
        break;
      case 'return':
        if (typeof p.returnId === 'string') returnUpserts.add(p.returnId);
        if (typeof p.saleId === 'string') saleUpserts.add(p.saleId);
        if (typeof p.shiftId === 'string') shiftUpserts.add(p.shiftId);
        if (typeof p.accountId === 'string') accountUpserts.add(p.accountId);
        addMoves();
        addAudit();
        break;
      case 'shift_open':
      case 'shift_close':
        if (typeof p.shiftId === 'string') shiftUpserts.add(p.shiftId);
        addAudit();
        break;
      case 'cash_op':
        if (typeof p.opId === 'string') cashOpUpserts.add(p.opId);
        if (typeof p.shiftId === 'string') shiftUpserts.add(p.shiftId);
        break;
      case 'customer':
        if (typeof p.customerId === 'string') customerUpserts.add(p.customerId);
        if (typeof p.loyaltyAccountId === 'string') loyaltyAccountUpserts.add(p.loyaltyAccountId);
        break;
      case 'debt_pay':
        if (typeof p.debtId === 'string') debtUpserts.add(p.debtId);
        if (typeof p.customerId === 'string') customerUpserts.add(p.customerId);
        if (typeof p.accountId === 'string') accountUpserts.add(p.accountId);
        if (typeof p.transactionId === 'string') trxUpserts.add(p.transactionId);
        addAudit();
        break;
      case 'promo':
        if (typeof p.promoId === 'string') promoUpserts.add(p.promoId);
        break;
      case 'expense':
        if (typeof p.expenseId === 'string') expenseUpserts.add(p.expenseId);
        if (typeof p.accountId === 'string') accountUpserts.add(p.accountId);
        if (typeof p.transactionId === 'string') trxUpserts.add(p.transactionId);
        break;
      case 'finance_transfer':
        if (typeof p.fromAccountId === 'string') accountUpserts.add(p.fromAccountId);
        if (typeof p.toAccountId === 'string') accountUpserts.add(p.toAccountId);
        if (typeof p.transactionId === 'string') trxUpserts.add(p.transactionId);
        break;
      case 'account':
        if (typeof p.accountId === 'string') accountUpserts.add(p.accountId);
        break;
      case 'employee':
        hasEmployeePending = true;
        break;
      case 'employee_delete':
        hasEmployeePending = true;
        if (Array.isArray(p.deletedTargetIds)) {
          p.deletedTargetIds.forEach((id) => {
            if (typeof id === 'string') targetDeletes.add(id);
          });
        }
        break;
      case 'target':
        if (typeof p.targetId === 'string') targetUpserts.add(p.targetId);
        break;
      case 'online_order':
      case 'online_order_status':
        if (typeof p.orderId === 'string') orderUpserts.add(p.orderId);
        addMoves();
        break;
      case 'store':
        if (typeof p.storeId === 'string') storeUpserts.add(p.storeId);
        break;
      case 'store_delete':
        if (typeof p.storeId === 'string') storeDeletes.add(p.storeId);
        if (typeof p.deletedWarehouseId === 'string') whDeletes.add(p.deletedWarehouseId);
        break;
      case 'warehouse':
        if (typeof p.warehouseId === 'string') whUpserts.add(p.warehouseId);
        break;
      case 'settings':
        keepSettings = true;
        addAudit();
        break;
      case 'roles':
        keepRoles = true;
        break;
    }
  }

  // Reconcile pending stock items based on pending movements & product deletes
  let reconciledStockItems = incoming.stockItems;
  if (deletedStockDocIds.size > 0 || productDeletes.size > 0) {
    reconciledStockItems = reconciledStockItems.filter(
      (s) =>
        !productDeletes.has(s.productId) &&
        !deletedStockDocIds.has(stockItemDocId(s.warehouseId, s.variantId))
    );
  }
  if (pendingMovementIds.size > 0) {
    const pendingMoves = base.stockMovements.filter((m) => pendingMovementIds.has(m.id));
    const affectedKeys = new Set(pendingMoves.map((m) => `${m.warehouseId}__${m.variantId}`));
    const localStockMap = new Map(
      base.stockItems.map((s) => [`${s.warehouseId}__${s.variantId}`, s])
    );
    const nextStockMap = new Map(
      reconciledStockItems.map((s) => [`${s.warehouseId}__${s.variantId}`, s])
    );
    affectedKeys.forEach((k) => {
      const localS = localStockMap.get(k);
      if (localS) nextStockMap.set(k, localS);
    });
    reconciledStockItems = Array.from(nextStockMap.values());
  }

  return {
    ...incoming,
    settings: keepSettings ? base.settings : incoming.settings,
    roles: keepRoles ? base.roles : incoming.roles,
    users: hasEmployeePending ? base.users : incoming.users,
    employees: hasEmployeePending ? base.employees : incoming.employees,
    stores: mergePendingCollection(incoming.stores, base.stores, storeUpserts, storeDeletes),
    warehouses: mergePendingCollection(incoming.warehouses, base.warehouses, whUpserts, whDeletes),
    categories: mergePendingCollection(incoming.categories, base.categories, categoryUpserts, categoryDeletes),
    products: mergePendingCollection(incoming.products, base.products, productUpserts, productDeletes),
    suppliers: mergePendingCollection(incoming.suppliers, base.suppliers, supplierUpserts),
    stockItems: reconciledStockItems,
    stockMovements: mergePendingCollection(incoming.stockMovements, base.stockMovements, pendingMovementIds),
    purchaseReceipts: mergePendingCollection(incoming.purchaseReceipts, base.purchaseReceipts, receiptUpserts),
    purchaseOrders: mergePendingCollection(incoming.purchaseOrders, base.purchaseOrders, poUpserts),
    transfers: mergePendingCollection(incoming.transfers, base.transfers, transferUpserts),
    writeOffs: mergePendingCollection(incoming.writeOffs, base.writeOffs, writeOffUpserts),
    stocktakes: mergePendingCollection(incoming.stocktakes, base.stocktakes, stocktakeUpserts),
    sales: mergePendingCollection(incoming.sales, base.sales, saleUpserts, saleDeletes),
    returns: mergePendingCollection(incoming.returns, base.returns, returnUpserts),
    cashShifts: mergePendingCollection(incoming.cashShifts, base.cashShifts, shiftUpserts),
    cashOperations: mergePendingCollection(incoming.cashOperations, base.cashOperations, cashOpUpserts),
    accounts: mergePendingCollection(incoming.accounts, base.accounts, accountUpserts),
    transactions: mergePendingCollection(incoming.transactions, base.transactions, trxUpserts),
    expenses: mergePendingCollection(incoming.expenses, base.expenses, expenseUpserts),
    customers: mergePendingCollection(incoming.customers, base.customers, customerUpserts),
    loyaltyAccounts: mergePendingCollection(incoming.loyaltyAccounts, base.loyaltyAccounts, loyaltyAccountUpserts),
    loyaltyTransactions: mergePendingCollection(incoming.loyaltyTransactions, base.loyaltyTransactions, loyaltyTxUpserts),
    debts: mergePendingCollection(incoming.debts, base.debts, debtUpserts),
    promoCodes: mergePendingCollection(incoming.promoCodes, base.promoCodes, promoUpserts),
    targets: mergePendingCollection(incoming.targets, base.targets, targetUpserts, targetDeletes),
    onlineOrders: mergePendingCollection(incoming.onlineOrders, base.onlineOrders, orderUpserts),
    auditLogs: mergePendingCollection(incoming.auditLogs, base.auditLogs, auditUpserts),
  };
}

export async function verifyWorkspaceServerSync(workspaceId: string): Promise<boolean> {
  try {
    await getDocFromServer(doc(firestoreDb, 'workspaces', workspaceId));
    return true;
  } catch {
    return false;
  }
}

export async function checkWorkspaceSyncHealth(
  ctx: WorkspaceContext,
  lang: 'uz' | 'ru' = 'uz'
): Promise<{ ok: boolean; error?: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      error: lang === 'ru' ? 'Нет подключения к интернету' : "Internet aloqasi yo'q",
    };
  }
  try {
    await getDocFromServer(doc(firestoreDb, 'workspaces', ctx.workspaceId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: formatFirebaseErrorMessage(err, lang),
    };
  }
}

const WORKSPACE_WIDE_READ_COLS = new Set([
  'stores',
  'warehouses',
  'categories',
  'brands',
  'products',
  'suppliers',
  'stockItems',
  'stockMovements',
  'purchaseReceipts',
  'purchaseOrders',
  'transfers',
  'writeOffs',
  'stocktakes',
  'sales',
  'returns',
  'cashShifts',
  'cashOperations',
  'accounts',
  'transactions',
  'expenses',
  'customers',
  'loyaltyAccounts',
  'loyaltyTransactions',
  'debts',
  'promoCodes',
  'staffDirectory',
  'targets',
  'onlineOrders',
  'auditLogs',
]);

export function subscribeWorkspaceRealtime(
  ctx: WorkspaceContext,
  getBaseSnapshot: () => DatabaseSnapshot | null,
  onHydrate: (snapshot: DatabaseSnapshot, updatedMeta?: Partial<WorkspaceContext>) => void,
  onFatalError: (err: Error) => void,
  onSyncWarning?: (err: Error) => void
): () => void {
  const bucket: SyncBucket = {};
  const rawMemberTracking: Record<string, { id: string; memberUids?: string[] }[]> = {};
  const unsubs: (() => void)[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const scheduleFlush = () => {
    if (disposed) return;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      const base = getBaseSnapshot();
      if (!base || disposed) return;

      const next: DatabaseSnapshot = {
        ...base,
        version: bucket.workspaceMeta?.version ?? base.version,
        roles: bucket.workspaceMeta?.roles?.length ? bucket.workspaceMeta.roles : base.roles,
        settings: {
          ...(bucket.workspaceMeta?.settings ?? base.settings),
          integrations: {
            ...(bucket.workspaceMeta?.settings?.integrations ?? base.settings.integrations),
            ...(bucket.privateIntegrations ?? {}),
          },
        },
        stores: bucket.stores ?? base.stores,
        warehouses: bucket.warehouses ?? base.warehouses,
        categories: bucket.categories ?? base.categories,
        brands: bucket.brands ?? base.brands,
        products: bucket.products ?? base.products,
        suppliers: bucket.suppliers ?? base.suppliers,
        stockItems: bucket.stockItems ?? base.stockItems,
        stockMovements: bucket.stockMovements ?? base.stockMovements,
        purchaseReceipts: bucket.purchaseReceipts ?? base.purchaseReceipts,
        purchaseOrders: bucket.purchaseOrders ?? base.purchaseOrders,
        transfers: bucket.transfers ?? base.transfers,
        writeOffs: bucket.writeOffs ?? base.writeOffs,
        stocktakes: bucket.stocktakes ?? base.stocktakes,
        sales: bucket.sales ?? base.sales,
        returns: bucket.returns ?? base.returns,
        cashShifts: bucket.cashShifts ?? base.cashShifts,
        cashOperations: bucket.cashOperations ?? base.cashOperations,
        accounts: bucket.accounts ?? base.accounts,
        transactions: bucket.transactions ?? base.transactions,
        expenses: bucket.expenses ?? base.expenses,
        customers: bucket.customers ?? base.customers,
        loyaltyAccounts: bucket.loyaltyAccounts ?? base.loyaltyAccounts,
        loyaltyTransactions: bucket.loyaltyTransactions ?? base.loyaltyTransactions,
        debts: bucket.debts ?? base.debts,
        promoCodes: bucket.promoCodes ?? base.promoCodes,
        targets: bucket.targets ?? base.targets,
        onlineOrders: bucket.onlineOrders ?? base.onlineOrders,
        auditLogs: bucket.auditLogs ?? base.auditLogs,
        offlineQueue: base.offlineQueue,
      };

      // Merge staffDirectory + staffCredentials (hashed + optional legacy plaintext) into users & employees
      if (bucket.staffDirectory) {
        const credById = new Map<string, Record<string, unknown>>();
        (bucket.staffCredentials || []).forEach((c) => credById.set(c.id, c));

        const nextUsers: User[] = [];
        const nextEmployees: Employee[] = [];

        bucket.staffDirectory.forEach((dir) => {
          const cred = credById.get(dir.id);
          const existingLocalUser = base.users.find((u) => u.id === dir.userId);
          const existingLocalEmp = base.employees.find((e) => e.id === dir.id || e.userId === dir.userId);

          const userId = String(dir.userId || dir.id);
          const roleId = String(dir.roleId || 'cashier') as RoleId;
          const storeId = String(dir.storeId || next.stores[0]?.id || 'store-chilonzor');
          const createdAt = toIsoString(dir.createdAt, existingLocalUser?.createdAt);
          const updatedAt = toIsoString(dir.updatedAt, existingLocalUser?.updatedAt);

          const remotePasswordHash = cred?.passwordHash ? String(cred.passwordHash) : existingLocalUser?.passwordHash;
          const remotePinHash = cred?.pinHash ? String(cred.pinHash) : existingLocalUser?.pinHash;
          const legacyPlainPass = cred?.password ? String(cred.password) : '';
          const legacyPlainPin = cred?.pin ? String(cred.pin) : '';

          const localPassMatchesRemote =
            Boolean(existingLocalUser?.password) &&
            (!remotePasswordHash || hashStaffSecret(existingLocalUser!.password) === remotePasswordHash);
          const localPinMatchesRemote =
            Boolean(existingLocalUser?.pin) &&
            (!remotePinHash || hashStaffSecret(existingLocalUser!.pin) === remotePinHash);

          const mergedUser: User = {
            id: userId,
            name: String(dir.name || 'Xodim'),
            phone: cred ? String(cred.phone || '') : existingLocalUser?.phone || '',
            password: legacyPlainPass || (localPassMatchesRemote ? existingLocalUser!.password : ''),
            pin: legacyPlainPin || (localPinMatchesRemote ? existingLocalUser!.pin : ''),
            ...(remotePasswordHash ? { passwordHash: remotePasswordHash } : {}),
            ...(remotePinHash ? { pinHash: remotePinHash } : {}),
            ...(cred?.hashAlgo
              ? { hashAlgo: cred.hashAlgo as User['hashAlgo'] }
              : existingLocalUser?.hashAlgo
              ? { hashAlgo: existingLocalUser.hashAlgo }
              : {}),
            ...(typeof cred?.authMigrated === 'boolean'
              ? { authMigrated: cred.authMigrated }
              : existingLocalUser?.authMigrated !== undefined
              ? { authMigrated: existingLocalUser.authMigrated }
              : {}),
            googleEmail: cred?.googleEmail
              ? String(cred.googleEmail)
              : existingLocalUser?.googleEmail,
            roleId,
            assignedStoreIds: Array.isArray(dir.assignedStoreIds)
              ? (dir.assignedStoreIds as string[])
              : [storeId],
            ...(Array.isArray(dir.customPermissions)
              ? {
                  customPermissions: Array.from(
                    new Set<Permission>([...(dir.customPermissions as Permission[]), 'use_pos'])
                  ),
                }
              : {}),
            isActive: Boolean(dir.isActive),
            ...(dir.avatarColor ? { avatarColor: String(dir.avatarColor) } : {}),
            storeId,
            createdAt,
            updatedAt,
            createdBy: String(dir.createdBy || ctx.ownerUid),
          };
          nextUsers.push(mergedUser);

          const mergedEmp: Employee = {
            id: dir.id,
            userId,
            name: mergedUser.name,
            phone: mergedUser.phone,
            googleEmail: mergedUser.googleEmail,
            roleId,
            baseSalary: cred ? Number(cred.baseSalary || 0) : existingLocalEmp?.baseSalary ?? 0,
            commissionPercent: cred
              ? Number(cred.commissionPercent || 0)
              : existingLocalEmp?.commissionPercent ?? 0,
            schedule: String(dir.schedule || ''),
            hiredAt: cred ? String(cred.hiredAt || createdAt) : existingLocalEmp?.hiredAt || createdAt,
            storeId,
            createdAt,
            updatedAt,
            createdBy: String(dir.createdBy || ctx.ownerUid),
          };
          nextEmployees.push(mergedEmp);
        });

        if (nextUsers.length > 0) {
          next.users = nextUsers;
          next.employees = nextEmployees;
        }
      }

      const metaUpdate: Partial<WorkspaceContext> | undefined = bucket.workspaceMeta
        ? {
            ownerUid: bucket.workspaceMeta.ownerUid,
            memberUids: bucket.workspaceMeta.memberUids,
            adminUids: bucket.workspaceMeta.adminUids,
            invitedEmails: bucket.workspaceMeta.invitedEmails,
          }
        : undefined;

      const reconciled = reconcilePendingOfflineEdits(base, next);
      onHydrate(reconciled, metaUpdate);

      if (ctx.isWsAdmin && bucket.workspaceMeta?.memberUids) {
        void propagateMembersIfNeeded(
          ctx.workspaceId,
          bucket.workspaceMeta.memberUids,
          rawMemberTracking
        );
      }
    }, 60);
  };

  const wsPath = `workspaces/${ctx.workspaceId}`;

  // 1. Workspace Root Listener
  unsubs.push(
    onSnapshot(
      doc(firestoreDb, 'workspaces', ctx.workspaceId),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data({ serverTimestamps: 'estimate' });
        bucket.workspaceMeta = {
          ownerUid: String(d.ownerUid || ctx.ownerUid),
          memberUids: Array.isArray(d.memberUids) ? d.memberUids : ctx.memberUids,
          adminUids: Array.isArray(d.adminUids) ? d.adminUids : ctx.adminUids,
          invitedEmails: Array.isArray(d.invitedEmails) ? d.invitedEmails : ctx.invitedEmails,
          roles: Array.isArray(d.roles)
            ? (d.roles as Role[]).map((r) => ({
                ...r,
                permissions: Array.isArray(r.permissions)
                  ? Array.from(new Set<Permission>([...r.permissions, 'use_pos']))
                  : ['use_pos'],
              }))
            : undefined,
          settings: d.settings as AppSettings | undefined,
          version: typeof d.version === 'number' ? d.version : undefined,
        };
        scheduleFlush();
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, wsPath);
        } catch (wrapped) {
          onFatalError(wrapped as Error);
        }
      }
    )
  );

  // 2. Own Membership Listener (live RBAC & suspension enforcement)
  let lastMemberSig = `${ctx.roleId}|${ctx.isWsAdmin}|${(ctx.assignedStoreIds || []).join(',')}`;
  unsubs.push(
    onSnapshot(
      doc(firestoreDb, 'workspaces', ctx.workspaceId, 'members', ctx.uid),
      (snap) => {
        if (!snap.exists()) return;
        const md = snap.data({ serverTimestamps: 'estimate' });
        if (md.isActive === false) {
          onFatalError(new Error("Sizning xodim hisobingiz faolsizlantirilgan. Administrator bilan bog'laning."));
          return;
        }
        const roleId = (md.roleId as RoleId) || ctx.roleId;
        const assignedStoreIds = Array.isArray(md.assignedStoreIds) ? md.assignedStoreIds : [];
        const isWsAdmin =
          ctx.isPlatformAdmin ||
          ctx.ownerUid === ctx.uid ||
          isBootstrappedAdminEmail(ctx.email) ||
          roleId === 'owner' ||
          roleId === 'admin';
        const nextSig = `${roleId}|${isWsAdmin}|${assignedStoreIds.join(',')}`;
        if (nextSig !== lastMemberSig) {
          lastMemberSig = nextSig;
          const baseSnap = getBaseSnapshot();
          if (baseSnap) {
            onHydrate(baseSnap, { roleId, assignedStoreIds, isWsAdmin });
          }
        }
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, `${wsPath}/members/${ctx.uid}`);
        } catch (wrapped) {
          onFatalError(wrapped as Error);
        }
      }
    )
  );

  // Helper to attach subcollection listeners cleanly, with automatic store-scoped fallback if server rules lag behind
  const watchCol = <T extends object>(
    colName: string,
    assign: (items: T[]) => void,
    options?: { adminOnly?: boolean; sortDescCreatedAt?: boolean; mapItem?: (raw: Record<string, unknown>) => T }
  ) => {
    const colPath = `${wsPath}/${colName}`;
    const colRef = collection(firestoreDb, 'workspaces', ctx.workspaceId, colName);
    const isWorkspaceWide = WORKSPACE_WIDE_READ_COLS.has(colName);
    const activeColUnsubs = new Set<() => void>();
    let registeredCleanup = false;
    const ensureCleanupRegistered = () => {
      if (registeredCleanup) return;
      registeredCleanup = true;
      unsubs.push(() => {
        activeColUnsubs.forEach((u) => u());
        activeColUnsubs.clear();
      });
    };

    const allowedStores = Array.from(new Set(ctx.assignedStoreIds || [])).filter(Boolean).slice(0, 10);

    const buildQueries = (forceStoreScoped = false) => {
      if (options?.adminOnly) {
        return [
          ctx.isPlatformAdmin || ctx.isWsAdmin
            ? colRef
            : query(colRef, where('adminUids', 'array-contains', ctx.uid)),
        ];
      }
      if (!forceStoreScoped && isWorkspaceWide) {
        return [colRef];
      }
      if (!forceStoreScoped && (ctx.isPlatformAdmin || ctx.isWsAdmin)) {
        return [colRef];
      }
      return allowedStores.map((sId) => query(colRef, where('storeId', '==', sId)));
    };

    const docsByQueryIdx = new Map<number, Map<string, { item: T; memberUids?: string[] }>>();
    const emitMerged = () => {
      const mergedMap = new Map<string, { item: T; memberUids?: string[] }>();
      docsByQueryIdx.forEach((m) => {
        m.forEach((val, docId) => mergedMap.set(docId, val));
      });
      const tracker: { id: string; memberUids?: string[] }[] = [];
      const items: T[] = [];
      mergedMap.forEach((entry, docId) => {
        tracker.push({ id: docId, memberUids: entry.memberUids });
        items.push(entry.item);
      });
      if (options?.sortDescCreatedAt) {
        items.sort((a, b) =>
          String((b as unknown as Record<string, unknown>).createdAt || '').localeCompare(
            String((a as unknown as Record<string, unknown>).createdAt || '')
          )
        );
      }
      rawMemberTracking[colName] = tracker;
      assign(items);
      scheduleFlush();
    };

    const attachQueries = (queriesToAttach: ReturnType<typeof buildQueries>, isStoreFallback: boolean) => {
      if (disposed) return;
      activeColUnsubs.forEach((u) => u());
      activeColUnsubs.clear();
      docsByQueryIdx.clear();

      if (queriesToAttach.length === 0) {
        rawMemberTracking[colName] = [];
        assign([]);
        scheduleFlush();
        return;
      }

      ensureCleanupRegistered();
      let switchedToFallback = false;

      queriesToAttach.forEach((q, qIdx) => {
        const unsub = onSnapshot(
          q,
          (snap) => {
            const localMap = new Map<string, { item: T; memberUids?: string[] }>();
            snap.docs.forEach((d) => {
              const raw = d.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>;
              const memberUids = Array.isArray(raw.memberUids) ? (raw.memberUids as string[]) : undefined;
              const normalized = normalizeDocDates({ ...raw, id: d.id });
              const item = options?.mapItem ? options.mapItem(normalized) : (normalized as unknown as T);
              localMap.set(d.id, { item, memberUids });
            });
            docsByQueryIdx.set(qIdx, localMap);
            emitMerged();
          },
          (err) => {
            const errCode =
              typeof err === 'object' && err !== null && 'code' in err
                ? String((err as { code?: unknown }).code).toLowerCase()
                : '';
            const errMsg = (err instanceof Error ? err.message : String(err)).toLowerCase();
            const isPermErr =
              errCode.includes('permission-denied') ||
              errMsg.includes('permission') ||
              errMsg.includes('insufficient');

            if (
              isPermErr &&
              !isStoreFallback &&
              !switchedToFallback &&
              !options?.adminOnly &&
              !ctx.isPlatformAdmin &&
              !ctx.isWsAdmin &&
              allowedStores.length > 0
            ) {
              switchedToFallback = true;
              const fallbackQueries = buildQueries(true);
              attachQueries(fallbackQueries, true);
              return;
            }

            if (isPermErr) {
              console.warn(`[firebaseSync] Non-fatal list permission warning on ${colPath}:`, err);
              if (onSyncWarning) {
                onSyncWarning(err instanceof Error ? err : new Error(String(err)));
              }
              return;
            }

            try {
              handleFirestoreError(err, OperationType.LIST, colPath);
            } catch (wrapped) {
              onFatalError(wrapped as Error);
            }
          }
        );
        activeColUnsubs.add(unsub);
      });
    };

    attachQueries(buildQueries(false), false);
  };

  watchCol<Store>('stores', (items) => {
    bucket.stores = items;
  });
  watchCol<Warehouse>('warehouses', (items) => {
    bucket.warehouses = items;
  });
  watchCol<Category>('categories', (items) => {
    items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    bucket.categories = items;
  });
  watchCol<Brand>('brands', (items) => {
    bucket.brands = items;
  });
  watchCol<Product>('products', (items) => {
    bucket.products = items;
  }, { sortDescCreatedAt: true });
  watchCol<Supplier>('suppliers', (items) => {
    bucket.suppliers = items;
  }, { sortDescCreatedAt: true });
  watchCol<StockItem>('stockItems', (items) => {
    bucket.stockItems = items;
  });
  watchCol<StockMovement>('stockMovements', (items) => {
    bucket.stockMovements = items;
  }, { sortDescCreatedAt: true });
  watchCol<PurchaseReceipt>('purchaseReceipts', (items) => {
    bucket.purchaseReceipts = items;
  }, { sortDescCreatedAt: true });
  watchCol<PurchaseOrder>('purchaseOrders', (items) => {
    bucket.purchaseOrders = items;
  }, { sortDescCreatedAt: true });
  watchCol<Transfer>('transfers', (items) => {
    bucket.transfers = items;
  }, { sortDescCreatedAt: true });
  watchCol<WriteOff>('writeOffs', (items) => {
    bucket.writeOffs = items;
  }, { sortDescCreatedAt: true });
  watchCol<Stocktake>('stocktakes', (items) => {
    bucket.stocktakes = items;
  }, { sortDescCreatedAt: true });
  watchCol<Sale>('sales', (items) => {
    bucket.sales = items;
  }, { sortDescCreatedAt: true });
  watchCol<Return>('returns', (items) => {
    bucket.returns = items;
  }, { sortDescCreatedAt: true });
  watchCol<CashShift>('cashShifts', (items) => {
    bucket.cashShifts = items;
  }, { sortDescCreatedAt: true });
  watchCol<CashOperation>('cashOperations', (items) => {
    bucket.cashOperations = items;
  }, { sortDescCreatedAt: true });
  watchCol<Account>('accounts', (items) => {
    bucket.accounts = items;
  });
  watchCol<Transaction>('transactions', (items) => {
    bucket.transactions = items;
  }, { sortDescCreatedAt: true });
  watchCol<Expense>('expenses', (items) => {
    bucket.expenses = items;
  }, { sortDescCreatedAt: true });
  watchCol<Customer>('customers', (items) => {
    bucket.customers = items;
  }, { sortDescCreatedAt: true });
  watchCol<LoyaltyAccount>('loyaltyAccounts', (items) => {
    bucket.loyaltyAccounts = items;
  });
  watchCol<LoyaltyTransaction>('loyaltyTransactions', (items) => {
    bucket.loyaltyTransactions = items;
  }, { sortDescCreatedAt: true });
  watchCol<Debt>('debts', (items) => {
    bucket.debts = items;
  }, { sortDescCreatedAt: true });
  watchCol<PromoCode>('promoCodes', (items) => {
    bucket.promoCodes = items;
  }, { sortDescCreatedAt: true });
  watchCol<Record<string, unknown> & { id: string }>('staffDirectory', (items) => {
    bucket.staffDirectory = items;
  });
  watchCol<Target>('targets', (items) => {
    bucket.targets = items;
  });
  watchCol<OnlineOrder>('onlineOrders', (items) => {
    bucket.onlineOrders = items;
  }, { sortDescCreatedAt: true });
  watchCol<AuditLog>(
    'auditLogs',
    (items) => {
      bucket.auditLogs = items;
    },
    {
      sortDescCreatedAt: true,
      mapItem: (raw) =>
        ({
          ...raw,
          summary: String(raw.details || raw.action || ''),
          details: raw.details ? String(raw.details) : undefined,
        }) as unknown as AuditLog,
    }
  );

  // Admin-only split PII & integration secrets
  if (ctx.isWsAdmin) {
    watchCol<Record<string, unknown> & { id: string }>(
      'staffCredentials',
      (items) => {
        bucket.staffCredentials = items;
      },
      { adminOnly: true }
    );

    unsubs.push(
      onSnapshot(
        doc(firestoreDb, 'workspaces', ctx.workspaceId, 'privateSettings', 'integrations'),
        (snap) => {
          if (!snap.exists()) return;
          const d = snap.data({ serverTimestamps: 'estimate' });
          bucket.privateIntegrations = d.integrations as AppSettings['integrations'];
          scheduleFlush();
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.GET, `${wsPath}/privateSettings/integrations`);
          } catch (wrapped) {
            onFatalError(wrapped as Error);
          }
        }
      )
    );
  }

  return () => {
    disposed = true;
    if (flushTimer) clearTimeout(flushTimer);
    unsubs.forEach((fn) => fn());
  };
}

// --- Idempotent Atomic Sync Operations ---

export async function pushSyncItemToFirestore(
  ctx: WorkspaceContext,
  item: OfflineSyncItem,
  snapshot: DatabaseSnapshot
): Promise<void> {
  const wsPath = `workspaces/${ctx.workspaceId}`;
  const opId = sanitizeId(item.idempotencyKey || item.id);
  const syncedOpRef = doc(firestoreDb, wsPath, 'syncedOps', opId);
  const tenantCtx = { ownerUid: ctx.ownerUid, memberUids: ctx.memberUids, uid: ctx.uid };

  // Skip idempotency check only if already recorded
  try {
    const existingOp = await getDoc(syncedOpRef);
    if (existingOp.exists()) return;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `${wsPath}/syncedOps/${opId}`);
  }

  const payload = (item.payload || {}) as Record<string, unknown>;
  const storeIdForOp = nonEmptyStr(payload.storeId || snapshot.stores[0]?.id, 128, 'store-chilonzor');

  const markSyncedInBatch = (batch: WriteBatch) => {
    batch.set(syncedOpRef, {
      id: opId,
      opType: clampStr(item.type, 80),
      actorUid: ctx.uid,
      storeId: storeIdForOp,
      ownerUid: ctx.ownerUid,
      memberUids: Array.from(new Set([ctx.ownerUid, ...ctx.memberUids])).slice(0, 50),
      createdBy: ctx.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const applyStockDeltasInTx = async (
    entries: {
      productId: string;
      variantId: string;
      warehouseId: string;
      storeId: string;
      qtyDelta: number;
      movement?: StockMovement;
    }[],
    markFinalOp = false
  ) => {
    const stockPhaseId = markFinalOp ? opId : sanitizeId(`${opId}__stock`);
    const phaseOpRef = markFinalOp ? syncedOpRef : doc(firestoreDb, wsPath, 'syncedOps', stockPhaseId);
    try {
      await runTransaction(firestoreDb, async (tx) => {
        const opSnap = await tx.get(phaseOpRef);
        if (opSnap.exists()) return;

        // Aggregate per (warehouseId, variantId) so duplicate variant entries never clash
        const grouped = new Map<
          string,
          {
            stkId: string;
            productId: string;
            variantId: string;
            warehouseId: string;
            storeId: string;
            totalDelta: number;
            movements: StockMovement[];
          }
        >();

        for (const entry of entries) {
          const stkId = stockItemDocId(entry.warehouseId, entry.variantId);
          const prev = grouped.get(stkId);
          if (prev) {
            prev.totalDelta = Number((prev.totalDelta + entry.qtyDelta).toFixed(3));
            if (entry.movement) prev.movements.push(entry.movement);
          } else {
            grouped.set(stkId, {
              stkId,
              productId: entry.productId,
              variantId: entry.variantId,
              warehouseId: entry.warehouseId,
              storeId: entry.storeId,
              totalDelta: Number(entry.qtyDelta.toFixed(3)),
              movements: entry.movement ? [entry.movement] : [],
            });
          }
        }

        // Read all affected stockItems first (Firestore transactions require all reads before writes)
        const reads: {
          group: NonNullable<ReturnType<typeof grouped.get>>;
          ref: ReturnType<typeof doc>;
          exists: boolean;
          currentQty: number;
        }[] = [];

        for (const group of grouped.values()) {
          const ref = doc(firestoreDb, wsPath, 'stockItems', group.stkId);
          const snap = await tx.get(ref);
          const currentQty = snap.exists() ? Number(snap.data().qty || 0) : 0;
          const nextQty = Number((currentQty + group.totalDelta).toFixed(3));
          if (group.totalDelta < 0 && !snapshot.settings.allowNegativeStock && nextQty < 0) {
            const prodName =
              snapshot.products.find((p) => p.id === group.productId)?.name || 'Mahsulot';
            throw new BusinessRuleError(
              `"${prodName}" omborda yetarli emas (Mavjud: ${currentQty}, So'ralgan: ${Math.abs(group.totalDelta)}).`
            );
          }
          reads.push({
            group,
            ref,
            exists: snap.exists(),
            currentQty,
          });
        }

        for (const r of reads) {
          const nextQty = Number((r.currentQty + r.group.totalDelta).toFixed(3));
          if (r.exists) {
            tx.update(r.ref, { qty: nextQty, updatedAt: serverTimestamp() });
          } else {
            tx.set(
              r.ref,
              serializeStockItem(
                {
                  id: r.group.stkId,
                  productId: r.group.productId,
                  variantId: r.group.variantId,
                  warehouseId: r.group.warehouseId,
                  qty: nextQty,
                  storeId: r.group.storeId,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: ctx.uid,
                },
                tenantCtx
              )
            );
          }

          let runningQty = r.currentQty;
          for (const rawMov of r.group.movements) {
            runningQty = Number((runningQty + rawMov.qtyDelta).toFixed(3));
            const mov = { ...rawMov, qtyAfter: runningQty };
            tx.set(
              doc(firestoreDb, wsPath, 'stockMovements', sanitizeId(mov.id)),
              serializeStockMovement(mov, tenantCtx)
            );
          }
        }

        tx.set(phaseOpRef, {
          id: stockPhaseId,
          opType: clampStr(markFinalOp ? item.type : `${item.type}_stock`, 80),
          actorUid: ctx.uid,
          storeId: storeIdForOp,
          ownerUid: ctx.ownerUid,
          memberUids: Array.from(new Set([ctx.ownerUid, ...ctx.memberUids])).slice(0, 50),
          createdBy: ctx.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    } catch (err) {
      if (err instanceof BusinessRuleError) throw err;
      handleFirestoreError(err, OperationType.WRITE, `${wsPath}/stockItems`);
    }
  };

  try {
    switch (item.type) {
      case 'category': {
        const catId = String(payload.categoryId || '');
        const cat = snapshot.categories.find((c) => c.id === catId);
        if (!cat) return;
        const ref = doc(firestoreDb, wsPath, 'categories', sanitizeId(cat.id));
        const existing = await getDoc(ref);
        const batch = writeBatch(firestoreDb);
        if (existing.exists()) {
          batch.update(ref, {
            nameUz: nonEmptyStr(cat.nameUz, 120, 'Kategoriya'),
            nameRu: nonEmptyStr(cat.nameRu, 120, cat.nameUz),
            sortOrder: Number(cat.sortOrder) || 0,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(ref, serializeCategory(cat, tenantCtx));
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'category_delete': {
        const catId = sanitizeId(String(payload.categoryId || ''));
        const batch = writeBatch(firestoreDb);
        batch.delete(doc(firestoreDb, wsPath, 'categories', catId));
        const reassignedIds = Array.isArray(payload.reassignedProductIds)
          ? (payload.reassignedProductIds as string[])
          : [];
        reassignedIds.forEach((pid) => {
          const prod = snapshot.products.find((p) => p.id === pid);
          if (prod) {
            batch.update(doc(firestoreDb, wsPath, 'products', sanitizeId(pid)), {
              categoryId: prod.categoryId,
              updatedAt: serverTimestamp(),
            });
          }
        });
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'categories_reset': {
        const writer = new ChunkedBatchWriter();
        const existingSnap = await getDocs(collection(firestoreDb, wsPath, 'categories'));
        const newIds = new Set(snapshot.categories.map((c) => sanitizeId(c.id)));
        existingSnap.docs.forEach((d) => {
          if (!newIds.has(d.id)) {
            writer.add((b) => b.delete(d.ref));
          }
        });
        snapshot.categories.forEach((c) => {
          writer.add((b) =>
            b.set(doc(firestoreDb, wsPath, 'categories', sanitizeId(c.id)), serializeCategory(c, tenantCtx))
          );
        });
        snapshot.products.forEach((p) => {
          writer.add((b) =>
            b.update(doc(firestoreDb, wsPath, 'products', sanitizeId(p.id)), {
              categoryId: p.categoryId,
              updatedAt: serverTimestamp(),
            })
          );
        });
        writer.add(markSyncedInBatch);
        await writer.commitAll(`${wsPath}/categories`);
        return;
      }

      case 'product': {
        const productId = String(payload.productId || '');
        const prod = snapshot.products.find((p) => p.id === productId);
        if (!prod) return;
        const ref = doc(firestoreDb, wsPath, 'products', sanitizeId(prod.id));
        const existing = await getDoc(ref);
        const batch = writeBatch(firestoreDb);
        const serialized = serializeProduct(prod, tenantCtx);
        if (existing.exists()) {
          const {
            id: _id,
            ownerUid: _o,
            createdBy: _cb,
            createdAt: _ca,
            storeId: _s,
            memberUids: _m,
            ...updatable
          } = serialized;
          batch.update(ref, { ...updatable, updatedAt: serverTimestamp() });
        } else {
          batch.set(ref, serialized);
        }
        const auditId = payload.auditId ? String(payload.auditId) : null;
        if (auditId) {
          const aud = snapshot.auditLogs.find((a) => a.id === auditId);
          if (aud) {
            batch.set(doc(firestoreDb, wsPath, 'auditLogs', sanitizeId(aud.id)), serializeAuditLog(aud, tenantCtx));
          }
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'product_delete': {
        const productId = sanitizeId(String(payload.productId || ''));
        const batch = writeBatch(firestoreDb);
        batch.delete(doc(firestoreDb, wsPath, 'products', productId));
        const deletedStockIds = Array.isArray(payload.deletedStockIds) ? (payload.deletedStockIds as string[]) : [];
        deletedStockIds.forEach((sId) => {
          batch.delete(doc(firestoreDb, wsPath, 'stockItems', sanitizeId(sId)));
        });
        const auditId = payload.auditId ? String(payload.auditId) : null;
        if (auditId) {
          const aud = snapshot.auditLogs.find((a) => a.id === auditId);
          if (aud) {
            batch.set(doc(firestoreDb, wsPath, 'auditLogs', sanitizeId(aud.id)), serializeAuditLog(aud, tenantCtx));
          }
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'bulk_prices': {
        const productIds = Array.isArray(payload.productIds) ? (payload.productIds as string[]) : [];
        const writer = new ChunkedBatchWriter();
        productIds.forEach((pid) => {
          const prod = snapshot.products.find((p) => p.id === pid);
          if (prod) {
            const ser = serializeProduct(prod, tenantCtx);
            writer.add((b) =>
              b.update(doc(firestoreDb, wsPath, 'products', sanitizeId(pid)), {
                variants: ser.variants,
                updatedAt: serverTimestamp(),
              })
            );
          }
        });
        const auditId = payload.auditId ? String(payload.auditId) : null;
        if (auditId) {
          const aud = snapshot.auditLogs.find((a) => a.id === auditId);
          if (aud) {
            writer.add((b) =>
              b.set(doc(firestoreDb, wsPath, 'auditLogs', sanitizeId(aud.id)), serializeAuditLog(aud, tenantCtx))
            );
          }
        }
        writer.add(markSyncedInBatch);
        await writer.commitAll(`${wsPath}/products`);
        return;
      }

      case 'quick_stock': {
        const movementId = String(payload.movementId || '');
        const mov = snapshot.stockMovements.find((m) => m.id === movementId);
        if (!mov) return;
        await applyStockDeltasInTx(
          [
            {
              productId: mov.productId,
              variantId: mov.variantId,
              warehouseId: mov.warehouseId,
              storeId: mov.storeId,
              qtyDelta: mov.qtyDelta,
              movement: mov,
            },
          ],
          true
        );
        return;
      }

      case 'import_products': {
        const productIds = Array.isArray(payload.productIds) ? (payload.productIds as string[]) : [];
        const movementIds = Array.isArray(payload.movementIds) ? (payload.movementIds as string[]) : [];
        const writer = new ChunkedBatchWriter();
        for (const pid of productIds) {
          const prod = snapshot.products.find((p) => p.id === pid);
          if (!prod) continue;
          const ref = doc(firestoreDb, wsPath, 'products', sanitizeId(prod.id));
          const serialized = serializeProduct(prod, tenantCtx);
          const existingSnap = item.attempts > 0 ? await getDoc(ref) : null;
          if (existingSnap?.exists()) {
            const {
              id: _id,
              ownerUid: _o,
              createdBy: _cb,
              createdAt: _ca,
              storeId: _s,
              memberUids: _m,
              ...updatable
            } = serialized;
            writer.add((b) => b.update(ref, { ...updatable, updatedAt: serverTimestamp() }));
          } else {
            writer.add((b) => b.set(ref, serialized));
          }
        }
        await writer.commitAll(`${wsPath}/products`);
        const entries = movementIds
          .map((mid) => snapshot.stockMovements.find((m) => m.id === mid))
          .filter(Boolean)
          .map((m) => ({
            productId: m!.productId,
            variantId: m!.variantId,
            warehouseId: m!.warehouseId,
            storeId: m!.storeId,
            qtyDelta: m!.qtyDelta,
            movement: m!,
          }));
        if (entries.length > 0) {
          await applyStockDeltasInTx(entries, false);
        }
        const b = writeBatch(firestoreDb);
        markSyncedInBatch(b);
        await b.commit();
        return;
      }

      case 'purchase_receipt': {
        const receiptId = String(payload.receiptId || '');
        const pr = snapshot.purchaseReceipts.find((r) => r.id === receiptId);
        if (!pr) return;
        const movementIds = Array.isArray(payload.movementIds) ? (payload.movementIds as string[]) : [];
        const movements = movementIds
          .map((id) => snapshot.stockMovements.find((m) => m.id === id))
          .filter(Boolean) as StockMovement[];

        // Update stock atomically first
        if (movements.length > 0) {
          await applyStockDeltasInTx(
            movements.map((m) => ({
              productId: m.productId,
              variantId: m.variantId,
              warehouseId: m.warehouseId,
              storeId: m.storeId,
              qtyDelta: m.qtyDelta,
              movement: m,
            }))
          );
        }

        const batch = writeBatch(firestoreDb);
        batch.set(doc(firestoreDb, wsPath, 'purchaseReceipts', sanitizeId(pr.id)), serializePurchaseReceipt(pr, tenantCtx));

        // Update product variants purchasePrice if changed
        const touchedProducts = new Set(pr.items.map((it) => it.productId));
        touchedProducts.forEach((pid) => {
          const prod = snapshot.products.find((p) => p.id === pid);
          if (prod) {
            const ser = serializeProduct(prod, tenantCtx);
            batch.update(doc(firestoreDb, wsPath, 'products', sanitizeId(pid)), {
              variants: ser.variants,
              updatedAt: serverTimestamp(),
            });
          }
        });

        const sup = snapshot.suppliers.find((s) => s.id === pr.supplierId);
        if (sup) {
          const supDelta = typeof payload.supplierDebtDelta === 'number' ? payload.supplierDebtDelta : null;
          batch.update(doc(firestoreDb, wsPath, 'suppliers', sanitizeId(sup.id)), {
            debtBalance: supDelta !== null ? increment(supDelta) : sup.debtBalance,
            updatedAt: serverTimestamp(),
          });
        }
        if (payload.accountId) {
          const acc = snapshot.accounts.find((a) => a.id === String(payload.accountId));
          if (acc) {
            const accDelta = typeof payload.accountDelta === 'number' ? payload.accountDelta : null;
            batch.update(doc(firestoreDb, wsPath, 'accounts', sanitizeId(acc.id)), {
              balance: accDelta !== null ? increment(accDelta) : acc.balance,
              updatedAt: serverTimestamp(),
            });
          }
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'purchase_order': {
        const poId = String(payload.poId || '');
        const po = snapshot.purchaseOrders.find((x) => x.id === poId);
        if (!po) return;
        const batch = writeBatch(firestoreDb);
        batch.set(doc(firestoreDb, wsPath, 'purchaseOrders', sanitizeId(po.id)), serializePurchaseOrder(po, tenantCtx));
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'purchase_order_status': {
        const poId = String(payload.poId || '');
        const po = snapshot.purchaseOrders.find((x) => x.id === poId);
        if (!po) return;
        const batch = writeBatch(firestoreDb);
        batch.update(doc(firestoreDb, wsPath, 'purchaseOrders', sanitizeId(po.id)), {
          status: po.status,
          updatedAt: serverTimestamp(),
        });
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'transfer': {
        const transferId = String(payload.transferId || '');
        const tr = snapshot.transfers.find((x) => x.id === transferId);
        if (!tr) return;
        const movementIds = Array.isArray(payload.movementIds) ? (payload.movementIds as string[]) : [];
        const movements = movementIds
          .map((id) => snapshot.stockMovements.find((m) => m.id === id))
          .filter(Boolean) as StockMovement[];

        if (movements.length > 0) {
          await applyStockDeltasInTx(
            movements.map((m) => ({
              productId: m.productId,
              variantId: m.variantId,
              warehouseId: m.warehouseId,
              storeId: m.storeId,
              qtyDelta: m.qtyDelta,
              movement: m,
            }))
          );
        }
        const batch = writeBatch(firestoreDb);
        batch.set(doc(firestoreDb, wsPath, 'transfers', sanitizeId(tr.id)), serializeTransfer(tr, tenantCtx));
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'transfer_receive': {
        const transferId = String(payload.transferId || '');
        const tr = snapshot.transfers.find((x) => x.id === transferId);
        if (!tr) return;
        const movementIds = Array.isArray(payload.movementIds) ? (payload.movementIds as string[]) : [];
        const movements = movementIds
          .map((id) => snapshot.stockMovements.find((m) => m.id === id))
          .filter(Boolean) as StockMovement[];

        if (movements.length > 0) {
          await applyStockDeltasInTx(
            movements.map((m) => ({
              productId: m.productId,
              variantId: m.variantId,
              warehouseId: m.warehouseId,
              storeId: m.storeId,
              qtyDelta: m.qtyDelta,
              movement: m,
            }))
          );
        }
        const batch = writeBatch(firestoreDb);
        batch.update(doc(firestoreDb, wsPath, 'transfers', sanitizeId(tr.id)), {
          status: tr.status,
          items: tr.items,
          updatedAt: serverTimestamp(),
        });
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'write_off': {
        const writeOffId = String(payload.writeOffId || '');
        const wo = snapshot.writeOffs.find((x) => x.id === writeOffId);
        if (!wo) return;
        const movementIds = Array.isArray(payload.movementIds) ? (payload.movementIds as string[]) : [];
        const movements = movementIds
          .map((id) => snapshot.stockMovements.find((m) => m.id === id))
          .filter(Boolean) as StockMovement[];

        if (movements.length > 0) {
          await applyStockDeltasInTx(
            movements.map((m) => ({
              productId: m.productId,
              variantId: m.variantId,
              warehouseId: m.warehouseId,
              storeId: m.storeId,
              qtyDelta: m.qtyDelta,
              movement: m,
            }))
          );
        }
        const batch = writeBatch(firestoreDb);
        batch.set(doc(firestoreDb, wsPath, 'writeOffs', sanitizeId(wo.id)), serializeWriteOff(wo, tenantCtx));
        if (payload.auditId) {
          const aud = snapshot.auditLogs.find((a) => a.id === String(payload.auditId));
          if (aud) {
            batch.set(doc(firestoreDb, wsPath, 'auditLogs', sanitizeId(aud.id)), serializeAuditLog(aud, tenantCtx));
          }
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'stocktake': {
        const stocktakeId = String(payload.stocktakeId || '');
        const st = snapshot.stocktakes.find((x) => x.id === stocktakeId);
        if (!st) return;
        const ref = doc(firestoreDb, wsPath, 'stocktakes', sanitizeId(st.id));
        const existing = await getDoc(ref);
        const batch = writeBatch(firestoreDb);
        if (existing.exists()) {
          batch.update(ref, {
            status: st.status,
            items: st.items,
            totalDiscrepancyValue: st.totalDiscrepancyValue,
            ...(st.note !== undefined ? { note: clampStr(st.note, 500) } : {}),
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(ref, serializeStocktake(st, tenantCtx));
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'stocktake_apply': {
        const stocktakeId = String(payload.stocktakeId || '');
        const st = snapshot.stocktakes.find((x) => x.id === stocktakeId);
        if (!st) return;
        const movementIds = Array.isArray(payload.movementIds) ? (payload.movementIds as string[]) : [];
        const movements = movementIds
          .map((id) => snapshot.stockMovements.find((m) => m.id === id))
          .filter(Boolean) as StockMovement[];

        if (movements.length > 0) {
          await applyStockDeltasInTx(
            movements.map((m) => ({
              productId: m.productId,
              variantId: m.variantId,
              warehouseId: m.warehouseId,
              storeId: m.storeId,
              qtyDelta: m.qtyDelta,
              movement: m,
            }))
          );
        }
        const batch = writeBatch(firestoreDb);
        batch.update(doc(firestoreDb, wsPath, 'stocktakes', sanitizeId(st.id)), {
          status: st.status,
          items: st.items,
          totalDiscrepancyValue: st.totalDiscrepancyValue,
          updatedAt: serverTimestamp(),
        });
        if (payload.auditId) {
          const aud = snapshot.auditLogs.find((a) => a.id === String(payload.auditId));
          if (aud) {
            batch.set(doc(firestoreDb, wsPath, 'auditLogs', sanitizeId(aud.id)), serializeAuditLog(aud, tenantCtx));
          }
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'supplier': {
        const supplierId = String(payload.supplierId || '');
        const sup = snapshot.suppliers.find((s) => s.id === supplierId);
        if (!sup) return;
        const ref = doc(firestoreDb, wsPath, 'suppliers', sanitizeId(sup.id));
        const existing = await getDoc(ref);
        const batch = writeBatch(firestoreDb);
        if (existing.exists()) {
          batch.update(ref, {
            name: nonEmptyStr(sup.name, 150, "Ta'minotchi"),
            contactName: clampStr(sup.contactName, 120, ''),
            phone: clampStr(sup.phone, 40, ''),
            ...(sup.address !== undefined ? { address: clampStr(sup.address, 300) } : {}),
            ...(sup.notes !== undefined ? { notes: clampStr(sup.notes, 500) } : {}),
            debtBalance: Number(sup.debtBalance) || 0,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(ref, serializeSupplier(sup, tenantCtx));
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'supplier_debt_pay': {
        const sup = snapshot.suppliers.find((s) => s.id === String(payload.supplierId || ''));
        const acc = snapshot.accounts.find((a) => a.id === String(payload.accountId || ''));
        const trx = snapshot.transactions.find((t) => t.id === String(payload.transactionId || ''));
        const batch = writeBatch(firestoreDb);
        if (sup) {
          const supDelta = typeof payload.supplierDebtDelta === 'number' ? payload.supplierDebtDelta : null;
          batch.update(doc(firestoreDb, wsPath, 'suppliers', sanitizeId(sup.id)), {
            debtBalance: supDelta !== null ? increment(supDelta) : sup.debtBalance,
            updatedAt: serverTimestamp(),
          });
        }
        if (acc) {
          const accDelta = typeof payload.accountDelta === 'number' ? payload.accountDelta : null;
          batch.update(doc(firestoreDb, wsPath, 'accounts', sanitizeId(acc.id)), {
            balance: accDelta !== null ? increment(accDelta) : acc.balance,
            updatedAt: serverTimestamp(),
          });
        }
        if (trx) {
          batch.set(doc(firestoreDb, wsPath, 'transactions', sanitizeId(trx.id)), serializeFinanceTransaction(trx, tenantCtx));
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'sale':
      case 'sale_pay_deferred': {
        const saleId = String(payload.saleId || '');
        const sale = snapshot.sales.find((s) => s.id === saleId);
        if (!sale) return;

        const movementIds = Array.isArray(payload.movementIds) ? (payload.movementIds as string[]) : [];
        const movements = movementIds
          .map((id) => snapshot.stockMovements.find((m) => m.id === id))
          .filter(Boolean) as StockMovement[];

        await runTransaction(firestoreDb, async (tx) => {
          // 1. Idempotency check (both syncedOp marker & existing sale document)
          const opSnap = await tx.get(syncedOpRef);
          if (opSnap.exists()) return;

          const saleRef = doc(firestoreDb, wsPath, 'sales', sanitizeId(sale.id));
          const saleSnap = await tx.get(saleRef);

          // 2. Prevent duplicate direct sale writes or double stock deduction
          if (item.type === 'sale') {
            if (saleSnap.exists()) return;
          } else if (item.type === 'sale_pay_deferred') {
            if (!saleSnap.exists() || saleSnap.data()?.status !== 'deferred') {
              throw new BusinessRuleError("Ushbu kechiktirilgan chek allaqachon to'langan yoki topilmadi.");
            }
          }

          // 3. Group & read all affected stockItems first
          const stockGroups = new Map<
            string,
            {
              stkId: string;
              productId: string;
              variantId: string;
              warehouseId: string;
              storeId: string;
              totalDelta: number;
              movements: StockMovement[];
            }
          >();
          for (const m of movements) {
            const stkId = stockItemDocId(m.warehouseId, m.variantId);
            const prev = stockGroups.get(stkId);
            if (prev) {
              prev.totalDelta = Number((prev.totalDelta + m.qtyDelta).toFixed(3));
              prev.movements.push(m);
            } else {
              stockGroups.set(stkId, {
                stkId,
                productId: m.productId,
                variantId: m.variantId,
                warehouseId: m.warehouseId,
                storeId: m.storeId,
                totalDelta: Number(m.qtyDelta.toFixed(3)),
                movements: [m],
              });
            }
          }

          const stockReads: {
            group: NonNullable<ReturnType<typeof stockGroups.get>>;
            ref: ReturnType<typeof doc>;
            exists: boolean;
            currentQty: number;
          }[] = [];

          for (const group of stockGroups.values()) {
            const ref = doc(firestoreDb, wsPath, 'stockItems', group.stkId);
            const snap = await tx.get(ref);
            const currentQty = snap.exists() ? Number(snap.data().qty || 0) : 0;
            const nextQty = Number((currentQty + group.totalDelta).toFixed(3));
            if (group.totalDelta < 0 && !snapshot.settings.allowNegativeStock && nextQty < 0) {
              const prodName =
                snapshot.products.find((p) => p.id === group.productId)?.name ||
                sale.items.find((i) => i.productId === group.productId)?.productName ||
                'Mahsulot';
              throw new BusinessRuleError(
                `"${prodName}" omborda yetarli emas (Qoldiq: ${currentQty}, So'ralgan: ${Math.abs(group.totalDelta)}).`
              );
            }
            stockReads.push({ group, ref, exists: snap.exists(), currentQty });
          }

          // 4. Read customer, loyalty, promo, shift, accounts BEFORE any writes
          const cust = sale.customerId ? snapshot.customers.find((c) => c.id === sale.customerId) : undefined;
          const custRef = cust ? doc(firestoreDb, wsPath, 'customers', sanitizeId(cust.id)) : null;
          const custSnap = custRef ? await tx.get(custRef) : null;

          const loy = sale.customerId ? snapshot.loyaltyAccounts.find((l) => l.customerId === sale.customerId) : undefined;
          const loyRef = loy ? doc(firestoreDb, wsPath, 'loyaltyAccounts', sanitizeId(loy.id)) : null;
          const loySnap = loyRef ? await tx.get(loyRef) : null;

          const promo = sale.promoCode
            ? snapshot.promoCodes.find((p) => p.code.toUpperCase() === sale.promoCode?.toUpperCase())
            : undefined;
          const promoRef = promo ? doc(firestoreDb, wsPath, 'promoCodes', sanitizeId(promo.id)) : null;
          const promoSnap = promoRef ? await tx.get(promoRef) : null;

          const sh = sale.shiftId ? snapshot.cashShifts.find((s) => s.id === sale.shiftId) : undefined;
          const shiftRef = sh ? doc(firestoreDb, wsPath, 'cashShifts', sanitizeId(sh.id)) : null;
          const shiftSnap = shiftRef ? await tx.get(shiftRef) : null;

          const accountIds = Array.from(
            new Set(Array.isArray(payload.accountIds) ? (payload.accountIds as string[]) : [])
          );
          const accountDeltas = (payload.accountDeltas || null) as Record<string, number> | null;
          const accReads: {
            acc: Account;
            ref: ReturnType<typeof doc>;
            exists: boolean;
            currentBalance: number;
            delta: number | null;
          }[] = [];
          for (const accId of accountIds) {
            const acc = snapshot.accounts.find((a) => a.id === accId);
            if (!acc) continue;
            const ref = doc(firestoreDb, wsPath, 'accounts', sanitizeId(acc.id));
            const snap = await tx.get(ref);
            accReads.push({
              acc,
              ref,
              exists: snap.exists(),
              currentBalance: snap.exists() ? Number(snap.data().balance || 0) : Number(acc.balance || 0),
              delta: accountDeltas && typeof accountDeltas[accId] === 'number' ? accountDeltas[accId] : null,
            });
          }

          // 5. All writes atomically inside the same transaction
          for (const r of stockReads) {
            const nextQty = Number((r.currentQty + r.group.totalDelta).toFixed(3));
            if (r.exists) {
              tx.update(r.ref, { qty: nextQty, updatedAt: serverTimestamp() });
            } else {
              tx.set(
                r.ref,
                serializeStockItem(
                  {
                    id: r.group.stkId,
                    productId: r.group.productId,
                    variantId: r.group.variantId,
                    warehouseId: r.group.warehouseId,
                    qty: nextQty,
                    storeId: r.group.storeId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: ctx.uid,
                  },
                  tenantCtx
                )
              );
            }
            let runningQty = r.currentQty;
            for (const rawMov of r.group.movements) {
              runningQty = Number((runningQty + rawMov.qtyDelta).toFixed(3));
              const mov = { ...rawMov, qtyAfter: runningQty };
              tx.set(
                doc(firestoreDb, wsPath, 'stockMovements', sanitizeId(mov.id)),
                serializeStockMovement(mov, tenantCtx)
              );
            }
          }

          if (item.type === 'sale_pay_deferred') {
            tx.update(
              saleRef,
              stripUndefinedDeep({
                status: sale.status,
                payments: sale.payments,
                paidAmount: sale.paidAmount,
                debtAmount: sale.debtAmount,
                totalAmount: sale.totalAmount,
                vatAmount: sale.vatAmount,
                loyaltyPointsSpent: sale.loyaltyPointsSpent,
                loyaltyPointsEarned: sale.loyaltyPointsEarned,
                cashierId: sale.cashierId,
                cashierName: sale.cashierName,
                offlineCreated: false,
                syncedAt: new Date().toISOString(),
                ...(sale.customerId !== undefined ? { customerId: sale.customerId } : {}),
                ...(sale.customerName !== undefined ? { customerName: sale.customerName } : {}),
                ...(sale.shiftId !== undefined ? { shiftId: sale.shiftId } : {}),
                ...(sale.cashGiven !== undefined ? { cashGiven: sale.cashGiven } : {}),
                ...(sale.changeAmount !== undefined ? { changeAmount: sale.changeAmount } : {}),
                ...(sale.paidAt ? { paidAt: sale.paidAt } : {}),
                updatedAt: serverTimestamp(),
              })
            );
          } else {
            tx.set(
              saleRef,
              serializeSale({ ...sale, offlineCreated: false, syncedAt: new Date().toISOString() }, tenantCtx)
            );
          }

          if (cust && custRef) {
            const spentDelta = typeof payload.customerSpentDelta === 'number' ? payload.customerSpentDelta : null;
            const ordersDelta = typeof payload.customerOrdersDelta === 'number' ? payload.customerOrdersDelta : null;
            const cDebtDelta = typeof payload.customerDebtDelta === 'number' ? payload.customerDebtDelta : null;
            if (custSnap?.exists()) {
              const cData = custSnap.data();
              tx.update(custRef, {
                totalSpent: spentDelta !== null ? Math.max(0, Number(cData.totalSpent || 0) + spentDelta) : cust.totalSpent,
                ordersCount: ordersDelta !== null ? Math.max(0, Number(cData.ordersCount || 0) + ordersDelta) : cust.ordersCount,
                ...(cust.lastPurchaseAt ? { lastPurchaseAt: cust.lastPurchaseAt } : {}),
                segment: cust.segment,
                debtBalance: cDebtDelta !== null ? Number(cData.debtBalance || 0) + cDebtDelta : cust.debtBalance,
                updatedAt: serverTimestamp(),
              });
            } else {
              tx.set(custRef, serializeCustomer(cust, tenantCtx));
            }
          }

          if (loy && loyRef) {
            const loyDelta = typeof payload.loyaltyPointsDelta === 'number' ? payload.loyaltyPointsDelta : null;
            if (loySnap?.exists()) {
              const lData = loySnap.data();
              tx.update(loyRef, {
                tier: loy.tier,
                cashbackPercent: loy.cashbackPercent,
                pointsBalance: loyDelta !== null ? Math.max(0, Number(lData.pointsBalance || 0) + loyDelta) : loy.pointsBalance,
                ...(loy.expiresAt ? { expiresAt: loy.expiresAt } : {}),
                updatedAt: serverTimestamp(),
              });
            } else {
              tx.set(loyRef, serializeLoyaltyAccount(loy, tenantCtx));
            }
          }

          const ltxIds = Array.isArray(payload.loyaltyTxIds) ? (payload.loyaltyTxIds as string[]) : [];
          ltxIds.forEach((id) => {
            const ltx = snapshot.loyaltyTransactions.find((x) => x.id === id);
            if (ltx) {
              tx.set(
                doc(firestoreDb, wsPath, 'loyaltyTransactions', sanitizeId(ltx.id)),
                serializeLoyaltyTransaction(ltx, tenantCtx)
              );
            }
          });

          if (payload.debtId) {
            const debt = snapshot.debts.find((d) => d.id === String(payload.debtId));
            if (debt) {
              tx.set(doc(firestoreDb, wsPath, 'debts', sanitizeId(debt.id)), serializeDebt(debt, tenantCtx));
            }
          }

          if (promo && promoRef && promoSnap?.exists()) {
            const promoDelta = typeof payload.promoUsedDelta === 'number' ? payload.promoUsedDelta : null;
            const currentUsed = Number(promoSnap.data().usedCount || 0);
            tx.update(promoRef, {
              usedCount: promoDelta !== null ? Math.max(0, currentUsed + promoDelta) : promo.usedCount,
              updatedAt: serverTimestamp(),
            });
          }

          if (sh && shiftRef && shiftSnap?.exists() && shiftSnap.data()?.status === 'open') {
            const sDeltas = (payload.shiftDeltas || null) as
              | { cashSales?: number; cardSales?: number; otherSales?: number; expectedCash?: number }
              | null;
            const sData = shiftSnap.data();
            tx.update(shiftRef, {
              cashSalesTotal:
                typeof sDeltas?.cashSales === 'number'
                  ? Number(sData.cashSalesTotal || 0) + sDeltas.cashSales
                  : sh.cashSalesTotal,
              cardSalesTotal:
                typeof sDeltas?.cardSales === 'number'
                  ? Number(sData.cardSalesTotal || 0) + sDeltas.cardSales
                  : sh.cardSalesTotal,
              otherSalesTotal:
                typeof sDeltas?.otherSales === 'number'
                  ? Number(sData.otherSalesTotal || 0) + sDeltas.otherSales
                  : sh.otherSalesTotal,
              expectedCash:
                typeof sDeltas?.expectedCash === 'number'
                  ? Number(sData.expectedCash || 0) + sDeltas.expectedCash
                  : sh.expectedCash,
              updatedAt: serverTimestamp(),
            });
          }

          for (const ar of accReads) {
            const nextBalance =
              ar.delta !== null ? ar.currentBalance + ar.delta : ar.acc.balance;
            if (ar.exists) {
              tx.update(ar.ref, {
                balance: nextBalance,
                updatedAt: serverTimestamp(),
              });
            } else {
              tx.set(ar.ref, serializeAccount({ ...ar.acc, balance: nextBalance }, tenantCtx));
            }
          }

          if (payload.auditId) {
            const aud = snapshot.auditLogs.find((a) => a.id === String(payload.auditId));
            if (aud) {
              tx.set(
                doc(firestoreDb, wsPath, 'auditLogs', sanitizeId(aud.id)),
                serializeAuditLog(aud, tenantCtx)
              );
            }
          }

          tx.set(syncedOpRef, {
            id: opId,
            opType: clampStr(item.type, 80),
            actorUid: ctx.uid,
            storeId: storeIdForOp,
            ownerUid: ctx.ownerUid,
            memberUids: Array.from(new Set([ctx.ownerUid, ...ctx.memberUids])).slice(0, 50),
            createdBy: ctx.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        return;
      }

      case 'sale_deferred': {
        const sale = snapshot.sales.find((s) => s.id === String(payload.saleId || ''));
        if (!sale) return;
        const batch = writeBatch(firestoreDb);
        batch.set(doc(firestoreDb, wsPath, 'sales', sanitizeId(sale.id)), serializeSale(sale, tenantCtx));
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'sale_delete_deferred': {
        const saleId = sanitizeId(String(payload.saleId || ''));
        const batch = writeBatch(firestoreDb);
        batch.delete(doc(firestoreDb, wsPath, 'sales', saleId));
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'return': {
        const ret = snapshot.returns.find((r) => r.id === String(payload.returnId || ''));
        if (!ret) return;
        const movementIds = Array.isArray(payload.movementIds) ? (payload.movementIds as string[]) : [];
        const movements = movementIds
          .map((id) => snapshot.stockMovements.find((m) => m.id === id))
          .filter(Boolean) as StockMovement[];
        const sale = snapshot.sales.find((s) => s.id === ret.saleId);

        await runTransaction(firestoreDb, async (tx) => {
          const opSnap = await tx.get(syncedOpRef);
          if (opSnap.exists()) return;

          const saleRef = doc(firestoreDb, wsPath, 'sales', sanitizeId(ret.saleId));
          const saleSnap = await tx.get(saleRef);
          if (
            !saleSnap.exists() ||
            !['completed', 'partial_return'].includes(String(saleSnap.data()?.status))
          ) {
            throw new BusinessRuleError("Ushbu chek bo'yicha qaytarish mumkin emas.");
          }

          const stockGroups = new Map<
            string,
            {
              stkId: string;
              productId: string;
              variantId: string;
              warehouseId: string;
              storeId: string;
              totalDelta: number;
              movements: StockMovement[];
            }
          >();
          for (const m of movements) {
            const stkId = stockItemDocId(m.warehouseId, m.variantId);
            const prev = stockGroups.get(stkId);
            if (prev) {
              prev.totalDelta = Number((prev.totalDelta + m.qtyDelta).toFixed(3));
              prev.movements.push(m);
            } else {
              stockGroups.set(stkId, {
                stkId,
                productId: m.productId,
                variantId: m.variantId,
                warehouseId: m.warehouseId,
                storeId: m.storeId,
                totalDelta: Number(m.qtyDelta.toFixed(3)),
                movements: [m],
              });
            }
          }

          const stockReads: {
            group: NonNullable<ReturnType<typeof stockGroups.get>>;
            ref: ReturnType<typeof doc>;
            exists: boolean;
            currentQty: number;
          }[] = [];

          for (const group of stockGroups.values()) {
            const ref = doc(firestoreDb, wsPath, 'stockItems', group.stkId);
            const snap = await tx.get(ref);
            stockReads.push({
              group,
              ref,
              exists: snap.exists(),
              currentQty: snap.exists() ? Number(snap.data().qty || 0) : 0,
            });
          }

          const sh = payload.shiftId
            ? snapshot.cashShifts.find((s) => s.id === String(payload.shiftId))
            : undefined;
          const shiftRef = sh ? doc(firestoreDb, wsPath, 'cashShifts', sanitizeId(sh.id)) : null;
          const shiftSnap = shiftRef ? await tx.get(shiftRef) : null;

          const acc = payload.accountId
            ? snapshot.accounts.find((a) => a.id === String(payload.accountId))
            : undefined;
          const accRef = acc ? doc(firestoreDb, wsPath, 'accounts', sanitizeId(acc.id)) : null;
          const accSnap = accRef ? await tx.get(accRef) : null;

          // Atomic writes
          for (const r of stockReads) {
            const nextQty = Number((r.currentQty + r.group.totalDelta).toFixed(3));
            if (r.exists) {
              tx.update(r.ref, { qty: nextQty, updatedAt: serverTimestamp() });
            } else {
              tx.set(
                r.ref,
                serializeStockItem(
                  {
                    id: r.group.stkId,
                    productId: r.group.productId,
                    variantId: r.group.variantId,
                    warehouseId: r.group.warehouseId,
                    qty: nextQty,
                    storeId: r.group.storeId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: ctx.uid,
                  },
                  tenantCtx
                )
              );
            }
            let runningQty = r.currentQty;
            for (const rawMov of r.group.movements) {
              runningQty = Number((runningQty + rawMov.qtyDelta).toFixed(3));
              const mov = { ...rawMov, qtyAfter: runningQty };
              tx.set(
                doc(firestoreDb, wsPath, 'stockMovements', sanitizeId(mov.id)),
                serializeStockMovement(mov, tenantCtx)
              );
            }
          }

          tx.set(doc(firestoreDb, wsPath, 'returns', sanitizeId(ret.id)), serializeReturnDoc(ret, tenantCtx));

          if (sale) {
            tx.update(saleRef, {
              status: sale.status,
              updatedAt: serverTimestamp(),
            });
          }

          if (sh && shiftRef && shiftSnap?.exists() && shiftSnap.data()?.status === 'open') {
            const refundDelta = typeof payload.shiftCashRefundDelta === 'number' ? payload.shiftCashRefundDelta : null;
            const sData = shiftSnap.data();
            tx.update(shiftRef, {
              cashRefundsTotal:
                refundDelta !== null
                  ? Number(sData.cashRefundsTotal || 0) + refundDelta
                  : sh.cashRefundsTotal,
              expectedCash:
                refundDelta !== null
                  ? Number(sData.expectedCash || 0) - refundDelta
                  : sh.expectedCash,
              updatedAt: serverTimestamp(),
            });
          }

          if (acc && accRef && accSnap?.exists()) {
            const accDelta = typeof payload.accountDelta === 'number' ? payload.accountDelta : null;
            const currentBalance = Number(accSnap.data().balance || 0);
            tx.update(accRef, {
              balance: accDelta !== null ? currentBalance + accDelta : acc.balance,
              updatedAt: serverTimestamp(),
            });
          }

          if (payload.auditId) {
            const aud = snapshot.auditLogs.find((a) => a.id === String(payload.auditId));
            if (aud) {
              tx.set(
                doc(firestoreDb, wsPath, 'auditLogs', sanitizeId(aud.id)),
                serializeAuditLog(aud, tenantCtx)
              );
            }
          }

          tx.set(syncedOpRef, {
            id: opId,
            opType: clampStr(item.type, 80),
            actorUid: ctx.uid,
            storeId: storeIdForOp,
            ownerUid: ctx.ownerUid,
            memberUids: Array.from(new Set([ctx.ownerUid, ...ctx.memberUids])).slice(0, 50),
            createdBy: ctx.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        return;
      }

      case 'shift_open': {
        const sh = snapshot.cashShifts.find((s) => s.id === String(payload.shiftId || ''));
        if (!sh) return;
        const batch = writeBatch(firestoreDb);
        batch.set(doc(firestoreDb, wsPath, 'cashShifts', sanitizeId(sh.id)), serializeCashShift(sh, tenantCtx));
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'shift_close': {
        const sh = snapshot.cashShifts.find((s) => s.id === String(payload.shiftId || ''));
        if (!sh) return;
        const batch = writeBatch(firestoreDb);
        batch.update(
          doc(firestoreDb, wsPath, 'cashShifts', sanitizeId(sh.id)),
          stripUndefinedDeep({
            closedAt: sh.closedAt,
            actualCash: sh.actualCash,
            discrepancy: sh.discrepancy,
            status: sh.status,
            ...(sh.notes !== undefined ? { notes: clampStr(sh.notes, 500) } : {}),
            updatedAt: serverTimestamp(),
          })
        );
        if (payload.auditId) {
          const aud = snapshot.auditLogs.find((a) => a.id === String(payload.auditId));
          if (aud) {
            batch.set(doc(firestoreDb, wsPath, 'auditLogs', sanitizeId(aud.id)), serializeAuditLog(aud, tenantCtx));
          }
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'cash_op': {
        const cop = snapshot.cashOperations.find((c) => c.id === String(payload.opId || ''));
        if (!cop) return;
        const batch = writeBatch(firestoreDb);
        batch.set(doc(firestoreDb, wsPath, 'cashOperations', sanitizeId(cop.id)), serializeCashOperation(cop, tenantCtx));
        const sh = snapshot.cashShifts.find((s) => s.id === cop.shiftId);
        if (sh) {
          const inDelta = typeof payload.shiftCashInDelta === 'number' ? payload.shiftCashInDelta : null;
          const outDelta = typeof payload.shiftCashOutDelta === 'number' ? payload.shiftCashOutDelta : null;
          const expDelta = typeof payload.shiftExpectedCashDelta === 'number' ? payload.shiftExpectedCashDelta : null;
          batch.update(doc(firestoreDb, wsPath, 'cashShifts', sanitizeId(sh.id)), {
            cashInTotal: inDelta !== null ? increment(inDelta) : sh.cashInTotal,
            cashOutTotal: outDelta !== null ? increment(outDelta) : sh.cashOutTotal,
            expectedCash: expDelta !== null ? increment(expDelta) : sh.expectedCash,
            updatedAt: serverTimestamp(),
          });
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'customer': {
        const cust = snapshot.customers.find((c) => c.id === String(payload.customerId || ''));
        if (!cust) return;
        const ref = doc(firestoreDb, wsPath, 'customers', sanitizeId(cust.id));
        const existing = await getDoc(ref);
        const batch = writeBatch(firestoreDb);
        if (existing.exists()) {
          batch.update(
            ref,
            stripUndefinedDeep({
              name: nonEmptyStr(cust.name, 120, 'Mijoz'),
              phone: clampStr(cust.phone, 40, ''),
              ...(cust.birthday !== undefined ? { birthday: clampStr(cust.birthday, 32) } : {}),
              ...(cust.gender !== undefined ? { gender: cust.gender } : {}),
              ...(cust.notes !== undefined ? { notes: clampStr(cust.notes, 500) } : {}),
              tags: cust.tags || [],
              segment: cust.segment,
              totalSpent: cust.totalSpent,
              ordersCount: cust.ordersCount,
              ...(cust.lastPurchaseAt ? { lastPurchaseAt: cust.lastPurchaseAt } : {}),
              debtBalance: cust.debtBalance,
              updatedAt: serverTimestamp(),
            })
          );
        } else {
          batch.set(ref, serializeCustomer(cust, tenantCtx));
          if (payload.loyaltyAccountId) {
            const loy = snapshot.loyaltyAccounts.find((l) => l.id === String(payload.loyaltyAccountId));
            if (loy) {
              batch.set(doc(firestoreDb, wsPath, 'loyaltyAccounts', sanitizeId(loy.id)), serializeLoyaltyAccount(loy, tenantCtx));
            }
          }
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'debt_pay': {
        const debt = snapshot.debts.find((d) => d.id === String(payload.debtId || ''));
        if (!debt) return;
        const batch = writeBatch(firestoreDb);
        batch.update(doc(firestoreDb, wsPath, 'debts', sanitizeId(debt.id)), {
          remainingAmount: debt.remainingAmount,
          status: debt.status,
          payments: debt.payments,
          updatedAt: serverTimestamp(),
        });
        const cust = snapshot.customers.find((c) => c.id === debt.customerId);
        if (cust) {
          const cDebtDelta = typeof payload.customerDebtDelta === 'number' ? payload.customerDebtDelta : null;
          batch.update(doc(firestoreDb, wsPath, 'customers', sanitizeId(cust.id)), {
            debtBalance: cDebtDelta !== null ? increment(cDebtDelta) : cust.debtBalance,
            updatedAt: serverTimestamp(),
          });
        }
        if (payload.accountId) {
          const acc = snapshot.accounts.find((a) => a.id === String(payload.accountId));
          if (acc) {
            const accDelta = typeof payload.accountDelta === 'number' ? payload.accountDelta : null;
            batch.update(doc(firestoreDb, wsPath, 'accounts', sanitizeId(acc.id)), {
              balance: accDelta !== null ? increment(accDelta) : acc.balance,
              updatedAt: serverTimestamp(),
            });
          }
        }
        if (payload.transactionId) {
          const trx = snapshot.transactions.find((t) => t.id === String(payload.transactionId));
          if (trx) {
            batch.set(doc(firestoreDb, wsPath, 'transactions', sanitizeId(trx.id)), serializeFinanceTransaction(trx, tenantCtx));
          }
        }
        if (payload.auditId) {
          const aud = snapshot.auditLogs.find((a) => a.id === String(payload.auditId));
          if (aud) {
            batch.set(doc(firestoreDb, wsPath, 'auditLogs', sanitizeId(aud.id)), serializeAuditLog(aud, tenantCtx));
          }
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'promo': {
        const promo = snapshot.promoCodes.find((p) => p.id === String(payload.promoId || ''));
        if (!promo) return;
        const ref = doc(firestoreDb, wsPath, 'promoCodes', sanitizeId(promo.id));
        const existing = await getDoc(ref);
        const batch = writeBatch(firestoreDb);
        if (existing.exists()) {
          batch.update(
            ref,
            stripUndefinedDeep({
              code: promo.code,
              discountType: promo.discountType,
              discountValue: promo.discountValue,
              minOrderAmount: promo.minOrderAmount,
              maxUses: promo.maxUses,
              usedCount: promo.usedCount,
              ...(promo.expiresAt ? { expiresAt: promo.expiresAt } : {}),
              isActive: promo.isActive,
              updatedAt: serverTimestamp(),
            })
          );
        } else {
          batch.set(ref, serializePromoCode(promo, tenantCtx));
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'expense': {
        const exp = snapshot.expenses.find((e) => e.id === String(payload.expenseId || ''));
        if (!exp) return;
        const batch = writeBatch(firestoreDb);
        batch.set(doc(firestoreDb, wsPath, 'expenses', sanitizeId(exp.id)), serializeExpense(exp, tenantCtx));
        const acc = snapshot.accounts.find((a) => a.id === exp.accountId);
        if (acc) {
          const accDelta = typeof payload.accountDelta === 'number' ? payload.accountDelta : null;
          batch.update(doc(firestoreDb, wsPath, 'accounts', sanitizeId(acc.id)), {
            balance: accDelta !== null ? increment(accDelta) : acc.balance,
            updatedAt: serverTimestamp(),
          });
        }
        if (payload.transactionId) {
          const trx = snapshot.transactions.find((t) => t.id === String(payload.transactionId));
          if (trx) {
            batch.set(doc(firestoreDb, wsPath, 'transactions', sanitizeId(trx.id)), serializeFinanceTransaction(trx, tenantCtx));
          }
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'finance_transfer': {
        const fromAcc = snapshot.accounts.find((a) => a.id === String(payload.fromAccountId || ''));
        const toAcc = snapshot.accounts.find((a) => a.id === String(payload.toAccountId || ''));
        const trx = snapshot.transactions.find((t) => t.id === String(payload.transactionId || ''));
        const batch = writeBatch(firestoreDb);
        if (fromAcc) {
          const fromDelta = typeof payload.fromDelta === 'number' ? payload.fromDelta : null;
          batch.update(doc(firestoreDb, wsPath, 'accounts', sanitizeId(fromAcc.id)), {
            balance: fromDelta !== null ? increment(fromDelta) : fromAcc.balance,
            updatedAt: serverTimestamp(),
          });
        }
        if (toAcc) {
          const toDelta = typeof payload.toDelta === 'number' ? payload.toDelta : null;
          batch.update(doc(firestoreDb, wsPath, 'accounts', sanitizeId(toAcc.id)), {
            balance: toDelta !== null ? increment(toDelta) : toAcc.balance,
            updatedAt: serverTimestamp(),
          });
        }
        if (trx) {
          batch.set(doc(firestoreDb, wsPath, 'transactions', sanitizeId(trx.id)), serializeFinanceTransaction(trx, tenantCtx));
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'account': {
        const acc = snapshot.accounts.find((a) => a.id === String(payload.accountId || ''));
        if (!acc) return;
        const ref = doc(firestoreDb, wsPath, 'accounts', sanitizeId(acc.id));
        const existing = await getDoc(ref);
        const batch = writeBatch(firestoreDb);
        if (existing.exists()) {
          batch.update(ref, {
            balance: acc.balance,
            name: acc.name,
            type: acc.type,
            ...(acc.isDefault !== undefined ? { isDefault: acc.isDefault } : {}),
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(ref, serializeAccount(acc, tenantCtx));
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'employee': {
        const empId = String(payload.empId || '');
        const emp = snapshot.employees.find((e) => e.id === empId);
        const user = snapshot.users.find((u) => u.id === (emp?.userId || String(payload.userId || '')));
        if (!user) return;
        const staffId = sanitizeId(emp?.id || user.id);

        const dirRef = doc(firestoreDb, wsPath, 'staffDirectory', staffId);
        const dirSnap = await getDoc(dirRef);
        const batch = writeBatch(firestoreDb);
        const dirSer = serializeStaffDirectoryEntry(user, emp, tenantCtx);
        if (dirSnap.exists()) {
          const { id: _id, userId: _u, ownerUid: _o, createdBy: _cb, createdAt: _ca, ...updatable } = dirSer;
          batch.update(dirRef, { ...updatable, updatedAt: serverTimestamp() });
        } else {
          batch.set(dirRef, dirSer);
        }

        if (ctx.isWsAdmin) {
          const credRef = doc(firestoreDb, wsPath, 'staffCredentials', staffId);
          const credSnap = await getDoc(credRef);
          const credSer = serializeStaffCredential(user, emp, {
            ownerUid: ctx.ownerUid,
            adminUids: ctx.adminUids,
            uid: ctx.uid,
          });
          if (credSnap.exists()) {
            const existingCred = credSnap.data();
            // Strip legacy plaintext password/pin in an isolated rule-compliant update before writing metadata fields
            if ('password' in existingCred || 'pin' in existingCred) {
              await updateDoc(credRef, {
                password: deleteField(),
                pin: deleteField(),
                passwordHash: credSer.passwordHash,
                pinHash: credSer.pinHash,
                hashAlgo: 'sha256',
                authMigrated: true,
                updatedAt: serverTimestamp(),
              });
            }
            const { id: _id, userId: _u, ownerUid: _o, createdBy: _cb, createdAt: _ca, ...updatable } = credSer;
            batch.update(credRef, { ...updatable, updatedAt: serverTimestamp() });
          } else {
            batch.set(credRef, credSer);
          }

          const cleanPhoneEmail = phoneToInternalEmail(emp?.phone || user.phone);
          const cleanLegacyEmail = (emp?.googleEmail || user.googleEmail || '').trim().toLowerCase();
          const activeEmailsForStaff = Array.from(new Set([cleanPhoneEmail, cleanLegacyEmail].filter(Boolean)));

          const prevPhoneEmail =
            typeof payload.previousPhone === 'string' && payload.previousPhone
              ? phoneToInternalEmail(payload.previousPhone)
              : '';
          const prevLegacyEmail =
            typeof payload.previousGoogleEmail === 'string'
              ? payload.previousGoogleEmail.trim().toLowerCase()
              : '';
          const prevEmails = Array.from(new Set([prevPhoneEmail, prevLegacyEmail].filter(Boolean)));

          // Maintain zero-PII staffInvites/{emailHash} so phone or legacy staff accounts map to role/stores/permissions
          for (const targetEmail of activeEmailsForStaff) {
            const emailHash = await sha256Hex(targetEmail);
            const invRef = doc(firestoreDb, wsPath, 'staffInvites', emailHash);
            const invSnap = await getDoc(invRef);
            const invSer = serializeStaffInvite(
              user,
              emp,
              snapshot.roles,
              { ownerUid: ctx.ownerUid, adminUids: ctx.adminUids, uid: ctx.uid },
              emailHash
            );
            if (invSnap.exists()) {
              batch.update(invRef, {
                staffId: invSer.staffId,
                userId: invSer.userId,
                roleId: invSer.roleId,
                assignedStoreIds: invSer.assignedStoreIds,
                permissions: invSer.permissions,
                adminUids: invSer.adminUids,
                updatedAt: serverTimestamp(),
              });
            } else {
              batch.set(invRef, invSer);
            }
          }

          for (const oldEmail of prevEmails) {
            if (!activeEmailsForStaff.includes(oldEmail)) {
              const oldHash = await sha256Hex(oldEmail);
              batch.delete(doc(firestoreDb, wsPath, 'staffInvites', oldHash));
            }
          }

          // Update workspace invitedEmails & adminUids cleanly
          const wsRef = doc(firestoreDb, 'workspaces', ctx.workspaceId);
          const wsSnap = await getDoc(wsRef);
          const wsData = wsSnap.data();
          const liveInvited = Array.isArray(wsData?.invitedEmails)
            ? (wsData.invitedEmails as string[]).map((e) => String(e).toLowerCase())
            : ctx.invitedEmails;
          const liveAdmins = Array.isArray(wsData?.adminUids)
            ? (wsData.adminUids as string[]).map((u) => String(u))
            : ctx.adminUids;

          let nextInvited = [...liveInvited];
          let invitedChanged = false;

          for (const oldEmail of prevEmails) {
            if (!activeEmailsForStaff.includes(oldEmail) && !isBootstrappedAdminEmail(oldEmail)) {
              const stillUsed =
                snapshot.users.some(
                  (u) =>
                    u.isActive &&
                    (phoneToInternalEmail(u.phone) === oldEmail ||
                      u.googleEmail?.trim().toLowerCase() === oldEmail)
                ) ||
                snapshot.employees.some(
                  (e) =>
                    phoneToInternalEmail(e.phone) === oldEmail ||
                    e.googleEmail?.trim().toLowerCase() === oldEmail
                );
              if (!stillUsed && nextInvited.includes(oldEmail)) {
                nextInvited = nextInvited.filter((e) => e !== oldEmail);
                invitedChanged = true;
              }
            }
          }
          for (const targetEmail of activeEmailsForStaff) {
            if (!nextInvited.includes(targetEmail)) {
              nextInvited = Array.from(new Set([...nextInvited, targetEmail])).slice(0, 50);
              invitedChanged = true;
            }
          }

          // Also sync matching workspace member doc if they have already claimed a seat
          const membersSnap = await getDocs(collection(firestoreDb, wsPath, 'members'));
          const rolePerms =
            user.customPermissions ??
            snapshot.roles.find((r) => r.id === user.roleId)?.permissions ??
            [];
          const rulePerms = mapAppPermissionsToRuleTokens(rolePerms, user.roleId);
          let nextAdmins = [...liveAdmins];
          let adminsChanged = false;

          membersSnap.docs.forEach((mDoc) => {
            const md = mDoc.data();
            if (md.staffId === staffId) {
              batch.update(mDoc.ref, {
                displayName: nonEmptyStr(user.name, 120, 'Xodim'),
                roleId: user.roleId,
                assignedStoreIds: user.assignedStoreIds.slice(0, 20),
                permissions: rulePerms,
                isActive: Boolean(user.isActive),
                updatedAt: serverTimestamp(),
              });
              const shouldBeAdmin = Boolean(user.isActive) && (user.roleId === 'owner' || user.roleId === 'admin');
              if (shouldBeAdmin && !nextAdmins.includes(mDoc.id)) {
                nextAdmins = Array.from(new Set([...nextAdmins, mDoc.id])).slice(0, 20);
                adminsChanged = true;
              } else if (!shouldBeAdmin && mDoc.id !== ctx.ownerUid && nextAdmins.includes(mDoc.id)) {
                nextAdmins = nextAdmins.filter((uid) => uid !== mDoc.id);
                adminsChanged = true;
              }
            }
          });

          if (invitedChanged || adminsChanged) {
            batch.update(wsRef, {
              ...(invitedChanged ? { invitedEmails: nextInvited } : {}),
              ...(adminsChanged ? { adminUids: nextAdmins } : {}),
              updatedAt: serverTimestamp(),
            });
          }
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'employee_delete': {
        const staffId = sanitizeId(String(payload.empId || ''));
        const batch = writeBatch(firestoreDb);
        batch.delete(doc(firestoreDb, wsPath, 'staffDirectory', staffId));
        const deletedTargetIds = Array.isArray(payload.deletedTargetIds)
          ? (payload.deletedTargetIds as string[])
          : [];
        deletedTargetIds.forEach((tid) => {
          batch.delete(doc(firestoreDb, wsPath, 'targets', sanitizeId(tid)));
        });
        if (ctx.isWsAdmin) {
          const credRef = doc(firestoreDb, wsPath, 'staffCredentials', staffId);
          const emailsToDelete = new Set<string>();
          if (typeof payload.deletedPhone === 'string' && payload.deletedPhone) {
            const pe = phoneToInternalEmail(payload.deletedPhone);
            if (pe) emailsToDelete.add(pe);
          }
          if (typeof payload.deletedGoogleEmail === 'string' && payload.deletedGoogleEmail.trim()) {
            emailsToDelete.add(payload.deletedGoogleEmail.trim().toLowerCase());
          }
          try {
            const credSnap = await getDoc(credRef);
            if (credSnap.exists()) {
              const cd = credSnap.data();
              if (cd.phone) {
                const pe = phoneToInternalEmail(String(cd.phone));
                if (pe) emailsToDelete.add(pe);
              }
              if (cd.googleEmail) {
                emailsToDelete.add(String(cd.googleEmail).trim().toLowerCase());
              }
            }
          } catch {
            // ignore if credential doc does not exist
          }
          batch.delete(credRef);

          for (const em of emailsToDelete) {
            const emailHash = await sha256Hex(em);
            batch.delete(doc(firestoreDb, wsPath, 'staffInvites', emailHash));
          }

          const removedUids = new Set<string>();
          const membersSnap = await getDocs(collection(firestoreDb, wsPath, 'members'));
          membersSnap.docs.forEach((mDoc) => {
            if (mDoc.data().staffId === staffId && mDoc.id !== ctx.ownerUid) {
              removedUids.add(mDoc.id);
              batch.delete(mDoc.ref);
            }
          });

          const wsRef = doc(firestoreDb, 'workspaces', ctx.workspaceId);
          const wsSnap = await getDoc(wsRef);
          const wsData = wsSnap.data();
          if (wsData) {
            const wsPatch: Record<string, unknown> = {};
            if (emailsToDelete.size > 0 && Array.isArray(wsData.invitedEmails)) {
              const removable = new Set<string>();
              for (const em of emailsToDelete) {
                if (isBootstrappedAdminEmail(em)) continue;
                const stillUsed =
                  snapshot.users.some(
                    (u) =>
                      u.isActive &&
                      (phoneToInternalEmail(u.phone) === em || u.googleEmail?.trim().toLowerCase() === em)
                  ) ||
                  snapshot.employees.some(
                    (e) =>
                      phoneToInternalEmail(e.phone) === em || e.googleEmail?.trim().toLowerCase() === em
                  );
                if (!stillUsed) removable.add(em);
              }
              if (removable.size > 0) {
                wsPatch.invitedEmails = (wsData.invitedEmails as string[]).filter(
                  (e) => !removable.has(String(e).toLowerCase())
                );
              }
            }
            if (removedUids.size > 0) {
              if (Array.isArray(wsData.memberUids)) {
                wsPatch.memberUids = (wsData.memberUids as string[]).filter((u) => !removedUids.has(String(u)));
              }
              if (Array.isArray(wsData.adminUids)) {
                wsPatch.adminUids = (wsData.adminUids as string[]).filter((u) => !removedUids.has(String(u)));
              }
            }
            if (Object.keys(wsPatch).length > 0) {
              batch.update(wsRef, { ...wsPatch, updatedAt: serverTimestamp() });
            }
          }
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'target': {
        const tg = snapshot.targets.find((t) => t.id === String(payload.targetId || ''));
        if (!tg) return;
        const ref = doc(firestoreDb, wsPath, 'targets', sanitizeId(tg.id));
        const existing = await getDoc(ref);
        const batch = writeBatch(firestoreDb);
        if (existing.exists()) {
          batch.update(
            ref,
            stripUndefinedDeep({
              ...(tg.employeeId ? { employeeId: tg.employeeId } : {}),
              month: tg.month,
              targetAmount: tg.targetAmount,
              updatedAt: serverTimestamp(),
            })
          );
        } else {
          batch.set(ref, serializeTarget(tg, tenantCtx));
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'online_order': {
        const ord = snapshot.onlineOrders.find((o) => o.id === String(payload.orderId || ''));
        if (!ord) return;
        const batch = writeBatch(firestoreDb);
        batch.set(doc(firestoreDb, wsPath, 'onlineOrders', sanitizeId(ord.id)), serializeOnlineOrder(ord, tenantCtx));
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'online_order_status': {
        const ord = snapshot.onlineOrders.find((o) => o.id === String(payload.orderId || ''));
        if (!ord) return;
        const movementIds = Array.isArray(payload.movementIds) ? (payload.movementIds as string[]) : [];
        const movements = movementIds
          .map((id) => snapshot.stockMovements.find((m) => m.id === id))
          .filter(Boolean) as StockMovement[];

        if (movements.length > 0) {
          await applyStockDeltasInTx(
            movements.map((m) => ({
              productId: m.productId,
              variantId: m.variantId,
              warehouseId: m.warehouseId,
              storeId: m.storeId,
              qtyDelta: m.qtyDelta,
              movement: m,
            }))
          );
        }
        const batch = writeBatch(firestoreDb);
        batch.update(doc(firestoreDb, wsPath, 'onlineOrders', sanitizeId(ord.id)), {
          status: ord.status,
          updatedAt: serverTimestamp(),
        });
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'store': {
        const st = snapshot.stores.find((s) => s.id === String(payload.storeId || ''));
        if (!st) return;
        const ref = doc(firestoreDb, wsPath, 'stores', sanitizeId(st.id));
        const existing = await getDoc(ref);
        const batch = writeBatch(firestoreDb);
        if (existing.exists()) {
          batch.update(
            ref,
            stripUndefinedDeep({
              name: st.name,
              address: st.address || '',
              phone: st.phone || '',
              isActive: st.isActive,
              defaultWarehouseId: st.defaultWarehouseId || '',
              ...(st.storeCode ? { storeCode: st.storeCode } : {}),
              ...(st.color ? { color: st.color } : {}),
              updatedAt: serverTimestamp(),
            })
          );
        } else {
          batch.set(ref, serializeStore(st, tenantCtx));
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'store_delete': {
        const storeId = sanitizeId(String(payload.storeId || ''));
        const batch = writeBatch(firestoreDb);
        batch.delete(doc(firestoreDb, wsPath, 'stores', storeId));
        if (payload.deletedWarehouseId) {
          batch.delete(doc(firestoreDb, wsPath, 'warehouses', sanitizeId(String(payload.deletedWarehouseId))));
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'warehouse': {
        const wh = snapshot.warehouses.find((w) => w.id === String(payload.warehouseId || ''));
        if (!wh) return;
        const ref = doc(firestoreDb, wsPath, 'warehouses', sanitizeId(wh.id));
        const existing = await getDoc(ref);
        const batch = writeBatch(firestoreDb);
        if (existing.exists()) {
          batch.update(ref, {
            name: nonEmptyStr(wh.name, 120, 'Ombor'),
            address: clampStr(wh.address, 300, ''),
            isMain: Boolean(wh.isMain),
            storeId: nonEmptyStr(wh.storeId, 128, 'store-chilonzor'),
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(ref, serializeWarehouse(wh, tenantCtx));
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'settings': {
        const batch = writeBatch(firestoreDb);
        batch.update(doc(firestoreDb, 'workspaces', ctx.workspaceId), {
          name: nonEmptyStr(snapshot.settings.brandName, 120, 'SHU BREND OMBOR'),
          settings: sanitizeSettingsForWorkspace(snapshot.settings),
          updatedAt: serverTimestamp(),
        });
        if (ctx.isWsAdmin) {
          const privRef = doc(firestoreDb, wsPath, 'privateSettings', 'integrations');
          const privSnap = await getDoc(privRef);
          const fullInteg = stripUndefinedDeep(snapshot.settings.integrations || {});
          if (privSnap.exists()) {
            batch.update(privRef, {
              integrations: fullInteg,
              updatedAt: serverTimestamp(),
            });
          } else {
            batch.set(privRef, {
              id: 'integrations',
              integrations: fullInteg,
              ownerUid: ctx.ownerUid,
              adminUids: ctx.adminUids,
              createdBy: ctx.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
        if (payload.auditId) {
          const aud = snapshot.auditLogs.find((a) => a.id === String(payload.auditId));
          if (aud) {
            batch.set(doc(firestoreDb, wsPath, 'auditLogs', sanitizeId(aud.id)), serializeAuditLog(aud, tenantCtx));
          }
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }

      case 'roles': {
        const batch = writeBatch(firestoreDb);
        batch.update(doc(firestoreDb, 'workspaces', ctx.workspaceId), {
          roles: sanitizeRolesForWorkspace(snapshot.roles),
          updatedAt: serverTimestamp(),
        });
        // Also update members and staffInvites whose roleId is NOT using customPermissions
        if (ctx.isWsAdmin) {
          const membersSnap = await getDocs(collection(firestoreDb, wsPath, 'members'));
          membersSnap.docs.forEach((mDoc) => {
            const md = mDoc.data();
            const matchedEmp = snapshot.employees.find((e) => e.id === md.staffId);
            const matchedUser = snapshot.users.find((u) => u.id === (matchedEmp?.userId || md.staffId));
            const rObj = snapshot.roles.find((r) => r.id === md.roleId);
            if (rObj && (!matchedUser || !Array.isArray(matchedUser.customPermissions))) {
              batch.update(mDoc.ref, {
                permissions: mapAppPermissionsToRuleTokens(rObj.permissions, rObj.id),
                updatedAt: serverTimestamp(),
              });
            }
          });

          const invitesSnap = await getDocs(collection(firestoreDb, wsPath, 'staffInvites'));
          invitesSnap.docs.forEach((iDoc) => {
            const idata = iDoc.data();
            const matchedEmp = snapshot.employees.find((e) => e.id === idata.staffId);
            const matchedUser = snapshot.users.find((u) => u.id === (matchedEmp?.userId || idata.userId));
            const rObj = snapshot.roles.find((r) => r.id === idata.roleId);
            if (rObj && (!matchedUser || !Array.isArray(matchedUser.customPermissions))) {
              batch.update(iDoc.ref, {
                permissions: mapAppPermissionsToRuleTokens(rObj.permissions, rObj.id),
                updatedAt: serverTimestamp(),
              });
            }
          });
        }
        markSyncedInBatch(batch);
        await batch.commit();
        return;
      }
    }
  } catch (err) {
    if (err instanceof BusinessRuleError) throw err;
    handleFirestoreError(err, OperationType.WRITE, `${wsPath}/${item.type}`);
  }
}

export async function clearWorkspaceOperationalData(
  ctx: WorkspaceContext,
  snapshotAfterClear: DatabaseSnapshot
): Promise<void> {
  if (!ctx.isWsAdmin) {
    throw new Error("Faqat administrator bazani tozalashi mumkin.");
  }
  const wsPath = `workspaces/${ctx.workspaceId}`;
  const writer = new ChunkedBatchWriter();
  const deletableCollections = [
    'products',
    'stockItems',
    'stockMovements',
    'purchaseReceipts',
    'purchaseOrders',
    'transfers',
    'writeOffs',
    'stocktakes',
    'sales',
    'returns',
    'cashShifts',
    'cashOperations',
    'transactions',
    'expenses',
    'customers',
    'loyaltyAccounts',
    'loyaltyTransactions',
    'debts',
    'promoCodes',
    'onlineOrders',
    'targets',
  ];
  for (const colName of deletableCollections) {
    const snap = await getDocs(collection(firestoreDb, wsPath, colName));
    snap.docs.forEach((d) => writer.add((b) => b.delete(d.ref)));
  }
  snapshotAfterClear.accounts.forEach((a) => {
    writer.add((b) =>
      b.update(doc(firestoreDb, wsPath, 'accounts', sanitizeId(a.id)), {
        balance: 0,
        updatedAt: serverTimestamp(),
      })
    );
  });
  snapshotAfterClear.suppliers.forEach((s) => {
    writer.add((b) =>
      b.update(doc(firestoreDb, wsPath, 'suppliers', sanitizeId(s.id)), {
        debtBalance: 0,
        updatedAt: serverTimestamp(),
      })
    );
  });
  await writer.commitAll(wsPath);
}

// Keep unused import guard clean
export const _keepDeleteDocRef = deleteDoc;
export const _keepExtractSecrets = extractIntegrationSecrets;
