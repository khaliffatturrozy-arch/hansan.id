"use client";

import React, { useState, useMemo } from "react";
import {
  CATEGORIES,
  MOCK_MENU_ITEMS,
  MenuItem,
  CartItem,
  OrderType,
  PaymentMethod,
  CompletedTransaction,
} from "../types/pos";
import { SearchBar } from "../components/SearchBar";
import { CategoryTabs } from "../components/CategoryTabs";
import { MenuCard } from "../components/MenuCard";
import { CartSidebar } from "../components/CartSidebar";
import { PaymentModal } from "../components/PaymentModal";
import { ReceiptModal } from "../components/ReceiptModal";
import {
  Store,
  Wifi,
  Clock,
  CheckCircle2,
  RefreshCw,
  Bell,
  Sparkles,
} from "lucide-react";

export const PosCashierView: React.FC = () => {
  // Navigation & Filtering
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Order Details
  const [orderType, setOrderType] = useState<OrderType>("DINE_IN");
  const [tableNumber, setTableNumber] = useState<string>("Meja 05");
  const [customerName, setCustomerName] = useState<string>("Dimas Pratama");

  // Cart State (pre-populated with 2 items for lively demo)
  const [cart, setCart] = useState<CartItem[]>([
    {
      item: MOCK_MENU_ITEMS[0], // Hansan Aren Latte
      quantity: 2,
    },
    {
      item: MOCK_MENU_ITEMS[7], // Truffle Fries
      quantity: 1,
    },
  ]);

  // Modals & Transaction State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [completedTransaction, setCompletedTransaction] =
    useState<CompletedTransaction | null>(null);

  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);

  // Financial calculations
  const subtotal = useMemo(
    () => cart.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0),
    [cart]
  );
  const taxPb1 = useMemo(() => Math.round(subtotal * 0.1), [subtotal]);
  const grandTotal = subtotal + taxPb1;

  // Category item counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: MOCK_MENU_ITEMS.length,
    };
    MOCK_MENU_ITEMS.forEach((item) => {
      counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return counts;
  }, []);

  // Filtered menu items
  const filteredMenuItems = useMemo(() => {
    return MOCK_MENU_ITEMS.filter((item) => {
      const matchCategory =
        activeCategory === "all" || item.category === activeCategory;
      const matchSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [activeCategory, searchQuery]);

  // Cart operations
  const handleAddToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.item.id === item.id);
      if (existing) {
        return prev.map((ci) =>
          ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const handleIncrement = (itemId: string) => {
    setCart((prev) =>
      prev.map((ci) =>
        ci.item.id === itemId ? { ...ci, quantity: ci.quantity + 1 } : ci
      )
    );
  };

  const handleDecrement = (itemId: string) => {
    setCart((prev) =>
      prev
        .map((ci) =>
          ci.item.id === itemId ? { ...ci, quantity: ci.quantity - 1 } : ci
        )
        .filter((ci) => ci.quantity > 0)
    );
  };

  const handleRemove = (itemId: string) => {
    setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
  };

  const handleClear = () => {
    setCart([]);
  };

  // Open Payment Flow
  const handleOpenPayment = () => {
    if (cart.length === 0) return;
    setIsPaymentModalOpen(true);
  };

  // Confirm Payment & Complete Transaction
  const handleConfirmPayment = (data: {
    method: PaymentMethod;
    amountPaid: number;
    changeAmount: number;
    bankName?: string;
    approvalCode?: string;
  }) => {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `HN-${dateStr}-${randomSuffix}`;

    const tx: CompletedTransaction = {
      id: "tx-" + Date.now(),
      orderNumber,
      timestamp: today,
      cashierName: "Rozy (Shift 1)",
      customerName: customerName || "Tamu",
      tableNumber: orderType === "DINE_IN" ? tableNumber : "Takeaway",
      orderType,
      items: [...cart],
      subtotal,
      taxPb1,
      grandTotal,
      paymentMethod: data.method,
      amountPaid: data.amountPaid,
      changeAmount: data.changeAmount,
      bankName: data.bankName,
      approvalCode: data.approvalCode,
    };

    setCompletedTransaction(tx);
    setIsPaymentModalOpen(false);
    setIsReceiptModalOpen(true);

    // Reset Cart for next transaction
    setCart([]);

    setCheckoutNotice(`Transaksi ${orderNumber} berhasil dicatat!`);
    setTimeout(() => {
      setCheckoutNotice(null);
    }, 4500);
  };

  // Start New Transaction from Receipt modal
  const handleNewTransaction = () => {
    setIsReceiptModalOpen(false);
    setCompletedTransaction(null);
    setCustomerName("");
    setTableNumber("Meja 01");
  };

  const cartQuantityMap = useMemo(() => {
    const map: Record<string, number> = {};
    cart.forEach((ci) => {
      map[ci.item.id] = ci.quantity;
    });
    return map;
  }, [cart]);

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
              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200/60">
                OUTLET 01
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-gray-200" />

          {/* Real-time Status Badges */}
          <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
            <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Online & Synced
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              POS Terminal 01
            </span>
          </div>
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-3">
          {checkoutNotice && (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {checkoutNotice}
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100/80 border border-gray-200/60 text-xs font-medium text-gray-700">
            <div className="w-2 h-2 rounded-full bg-brand-500" />
            <span>Kasir:</span>
            <span className="font-bold text-gray-900">Rozy (Shift 1)</span>
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
                  placeholder="Cari menu kopi, makanan, snack..."
                />
              </div>

              <div className="text-xs text-gray-500 font-medium">
                Menampilkan{" "}
                <span className="font-bold text-gray-900">
                  {filteredMenuItems.length}
                </span>{" "}
                menu
              </div>
            </div>

            <CategoryTabs
              categories={CATEGORIES}
              activeSlug={activeCategory}
              onSelect={setActiveCategory}
              categoryCounts={categoryCounts}
            />
          </div>

          {/* Menu Catalog Grid */}
          <div className="flex-1 overflow-y-auto pr-1 pb-4">
            {filteredMenuItems.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-gray-400">
                <p className="text-sm font-semibold text-gray-600">
                  Menu tidak ditemukan
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Coba gunakan kata kunci lain atau pilih kategori Semua Menu
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
            items={cart}
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
        tableNumber={tableNumber}
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
