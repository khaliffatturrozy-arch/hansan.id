# HANSAN Production Architecture Audit

## A. Repository Status

### Stack
- Next.js 14.2.x
- React 18
- TypeScript
- Prisma ORM
- PostgreSQL (target database)
- Supabase JS client
- Tailwind CSS

### Architecture
- App Router structure is present under src/app.
- POS is implemented as a modular feature layout under src/modules/pos.
- Shared state is centralized in src/context/CartContext.tsx.
- Database access is centralized in src/lib/prisma.ts.
- A real order persistence path exists in src/lib/order-service.ts and src/app/api/orders/route.ts.
- The architecture is modular but not yet production-guarded by auth, tenant scoping, or deployment infrastructure.

### Current Modules
- POS / order: partial and functionally present
- KDS: not implemented in the audited scope
- Inventory: not implemented as a production inventory architecture
- Dashboard: present as shell/module stub, not a production operational system
- Auth / identity: missing in the current repo
- Customer Experience Engine: not implemented as a configurable domain engine
- Platform services / deployment / CI: not implemented in the audited scope

### Database
- Prisma schema exists and is valid locally.
- Primary operational models include Category, MenuItem, Order, OrderItem.
- Required runtime database credentials are not currently available in this environment.
- Live database verification is blocked.

### Authentication
- No real auth implementation was found in the inspected code.
- No middleware file exists.
- No server-side session retrieval utilities were found.
- Supabase is configured only as a client object with public anon credentials; no Supabase Auth integration or server-side session validation is active.

### Deployment
- No CI workflow files or deployment manifests were in the inspected scope.
- No production deployment config was identified.
- The repo is currently development-oriented and not yet deployment-ready.

---

## B. Domain Audit

### 1. PLATFORM
Status: Partial
Evidence: Next.js app shell exists; modular structure exists; however there is no production platform operations layer, no deployment config, and no platform runtime controls.
Risk: Medium

### 2. IDENTITY & ACCESS
Status: Missing
Evidence: No auth/session server utilities, middleware, or user/profile model found.
Risk: CRITICAL

### 3. POS & ORDER HUB
Status: Partial
Evidence: POS UI and order service exist; order creation is validated and persisted at the API/service layer, but auth and outlet scoping are absent.
Risk: CRITICAL

### 4. MENU & RECIPE
Status: Partial
Evidence: MenuItem and Category exist; menu catalog is present. Recipe/BOM structure is not present.
Risk: HIGH

### 5. INVENTORY
Status: Missing / Broken for production
Evidence: stockCount exists on MenuItem, but no inventory ledger, stock movement model, or recipe/BOM layer exists. Direct stock mutation was isolated to avoid unsafe coupling.
Risk: CRITICAL

### 6. KDS
Status: Missing
Evidence: module folder exists but no production kitchen workflow or order-status propagation is implemented.
Risk: HIGH

### 7. TABLE & RESERVATION
Status: Missing
Evidence: table number exists on order, but no table-management domain or reservation system is present.
Risk: MEDIUM

### 8. CUSTOMER & LOYALTY
Status: Missing
Evidence: customerName exists as a field, but no domain model for customer identity, loyalty, membership, or membership rules is present.
Risk: HIGH

### 9. PROMOTION ENGINE
Status: Missing
Evidence: no promotion data model, rules engine, or application pipeline found.
Risk: MEDIUM

### 10. PAYMENT & FINANCE
Status: Partial
Evidence: payment method enum and UI modal exist. No payment gateway, reconciliation, settlement, or audit ledger is present.
Risk: HIGH

### 11. TAX
Status: Partial
Evidence: taxPb1 is stored in Order; no tax engine, tax configuration model, or tax ledger logic is present.
Risk: MEDIUM

### 12. STAFF OPERATIONS
Status: Missing
Evidence: cashier name field exists, but no staff model, attendance, shift, or permission model is present.
Risk: HIGH

### 13. WEBSITE & OMNICHANNEL
Status: Missing
Evidence: no storefront or omnichannel ordering domain was identified in the inspected scope.
Risk: MEDIUM

### 14. REPORTING
Status: Missing
Evidence: no reporting schema or analytics layer identified.
Risk: MEDIUM

### 15. OWNER HQ
Status: Missing
Evidence: no HQ dashboard or aggregated reporting layer identified.
Risk: MEDIUM

### 16. CUSTOMER EXPERIENCE ENGINE
Status: Missing
Evidence: no brand/theme/page builder, CMS, media library, or live preview system exists.
Risk: CRITICAL

### 17. PLATFORM SERVICES
Status: Partial
Evidence: Supabase JS client exists, but no platform service layer, event bus, queue, or server-side service architecture exists.
Risk: HIGH

---

## C. Security Audit

### Authentication
Status: FAIL / BLOCKED
- No authenticated server-side session retrieval path exists.
- No middleware exists.
- No server-side user context is enforced.

### Authorization
Status: FAIL / BLOCKED
- Order API currently accepts requests without any user or outlet authorization check.
- The repository does not contain a role model or RBAC rules.

### RBAC
Status: Missing
- No permission model or server-side permission gate was located.

### RLS
Status: Not verified / not implemented
- No Supabase RLS policies or migrations for auth-scoped tables were found.

### Tenant Isolation
Status: Missing
- No organization or outlet domain model is present.
- No tenant scoping is enforced at API/service layer.

### Outlet Isolation
Status: Missing
- Orders are not associated with an outlet or organization.
- The frontend can represent outlet labels, but the backend does not derive outlet context from the authenticated user.

### Secrets
Status: PASS (local only)
- No .env or secret credentials were committed.
- .env.example does contain placeholders and does not leak credentials.

### API Validation
Status: Partial PASS
- Server-side validation exists for order payload structure and invalid menu items/quantities.
- Price trust issue was addressed by resolving menu prices from the database.
- Auth and outlet authorization remain missing.

### Client Trust
Status: Partial PASS
- Client-calculated totals are no longer trusted in the order service.
- However, client-supplied outlet/user identity is still not validated by the server.

### Webhook security
Status: Not present
- No webhook endpoints, signing, or callback verification were found in the inspected scope.

### Audit Logging
Status: Missing
- No critical-operation audit trail was identified.

---

## D. Database Audit

### Schema
Status: PASS locally
- Prisma schema is valid.
- Core operational entities are present for menu and orders.
- No auth, outlet, tenant, or RBAC models are present.

### Relations
Status: Partial
- MenuItem -> Category: present
- OrderItem -> Order: present
- OrderItem -> MenuItem: present
- Organization/outlet/user membership relations: missing

### Indexes
Status: Partial
- Order indexes exist for status and createdAt.
- Idempotency index exists on Order.idempotencyKey.
- No auth/outlet/tenant indexes exist.

### Constraints
Status: Partial
- FK constraints exist for order item relationships and category availability.
- No outlet or tenant scoping constraints exist.

### Migrations
Status: PASS locally for schema consistency; BLOCKED for live deployment
- Migration files exist and reflect the current schema for the order domain.
- Live migration status cannot be verified without a reachable PostgreSQL database.

### Transaction Boundaries
Status: PASS in local order service design
- Order + OrderItem creation is atomic in a Prisma transaction.
- Inventory deduction was intentionally isolated because the underlying inventory architecture is incomplete.

### Historical Snapshots
Status: PASS for pricing
- OrderItem.unitPrice snapshots the menu price at order creation.
- This preserves historical integrity.

---

## E. Production Risks

### CRITICAL
1. No real database connection is available in the current environment.
2. No auth/session model or server-side user context exists.
3. No organization/outlet authorization model exists.
4. No tenant isolation enforcement exists.
5. Customer Experience Engine is missing, which is a core domain for HANSAN.

### HIGH
1. Inventory architecture is incomplete and not production-safe.
2. KDS workflow is not implemented.
3. No RBAC / permission model exists.
4. No reporting or HQ layer exists.
5. No production deployment pipeline or CI configuration was identified.

### MEDIUM
1. Hardcoded brand text remains in UI shell and should be moved to configuration-driven branding.
2. Outlet labels are static text and not tenant-driven.
3. No reservation, table management, or loyalty domain exists yet.
4. Payment and tax engines are not complete.

### LOW
1. Build and lint pass locally.
2. Basic order validation is in place.

---

## F. Recommended Execution Order

1. Provision and verify the actual PostgreSQL environment.
2. Add the missing authentication stack and session utilities.
3. Define organization/outlet/user membership domain and RBAC.
4. Enforce server-side outlet scoping on all transactional APIs.
5. Complete the inventory ledger and stock movement architecture.
6. Connect KDS and order lifecycle propagation.
7. Add reporting and HQ capabilities.
8. Implement customer experience engine as a configurable data model and builder layer.
9. Then proceed with payment, tax, promotions, reservations, and omnichannel expansion.

The ordering above is dependency-aware: all downstream capabilities depend on verified database access and trusted identity/outlet boundaries.

---

## Final Determination

STATUS: BLOCKED

Reason: The repository is structurally viable as a development prototype and some POS transaction safeguards are now in place, but it is not ready for production implementation because database connectivity, auth, and outlet authorization are not yet implemented or verified.
