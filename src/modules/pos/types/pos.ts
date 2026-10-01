/**
 * POS view types.
 *
 * PHASE C: this module no longer contains any product data. The previous
 * `MOCK_MENU_ITEMS` (12 fabricated products) and the hardcoded `CATEGORIES`
 * list were removed. Categories and items now come from GET /api/menu, which is
 * scoped to the authenticated tenant's real database catalog.
 */

export type OrderType = "DINE_IN" | "TAKEAWAY";

export type PaymentMethod = "CASH" | "QRIS" | "CARD";

export interface Category {
  id: string;
  name: string;
  slug: string;
  displayOrder?: number;
  count?: number;
}

export interface MenuItem {
  id: string;
  name: string;
  /** Database description, normalized to "" when null so the UI stays simple. */
  description: string;
  price: number;
  /** Real category slug from the database. */
  category: string;
  categoryId: string;
  /** Real menu items may legitimately have no image. */
  imageUrl?: string | null;
  isAvailable: boolean;
  badge?: "Signature" | "Best Seller" | "New" | "Promo";
}

export interface CartItem {
  item: MenuItem;
  quantity: number;
  notes?: string;
}

export interface CompletedTransaction {
  id: string;
  orderNumber: string;
  timestamp: Date;
  /** Authenticated staff name resolved server-side (never hardcoded). */
  cashierName: string;
  customerName: string;
  tableNumber: string;
  orderType: OrderType;
  items: CartItem[];
  /** Server-authoritative amounts returned by POST /api/orders. */
  subtotal: number;
  taxPb1: number;
  grandTotal: number;
  /** Lifecycle status as persisted, e.g. PENDING. */
  status: string;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  changeAmount: number;
  bankName?: string | null;
  /** Real identity from GET /api/session; omitted when unavailable. */
  organizationName?: string | null;
  outletName?: string | null;
}
