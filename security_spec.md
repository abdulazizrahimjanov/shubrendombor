# SHU BREND OMBOR — Firestore Security Specification (Phase 0)

## 1. Core Data & Access Invariants
1. **Verified Authentication**: Every workspace read/write requires `request.auth != null && request.auth.token.email_verified == true`.
2. **Workspace Membership Boundary (Master Gate)**:
   - Every tenant resource lives under `/workspaces/{workspaceId}/...`.
   - Every single-document `get`, `create`, `update`, `delete` verifies membership on `/workspaces/{workspaceId}` and `/workspaces/{workspaceId}/members/{request.auth.uid}`.
   - Every `list` query evaluates `resource.data.ownerUid == request.auth.uid || request.auth.uid in resource.data.memberUids` (or `adminUids` on admin-restricted collections) with **zero** `get()`/`exists()` inside `allow list`.
3. **Role & Branch Scoping (RBAC)**:
   - `owner` and `admin` (plus bootstrapped verified admin emails `assalomu408@gmail.com`, `assdsh993@gmail.com`, `a1sanjar73@gmail.com`) can manage workspace settings, stores, roles, employees, private credentials, and all branches.
   - `manager`, `cashier`, and `warehouse` can only write documents in collections permitted by their role/custom permissions AND scoped to their `assignedStoreIds`, and branch-isolated collections enforce `canGetStoreDoc` / `canReadStoreRow` on both `get` and `list`.
4. **PII & Credential Isolation**:
   - `/userProfiles/{uid}/private/info` is readable/writable strictly by `uid`.
   - `/workspaces/{wsId}/staffCredentials/{staffId}` (phone, `passwordHash`, `pinHash`, `hashAlgo`, `authMigrated`, Google email, base salary, commission; rejecting plaintext `password`/`pin` on create) and `/workspaces/{wsId}/privateSettings/{docId}` (OFD/Click/Payme/Telegram API keys) are restricted exclusively to workspace Owner/Admin (`adminUids`).
   - `/workspaces/{wsId}/staffInvites/{emailHash}` stores zero-PII role/store bindings keyed by lowercase email SHA-256 hash so invited employees can claim only their admin-assigned role and branches upon Google sign-in.
5. **Immutable & Server-Timestamped Integrity**:
   - `createdAt == request.time` on `create`.
   - `createdAt == existing().createdAt && updatedAt == request.time && ownerUid == existing().ownerUid` on `update`.
   - Terminal states (`stockMovements`, `returns`, `auditLogs`, `syncedOps`) cannot be forged or overwritten once created.
   - All updates use explicit action branches with `affectedKeys().hasOnly(...)` and full `isValid[Entity](incoming())` checks.
6. **Bounded Arrays & String Lengths**:
   - Document IDs validated via `isValidId()` (`<= 128` chars, `^[a-zA-Z0-9_\-]+$`).
   - All strings have explicit `.size()` bounds; all lists (`memberUids`, `adminUids`, `variants`, `items`, `tags`, `payments`) have strict `.size() <= MAX` limits.

## 2. The "Dirty Dozen" Attack Payloads (Expected: `PERMISSION_DENIED`)
1. **Unauthenticated Product Read**: Anonymous/null auth attempts `get /workspaces/ws-main/products/prod-1`.
2. **Unverified Email Write**: Auth user with `email_verified: false` tries creating a category even with matching email.
3. **Cross-Tenant List Scraping**: Authenticated non-member attempts `list /workspaces/ws-main/sales` without `memberUids` containment.
4. **Ghost Field ("Shadow Update") on Category Create**: Member submits `categories/cat-x` with extra field `isVerified: true` or `isSystem: true`.
5. **Owner Spoofing on Workspace Create**: Attacker creates `/workspaces/ws-evil` setting `ownerUid: "victim-uid"`.
6. **Privilege Escalation on Member Update**: Cashier updates `/workspaces/ws-main/members/{self}` changing `roleId` to `'owner'` or adding `'manage_settings'`.
7. **PII Credential Theft**: Cashier attempts `get` or `list` on `/workspaces/ws-main/staffCredentials/{staffId}`.
8. **API Secret Exfiltration**: Cashier/Warehouse attempts `get` on `/workspaces/ws-main/privateSettings/integrations`.
9. **Client Timestamp Forgery**: Member creates a `Sale` or `Category` passing a client ISO string or past timestamp instead of `request.time`.
10. **ID Poisoning / Oversized Payload**: Member attempts `create` with 1.5KB category ID or 10KB category name (`nameUz.size() > 120`).
11. **Terminal State Modification**: Cashier attempts `update` on an already `completed` Sale status back to `deferred`, or tampers with an immutable `AuditLog` / `StockMovement`.
12. **Out-of-Branch Write**: Cashier assigned only to `store-chilonzor` attempts `create` on `/sales/sale-x` with `storeId: "store-samdarvoza"`.
