"use client";

import React from "react";
import { Category } from "../types/pos";
import { Coffee, Utensils, Sparkles, Cookie, LayoutGrid } from "lucide-react";

interface CategoryTabsProps {
  categories: Category[];
  activeSlug: string;
  onSelect: (slug: string) => void;
  categoryCounts?: Record<string, number>;
}

export const CategoryTabs: React.FC<CategoryTabsProps> = ({
  categories,
  activeSlug,
  onSelect,
  categoryCounts = {},
}) => {
  const getCategoryIcon = (slug: string) => {
    switch (slug) {
      case "coffee":
        return <Coffee className="w-4 h-4 mr-1.5" />;
      case "non-coffee":
        return <Sparkles className="w-4 h-4 mr-1.5" />;
      case "main-course":
        return <Utensils className="w-4 h-4 mr-1.5" />;
      case "snack":
      case "pastry":
        return <Cookie className="w-4 h-4 mr-1.5" />;
      default:
        return <LayoutGrid className="w-4 h-4 mr-1.5" />;
    }
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
      {categories.map((cat) => {
        const isActive = activeSlug === cat.slug;
        const count = categoryCounts[cat.slug];

        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.slug)}
            className={`flex items-center whitespace-nowrap px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
              isActive
                ? "bg-brand-500 text-white shadow-sm shadow-brand-500/30 scale-[1.02]"
                : "bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 border border-gray-200/80"
            }`}
          >
            {getCategoryIcon(cat.slug)}
            <span>{cat.name}</span>
            {typeof count === "number" && (
              <span
                className={`ml-2 px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
