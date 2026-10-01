import { prisma } from "@/lib/prisma";

/**
 * HANSAN — tenant-scoped menu reads.
 *
 * PHASE C / PHASE B CONTRACT
 * Category and MenuItem are ORGANIZATION-owned (see docs/ARCHITECTURE-DECISIONS.md).
 * Every query in this module filters on the organization resolved from the
 * authenticated server-side context. `organizationId` is never accepted from a
 * request body, so it cannot be used as a client-chosen authorization boundary.
 *
 * There is no outlet-specific menu in Phase C. Resolving the outlet is still
 * required for the POS action itself (outlet-bound ordering), but the catalog is
 * intentionally organization-level.
 */

export type MenuCategoryView = {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
};

export type MenuItemView = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  badge: string | null;
  categoryId: string;
  categorySlug: string;
};

export type MenuSnapshot = {
  categories: MenuCategoryView[];
  items: MenuItemView[];
};

/**
 * Returns the catalog for exactly one organization.
 * An empty catalog is a valid, expected result (the production database is
 * allowed to be empty) and returns empty arrays — never fallback data.
 */
export async function listTenantMenu(organizationId: string): Promise<MenuSnapshot> {
  if (!organizationId) {
    throw new Error("BLOCKED_EXTERNAL_DEPENDENCY: organizationId is required to read a menu.");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("BLOCKED_EXTERNAL_DEPENDENCY: DATABASE_URL is not configured.");
  }

  const [categories, items] = await Promise.all([
    prisma.category.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, displayOrder: true },
    }),
    prisma.menuItem.findMany({
      where: {
        organizationId,
        // Both predicates apply: the item's own tenant key AND its category's.
        // The Phase B composite foreign key makes these impossible to diverge;
        // restating the scope here keeps the tenant boundary explicit at the
        // query site so it cannot be dropped by accident.
        category: { organizationId, isActive: true },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        imageUrl: true,
        isAvailable: true,
        badge: true,
        categoryId: true,
        category: { select: { slug: true } },
      },
    }),
  ]);

  return {
    categories,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      imageUrl: item.imageUrl,
      isAvailable: item.isAvailable,
      badge: item.badge,
      categoryId: item.categoryId,
      categorySlug: item.category.slug,
    })),
  };
}
