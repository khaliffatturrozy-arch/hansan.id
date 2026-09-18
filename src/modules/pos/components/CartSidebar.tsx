"use client";

import React from "react";
import Image from "next/image";
import { CartItem, OrderType } from "../types/pos";
import { formatRupiah } from "@/lib/utils";
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  UtensilsCrossed,
  Package,
  User,
  Hash,
  ArrowRight,
  ReceiptText,
} from "lucide-react";

interface CartSidebarProps {
  items: CartItem[];
  orderType: OrderType;
  tableNumber: string;
  customerName: string;
  onOrderTypeChange: (type: OrderType) => void;
  onTableNumberChange: (val: string) => void;
  onCustomerNameChange: (val: string) => void;
  onIncrement: (itemId: string) => void;
  onDecrement: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
}

export const CartSidebar: React.FC<CartSidebarProps> = ({
  items,
  orderType,
  tableNumber,
  customerName,
  onOrderTypeChange,
  onTableNumberChange,
  onCustomerNameChange,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  onCheckout,
}) => {
  const subtotal = items.reduce(
    (sum, ci) => sum + ci.item.price * ci.quantity,
    0
  );
  const pb1Tax = Math.round(subtotal * 0.1); // 10% PB1 Restaurant Tax
  const grandTotal = subtotal + pb1Tax;
  const totalItemCount = items.reduce((sum, ci) => sum + ci.quantity, 0);

  return (
    <aside className="w-full h-full flex flex-col bg-white border-l border-gray-200/90 shadow-sidebar">
      {/* 1. Header & Order Type Switcher */}
      <div className="p-4 border-b border-gray-200/80 space-y-3.5 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 flex items-center justify-center font-bold">
              <ReceiptText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 tracking-tight">
                Current Order
              </h2>
              <p className="text-[11px] text-gray-500 font-medium">
                {totalItemCount} {totalItemCount === 1 ? "item" : "items"} selected
              </p>
            </div>
          </div>

          {items.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-semibold text-rose-500 hover:text-rose-600 hover:underline transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Order Type Toggle: Dine In vs Takeaway */}
        <div className="grid grid-cols-2 p-1 bg-gray-200/70 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => onOrderTypeChange("DINE_IN")}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
              orderType === "DINE_IN"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Dine In</span>
          </button>

          <button
            type="button"
            onClick={() => onOrderTypeChange("TAKEAWAY")}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
              orderType === "TAKEAWAY"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Takeaway</span>
          </button>
        </div>

        {/* Customer Info & Table Inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">
              <Hash className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              value={tableNumber}
              disabled={orderType === "TAKEAWAY"}
              onChange={(e) => onTableNumberChange(e.target.value)}
              placeholder={orderType === "TAKEAWAY" ? "Takeaway" : "Table #"}
              className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">
              <User className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              value={customerName}
              onChange={(e) => onCustomerNameChange(e.target.value)}
              placeholder="Customer Name"
              className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </div>
      </div>

      {/* 2. Scrollable Cart Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-gray-100">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
              <ShoppingBag className="w-7 h-7 text-gray-300 stroke-[1.5]" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Cart is empty</p>
            <p className="text-xs text-gray-400 mt-1 max-w-[200px]">
              Tap any item on the left catalog grid to add to order
            </p>
          </div>
        ) : (
          items.map((ci) => (
            <div key={ci.item.id} className="pt-3 first:pt-0 flex gap-3">
              {/* Thumbnail */}
              <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-100">
                <Image
                  src={ci.item.imageUrl}
                  alt={ci.item.name}
                  fill
                  className="object-cover"
                />
              </div>

              {/* Item Info & Modifiers */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 truncate leading-snug">
                      {ci.item.name}
                    </h4>
                    <p className="text-[11px] text-gray-500 font-medium">
                      {formatRupiah(ci.item.price)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(ci.item.id)}
                    className="text-gray-300 hover:text-rose-500 transition-colors p-1"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quantity Controls & Line Subtotal */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center bg-gray-100 rounded-lg p-0.5 border border-gray-200/60">
                    <button
                      type="button"
                      onClick={() => onDecrement(ci.item.id)}
                      className="w-6 h-6 rounded-md bg-white text-gray-700 flex items-center justify-center shadow-2xs hover:bg-gray-50 active:scale-95 transition-all"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-7 text-center text-xs font-bold text-gray-900">
                      {ci.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onIncrement(ci.item.id)}
                      className="w-6 h-6 rounded-md bg-white text-gray-700 flex items-center justify-center shadow-2xs hover:bg-gray-50 active:scale-95 transition-all"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <span className="text-xs font-bold text-gray-900">
                    {formatRupiah(ci.item.price * ci.quantity)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 3. Financial Breakdown & Prominent Checkout Footer */}
      <div className="p-4 border-t border-gray-200/90 bg-gray-50/70 space-y-3">
        <div className="space-y-1.5 text-xs text-gray-600 font-medium">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-semibold text-gray-900">
              {formatRupiah(subtotal)}
            </span>
          </div>
          <div className="flex justify-between items-center text-gray-500">
            <span className="flex items-center gap-1">
              <span>PB1 Restaurant Tax</span>
              <span className="px-1.5 py-0.2 rounded bg-gray-200/80 text-[10px] font-bold text-gray-700">
                10%
              </span>
            </span>
            <span className="font-semibold text-gray-800">
              {formatRupiah(pb1Tax)}
            </span>
          </div>
          <div className="pt-2 border-t border-gray-200 flex justify-between items-baseline">
            <span className="text-sm font-bold text-gray-900">Grand Total</span>
            <span className="text-lg font-extrabold text-brand-600 tracking-tight">
              {formatRupiah(grandTotal)}
            </span>
          </div>
        </div>

        {/* Prominent Checkout Button */}
        <button
          type="button"
          onClick={onCheckout}
          disabled={items.length === 0}
          className={`w-full py-3.5 px-4 rounded-xl flex items-center justify-between text-sm font-bold transition-all duration-150 active:scale-[0.99] ${
            items.length === 0
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-brand-500 hover:bg-brand-600 text-white shadow-md shadow-brand-500/30"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="tracking-wide">BAYAR SEKARANG</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-white/20 px-2.5 py-1 rounded-lg text-xs font-black">
              {formatRupiah(grandTotal)}
            </span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </div>
        </button>
      </div>
    </aside>
  );
};
