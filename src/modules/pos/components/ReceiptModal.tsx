"use client";

import React, { useRef } from "react";
import { CompletedTransaction } from "../types/pos";
import { formatRupiah } from "@/lib/utils";
import { PB1_TAX_RATE } from "@/lib/pricing";
import {
  Printer,
  CheckCircle2,
  Share2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";

interface ReceiptModalProps {
  isOpen: boolean;
  transaction: CompletedTransaction | null;
  onClose: () => void;
  onNewTransaction: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  transaction,
  onClose,
  onNewTransaction,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !transaction) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(transaction.timestamp));

  const getPaymentMethodLabel = () => {
    switch (transaction.paymentMethod) {
      case "CASH":
        return "TUNAI (CASH)";
      case "QRIS":
        return "QRIS DINAMIS";
      case "CARD":
        return `KARTU EDC (${transaction.bankName || "BCA"})`;
      default:
        return "TUNAI";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Success Banner */}
        <div className="px-6 py-3.5 bg-emerald-500 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-100" />
            <span className="font-bold text-sm">Pembayaran Berhasil!</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Receipt Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-100/60 flex justify-center">
          {/* Thermal Paper Container */}
          <div
            ref={receiptRef}
            className="w-full bg-white rounded-xl p-5 shadow-sm border border-gray-200 text-gray-800 text-xs font-mono space-y-3"
          >
            {/* Header — PHASE C.
                The previous receipt printed a hardcoded merchant identity:
                "HANSAN CAFE", "Outlet 01 - Jakarta", a Senopati street address and
                a WhatsApp number. None of that exists in the database, so a
                receipt was asserting a business identity the system does not
                know. The real organization and outlet names are used instead, and
                address/contact details are omitted because they are not modeled
                yet. The product name is used only as a neutral header. */}
            <div className="text-center space-y-0.5 pb-3 border-b border-dashed border-gray-300">
              <h3 className="text-base font-black tracking-tight text-gray-900">
                {transaction.organizationName || "HANSAN OS"}
              </h3>
              {transaction.outletName && (
                <p className="text-[11px] text-gray-500 font-sans">
                  {transaction.outletName}
                </p>
              )}
            </div>

            {/* Meta Info */}
            <div className="space-y-1 text-[11px] text-gray-600 pb-2 border-b border-dashed border-gray-300">
              <div className="flex justify-between">
                <span>No. Transaksi</span>
                <span className="font-bold text-gray-900">
                  {transaction.orderNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Waktu</span>
                <span>{formattedDate}</span>
              </div>
              <div className="flex justify-between">
                <span>Kasir</span>
                <span>{transaction.cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span>Tipe Order</span>
                <span className="font-bold">
                  {transaction.orderType === "DINE_IN"
                    ? `Dine In (${transaction.tableNumber || "Meja -"})`
                    : "Takeaway"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Pelanggan</span>
                <span>{transaction.customerName || "—"}</span>
              </div>
            </div>

            {/* Itemized list */}
            <div className="space-y-2 py-1 border-b border-dashed border-gray-300">
              <div className="text-[10px] font-bold text-gray-400 uppercase flex justify-between">
                <span>Menu</span>
                <div className="flex gap-4">
                  <span>Qty</span>
                  <span>Total</span>
                </div>
              </div>

              {transaction.items.map((ci) => (
                <div key={ci.item.id} className="space-y-0.5">
                  <div className="flex justify-between font-bold text-gray-900">
                    <span className="truncate pr-2">{ci.item.name}</span>
                    <div className="flex gap-4 flex-shrink-0">
                      <span>{ci.quantity}x</span>
                      <span>{formatRupiah(ci.item.price * ci.quantity)}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-400">
                    @ {formatRupiah(ci.item.price)}
                  </div>
                </div>
              ))}
            </div>

            {/* Financial Breakdown */}
            <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-gray-300">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatRupiah(transaction.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Pajak Restoran PB1 ({PB1_TAX_RATE * 100}%)</span>
                <span>{formatRupiah(transaction.taxPb1)}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-gray-900 pt-1">
                <span>TOTAL AKHIR</span>
                <span>{formatRupiah(transaction.grandTotal)}</span>
              </div>
            </div>

            {/* Payment Details */}
            <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-gray-300">
              <div className="flex justify-between">
                <span>Metode Pembayaran</span>
                <span className="font-bold text-gray-900">
                  {getPaymentMethodLabel()}
                </span>
              </div>
              {/* PHASE C: the "Trace / Approval" row was removed. No approval code
                  is captured or stored, because no payment gateway exists to
                  verify one, and printing a fabricated trace number on a
                  customer-facing receipt is not acceptable. */}
              <div className="flex justify-between text-gray-600">
                <span>Uang Diterima</span>
                <span>{formatRupiah(transaction.amountPaid)}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-700">
                <span>Kembalian</span>
                <span>{formatRupiah(transaction.changeAmount)}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-2 space-y-1 text-gray-500 font-sans text-[11px]">
              <p className="font-bold text-gray-800">
                Terima kasih atas kunjungan Anda!
              </p>
              <p className="text-[9px] text-gray-400 pt-1">
                Powered by Hansan OS
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-white border-t border-gray-100 flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Struk</span>
          </button>

          <button
            type="button"
            onClick={onNewTransaction}
            className="flex-1 py-2.5 px-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-brand-500/20"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Transaksi Baru</span>
          </button>
        </div>
      </div>
    </div>
  );
};
