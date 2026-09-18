"use client";

import React, { useState, useMemo, useEffect } from "react";
import { PaymentMethod } from "../types/pos";
import { formatRupiah } from "@/lib/utils";
import {
  X,
  Banknote,
  QrCode,
  CreditCard,
  Check,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

interface PaymentModalProps {
  isOpen: boolean;
  grandTotal: number;
  customerName: string;
  tableNumber: string;
  onClose: () => void;
  onConfirmPayment: (data: {
    method: PaymentMethod;
    amountPaid: number;
    changeAmount: number;
    bankName?: string;
    approvalCode?: string;
  }) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  grandTotal,
  customerName,
  tableNumber,
  onClose,
  onConfirmPayment,
}) => {
  const [activeMethod, setActiveMethod] = useState<PaymentMethod>("CASH");

  // Cash state
  const [cashGiven, setCashGiven] = useState<number>(grandTotal);

  // Card state
  const [selectedBank, setSelectedBank] = useState<string>("BCA");
  const [approvalCode, setApprovalCode] = useState<string>("");

  // QRIS state
  const [qrisPaid, setQrisPaid] = useState<boolean>(false);

  // Sync cashGiven when grandTotal changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setCashGiven(grandTotal);
      setQrisPaid(false);
      setApprovalCode("");
    }
  }, [isOpen, grandTotal]);

  const cashChange = useMemo(() => {
    return cashGiven - grandTotal;
  }, [cashGiven, grandTotal]);

  const isCashValid = cashGiven >= grandTotal;

  // Preset denominations
  const cashSuggestions = useMemo(() => {
    const list = [grandTotal];
    const rounded50k = Math.ceil(grandTotal / 50000) * 50000;
    const rounded100k = Math.ceil(grandTotal / 100000) * 100000;

    if (rounded50k > grandTotal && !list.includes(rounded50k)) {
      list.push(rounded50k);
    }
    if (rounded100k > grandTotal && !list.includes(rounded100k)) {
      list.push(rounded100k);
    }
    if (!list.includes(100000) && 100000 > grandTotal) list.push(100000);
    if (!list.includes(200000) && 200000 > grandTotal) list.push(200000);

    return Array.from(new Set(list)).sort((a, b) => a - b);
  }, [grandTotal]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (activeMethod === "CASH") {
      if (!isCashValid) return;
      onConfirmPayment({
        method: "CASH",
        amountPaid: cashGiven,
        changeAmount: Math.max(0, cashChange),
      });
    } else if (activeMethod === "QRIS") {
      onConfirmPayment({
        method: "QRIS",
        amountPaid: grandTotal,
        changeAmount: 0,
      });
    } else if (activeMethod === "CARD") {
      onConfirmPayment({
        method: "CARD",
        amountPaid: grandTotal,
        changeAmount: 0,
        bankName: selectedBank,
        approvalCode: approvalCode || "EDC-" + Math.floor(100000 + Math.random() * 900000),
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-600">
                Penyelesaian Transaksi
              </span>
              <span className="text-xs text-gray-400">•</span>
              <span className="text-xs font-medium text-gray-500">
                {tableNumber ? tableNumber : "Takeaway"} ({customerName || "Tamu"})
              </span>
            </div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight mt-0.5">
              Pembayaran Kasir
            </h2>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Total Callout Banner */}
        <div className="px-6 py-4 bg-gradient-to-r from-brand-50 to-orange-50/40 border-b border-brand-100/60 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Total Tagihan (Termasuk Pajak PB1 10%)
            </span>
            <div className="text-2xl font-black text-brand-700 tracking-tight mt-0.5">
              {formatRupiah(grandTotal)}
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-brand-200/80 text-brand-700 text-xs font-semibold shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Verifikasi Otomatis</span>
          </div>
        </div>

        {/* Payment Method Tabs */}
        <div className="px-6 pt-4 pb-2">
          <div className="grid grid-cols-3 p-1 bg-gray-100 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => setActiveMethod("CASH")}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${
                activeMethod === "CASH"
                  ? "bg-white text-gray-900 shadow-sm scale-[1.01]"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Banknote className="w-4 h-4 text-emerald-600" />
              <span>Tunai (Cash)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMethod("QRIS")}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${
                activeMethod === "QRIS"
                  ? "bg-white text-gray-900 shadow-sm scale-[1.01]"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <QrCode className="w-4 h-4 text-brand-600" />
              <span>QRIS Dinamis</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMethod("CARD")}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${
                activeMethod === "CARD"
                  ? "bg-white text-gray-900 shadow-sm scale-[1.01]"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <CreditCard className="w-4 h-4 text-blue-600" />
              <span>Kartu (EDC)</span>
            </button>
          </div>
        </div>

        {/* Method Content Body */}
        <div className="px-6 py-4 flex-1 overflow-y-auto">
          {/* 1. TUNAI / CASH */}
          {activeMethod === "CASH" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Nominal Uang Diterima
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center font-bold text-gray-500 text-base">
                    Rp
                  </span>
                  <input
                    type="number"
                    value={cashGiven || ""}
                    onChange={(e) => setCashGiven(Number(e.target.value) || 0)}
                    placeholder="Masukkan jumlah uang..."
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-black text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                  />
                </div>
              </div>

              {/* Preset Chips */}
              <div>
                <span className="block text-xs font-medium text-gray-500 mb-2">
                  Pilihan Cepat (Uang Pas & Pecahan):
                </span>
                <div className="flex flex-wrap gap-2">
                  {cashSuggestions.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setCashGiven(amount)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                        cashGiven === amount
                          ? "bg-brand-500 text-white border-brand-500 shadow-sm"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {amount === grandTotal ? "Uang Pas (" + formatRupiah(amount) + ")" : formatRupiah(amount)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kembalian / Change Banner */}
              <div
                className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                  isCashValid
                    ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                    : "bg-rose-50 border-rose-200 text-rose-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                      isCashValid
                        ? "bg-emerald-500 text-white shadow-sm"
                        : "bg-rose-500 text-white"
                    }`}
                  >
                    {isCashValid ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider block opacity-75">
                      {isCashValid ? "Uang Kembalian" : "Uang Kurang"}
                    </span>
                    <span className="text-xl font-black">
                      {formatRupiah(Math.abs(cashChange))}
                    </span>
                  </div>
                </div>

                {!isCashValid && (
                  <span className="text-xs font-bold text-rose-600 bg-white px-2.5 py-1 rounded-lg border border-rose-200">
                    Uang belum cukup
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 2. QRIS DINAMIS */}
          {activeMethod === "QRIS" && (
            <div className="flex flex-col items-center justify-center text-center py-2 space-y-4">
              <div className="relative p-4 bg-white rounded-3xl border-2 border-dashed border-gray-200 shadow-md">
                {/* Simulated QR Code SVG Pattern */}
                <div className="w-48 h-48 bg-gray-900 rounded-2xl p-2.5 flex flex-col justify-between items-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(#ffffff_2px,transparent_2px)] [background-size:8px_8px] opacity-90 p-4" />
                  
                  {/* Corner Targets */}
                  <div className="w-full flex justify-between z-10">
                    <div className="w-10 h-10 bg-white rounded-lg p-1.5 flex items-center justify-center">
                      <div className="w-full h-full bg-gray-900 rounded-sm flex items-center justify-center">
                        <div className="w-3 h-3 bg-white rounded-xs" />
                      </div>
                    </div>
                    <div className="w-10 h-10 bg-white rounded-lg p-1.5 flex items-center justify-center">
                      <div className="w-full h-full bg-gray-900 rounded-sm flex items-center justify-center">
                        <div className="w-3 h-3 bg-white rounded-xs" />
                      </div>
                    </div>
                  </div>

                  {/* Center Brand Badge */}
                  <div className="z-10 px-2.5 py-1 rounded-md bg-brand-500 text-white text-[10px] font-black tracking-wider shadow-md">
                    HANSAN QRIS
                  </div>

                  <div className="w-full flex justify-start z-10">
                    <div className="w-10 h-10 bg-white rounded-lg p-1.5 flex items-center justify-center">
                      <div className="w-full h-full bg-gray-900 rounded-sm flex items-center justify-center">
                        <div className="w-3 h-3 bg-white rounded-xs" />
                      </div>
                    </div>
                  </div>
                </div>

                {qrisPaid && (
                  <div className="absolute inset-0 bg-emerald-600/95 backdrop-blur-xs rounded-3xl flex flex-col items-center justify-center text-white p-4 animate-in zoom-in duration-200">
                    <div className="w-12 h-12 rounded-full bg-white text-emerald-600 flex items-center justify-center mb-2 shadow-lg">
                      <Check className="w-7 h-7 stroke-[3]" />
                    </div>
                    <span className="font-extrabold text-sm">QRIS Berhasil Dibayar!</span>
                    <span className="text-xs text-emerald-100 mt-0.5">Saldo terverifikasi masuk</span>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-extrabold text-gray-800 tracking-wider">
                  NMID: ID1020349182391 • HANSAN CAFE 01
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Arahkan pelanggan scan kode QRIS menggunakan GoPay, OVO, Dana, atau BCA Mobile
                </p>
              </div>

              {!qrisPaid ? (
                <button
                  type="button"
                  onClick={() => setQrisPaid(true)}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 border border-gray-200 text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Simulasikan Pembayaran QRIS Berhasil</span>
                </button>
              ) : (
                <div className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  <span>Siap cetak struk</span>
                </div>
              )}
            </div>
          )}

          {/* 3. KARTU DEBIT / CREDIT */}
          {activeMethod === "CARD" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Pilih Mesin EDC / Bank
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {["BCA", "Mandiri", "BRI", "BNI"].map((bank) => (
                    <button
                      key={bank}
                      type="button"
                      onClick={() => setSelectedBank(bank)}
                      className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                        selectedBank === bank
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {bank}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Nomor Approval / Trace ID (EDC)
                </label>
                <input
                  type="text"
                  value={approvalCode}
                  onChange={(e) => setApprovalCode(e.target.value)}
                  placeholder="Contoh: 849201"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Masukkan nomor trace dari struk fisik mesin EDC setelah nasabah memasukkan PIN.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex items-center gap-2.5 text-blue-900 text-xs">
                <CreditCard className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span>Swipe atau tap kartu nasabah pada mesin EDC {selectedBank}.</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={activeMethod === "CASH" && !isCashValid}
            className={`flex-1 py-3 px-5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all shadow-md ${
              activeMethod === "CASH" && !isCashValid
                ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
                : "bg-brand-500 hover:bg-brand-600 text-white shadow-brand-500/30"
            }`}
          >
            <span>Konfirmasi Pembayaran ({formatRupiah(grandTotal)})</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
