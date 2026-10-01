/**
 * HANSAN — Canonical permission catalog (code-owned reference data).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 *   This module is the single authoritative vocabulary of permission names for
 *   the whole platform: role management, RolePermission assignment, staff
 *   authorization, POS, KDS, beverage station, inventory, purchasing, finance,
 *   staff management, orders, menu, customer/reservation capabilities and
 *   owner/back-office capabilities.
 *
 * OWNERSHIP
 *   Permission names are PLATFORM-OWNED reference data. They are never created
 *   from user input, never defined per organization, and never supplied by a
 *   client. `Permission` stays a GLOBAL table (no organizationId) and
 *   `RolePermission` stays the only grant mechanism. Tenant isolation is a
 *   property of Role/Staff/Outlet, never of Permission.
 *
 *   A role can therefore only ever be granted names that already exist here.
 *   Adding a permission is a code change plus one reference-data migration —
 *   never an API write.
 *
 * THE KEY
 *   `name` (dot-namespaced, lowercase) is the stable authorization key and is
 *   what the database stores and what authorization code compares against.
 *   `description` and the internal `domain` grouping are metadata only and are
 *   never used for an authorization decision.
 *
 * CATALOG IS NOT CAPABILITY
 *   A name existing here is NOT proof that the corresponding feature is
 *   implemented. The catalog establishes vocabulary for current and future
 *   phases. Routes must only require a permission they actually enforce, so
 *   unused catalog entries are deliberately not wired into any handler.
 *
 * PLATFORM / DEVELOPER PERMISSIONS ARE OUT OF SCOPE
 *   Developer and platform authorization is a tenant-independent boundary
 *   (see src/lib/developer-access.ts) and is NOT represented here. The
 *   NON_CATALOG_PERMISSION_PREFIXES list below names that boundary, and
 *   src/lib/permissions.test.ts rejects any catalog entry that crosses it.
 *
 * DATABASE
 *   These definitions are mirrored into PostgreSQL by the reference-data
 *   migration prisma/migrations/*_permission_catalog_reference_data. There is
 *   no prisma/seed.ts by design; reference data must ship deterministically
 *   with the deployment. src/lib/permissions.test.ts asserts the two stay in
 *   lockstep.
 */

/** Ordered grouping metadata. Every domain is the first segment of its names. */
export const PERMISSION_DOMAINS = Object.freeze([
  "owner",
  "settings",
  "orders",
  "menu",
  "kds",
  "beverage",
  "inventory",
  "recipes",
  "purchasing",
  "suppliers",
  "finance",
  "staff",
  "roles",
  "tables",
  "reservations",
  "customers",
  "loyalty",
  "promotions",
  "reports",
  "audit",
] as const);

export type PermissionDomain = (typeof PERMISSION_DOMAINS)[number];

export type PermissionDefinition = {
  readonly domain: PermissionDomain;
  readonly name: string;
  readonly description: string;
};

/**
 * Raised only for a defective catalog (a programming mistake), never for an
 * authorization decision. An unknown permission name is a denial, not an error.
 */
export class PermissionCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionCatalogError";
  }
}

/**
 * Permission names that must NEVER live in the tenant catalog.
 *
 * `developer.*` / `platform.*` / `admin.*` authorities are granted through the
 * DeveloperAccess boundary, not through tenant roles. Mixing them into the
 * catalog would let a tenant role mint platform authority.
 */
export const NON_CATALOG_PERMISSION_PREFIXES = ["developer.", "platform.", "admin."] as const;

/** Dot-namespaced lowercase key: `domain.segment[.segment]`, `_` allowed inside a segment. */
export const PERMISSION_NAME_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

/**
 * THE CATALOG.
 *
 * Key = the constant name exposed through PERMISSION. Value = the reference
 * data mirrored into the Permission table. One entry per permission, grouped by
 * domain, ordered exactly as the migration inserts it.
 *
 * `owner.hq.manage`, `settings.manage`, `orders.read` and `orders.create` are
 * live in production authorization code: their names and descriptions are
 * preserved verbatim and must never be renamed.
 */
const PERMISSION_CATALOG = {
  // ── OWNER / BACK OFFICE ────────────────────────────────────────────────────
  OWNER_HQ_MANAGE: { domain: "owner", name: "owner.hq.manage", description: "Access and manage the Owner HQ dashboard" },
  SETTINGS_MANAGE: { domain: "settings", name: "settings.manage", description: "Configure organization and outlet settings" },

  // ── ORDERS / POS ───────────────────────────────────────────────────────────
  ORDERS_READ: { domain: "orders", name: "orders.read", description: "View orders" },
  ORDERS_CREATE: { domain: "orders", name: "orders.create", description: "Create orders" },
  ORDERS_UPDATE: { domain: "orders", name: "orders.update", description: "Modify an unsettled order, such as its items or notes" },
  ORDERS_CANCEL: { domain: "orders", name: "orders.cancel", description: "Cancel an order before it is completed" },
  ORDERS_COMPLETE: { domain: "orders", name: "orders.complete", description: "Mark an order as completed and close its lifecycle" },
  ORDERS_REFUND: { domain: "orders", name: "orders.refund", description: "Refund a settled order; a privileged financial action that must stay auditable" },
  ORDERS_DISCOUNT: { domain: "orders", name: "orders.discount", description: "Apply a discount to an order line or the order total" },

  // ── MENU ───────────────────────────────────────────────────────────────────
  MENU_READ: { domain: "menu", name: "menu.read", description: "View the product catalog, categories, and prices" },
  MENU_CREATE: { domain: "menu", name: "menu.create", description: "Create categories and menu items" },
  MENU_UPDATE: { domain: "menu", name: "menu.update", description: "Edit categories, menu items, and their prices" },
  MENU_DELETE: { domain: "menu", name: "menu.delete", description: "Remove categories or menu items from the catalog" },
  MENU_AVAILABILITY: { domain: "menu", name: "menu.availability", description: "Toggle whether a menu item is available for sale" },

  // ── KDS / KITCHEN ──────────────────────────────────────────────────────────
  KDS_READ: { domain: "kds", name: "kds.read", description: "View the kitchen display queue" },
  KDS_MANAGE: { domain: "kds", name: "kds.manage", description: "Manage kitchen display configuration and queue handling" },
  KDS_UPDATE_STATUS: { domain: "kds", name: "kds.update_status", description: "Move a kitchen ticket between preparation statuses" },

  // ── BEVERAGE STATION ───────────────────────────────────────────────────────
  BEVERAGE_READ: { domain: "beverage", name: "beverage.read", description: "View the beverage station queue" },
  BEVERAGE_MANAGE: { domain: "beverage", name: "beverage.manage", description: "Manage beverage station configuration and queue handling" },
  BEVERAGE_UPDATE_STATUS: { domain: "beverage", name: "beverage.update_status", description: "Move a beverage ticket between preparation statuses" },

  // ── INVENTORY ──────────────────────────────────────────────────────────────
  INVENTORY_READ: { domain: "inventory", name: "inventory.read", description: "View stock levels, stock movements, and stock-taking records" },
  INVENTORY_CREATE: { domain: "inventory", name: "inventory.create", description: "Create inventory items and stock records" },
  INVENTORY_UPDATE: { domain: "inventory", name: "inventory.update", description: "Edit inventory item definitions such as unit, cost, and reorder level" },
  INVENTORY_ADJUST: { domain: "inventory", name: "inventory.adjust", description: "Post a manual stock adjustment with a reason" },
  INVENTORY_TRANSFER: { domain: "inventory", name: "inventory.transfer", description: "Move stock between outlets" },

  // ── RECIPES ────────────────────────────────────────────────────────────────
  RECIPES_READ: { domain: "recipes", name: "recipes.read", description: "View recipe definitions and their ingredient consumption" },
  RECIPES_CREATE: { domain: "recipes", name: "recipes.create", description: "Create a recipe that links a menu item to the inventory it consumes" },
  RECIPES_UPDATE: { domain: "recipes", name: "recipes.update", description: "Edit an existing recipe" },
  RECIPES_DELETE: { domain: "recipes", name: "recipes.delete", description: "Delete a recipe definition" },

  // ── PURCHASING ─────────────────────────────────────────────────────────────
  PURCHASING_READ: { domain: "purchasing", name: "purchasing.read", description: "View purchase orders and goods-receipt records" },
  PURCHASING_CREATE: { domain: "purchasing", name: "purchasing.create", description: "Create a purchase order" },
  PURCHASING_UPDATE: { domain: "purchasing", name: "purchasing.update", description: "Edit a purchase order that has not been sent to the supplier" },
  PURCHASING_APPROVE: { domain: "purchasing", name: "purchasing.approve", description: "Approve a purchase order so it can be sent to the supplier" },
  PURCHASING_RECEIVE: { domain: "purchasing", name: "purchasing.receive", description: "Record the goods received against a purchase order" },

  // ── SUPPLIERS ──────────────────────────────────────────────────────────────
  SUPPLIERS_READ: { domain: "suppliers", name: "suppliers.read", description: "View supplier records" },
  SUPPLIERS_CREATE: { domain: "suppliers", name: "suppliers.create", description: "Create a supplier record" },
  SUPPLIERS_UPDATE: { domain: "suppliers", name: "suppliers.update", description: "Edit a supplier record" },
  SUPPLIERS_DELETE: { domain: "suppliers", name: "suppliers.delete", description: "Delete a supplier record" },

  // ── FINANCE ────────────────────────────────────────────────────────────────
  FINANCE_READ: { domain: "finance", name: "finance.read", description: "View financial records, cash movements, and financial reports" },
  FINANCE_CREATE: { domain: "finance", name: "finance.create", description: "Record a financial transaction" },
  FINANCE_UPDATE: { domain: "finance", name: "finance.update", description: "Edit a financial transaction that has not been closed" },
  FINANCE_APPROVE: { domain: "finance", name: "finance.approve", description: "Approve a financial transaction or journal entry" },
  FINANCE_REFUND: { domain: "finance", name: "finance.refund", description: "Process a refund through the finance ledger" },
  FINANCE_RECONCILE: { domain: "finance", name: "finance.reconcile", description: "Close and reconcile a cash or banking period" },

  // ── STAFF ──────────────────────────────────────────────────────────────────
  STAFF_READ: { domain: "staff", name: "staff.read", description: "View staff profiles and their assignments" },
  STAFF_CREATE: { domain: "staff", name: "staff.create", description: "Onboard a new staff profile" },
  STAFF_UPDATE: { domain: "staff", name: "staff.update", description: "Edit a staff profile" },
  STAFF_STATUS: { domain: "staff", name: "staff.status", description: "Activate, deactivate, or suspend a staff account" },
  STAFF_ASSIGN_ROLE: { domain: "staff", name: "staff.assign_role", description: "Assign or revoke a role for a staff member" },
  STAFF_ASSIGN_OUTLET: { domain: "staff", name: "staff.assign_outlet", description: "Move a staff member between outlets" },

  // ── ROLES / PERMISSIONS ────────────────────────────────────────────────────
  ROLES_READ: { domain: "roles", name: "roles.read", description: "View roles and their permission grants" },
  ROLES_CREATE: { domain: "roles", name: "roles.create", description: "Create a role" },
  ROLES_UPDATE: { domain: "roles", name: "roles.update", description: "Edit a role definition" },
  ROLES_DELETE: { domain: "roles", name: "roles.delete", description: "Delete a role" },
  ROLES_ASSIGN_PERMISSION: { domain: "roles", name: "roles.assign_permission", description: "Grant or revoke a permission on a role" },

  // ── TABLES ─────────────────────────────────────────────────────────────────
  TABLES_READ: { domain: "tables", name: "tables.read", description: "View table layouts and the current status of each table" },
  TABLES_CREATE: { domain: "tables", name: "tables.create", description: "Create a table or table layout" },
  TABLES_UPDATE: { domain: "tables", name: "tables.update", description: "Edit a table or table layout" },
  TABLES_DELETE: { domain: "tables", name: "tables.delete", description: "Delete a table or table layout" },

  // ── RESERVATIONS ───────────────────────────────────────────────────────────
  RESERVATIONS_READ: { domain: "reservations", name: "reservations.read", description: "View reservations" },
  RESERVATIONS_CREATE: { domain: "reservations", name: "reservations.create", description: "Create a reservation" },
  RESERVATIONS_UPDATE: { domain: "reservations", name: "reservations.update", description: "Edit a reservation" },
  RESERVATIONS_CANCEL: { domain: "reservations", name: "reservations.cancel", description: "Cancel a reservation" },

  // ── CUSTOMER / LOYALTY ─────────────────────────────────────────────────────
  CUSTOMERS_READ: { domain: "customers", name: "customers.read", description: "View customer records" },
  CUSTOMERS_CREATE: { domain: "customers", name: "customers.create", description: "Create a customer record" },
  CUSTOMERS_UPDATE: { domain: "customers", name: "customers.update", description: "Edit a customer record" },
  LOYALTY_READ: { domain: "loyalty", name: "loyalty.read", description: "View loyalty balances and point histories" },
  LOYALTY_MANAGE: { domain: "loyalty", name: "loyalty.manage", description: "Issue, redeem, or adjust loyalty points" },

  // ── PROMOTIONS ─────────────────────────────────────────────────────────────
  PROMOTIONS_READ: { domain: "promotions", name: "promotions.read", description: "View promotions, vouchers, and price rules" },
  PROMOTIONS_CREATE: { domain: "promotions", name: "promotions.create", description: "Create a promotion or voucher" },
  PROMOTIONS_UPDATE: { domain: "promotions", name: "promotions.update", description: "Edit a promotion or voucher" },
  PROMOTIONS_DELETE: { domain: "promotions", name: "promotions.delete", description: "Delete a promotion or voucher" },

  // ── REPORTING ──────────────────────────────────────────────────────────────
  REPORTS_READ: { domain: "reports", name: "reports.read", description: "View operational and financial reports" },
  REPORTS_EXPORT: { domain: "reports", name: "reports.export", description: "Export report data out of the platform" },

  // ── AUDIT ──────────────────────────────────────────────────────────────────
  AUDIT_READ: { domain: "audit", name: "audit.read", description: "View the audit trail of privileged and sensitive actions" },
} as const satisfies Record<string, PermissionDefinition>;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC SHAPE
// ─────────────────────────────────────────────────────────────────────────────

/** The stable authorization key of every catalog entry. */
export type PermissionName = (typeof PERMISSION_CATALOG)[keyof typeof PERMISSION_CATALOG]["name"];

/**
 * Constant lookup for authorization code: `PERMISSION.ORDERS_READ === "orders.read"`.
 *
 * Each value keeps its string-literal type, so a mistyped key is a compile
 * error and a renamed constant cannot silently change an authorization rule.
 * Derived from the catalog — it can never drift from it.
 */
export const PERMISSION = Object.freeze(
  Object.fromEntries(
    Object.entries(PERMISSION_CATALOG).map(([key, definition]) => [key, definition.name])
  ) as { readonly [K in keyof typeof PERMISSION_CATALOG]: (typeof PERMISSION_CATALOG)[K]["name"] }
);

/** Every canonical definition, in catalog order. Frozen: this data is read-only. */
export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = Object.freeze(
  Object.values(PERMISSION_CATALOG).map((definition) => Object.freeze({ ...definition }))
);

/** Every canonical permission name, in catalog order. */
export const PERMISSION_NAMES: readonly PermissionName[] = Object.freeze(
  PERMISSION_DEFINITIONS.map((definition) => definition.name as PermissionName)
);

const DEFINITION_BY_NAME: ReadonlyMap<string, PermissionDefinition> = new Map(
  PERMISSION_DEFINITIONS.map((definition) => [definition.name, definition])
);

const NAMES_BY_DOMAIN: ReadonlyMap<PermissionDomain, readonly PermissionName[]> = new Map(
  PERMISSION_DOMAINS.map((domain) => [
    domain,
    Object.freeze(
      PERMISSION_DEFINITIONS.filter((definition) => definition.domain === domain).map(
        (definition) => definition.name as PermissionName
      )
    ),
  ])
);

/**
 * Deterministic primary key for a canonical permission, mirroring the rule used
 * by the reference-data migration (`perm` + name with dots as underscores).
 *
 * Existing rows are never rewritten: the migration only applies this id to rows
 * it inserts itself, so permissions created before the catalog keep their ids.
 */
export function deterministicPermissionId(name: PermissionName): string {
  return `perm_${name.replace(/\./g, "_")}`;
}

/**
 * Exact, case-sensitive lookup. Returns null for an unknown name instead of
 * throwing: an unknown permission is an authorization denial, not a fault.
 */
export function getPermissionDefinition(name: unknown): PermissionDefinition | null {
  if (typeof name !== "string") {
    return null;
  }
  return DEFINITION_BY_NAME.get(name) ?? null;
}

/**
 * Same lookup, for wiring that must never silently point at a missing row.
 *
 * Use it where an unresolvable name means a developer mistake (for example a
 * constant list fed to a provisioning flow), not where it means "denied".
 */
export function requirePermissionDefinition(name: unknown): PermissionDefinition {
  const definition = getPermissionDefinition(name);
  if (!definition) {
    throw new PermissionCatalogError(
      `"${String(name)}" is not a canonical permission. Add it to PERMISSION_CATALOG in src/lib/permissions.ts and ship the matching reference-data migration.`
    );
  }
  return definition;
}

/** Exact, case-sensitive membership test. Prefixes and wildcards never match. */
export function isCanonicalPermission(name: unknown): boolean {
  return getPermissionDefinition(name) !== null;
}

/**
 * Whether a name is one the catalog owns outright: a global `Permission` row
 * whose existence this module guarantees.
 *
 * Several names checked by existing code are not catalog-managed because their
 * source of truth is elsewhere — role-derived names such as `role.manage`,
 * `user.manage`, `staff.manage`, `tables.view`, `reservation.manage`,
 * `customer.manage`, `promotions.manage`, `pos.view` and
 * `reports.financial.view`, plus every `developer.*` / `platform.*` / `admin.*`
 * authority granted through the DeveloperAccess boundary. They are legitimate,
 * but the catalog must not claim to own them until their source moves here.
 */
export function isCatalogManagedPermission(name: unknown): boolean {
  return isCanonicalPermission(name);
}

const EMPTY_PERMISSION_NAMES: readonly PermissionName[] = Object.freeze([]);

/** Every canonical name in a domain, in catalog order. Empty for an unknown domain. */
export function getPermissionNamesByDomain(
  domain: PermissionDomain | (string & {})
): readonly PermissionName[] {
  return NAMES_BY_DOMAIN.get(domain as PermissionDomain) ?? EMPTY_PERMISSION_NAMES;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSUMER CONTRACTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The permissions `/api/auth/provision` attaches to the OWNER role it creates.
 *
 * Exactly the four names that endpoint has always granted, in the same order, so
 * provisioning behavior does not change. This is a deliberate subset of the
 * catalog: OWNER gains further capabilities through role management, never
 * through the provisioning secret.
 */
export const OWNER_PROVISION_PERMISSIONS: readonly PermissionDefinition[] = Object.freeze([
  PERMISSION_CATALOG.OWNER_HQ_MANAGE,
  PERMISSION_CATALOG.SETTINGS_MANAGE,
  PERMISSION_CATALOG.ORDERS_READ,
  PERMISSION_CATALOG.ORDERS_CREATE,
] as const);

/** Names of {@link OWNER_PROVISION_PERMISSIONS}, in the same order. */
export const OWNER_PROVISION_PERMISSION_NAMES: readonly PermissionName[] = Object.freeze(
  OWNER_PROVISION_PERMISSIONS.map((definition) => definition.name as PermissionName)
);
