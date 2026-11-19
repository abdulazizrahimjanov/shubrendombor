export type RoleId = 'owner' | 'admin' | 'manager' | 'cashier' | 'warehouse' | (string & {});

export type Permission =
  | 'view_dashboard'
  | 'view_profit_cost'
  | 'use_pos'
  | 'apply_big_discount'
  | 'process_returns'
  | 'manage_shifts'
  | 'view_catalog'
  | 'edit_catalog'
  | 'bulk_edit_prices'
  | 'view_inventory'
  | 'manage_inventory'
  | 'view_customers'
  | 'manage_customers'
  | 'manage_debts'
  | 'view_finance'
  | 'manage_finance'
  | 'view_employees'
  | 'manage_employees'
  | 'view_reports'
  | 'manage_online_orders'
  | 'manage_settings'
  | 'view_audit_log';

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  storeId: string;
}

export interface Role {
  id: RoleId;
  nameUz: string;
  nameRu: string;
  permissions: Permission[];
}

export interface Store extends BaseEntity {
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
  defaultWarehouseId: string;
  storeCode?: string;
  color?: string;
}

export interface Warehouse extends BaseEntity {
  name: string;
  address: string;
  isMain: boolean;
}

export interface User extends BaseEntity {
  name: string;
  phone: string;
  password: string;
  pin: string;
  passwordHash?: string;
  pinHash?: string;
  hashAlgo?: 'sha256' | 'pbkdf2-sha256' | 'firebase-auth';
  authMigrated?: boolean;
  googleEmail?: string;
  roleId: RoleId;
  assignedStoreIds: string[];
  customPermissions?: Permission[];
  isActive: boolean;
  avatarColor?: string;
}

export interface Category extends BaseEntity {
  nameUz: string;
  nameRu: string;
  parentId?: string;
  sortOrder: number;
}

export interface Brand extends BaseEntity {
  name: string;
  country?: string;
}

export interface Barcode extends BaseEntity {
  variantId: string;
  productId: string;
  code: string;
  format: 'EAN13' | 'CODE128';
}

export interface Variant extends BaseEntity {
  productId: string;
  sku: string;
  size?: string;
  color?: string;
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice: number;
  minStock: number;
  barcodes: string[];
}

export interface Product extends BaseEntity {
  name: string;
  categoryId: string;
  brandId?: string;
  collection?: string;
  unit: 'dona' | 'juft' | 'kg' | 'litr' | 'quti' | 'metr';
  description?: string;
  photoUrl?: string;
  supplierId?: string;
  tags: string[];
  isPublishedOnline: boolean;
  variants: Variant[];
}

export interface Supplier extends BaseEntity {
  name: string;
  contactName: string;
  phone: string;
  address?: string;
  notes?: string;
  debtBalance: number; // positive = we owe supplier
}

export interface StockItem extends BaseEntity {
  productId: string;
  variantId: string;
  warehouseId: string;
  qty: number;
}

export type StockMovementType =
  | 'kirim'
  | 'sotuv'
  | 'qaytarish'
  | 'kochirish_out'
  | 'kochirish_in'
  | 'chiqim'
  | 'inventarizatsiya'
  | 'online_sotuv';

export interface StockMovement extends BaseEntity {
  productId: string;
  variantId: string;
  warehouseId: string;
  type: StockMovementType;
  qtyDelta: number;
  qtyAfter: number;
  unitCost: number;
  referenceId?: string;
  referenceType?: string;
  note?: string;
}

export interface PurchaseReceiptItem {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  qty: number;
  purchasePrice: number;
  total: number;
}

export interface PurchaseReceipt extends BaseEntity {
  number: string;
  supplierId: string;
  warehouseId: string;
  categoryId?: string;
  items: PurchaseReceiptItem[];
  totalAmount: number;
  paidAmount: number;
  paymentStatus: 'paid' | 'partial' | 'debt';
  note?: string;
}

export interface PurchaseOrder extends BaseEntity {
  number: string;
  supplierId: string;
  warehouseId: string;
  items: PurchaseReceiptItem[];
  totalAmount: number;
  status: 'draft' | 'ordered' | 'received' | 'canceled';
  expectedDate?: string;
  note?: string;
}

export interface TransferItem {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  sentQty: number;
  receivedQty: number;
}

export interface Transfer extends BaseEntity {
  number: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  items: TransferItem[];
  status: 'sent' | 'received' | 'discrepancy';
  note?: string;
}

export type WriteOffReason = 'damaged' | 'expired' | 'lost' | 'other';

export interface WriteOffItem {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  qty: number;
  unitCost: number;
}

export interface WriteOff extends BaseEntity {
  number: string;
  warehouseId: string;
  reason: WriteOffReason;
  items: WriteOffItem[];
  totalCost: number;
  note?: string;
}

export interface StocktakeItem {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  barcode?: string;
  systemQty: number;
  countedQty: number;
  unitCost: number;
}

export interface Stocktake extends BaseEntity {
  number: string;
  warehouseId: string;
  status: 'in_progress' | 'completed';
  items: StocktakeItem[];
  totalDiscrepancyValue: number;
  note?: string;
}

export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'uzcard'
  | 'humo'
  | 'visa'
  | 'mastercard'
  | 'unionpay'
  | 'transfer'
  | 'click'
  | 'payme'
  | 'uzum'
  | 'debt'
  | 'loyalty';

export interface Payment extends BaseEntity {
  saleId: string;
  method: PaymentMethod;
  amount: number;
}

export interface SaleItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  qty: number;
  unitPrice: number;
  purchasePrice: number;
  discountAmount: number; // total discount on this line
  discountPercent: number;
  lineTotal: number;
}

export interface Sale extends BaseEntity {
  receiptNumber: string;
  warehouseId: string;
  shiftId?: string;
  cashierId: string;
  cashierName: string;
  customerId?: string;
  customerName?: string;
  items: SaleItem[];
  subtotal: number;
  checkDiscountAmount: number;
  checkDiscountPercent: number;
  loyaltyPointsSpent: number;
  loyaltyPointsEarned: number;
  promoCode?: string;
  vatAmount: number;
  totalAmount: number;
  costTotal: number;
  payments: Payment[];
  paidAmount: number;
  debtAmount: number;
  cashGiven?: number;
  changeAmount?: number;
  paidAt?: string;
  status: 'deferred' | 'completed' | 'returned' | 'partial_return';
  offlineCreated?: boolean;
  syncedAt?: string;
  fiscalStatus: 'not_configured' | 'pending' | 'fiscalized';
  fiscalReceiptId?: string;
  note?: string;
}

export interface ReturnItem {
  saleItemId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  qty: number;
  refundAmount: number;
  purchasePrice: number;
}

export interface Return extends BaseEntity {
  number: string;
  saleId: string;
  receiptNumber: string;
  warehouseId: string;
  items: ReturnItem[];
  totalRefund: number;
  refundMethod: PaymentMethod;
  reason: string;
  isExchange?: boolean;
}

export interface HeldCart {
  id: string;
  label: string;
  createdAt: string;
  customerId?: string;
  items: SaleItem[];
  checkDiscountPercent: number;
  checkDiscountAmount: number;
  promoCode?: string;
  note?: string;
}

export interface CashOperation extends BaseEntity {
  shiftId: string;
  type: 'in' | 'out';
  amount: number;
  reason: string;
}

export interface CashShift extends BaseEntity {
  number: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  startingCash: number;
  cashSalesTotal: number;
  cardSalesTotal: number;
  otherSalesTotal: number;
  cashRefundsTotal: number;
  cashInTotal: number;
  cashOutTotal: number;
  expectedCash: number;
  actualCash?: number;
  discrepancy?: number;
  status: 'open' | 'closed';
  notes?: string;
}

export interface Account extends BaseEntity {
  name: string;
  type: 'cash' | 'card_terminal' | 'bank';
  balance: number;
  isDefault?: boolean;
}

export interface Transaction extends BaseEntity {
  accountId: string;
  toAccountId?: string;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  amount: number;
  description: string;
  referenceId?: string;
}

export interface Expense extends BaseEntity {
  accountId: string;
  category: 'rent' | 'salary' | 'utilities' | 'delivery' | 'marketing' | 'taxes' | 'other';
  amount: number;
  description: string;
  isRecurring: boolean;
  recurringDay?: number;
  date: string;
}

export type CustomerSegment = 'new' | 'regular' | 'vip' | 'sleeping';

export interface Customer extends BaseEntity {
  name: string;
  phone: string;
  birthday?: string;
  gender?: 'male' | 'female';
  notes?: string;
  tags: string[];
  segment: CustomerSegment;
  totalSpent: number;
  ordersCount: number;
  lastPurchaseAt?: string;
  debtBalance: number;
}

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface LoyaltyAccount extends BaseEntity {
  customerId: string;
  tier: LoyaltyTier;
  cashbackPercent: number;
  pointsBalance: number;
  cardNumber: string;
  expiresAt?: string;
}

export interface LoyaltyTransaction extends BaseEntity {
  customerId: string;
  loyaltyAccountId: string;
  type: 'earn' | 'spend' | 'expire' | 'birthday_bonus';
  points: number;
  saleId?: string;
  expiresAt?: string;
  note?: string;
}

export interface Debt extends BaseEntity {
  customerId: string;
  customerName: string;
  saleId?: string;
  originalAmount: number;
  remainingAmount: number;
  dueDate?: string;
  status: 'open' | 'partial' | 'paid';
  payments: {
    id: string;
    amount: number;
    method: PaymentMethod;
    paidAt: string;
    note?: string;
  }[];
}

export interface PromoCode extends BaseEntity {
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderAmount: number;
  maxUses: number;
  usedCount: number;
  expiresAt?: string;
  isActive: boolean;
}

export interface Employee extends BaseEntity {
  userId: string;
  name: string;
  phone: string;
  googleEmail?: string;
  roleId: RoleId;
  baseSalary: number;
  commissionPercent: number;
  schedule: string;
  hiredAt: string;
}

export interface Target extends BaseEntity {
  employeeId?: string; // undefined = store-wide target
  month: string; // YYYY-MM
  targetAmount: number;
}

export interface OnlineOrderItem {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OnlineOrder extends BaseEntity {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryMethod: 'delivery' | 'pickup';
  paymentMethod: 'cash_on_delivery' | 'online_placeholder';
  items: OnlineOrderItem[];
  totalAmount: number;
  status: 'new' | 'confirmed' | 'delivered' | 'canceled';
  note?: string;
}

export interface AuditLog extends BaseEntity {
  userId: string;
  userName: string;
  action:
    | 'price_change'
    | 'product_delete'
    | 'sale_return'
    | 'big_discount'
    | 'stock_writeoff'
    | 'stocktake_apply'
    | 'shift_close'
    | 'settings_change'
    | 'debt_repay';
  entityType: string;
  entityId: string;
  summary: string;
  details?: string;
}

export type OfflineSyncOperationType =
  | 'sale'
  | 'sale_deferred'
  | 'sale_pay_deferred'
  | 'sale_delete_deferred'
  | 'return'
  | 'cash_op'
  | 'shift_open'
  | 'shift_close'
  | 'category'
  | 'category_delete'
  | 'categories_reset'
  | 'product'
  | 'product_delete'
  | 'bulk_prices'
  | 'quick_stock'
  | 'import_products'
  | 'purchase_receipt'
  | 'purchase_order'
  | 'purchase_order_status'
  | 'transfer'
  | 'transfer_receive'
  | 'write_off'
  | 'stocktake'
  | 'stocktake_apply'
  | 'supplier'
  | 'supplier_debt_pay'
  | 'customer'
  | 'debt_pay'
  | 'promo'
  | 'expense'
  | 'finance_transfer'
  | 'account'
  | 'employee'
  | 'employee_delete'
  | 'target'
  | 'online_order'
  | 'online_order_status'
  | 'store'
  | 'store_delete'
  | 'warehouse'
  | 'settings'
  | 'roles';

export interface OfflineSyncItem {
  id: string;
  type: OfflineSyncOperationType;
  payload: unknown;
  createdAt: string;
  attempts: number;
  idempotencyKey?: string;
}

export interface AppSettings {
  brandName: string;
  currency: 'UZS';
  showUsdOption: boolean;
  usdRate: number;
  roundingStep: 1 | 100 | 500 | 1000;
  vatEnabled: boolean;
  vatRate: number;
  allowNegativeStock: boolean;
  discountApprovalThresholdPercent: number;
  receiptWidth: '58mm' | '80mm';
  receiptHeader: string;
  receiptFooter: string;
  showReceiptQr: boolean;
  labelTemplate: '40x30' | '58x40' | '30x20';
  enabledPaymentMethods: PaymentMethod[];
  loyaltyTiers: {
    tier: LoyaltyTier;
    minSpend: number;
    cashbackPercent: number;
  }[];
  cashbackExpiryDays: number;
  birthdayBonusAmount: number;
  telegramChannelHandle: string;
  integrations: {
    fiscalProvider: 'none' | 'multikassa' | 'epos';
    paymentGateway: 'none' | 'click_payme_uzum';
    smsProvider: 'none' | 'eskiz';
    telegramBotConfigured: boolean;
    marketplaceSync: 'none' | 'uzum_market';
    ofdApiUrl?: string;
    ofdMerchantId?: string;
    ofdApiKey?: string;
    clickMerchantId?: string;
    clickServiceId?: string;
    clickSecretKey?: string;
    paymeMerchantId?: string;
    paymeSecretKey?: string;
    uzumMerchantId?: string;
    uzumApiKey?: string;
    smsLogin?: string;
    smsApiKey?: string;
    smsSender?: string;
    telegramBotToken?: string;
    telegramChatId?: string;
    externalApiKey?: string;
    externalWebhookUrl?: string;
    marketplaceApiKey?: string;
  };
}

export interface DatabaseSnapshot {
  version: number;
  stores: Store[];
  warehouses: Warehouse[];
  users: User[];
  roles: Role[];
  categories: Category[];
  brands: Brand[];
  products: Product[];
  suppliers: Supplier[];
  stockItems: StockItem[];
  stockMovements: StockMovement[];
  purchaseReceipts: PurchaseReceipt[];
  purchaseOrders: PurchaseOrder[];
  transfers: Transfer[];
  writeOffs: WriteOff[];
  stocktakes: Stocktake[];
  sales: Sale[];
  returns: Return[];
  cashShifts: CashShift[];
  cashOperations: CashOperation[];
  accounts: Account[];
  transactions: Transaction[];
  expenses: Expense[];
  customers: Customer[];
  loyaltyAccounts: LoyaltyAccount[];
  loyaltyTransactions: LoyaltyTransaction[];
  debts: Debt[];
  promoCodes: PromoCode[];
  employees: Employee[];
  targets: Target[];
  onlineOrders: OnlineOrder[];
  auditLogs: AuditLog[];
  offlineQueue: OfflineSyncItem[];
  settings: AppSettings;
}
