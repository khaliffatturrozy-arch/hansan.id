-- ═════════════════════════════════════════════════════════════════════════
-- HANSAN — Permission Catalog Reference Data
--
-- PURPOSE
--   Materialize the canonical permission vocabulary into the global Permission
--   table so that role management can grant from a fixed, platform-owned set.
--   The vocabulary lives in code (src/lib/permissions.ts); this migration is
--   its deterministic database projection. There is no prisma/seed.ts by
--   design: reference data must ship with the deployment, not be run by hand.
--
-- SCOPE
--   Permission rows ONLY — global reference data shared by every organization.
--   No Organization, Outlet, Staff, Developer, Role, RolePermission, StaffRole,
--   Order, Menu or other business row is created, changed, or deleted.
--   Permission keeps its global shape: no organizationId, no tenant catalog.
--
-- SAFETY (additive, idempotent, fail-closed)
--   * Safe on an empty database: inserts every canonical permission.
--   * Safe when some permissions already exist (for example the original four
--     created by POST /api/auth/provision): existing rows are matched by name
--     and their IDs are PRESERVED. Only rows inserted here receive the
--     deterministic "perm_<name>" id.
--   * Descriptions of existing rows are only completed when they are NULL or
--     blank; operator-authored text is never overwritten.
--   * Unknown permissions are never deleted and the table is never reset.
--   * Grants are untouched: this migration cannot widen any role, including
--     OWNER, whose current grants remain owner.hq.manage, settings.manage,
--     orders.read and orders.create.
--   * The whole script is a single DO block, so it is atomic under any client.
--   * Preflight aborts instead of guessing if a deterministic ID is already
--     occupied by a different name, or if an existing name differs from a
--     canonical name only by case. Nothing is modified in that case.
--   * A post-check aborts if any canonical name is missing afterwards.
--
-- GENERATED FROM src/lib/permissions.ts — edit the catalog, never this file by
-- hand. src/lib/permissions.test.ts asserts catalog and SQL stay identical.

DO $$
DECLARE
  v_names text[] := ARRAY[
    'owner.hq.manage',
    'settings.manage',
    'orders.read',
    'orders.create',
    'orders.update',
    'orders.cancel',
    'orders.complete',
    'orders.refund',
    'orders.discount',
    'menu.read',
    'menu.create',
    'menu.update',
    'menu.delete',
    'menu.availability',
    'kds.read',
    'kds.manage',
    'kds.update_status',
    'beverage.read',
    'beverage.manage',
    'beverage.update_status',
    'inventory.read',
    'inventory.create',
    'inventory.update',
    'inventory.adjust',
    'inventory.transfer',
    'recipes.read',
    'recipes.create',
    'recipes.update',
    'recipes.delete',
    'purchasing.read',
    'purchasing.create',
    'purchasing.update',
    'purchasing.approve',
    'purchasing.receive',
    'suppliers.read',
    'suppliers.create',
    'suppliers.update',
    'suppliers.delete',
    'finance.read',
    'finance.create',
    'finance.update',
    'finance.approve',
    'finance.refund',
    'finance.reconcile',
    'staff.read',
    'staff.create',
    'staff.update',
    'staff.status',
    'staff.assign_role',
    'staff.assign_outlet',
    'roles.read',
    'roles.create',
    'roles.update',
    'roles.delete',
    'roles.assign_permission',
    'tables.read',
    'tables.create',
    'tables.update',
    'tables.delete',
    'reservations.read',
    'reservations.create',
    'reservations.update',
    'reservations.cancel',
    'customers.read',
    'customers.create',
    'customers.update',
    'loyalty.read',
    'loyalty.manage',
    'promotions.read',
    'promotions.create',
    'promotions.update',
    'promotions.delete',
    'reports.read',
    'reports.export',
    'audit.read'
  ];
  v_descriptions text[] := ARRAY[
    'Access and manage the Owner HQ dashboard',
    'Configure organization and outlet settings',
    'View orders',
    'Create orders',
    'Modify an unsettled order, such as its items or notes',
    'Cancel an order before it is completed',
    'Mark an order as completed and close its lifecycle',
    'Refund a settled order; a privileged financial action that must stay auditable',
    'Apply a discount to an order line or the order total',
    'View the product catalog, categories, and prices',
    'Create categories and menu items',
    'Edit categories, menu items, and their prices',
    'Remove categories or menu items from the catalog',
    'Toggle whether a menu item is available for sale',
    'View the kitchen display queue',
    'Manage kitchen display configuration and queue handling',
    'Move a kitchen ticket between preparation statuses',
    'View the beverage station queue',
    'Manage beverage station configuration and queue handling',
    'Move a beverage ticket between preparation statuses',
    'View stock levels, stock movements, and stock-taking records',
    'Create inventory items and stock records',
    'Edit inventory item definitions such as unit, cost, and reorder level',
    'Post a manual stock adjustment with a reason',
    'Move stock between outlets',
    'View recipe definitions and their ingredient consumption',
    'Create a recipe that links a menu item to the inventory it consumes',
    'Edit an existing recipe',
    'Delete a recipe definition',
    'View purchase orders and goods-receipt records',
    'Create a purchase order',
    'Edit a purchase order that has not been sent to the supplier',
    'Approve a purchase order so it can be sent to the supplier',
    'Record the goods received against a purchase order',
    'View supplier records',
    'Create a supplier record',
    'Edit a supplier record',
    'Delete a supplier record',
    'View financial records, cash movements, and financial reports',
    'Record a financial transaction',
    'Edit a financial transaction that has not been closed',
    'Approve a financial transaction or journal entry',
    'Process a refund through the finance ledger',
    'Close and reconcile a cash or banking period',
    'View staff profiles and their assignments',
    'Onboard a new staff profile',
    'Edit a staff profile',
    'Activate, deactivate, or suspend a staff account',
    'Assign or revoke a role for a staff member',
    'Move a staff member between outlets',
    'View roles and their permission grants',
    'Create a role',
    'Edit a role definition',
    'Delete a role',
    'Grant or revoke a permission on a role',
    'View table layouts and the current status of each table',
    'Create a table or table layout',
    'Edit a table or table layout',
    'Delete a table or table layout',
    'View reservations',
    'Create a reservation',
    'Edit a reservation',
    'Cancel a reservation',
    'View customer records',
    'Create a customer record',
    'Edit a customer record',
    'View loyalty balances and point histories',
    'Issue, redeem, or adjust loyalty points',
    'View promotions, vouchers, and price rules',
    'Create a promotion or voucher',
    'Edit a promotion or voucher',
    'Delete a promotion or voucher',
    'View operational and financial reports',
    'Export report data out of the platform',
    'View the audit trail of privileged and sensitive actions'
  ];
  v_count bigint;
  v_conflicts bigint;
  v_missing bigint;
  v_missing_list text;
  i bigint;
BEGIN
  v_count := coalesce(array_length(v_names, 1), 0);

  IF v_count <> coalesce(array_length(v_descriptions, 1), 0) THEN
    RAISE EXCEPTION
      'HANSAN_PERMISSION_CATALOG_MALFORMED: % canonical name(s) but % description(s). The catalog arrays must be parallel. No row was modified.',
      v_count, coalesce(array_length(v_descriptions, 1), 0);
  END IF;

  -- 1. FAIL-CLOSED PREFLIGHT (runs before any write)
  -- A deterministic ID must not already belong to a different permission.
  SELECT count(*) INTO v_conflicts
    FROM unnest(v_names) AS canonical(name)
    JOIN "Permission" p ON p."id" = 'perm_' || replace(canonical.name, '.', '_')
   WHERE p."name" <> canonical.name;

  IF v_conflicts > 0 THEN
    RAISE EXCEPTION
      'HANSAN_PERMISSION_ID_CONFLICT: % existing Permission row(s) already use a deterministic catalog ID for a different name. Resolve those rows manually; this migration refuses to guess and modified nothing.',
      v_conflicts;
  END IF;

  -- A canonical name must not exist only under a different letter case.
  SELECT count(*) INTO v_conflicts
    FROM unnest(v_names) AS canonical(name)
    JOIN "Permission" p ON lower(p."name") = canonical.name
   WHERE p."name" <> canonical.name;

  IF v_conflicts > 0 THEN
    RAISE EXCEPTION
      'HANSAN_PERMISSION_CASE_CONFLICT: % existing Permission row(s) differ from a canonical name only by case. Permission names are lowercase and dot-namespaced. Rename those rows explicitly first; nothing was modified.',
      v_conflicts;
  END IF;

  -- 2. ADDITIVE UPSERT
  -- Insert missing canonical permissions. Existing rows are matched by their
  -- unique name: their ID and their authored description are left alone, and a
  -- blank or NULL description is completed from the catalog.
  FOR i IN 1..v_count LOOP
    INSERT INTO "Permission" ("id", "name", "description")
    VALUES ('perm_' || replace(v_names[i], '.', '_'), v_names[i], v_descriptions[i])
    ON CONFLICT ("name") DO UPDATE
      SET "description" = COALESCE(NULLIF(btrim("Permission"."description"), ''), EXCLUDED."description");
  END LOOP;

  -- 3. POST-CHECK
  SELECT count(*) INTO v_missing
    FROM unnest(v_names) AS canonical(name)
   WHERE NOT EXISTS (SELECT 1 FROM "Permission" p WHERE p."name" = canonical.name);

  IF v_missing > 0 THEN
    SELECT string_agg(canonical.name, ', ' ORDER BY canonical.name) INTO v_missing_list
      FROM unnest(v_names) AS canonical(name)
     WHERE NOT EXISTS (SELECT 1 FROM "Permission" p WHERE p."name" = canonical.name);

    RAISE EXCEPTION
      'HANSAN_PERMISSION_CATALOG_INCOMPLETE: % canonical permission(s) could not be created (%). No row was committed.',
      v_missing, v_missing_list;
  END IF;

  RAISE NOTICE 'HANSAN permission catalog synchronized: % canonical permission name(s) verified.', v_count;
END
$$;
