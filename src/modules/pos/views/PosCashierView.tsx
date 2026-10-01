"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Category,
  MenuItem,
  OrderType,
  PaymentMethod,
  CompletedTransaction,
} from "../types/pos";
import { useCart } from "@/context/CartContext";
import { SearchBar } from "../components/SearchBar";
import { CategoryTabs } from "../components/CategoryTabs";
import { MenuCard } from "../components/MenuCard";
import { CartSidebar } from "../components/CartSidebar";
import { PaymentModal } from "../components/PaymentModal";
import { ReceiptModal } from "../components/ReceiptModal";
import { computeOrderTotals } from "@/lib/pricing";
import { Store, Clock, CheckCircle2, AlertCircle, Loader2, LayoutGrid } from "lucide-react";

/**
 * PHASE C — REAL POS FLOW
 *
 * This view no longer contains any product data or business identity. It:
 *   1. loads the catalog from GET /api/menu (tenant-scoped, database-backed)
 *   2. loads its identity from GET /api/session (server-resolved cashier/outlet)
 *   3. submits orders to POST /api/orders using the Supabase SSR session cookie
 *
 * There is no fallback catalog. If the tenant has no menu items the POS shows an
 * honest empty state, because manufacturing products to look populated would be
 * fabricating business data.
 */

/** Pseudo-category for the "All Menu" tab. Not a database row. */
const ALL_CATEGORY: Category = { id: "__all__", name: "All Menu", slug: "all" };

type MenuApiItem = {
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

type SessionApi = {
  staff: { id: string; name: string; email: string };
  organization: { id: string; name: string; slug: string };
  outlet: { id: string; name: string; slug: string };
  roleName: string;
  permissions: string[];
};

type OrderApiResult = {
  id: string;
  orderNumber: string;
  subtotal: number;
  taxPb1: number;
  totalAmount: number;
  amountPaid: number;
  changeAmount: number;
  cashierName: string | null;
  status: string;
  paymentMethod: PaymentMethod;
  createdAt: string;
  duplicate: boolean;
};

const KNOWN_BADGES = ["Signature", "Best Seller", "New", "Promo"] as const;

/** Maps a database menu item to the POS view model. No fallback products. */
function toMenuItem(item: MenuApiItem): MenuItem {
  return {
    id: item.id,
    name: item.name,
    // A null description renders as empty text, never as invented copy.
    description: item.description ?? "",
    price: item.price,
    category: item.categorySlug,
    categoryId: item.categoryId,
    imageUrl: item.imageUrl,
    isAvailable: item.isAvailable,
    badge: KNOWN_BADGES.includes(item.badge as (typeof KNOWN_BADGES)[number])
      ? (item.badge as MenuItem["badge"])
      : undefined,
  };
}

export const PosCashierView: React.FC = () => {
  const { cart, addToCart, updateQuantity, removeFromCart, clearCart } = useCart();

  // ── Real catalog + identity, resolved by the authenticated server ──────────
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([ALL_CATEGORY]);
  const [session, setSession] = useState<SessionApi | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPosData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      // Same-origin requests carry the Supabase SSR session cookie; the server
      // resolves identity and tenant scope. No credential is handled here.
      const [menuResponse, sessionResponse] = await Promise.all([
        fetch("/api/menu", { cache: "no-store" }),
        fetch("/api/session", { cache: "no-store" }),
      ]);

      const menuPayload = await menuResponse.json().catch(() => null);
      if (!menuResponse.ok || !menuPayload?.ok) {
        throw new Error(menuPayload?.error ?? "Katalog menu tidak dapat dimuat.");
      }

      const sessionPayload = await sessionResponse.json().catch(() => null);
      if (!sessionResponse.ok || !sessionPayload?.ok) {
        throw new Error(sessionPayload?.error ?? "Sesi kasir tidak dapat diverifikasi.");
      }

      setSession(sessionPayload.data as SessionApi);
      setCategories([ALL_CATEGORY, ...(menuPayload.data.categories as Category[])]);
      setMenuItems((menuPayload.data.items as MenuApiItem[]).map(toMenuItem));
    } catch (error) {
      // Fail visibly. Never fall back to a local catalog.
      setSession(null);
      setCategories([ALL_CATEGORY]);
      setMenuItems([]);
      setLoadError(
        error instanceof Error ? error.message : "Data POS tidak dapat dimuat."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPosData();
  }, [loadPosData]);

  // Navigation & Filtering
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Order Details — intentionally blank. A pre-filled table number or customer
  // name would attach fabricated data to real orders.
  const [orderType, setOrderType] = useState<OrderType>("DINE_IN");
  const [tableNumber, setTableNumber] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");

  // Modals & Transaction State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [completedTransaction, setCompletedTransaction] = useState<CompletedTransaction | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Provisional on-screen totals, computed with the SAME shared pricing module
  // the server uses so the displayed amount cannot drift from the charged one.
  // The server stays authoritative: the receipt renders its response values.
  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );
  const { taxPb1, totalAmount: grandTotal } = useMemo(
    () => computeOrderTotals(subtotal),
    [subtotal]
  );

  // Category item counts, derived from the real catalog.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: menuItems.length };
    menuItems.forEach((item) => {
      counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return counts;
  }, [menuItems]);

  // Filtered menu items
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCategory =
        activeCategory === "all" || item.category === activeCategory;
      const matchSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [activeCategory, menuItems, searchQuery]);

  const hasNoMenuAtAll = !isLoading && !loadError && menuItems.length === 0;

  const handleAddToCart = (item: MenuItem) => {
    // The full database-backed item goes into the cart; nothing is synthesized.
    addToCart({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      categoryId: item.categoryId,
      imageUrl: item.imageUrl,
      isAvailable: item.isAvailable,
      badge: item.badge,
    });
  };

  const handleIncrement = (itemId: string) => {
    updateQuantity(itemId, 1);
  };

  const handleDecrement = (itemId: string) => {
    updateQuantity(itemId, -1);
  };

  const handleRemove = (itemId: string) => {
    removeFromCart(itemId);
  };

  const handleClear = () => {
    clearCart();
  };

  // Open Payment Flow
  const handleOpenPayment = () => {
    if (cart.length === 0) return;
    setCheckoutError(null);
    setIsPaymentModalOpen(true);
  };

  // Confirm Payment → persist the order server-side
  const handleConfirmPayment = async (data: {
    method: PaymentMethod;
    amountPaid: number;
    bankName?: string;
  }) => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setCheckoutError(null);

    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Only data the cashier is authorized to choose. Organization, outlet,
        // staff, cashier identity, prices and totals are all derived server-side.
        body: JSON.stringify({
          idempotencyKey,
          orderType,
          tableNumber: orderType === "DINE_IN" ? tableNumber || null : null,
          customerName: customerName || null,
          paymentMethod: data.method,
          amountPaid: data.amountPaid,
          bankName: data.bankName ?? null,
          items: cart.map((item) => ({
            id: item.id,
            quantity: item.quantity,
          })),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Transaksi tidak dapat disimpan.");
      }

      const order = payload.order as OrderApiResult;

      // The receipt renders SERVER-AUTHORITATIVE amounts, not the provisional
      // figures shown before submission.
      const tx: CompletedTransaction = {
        id: order.id,
        orderNumber: order.orderNumber,
        timestamp: new Date(order.createdAt),
        cashierName: order.cashierName ?? session?.staff.name ?? "",
        customerName: customerName || "—",
        tableNumber: orderType === "DINE_IN" ? tableNumber : "Takeaway",
        orderType,
        items: cart.map((item) => ({ item, quantity: item.quantity })),
        subtotal: order.subtotal,
        taxPb1: order.taxPb1,
        grandTotal: order.totalAmount,
        status: order.status,
        paymentMethod: order.paymentMethod,
        amountPaid: order.amountPaid,
        changeAmount: order.changeAmount,
        bankName: data.bankName ?? null,
        organizationName: session?.organization.name ?? null,
        outletName: session?.outlet.name ?? null,
      };

      setCompletedTransaction(tx);
      setIsPaymentModalOpen(false);
      setIsReceiptModalOpen(true);
      clearCart();

      setCheckoutNotice(
        order.duplicate
          ? `Transaksi ${order.orderNumber} sudah tercatat sebelumnya.`
          : `Transaksi ${order.orderNumber} berhasil dicatat.`
      );
      setTimeout(() => {
        setCheckoutNotice(null);
      }, 4500);
    } catch (error) {
      // Keep the modal open so the cashier can retry without re-entering the
      // payment. Nothing is persisted on a failed request.
      setCheckoutError(
        error instanceof Error ? error.message : "Transaksi gagal diproses."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Start New Transaction from Receipt modal
  const handleNewTransaction = () => {
    setIsReceiptModalOpen(false);
    setCompletedTransaction(null);
    setOrderType("DINE_IN");
    setCustomerName("");
    setTableNumber("");
  };

  const cartQuantityMap = useMemo(() => {
    const map: Record<string, number> = {};
    cart.forEach((item) => {
      map[item.id] = item.quantity;
    });
    return map;
  }, [cart]);

  const cartItems = useMemo(
    () => cart.map((item) => ({ item, quantity: item.quantity })),
    [cart]
  );

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50 font-sans select-none">
      {/* Top Application Bar */}
      <header className="h-14 bg-white border-b border-gray-200/90 px-5 flex items-center justify-between z-20 flex-shrink-0">
        <div className="flex items-center gap-6">
          {/* Logo & Branding */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-amber-500 flex items-center justify-center text-white shadow-sm shadow-brand-500/30">
              <Store className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-black tracking-tight text-gray-900">
                HANSAN<span className="text-brand-500 font-bold ml-1">OS</span>
              </span>
              {/* Real outlet name from the authenticated session. */}
              {session?.outlet.name && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200/60">
                  {session.outlet.name}
                </span>
              )}
            </div>
          </div>

          <div className="h-4 w-px bg-gray-200" />

          {/* Connection state, derived from real request outcomes.
              PHASE C: the previous "Online & Synced" badge was a hardcoded string
              that reflected no actual connectivity or sync state. Offline sync
              does not exist yet, so nothing here claims to be synced. */}
          <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
            {isLoading ? (
              <span className="flex items-center gap-1.5 text-gray-500 font-semibold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Memuat data…
              </span>
            ) : loadError ? (
              <span className="flex items-center gap-1.5 text-rose-600 font-semibold">
                <AlertCircle className="w-3.5 h-3.5" />
                Tidak terhubung
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Tersambung
              </span>
            )}

            {/* Real organization name from the session. */}
            {session?.organization.name && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                {session.organization.name}
              </span>
            )}
          </div>
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-3">
          {checkoutError && (
            <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5 max-w-md">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span className="truncate">{checkoutError}</span>
            </div>
          )}

          {checkoutNotice && (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {checkoutNotice}
            </div>
          )}

          <button
            type="button"
            onClick={() => void loadPosData()}
            className="px-2.5 py-1.5 rounded-xl bg-gray-100/80 border border-gray-200/60 text-xs font-semibold text-gray-700 hover:bg-gray-200/70 transition-colors"
          >
            Muat ulang
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100/80 border border-gray-200/60 text-xs font-medium text-gray-700">
            <div className="w-2 h-2 rounded-full bg-brand-500" />
            <span>Kasir:</span>
            {/* Authenticated staff name. Never a hardcoded operator. */}
            <span className="font-bold text-gray-900">
              {session?.staff.name ?? "Belum terverifikasi"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Split Screen Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left 70% Column: Menu Catalog Grid & Filters */}
        <section className="w-[70%] h-full flex flex-col overflow-hidden p-5 space-y-4">
          {/* Search & Category Filter Section */}
          <div className="flex flex-col gap-3 flex-shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div className="w-80 max-w-sm">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Cari menu..."
                />
              </div>

              <div className="text-xs text-gray-500 font-medium">
                Menampilkan{" "}
                <span className="font-bold text-gray-900">{filteredMenuItems.length}</span>{" "}
                menu
              </div>
            </div>

            {/* Real database categories, with an "All Menu" pseudo-tab. */}
            <CategoryTabs
              categories={categories}
              activeSlug={activeCategory}
              onSelect={setActiveCategory}
              categoryCounts={categoryCounts}
            />
          </div>

          {/* Menu Catalog Grid — real tenant data only, with honest empty states. */}
          <div className="flex-1 overflow-y-auto pr-1 pb-4">
            {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                <p className="mt-3 text-sm font-semibold text-gray-600">
                  Memuat katalog menu...
                </p>
              </div>
            ) : loadError ? (
              <div className="h-64 flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-9 h-9 text-rose-400" />
                <p className="mt-3 text-sm font-semibold text-gray-700">
                  Katalog tidak dapat dimuat
                </p>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">{loadError}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Signed-in staff must have an assigned outlet and the orders.read
                  permission.
                </p>
                <button
                  type="button"
                  onClick={() => void loadPosData()}
                  className="mt-4 px-3 py-1.5 rounded-xl bg-brand-500 text-white text-xs font-bold"
                >
                  Coba lagi
                </button>
              </div>
            ) : hasNoMenuAtAll ? (
              <div className="h-64 flex flex-col items-center justify-center text-center">
                <LayoutGrid className="w-9 h-9 text-gray-300" />
                <p className="mt-3 text-sm font-semibold text-gray-700">
                  No menu items available.
                </p>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  Belum ada item menu pada outlet ini. Tambahkan kategori dan menu
                  item terlebih dahulu sebelum transaksi dapat dibuat.
                </p>
              </div>
            ) : filteredMenuItems.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-gray-400">
                <p className="text-sm font-semibold text-gray-600">Menu tidak ditemukan</p>
                <p className="text-xs text-gray-400 mt-1">
                  Coba gunakan kata kunci lain atau pilih kategori lain
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredMenuItems.map((item) => (
                  <MenuCard
                    key={item.id}
                    item={item}
                    onAddToCart={handleAddToCart}
                    quantityInCart={cartQuantityMap[item.id] || 0}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right 30% Column: Order Cart Sidebar */}
        <section className="w-[30%] h-full flex flex-col overflow-hidden">
          <CartSidebar
            items={cartItems}
            orderType={orderType}
            tableNumber={tableNumber}
            customerName={customerName}
            onOrderTypeChange={setOrderType}
            onTableNumberChange={setTableNumber}
            onCustomerNameChange={setCustomerName}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            onRemove={handleRemove}
            onClear={handleClear}
            onCheckout={handleOpenPayment}
          />
        </section>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        grandTotal={grandTotal}
        customerName={customerName}
        tableNumber={orderType === "DINE_IN" ? tableNumber : "Takeaway"}
        onClose={() => setIsPaymentModalOpen(false)}
        onConfirmPayment={handleConfirmPayment}
      />

      {/* Thermal Receipt Modal */}
      <ReceiptModal
        isOpen={isReceiptModalOpen}
        transaction={completedTransaction}
        onClose={() => setIsReceiptModalOpen(false)}
        onNewTransaction={handleNewTransaction}
      />
    </div>
  );
};
