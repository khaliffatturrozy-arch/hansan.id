"use client";

import React from "react";
import Image from "next/image";
import { MenuItem } from "../types/pos";
import { formatRupiah } from "@/lib/utils";
import { Plus, Check } from "lucide-react";

interface MenuCardProps {
  item: MenuItem;
  onAddToCart: (item: MenuItem) => void;
  quantityInCart?: number;
}

export const MenuCard: React.FC<MenuCardProps> = ({
  item,
  onAddToCart,
  quantityInCart = 0,
}) => {
  const getBadgeStyle = (badge?: MenuItem["badge"]) => {
    switch (badge) {
      case "Signature":
        return "bg-amber-500 text-white shadow-sm shadow-amber-500/30";
      case "Best Seller":
        return "bg-rose-500 text-white shadow-sm shadow-rose-500/30";
      case "New":
        return "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30";
      default:
        return "";
    }
  };

  return (
    <div
      onClick={() => onAddToCart(item)}
      className={`group relative flex flex-col bg-white rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden select-none ${
        quantityInCart > 0
          ? "border-brand-500 ring-2 ring-brand-500/15 shadow-md"
          : "border-gray-200/80 hover:border-gray-300 hover:shadow-card hover:-translate-y-0.5"
      }`}
    >
      {/* Image Thumbnail with Overlay Badges */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
        <Image
          src={item.imageUrl}
          alt={item.name}
          fill
          sizes="(max-width: 768px) 50vw, 33vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
        />

        {/* Badge Overlay */}
        {item.badge && (
          <div className="absolute top-2.5 left-2.5 z-10">
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide uppercase ${getBadgeStyle(
                item.badge
              )}`}
            >
              {item.badge}
            </span>
          </div>
        )}

        {/* Stock status indicator */}
        <div className="absolute top-2.5 right-2.5 z-10">
          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-black/60 backdrop-blur-md text-white">
            {item.stockCount} left
          </span>
        </div>

        {/* Selected in Cart Indicator Pill */}
        {quantityInCart > 0 && (
          <div className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-500 text-white text-xs font-bold shadow-md shadow-brand-500/40 animate-in fade-in zoom-in duration-150">
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{quantityInCart}x in cart</span>
          </div>
        )}
      </div>

      {/* Content Container */}
      <div className="flex flex-col flex-1 p-3.5 justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 line-clamp-1 group-hover:text-brand-600 transition-colors">
            {item.name}
          </h3>
          <p className="mt-1 text-xs text-gray-500 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        </div>

        {/* Price and Action */}
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="text-sm font-bold text-gray-900 tracking-tight">
            {formatRupiah(item.price)}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart(item);
            }}
            aria-label={`Add ${item.name} to cart`}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-95 ${
              quantityInCart > 0
                ? "bg-brand-500 text-white shadow-sm shadow-brand-500/30"
                : "bg-gray-100 text-gray-700 hover:bg-brand-500 hover:text-white"
            }`}
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
