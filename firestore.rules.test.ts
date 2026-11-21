import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

/**
 * Phase 0 + Phase 2 Security Specification Test Suite
 * Verifies workspace RBAC, workspace-wide operational data exchange (`store-chilonzor` & `store-samdarvoza`),
 * universal active-staff POS selling rights, owner (`ISLOMBEK`) access,
 * outsider/unverified denial, and `staffCredentials` plaintext rejection / safe migration
 * against Firebase Rules Emulator (`@firebase/rules-unit-testing`).
 */
export const DIRTY_DOZEN_PAYLOADS = [
  {
    id: 1,
    name: 'Unauthenticated read on products',
    auth: null,
    operation: 'get',
    path: '/workspaces/ws-shubrend-main/products/prod-1',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email spoofing write on category',
    auth: { uid: 'uid-spoof', token: { email: 'a1sanjar73@gmail.com', email_verified: false } },
    operation: 'create',
    path: '/workspaces/ws-shubrend-main/categories/cat-spoof',
    data: { id: 'cat-spoof', nameUz: 'Spoof', nameRu: 'Spoof', sortOrder: 1, storeId: 'store-chilonzor' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Non-member list query scraping sales',
    auth: { uid: 'uid-outsider', token: { email: 'outsider@gmail.com', email_verified: true } },
    operation: 'list',
    path: '/workspaces/ws-shubrend-main/sales',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow ghost field injection on category create',
    auth: { uid: 'uid-owner', token: { email: 'a1sanjar73@gmail.com', email_verified: true } },
    operation: 'create',
    path: '/workspaces/ws-shubrend-main/categories/cat-ghost',
    data: {
      id: 'cat-ghost',
      nameUz: 'Kurtkalar',
      nameRu: 'Куртки',
      sortOrder: 9,
      storeId: 'store-chilonzor',
      ownerUid: 'uid-owner',
      memberUids: ['uid-owner'],
      createdBy: 'usr-owner',
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Owner UID spoofing on workspace create',
    auth: { uid: 'uid-attacker', token: { email: 'attacker@gmail.com', email_verified: true } },
    operation: 'create',
    path: '/workspaces/ws-evil',
    data: {
      id: 'ws-evil',
      name: 'Evil Store',
      ownerUid: 'uid-victim',
      ownerEmail: 'victim@gmail.com',
      memberUids: ['uid-attacker'],
      adminUids: ['uid-attacker'],
      invitedEmails: [],
      roles: [],
      settings: {},
      version: 3,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Cashier self-privilege escalation on member record',
    auth: { uid: 'uid-cashier', token: { email: 'cashier@gmail.com', email_verified: true } },
    operation: 'update',
    path: '/workspaces/ws-shubrend-main/members/uid-cashier',
    data: { roleId: 'owner', permissions: ['manage_settings', 'manage_employees'] },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Cashier reading isolated staffCredentials PII/passwords',
    auth: { uid: 'uid-cashier', token: { email: 'cashier@gmail.com', email_verified: true } },
    operation: 'get',
    path: '/workspaces/ws-shubrend-main/staffCredentials/emp-1',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Cashier reading privateSettings API keys',
    auth: { uid: 'uid-cashier', token: { email: 'cashier@gmail.com', email_verified: true } },
    operation: 'get',
    path: '/workspaces/ws-shubrend-main/privateSettings/integrations',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client timestamp forgery on category create',
    auth: { uid: 'uid-owner', token: { email: 'a1sanjar73@gmail.com', email_verified: true } },
    operation: 'create',
    path: '/workspaces/ws-shubrend-main/categories/cat-time',
    data: {
      id: 'cat-time',
      nameUz: 'Kostyumlar',
      nameRu: 'Костюмы',
      sortOrder: 5,
      storeId: 'store-chilonzor',
      ownerUid: 'uid-owner',
      memberUids: ['uid-owner'],
      createdBy: 'usr-owner',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'ID poisoning / oversized payload on category create',
    auth: { uid: 'uid-owner', token: { email: 'a1sanjar73@gmail.com', email_verified: true } },
    operation: 'create',
    path: `/workspaces/ws-shubrend-main/categories/${'a'.repeat(200)}`,
    data: {
      id: 'a'.repeat(200),
      nameUz: 'x'.repeat(500),
      nameRu: 'x'.repeat(500),
      sortOrder: 1,
      storeId: 'store-chilonzor',
      ownerUid: 'uid-owner',
      memberUids: ['uid-owner'],
      createdBy: 'usr-owner',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'AuditLog tampering / overwrite attempt',
    auth: { uid: 'uid-cashier', token: { email: 'cashier@gmail.com', email_verified: true } },
    operation: 'update',
    path: '/workspaces/ws-shubrend-main/auditLogs/aud-1',
    data: { summary: 'Tampered log' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Outsider non-member sale creation denied',
    auth: { uid: 'uid-outsider', token: { email: 'outsider@gmail.com', email_verified: true } },
    operation: 'create',
    path: '/workspaces/ws-shubrend-main/sales/sale-illegal',
    data: {
      id: 'sale-illegal',
      receiptNumber: '#020101049999',
      warehouseId: 'wh-samdarvoza',
      cashierId: 'uid-outsider',
      cashierName: 'Outsider',
      items: [],
      subtotal: 0,
      checkDiscountAmount: 0,
      checkDiscountPercent: 0,
      loyaltyPointsSpent: 0,
      loyaltyPointsEarned: 0,
      vatAmount: 0,
      totalAmount: 0,
      costTotal: 0,
      payments: [],
      paidAmount: 0,
      debtAmount: 0,
      status: 'completed',
      fiscalStatus: 'not_configured',
      storeId: 'store-samdarvoza',
      ownerUid: 'uid-owner',
      memberUids: ['uid-owner', 'uid-outsider'],
      createdBy: 'uid-outsider',
    },
    expected: 'PERMISSION_DENIED',
  },
] as const;

const PROJECT_ID = 'gen-lang-client-0396501667';
const WS_ID = 'ws-shubrend-main';
const OWNER_UID = 'uid-owner';
const OWNER_EMAIL = 'assdsh993@gmail.com';
const TOR_UID = 'uid-cashier-tor';
const MIN_UID = 'uid-cashier-min';
const OUTSIDER_UID = 'uid-outsider';
const STORE_TOR = 'store-chilonzor'; // SHU BREND TORAQORGON
const STORE_MIN = 'store-samdarvoza'; // SHU BREND MINGBULOQ
const ALL_MEMBERS = [OWNER_UID, TOR_UID, MIN_UID];

async function seedFixtureData(testEnv: RulesTestEnvironment): Promise<void> {
  const ts = firebase.firestore.FieldValue.serverTimestamp();
  const baseTenant = (storeId: string, createdBy: string) => ({
    storeId,
    ownerUid: OWNER_UID,
    memberUids: ALL_MEMBERS,
    createdBy,
    createdAt: ts,
    updatedAt: ts,
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const wsRef = db.doc(`workspaces/${WS_ID}`);

    await wsRef.set({
      id: WS_ID,
      name: 'SHU BREND OMBOR',
      ownerUid: OWNER_UID,
      ownerEmail: OWNER_EMAIL,
      memberUids: ALL_MEMBERS,
      adminUids: [OWNER_UID],
      invitedEmails: ['toraqorgon@shubrend.uz', 'mingbuloq@shubrend.uz'],
      roles: [],
      settings: { businessName: 'SHU BREND' },
      version: 3,
      createdAt: ts,
      updatedAt: ts,
    });

    await wsRef.collection('members').doc(OWNER_UID).set({
      uid: OWNER_UID,
      staffId: 'emp-owner',
      displayName: 'ISLOMBEK',
      roleId: 'owner',
      assignedStoreIds: [STORE_TOR, STORE_MIN],
      permissions: [
        'sell',
        'refund',
        'view_catalog',
        'manage_products',
        'manage_stock',
        'manage_finance',
        'view_customers',
        'manage_customers',
        'manage_employees',
        'manage_settings',
      ],
      isActive: true,
      ownerUid: OWNER_UID,
      memberUids: ALL_MEMBERS,
      createdAt: ts,
      updatedAt: ts,
    });

    await wsRef.collection('members').doc(TOR_UID).set({
      uid: TOR_UID,
      staffId: 'emp-tor',
      displayName: 'Toraqorgon Kassir',
      roleId: 'cashier',
      assignedStoreIds: [STORE_TOR],
      permissions: ['sell', 'view_catalog', 'view_customers', 'manage_customers'],
      isActive: true,
      ownerUid: OWNER_UID,
      memberUids: ALL_MEMBERS,
      createdAt: ts,
      updatedAt: ts,
    });

    await wsRef.collection('members').doc(MIN_UID).set({
      uid: MIN_UID,
      staffId: 'emp-min',
      displayName: 'Mingbuloq Kassir',
      roleId: 'cashier',
      assignedStoreIds: [STORE_MIN],
      permissions: ['sell', 'view_catalog', 'view_customers', 'manage_customers'],
      isActive: true,
      ownerUid: OWNER_UID,
      memberUids: ALL_MEMBERS,
      createdAt: ts,
      updatedAt: ts,
    });

    await wsRef.collection('stores').doc(STORE_TOR).set({
      id: STORE_TOR,
      name: 'SHU BREND TORAQORGON',
      address: 'Toraqorgon',
      phone: '+998901111111',
      isActive: true,
      defaultWarehouseId: 'wh-chilonzor',
      ...baseTenant(STORE_TOR, OWNER_UID),
    });

    await wsRef.collection('stores').doc(STORE_MIN).set({
      id: STORE_MIN,
      name: 'SHU BREND MINGBULOQ',
      address: 'Mingbuloq',
      phone: '+998902222222',
      isActive: true,
      defaultWarehouseId: 'wh-samdarvoza',
      ...baseTenant(STORE_MIN, OWNER_UID),
    });

    for (const branch of [
      { suffix: 'tor', storeId: STORE_TOR, whId: 'wh-chilonzor', actor: TOR_UID },
      { suffix: 'min', storeId: STORE_MIN, whId: 'wh-samdarvoza', actor: MIN_UID },
    ]) {
      const t = baseTenant(branch.storeId, branch.actor);
      await wsRef.collection('products').doc(`prod-${branch.suffix}`).set({
        id: `prod-${branch.suffix}`,
        name: `Ko'ylak ${branch.suffix}`,
        categoryId: 'cat-1',
        unit: 'dona',
        tags: [],
        isPublishedOnline: true,
        variants: [{ id: `var-${branch.suffix}`, sku: `SKU-${branch.suffix}`, barcode: `47800001${branch.suffix}`, size: 'L', color: 'Qora', costPrice: 50000, sellingPrice: 90000, minStock: 1 }],
        ...t,
      });

      await wsRef.collection('stockItems').doc(`stock-${branch.suffix}`).set({
        id: `stock-${branch.suffix}`,
        productId: `prod-${branch.suffix}`,
        variantId: `var-${branch.suffix}`,
        warehouseId: branch.whId,
        qty: 12,
        ...t,
      });

      await wsRef.collection('sales').doc(`sale-${branch.suffix}`).set({
        id: `sale-${branch.suffix}`,
        receiptNumber: `#01-${branch.suffix}`,
        warehouseId: branch.whId,
        cashierId: branch.actor,
        cashierName: `Kassir ${branch.suffix}`,
        items: [{ productId: `prod-${branch.suffix}`, variantId: `var-${branch.suffix}`, qty: 1, price: 90000 }],
        subtotal: 90000,
        checkDiscountAmount: 0,
        checkDiscountPercent: 0,
        loyaltyPointsSpent: 0,
        loyaltyPointsEarned: 0,
        vatAmount: 0,
        totalAmount: 90000,
        costTotal: 50000,
        payments: [{ method: 'cash', amount: 90000 }],
        paidAmount: 90000,
        debtAmount: 0,
        status: 'completed',
        fiscalStatus: 'not_configured',
        ...t,
      });

      await wsRef.collection('cashShifts').doc(`shift-${branch.suffix}`).set({
        id: `shift-${branch.suffix}`,
        number: `SH-${branch.suffix}`,
        cashierId: branch.actor,
        cashierName: `Kassir ${branch.suffix}`,
        openedAt: '2026-11-18T08:00:00.000Z',
        startingCash: 100000,
        cashSalesTotal: 90000,
        cardSalesTotal: 0,
        otherSalesTotal: 0,
        cashRefundsTotal: 0,
        cashInTotal: 0,
        cashOutTotal: 0,
        expectedCash: 190000,
        status: 'open',
        ...t,
      });

      await wsRef.collection('accounts').doc(`acc-${branch.suffix}`).set({
        id: `acc-${branch.suffix}`,
        name: `Kassa ${branch.suffix}`,
        type: 'cash',
        balance: 190000,
        isDefault: true,
        ...t,
      });

      await wsRef.collection('transactions').doc(`trx-${branch.suffix}`).set({
        id: `trx-${branch.suffix}`,
        accountId: `acc-${branch.suffix}`,
        type: 'income',
        category: 'sale',
        amount: 90000,
        description: 'Savdo tushumi',
        ...t,
      });

      await wsRef.collection('customers').doc(`cust-${branch.suffix}`).set({
        id: `cust-${branch.suffix}`,
        name: `Mijoz ${branch.suffix}`,
        phone: '+998901234567',
        tags: [],
        segment: 'new',
        totalSpent: 90000,
        ordersCount: 1,
        debtBalance: 0,
        ...t,
      });

      await wsRef.collection('debts').doc(`debt-${branch.suffix}`).set({
        id: `debt-${branch.suffix}`,
        customerId: `cust-${branch.suffix}`,
        customerName: `Mijoz ${branch.suffix}`,
        originalAmount: 50000,
        remainingAmount: 50000,
        status: 'open',
        payments: [],
        ...t,
      });

      await wsRef.collection('onlineOrders').doc(`ord-${branch.suffix}`).set({
        id: `ord-${branch.suffix}`,
        orderNumber: `ONL-${branch.suffix}`,
        customerName: `Online ${branch.suffix}`,
        customerPhone: '+998901234567',
        deliveryAddress: 'Markaz',
        deliveryMethod: 'pickup',
        paymentMethod: 'cash_on_delivery',
        items: [{ productId: `prod-${branch.suffix}`, qty: 1 }],
        totalAmount: 90000,
        status: 'new',
        ...t,
      });
    }

    // Legacy staffCredentials record (pre-migration plaintext) preserved intact
    await wsRef.collection('staffCredentials').doc('emp-legacy').set({
      id: 'emp-legacy',
      userId: 'usr-tor',
      phone: '+998901112233',
      password: 'legacy-password-preserved',
      pin: '1234',
      baseSalary: 2500000,
      commissionPercent: 2,
      hiredAt: '2026-01-01',
      storeId: STORE_TOR,
      ownerUid: OWNER_UID,
      adminUids: [OWNER_UID],
      createdBy: OWNER_UID,
      createdAt: ts,
      updatedAt: ts,
    });
  });
}

export async function runEmulatorSecurityTests(): Promise<{ passed: number; failed: number }> {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const emulatorHostPort = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  const [host, portStr] = emulatorHostPort.split(':');
  const port = Number(portStr) || 8080;

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host, port },
  });

  let passed = 0;
  let failed = 0;
  const check = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      passed += 1;
      console.log(`PASS: ${label}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${label}`, error);
    }
  };

  try {
    await testEnv.clearFirestore();
    await seedFixtureData(testEnv);

    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const unverifiedDb = testEnv
      .authenticatedContext('uid-spoof', { email: OWNER_EMAIL, email_verified: false })
      .firestore();
    const outsiderDb = testEnv
      .authenticatedContext(OUTSIDER_UID, { email: 'outsider@gmail.com', email_verified: true })
      .firestore();
    const torDb = testEnv
      .authenticatedContext(TOR_UID, { email: 'toraqorgon@shubrend.uz', email_verified: true })
      .firestore();
    const minDb = testEnv
      .authenticatedContext(MIN_UID, { email: 'mingbuloq@shubrend.uz', email_verified: true })
      .firestore();
    const ownerDb = testEnv
      .authenticatedContext(OWNER_UID, { email: OWNER_EMAIL, email_verified: true })
      .firestore();

    const ts = firebase.firestore.FieldValue.serverTimestamp();

    // 1. Unauthorized / Unverified / Outsider must be denied
    await check('Unauthenticated user cannot read products or list sales', async () => {
      await assertFails(unauthDb.doc(`workspaces/${WS_ID}/products/prod-tor`).get());
      await assertFails(unauthDb.collection(`workspaces/${WS_ID}/sales`).get());
      await assertFails(unauthDb.doc(`workspaces/${WS_ID}/staffCredentials/emp-legacy`).get());
    });

    await check('Unverified email user spoofing owner email is denied', async () => {
      await assertFails(unverifiedDb.doc(`workspaces/${WS_ID}/products/prod-tor`).get());
      await assertFails(
        unverifiedDb.collection(`workspaces/${WS_ID}/sales`).where('memberUids', 'array-contains', 'uid-spoof').get(),
      );
    });

    await check('Verified non-member outsider is denied on all branch collections', async () => {
      for (const col of ['products', 'sales', 'stockItems', 'cashShifts', 'accounts', 'transactions', 'customers', 'debts', 'onlineOrders']) {
        const suffix = col === 'products' ? 'prod' : col === 'stockItems' ? 'stock' : col === 'cashShifts' ? 'shift' : col === 'accounts' ? 'acc' : col === 'transactions' ? 'trx' : col === 'customers' ? 'cust' : col === 'debts' ? 'debt' : col === 'onlineOrders' ? 'ord' : 'sale';
        await assertFails(outsiderDb.doc(`workspaces/${WS_ID}/${col}/${suffix}-tor`).get());
        await assertFails(
          outsiderDb.collection(`workspaces/${WS_ID}/${col}`).where('memberUids', 'array-contains', OUTSIDER_UID).get(),
        );
      }
      await assertFails(outsiderDb.doc(`workspaces/${WS_ID}/staffCredentials/emp-legacy`).get());
    });

    // 2. Workspace-Wide Data Exchange & Universal Selling across all active employees
    await check('Toraqorgon cashier can read shared workspace operational docs across branches', async () => {
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/products/prod-tor`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/products/prod-min`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/sales/sale-tor`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/sales/sale-min`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/stockItems/stock-tor`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/stockItems/stock-min`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/cashShifts/shift-tor`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/cashShifts/shift-min`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/accounts/acc-tor`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/accounts/acc-min`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/transactions/trx-tor`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/transactions/trx-min`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/customers/cust-tor`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/customers/cust-min`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/debts/debt-tor`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/debts/debt-min`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/onlineOrders/ord-tor`).get());
      await assertSucceeds(torDb.doc(`workspaces/${WS_ID}/onlineOrders/ord-min`).get());
    });

    await check('Active staff can list all workspace operational collections for real-time exchange', async () => {
      for (const col of ['products', 'sales', 'customers', 'debts', 'stockItems', 'cashShifts', 'accounts', 'transactions', 'onlineOrders']) {
        await assertSucceeds(torDb.collection(`workspaces/${WS_ID}/${col}`).get());
        await assertSucceeds(minDb.collection(`workspaces/${WS_ID}/${col}`).get());
      }
    });

    await check('Active cashier CAN sell across shared workspace but CANNOT escalate own role', async () => {
      await assertSucceeds(
        torDb.doc(`workspaces/${WS_ID}/sales/sale-shared-pos`).set({
          id: 'sale-shared-pos',
          receiptNumber: '#999',
          warehouseId: 'wh-samdarvoza',
          cashierId: TOR_UID,
          cashierName: 'Toraqorgon Kassir',
          items: [],
          subtotal: 0,
          checkDiscountAmount: 0,
          checkDiscountPercent: 0,
          loyaltyPointsSpent: 0,
          loyaltyPointsEarned: 0,
          vatAmount: 0,
          totalAmount: 0,
          costTotal: 0,
          payments: [],
          paidAmount: 0,
          debtAmount: 0,
          status: 'completed',
          fiscalStatus: 'not_configured',
          storeId: STORE_MIN,
          ownerUid: OWNER_UID,
          memberUids: ALL_MEMBERS,
          createdBy: TOR_UID,
          createdAt: ts,
          updatedAt: ts,
        }),
      );
      await assertFails(
        torDb.doc(`workspaces/${WS_ID}/members/${TOR_UID}`).update({
          roleId: 'owner',
          assignedStoreIds: [STORE_TOR, STORE_MIN],
          updatedAt: ts,
        }),
      );
    });

    // 4. Owner ISLOMBEK full multi-branch access
    await check('Owner ISLOMBEK can get, list across ALL branches, and write in both branches', async () => {
      await assertSucceeds(ownerDb.doc(`workspaces/${WS_ID}/products/prod-tor`).get());
      await assertSucceeds(ownerDb.doc(`workspaces/${WS_ID}/products/prod-min`).get());
      await assertSucceeds(ownerDb.doc(`workspaces/${WS_ID}/sales/sale-tor`).get());
      await assertSucceeds(ownerDb.doc(`workspaces/${WS_ID}/sales/sale-min`).get());
      await assertSucceeds(ownerDb.doc(`workspaces/${WS_ID}/accounts/acc-tor`).get());
      await assertSucceeds(ownerDb.doc(`workspaces/${WS_ID}/accounts/acc-min`).get());
      await assertSucceeds(ownerDb.doc(`workspaces/${WS_ID}/debts/debt-tor`).get());
      await assertSucceeds(ownerDb.doc(`workspaces/${WS_ID}/debts/debt-min`).get());
      await assertSucceeds(ownerDb.doc(`workspaces/${WS_ID}/onlineOrders/ord-tor`).get());
      await assertSucceeds(ownerDb.doc(`workspaces/${WS_ID}/onlineOrders/ord-min`).get());

      for (const col of ['products', 'sales', 'stockItems', 'cashShifts', 'accounts', 'transactions', 'customers', 'debts', 'onlineOrders']) {
        await assertSucceeds(ownerDb.collection(`workspaces/${WS_ID}/${col}`).get());
      }

      await assertSucceeds(
        ownerDb.doc(`workspaces/${WS_ID}/customers/cust-owner-min`).set({
          id: 'cust-owner-min',
          name: 'Yangi Mijoz Mingbuloq',
          phone: '+998907778899',
          tags: [],
          segment: 'new',
          totalSpent: 0,
          ordersCount: 0,
          debtBalance: 0,
          storeId: STORE_MIN,
          ownerUid: OWNER_UID,
          memberUids: ALL_MEMBERS,
          createdBy: OWNER_UID,
          createdAt: ts,
          updatedAt: ts,
        }),
      );
    });

    // 5. staffCredentials plaintext rejection + non-admin denial + safe legacy migration
    await check('Ordinary employee CANNOT read or write staffCredentials', async () => {
      await assertFails(torDb.doc(`workspaces/${WS_ID}/staffCredentials/emp-legacy`).get());
      await assertFails(torDb.collection(`workspaces/${WS_ID}/staffCredentials`).get());
    });

    await check('Owner CANNOT create new staffCredentials with plaintext password or pin', async () => {
      await assertFails(
        ownerDb.doc(`workspaces/${WS_ID}/staffCredentials/emp-plaintext`).set({
          id: 'emp-plaintext',
          userId: 'usr-new',
          phone: '+998901230000',
          password: 'plaintext-password',
          pin: '1234',
          baseSalary: 2000000,
          commissionPercent: 1,
          hiredAt: '2026-11-18',
          storeId: STORE_TOR,
          ownerUid: OWNER_UID,
          adminUids: [OWNER_UID],
          createdBy: OWNER_UID,
          createdAt: ts,
          updatedAt: ts,
        }),
      );
    });

    await check('Owner CAN create hashed staffCredentials and safely migrate legacy records without losing data', async () => {
      await assertSucceeds(
        ownerDb.doc(`workspaces/${WS_ID}/staffCredentials/emp-hashed`).set({
          id: 'emp-hashed',
          userId: 'usr-new',
          phone: '+998901230000',
          passwordHash: 'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
          pinHash: 'sha256:03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
          hashAlgo: 'pbkdf2-sha256',
          authMigrated: true,
          baseSalary: 2000000,
          commissionPercent: 1,
          hiredAt: '2026-11-18',
          storeId: STORE_TOR,
          ownerUid: OWNER_UID,
          adminUids: [OWNER_UID],
          createdBy: OWNER_UID,
          createdAt: ts,
          updatedAt: ts,
        }),
      );

      // Legacy read & salary update while legacy password/pin untouched
      await assertSucceeds(ownerDb.doc(`workspaces/${WS_ID}/staffCredentials/emp-legacy`).get());
      await assertSucceeds(
        ownerDb.doc(`workspaces/${WS_ID}/staffCredentials/emp-legacy`).update({
          baseSalary: 3000000,
          updatedAt: ts,
        }),
      );

      // Owner cannot inject modified plaintext into legacy record
      await assertFails(
        ownerDb.doc(`workspaces/${WS_ID}/staffCredentials/emp-legacy`).update({
          password: 'new-plaintext-password',
          updatedAt: ts,
        }),
      );

      // Safe migration: replace plaintext password/pin with hashed credentials and mark authMigrated: true
      await assertSucceeds(
        ownerDb.doc(`workspaces/${WS_ID}/staffCredentials/emp-legacy`).update({
          password: firebase.firestore.FieldValue.delete(),
          pin: firebase.firestore.FieldValue.delete(),
          passwordHash: 'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
          pinHash: 'sha256:03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
          hashAlgo: 'pbkdf2-sha256',
          authMigrated: true,
          updatedAt: ts,
        }),
      );
    });
  } finally {
    await testEnv.cleanup();
  }

  if (failed > 0) {
    throw new Error(`Security rules test suite failed: ${failed} failed, ${passed} passed`);
  }
  return { passed, failed };
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntrypoint) {
  runEmulatorSecurityTests()
    .then(({ passed }) => {
      console.log(`All ${passed} Firestore security rules checks passed.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
