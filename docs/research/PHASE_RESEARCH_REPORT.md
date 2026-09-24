# PHASE 01 RESEARCH REPORT — HANSAN POS TECHNICAL FOUNDATION

**Target AI Agent / Role:** OpenCode (Senior Software Architect & Technical Analyst)
**Date:** September 22, 2026
**Status:** READY_WITH_CONDITIONS
**Repository Scope:** F&B Operating System / POS (Next.js 14, TypeScript, Prisma, PostgreSQL, Supabase)

---

## 1. Executive Summary

Hansan POS is an integrated F&B Operating System designed for cafes, restaurants, and beverage businesses. Following a thorough technical reconnaissance of the repository (`C:\Users\MyBook Hype AMD\Desktop\HANSAN`), we have established a grounded understanding of the existing codebase, database schema, state management, and architectural boundaries.

The repository currently contains a fully functional, highly polished Cashier POS prototype frontend (`PosCashierView`, `CartSidebar`, `PaymentModal`, `ReceiptModal`), paired with a robust Prisma schema supporting Categories, MenuItems, Orders, and OrderItems.

However, several architectural gaps exist between the UI mockup state and backend persistence, authentication, RLS, offline sync queue, and kitchen display routing. This research report and its accompanying blueprint documents provide the technical foundation required for safe, structured future implementation.

---

## 2. Repository Reality

- **Framework:** Next.js 14.2.24 (App Router) with React 18.3.1.
- **Styling:** Tailwind CSS 3.4.17 with PostCSS.
- **Database / ORM:** PostgreSQL via Prisma 5.22.0 (`prisma/schema.prisma`), plus Supabase JS client (`@supabase/supabase-js`) for realtime/auth integrations.
- **UI Icons:** `lucide-react`.
- **Existing Modules:**
  - `src/app/page.tsx`: Entry point rendering `PosCashierView`.
  - `src/modules/pos/`: Fully operational Cashier POS view, cart management, mock menu items, payment modal (Cash, QRIS, Card), and thermal receipt generator.
  - `src/modules/inventory/`, `src/modules/dashboard/`, `src/modules/kds/`: Placeholder index exports (`index.ts`).
  - `prisma/`: Prisma schema and seed script (`prisma/seed.ts`).
  - `src/lib/`: `prisma.ts`, `supabase.ts`, `utils.ts`.

---

## 3. Current Architecture

```text
[Browser UI (Next.js App Router)]
           ↓
[React State / Context (Cart, POS View State)]
           ↓ (Upcoming)
[API Routes / Server Actions]
           ↓
[Prisma Client / Supabase Client]
           ↓
[PostgreSQL Database (Prisma Schema)]
```

- **Current Separation:** The Cashier POS currently runs entirely on client-side state (`useState`, in-memory `MOCK_MENU_ITEMS`) with zero server persistence or API endpoints connected yet.
- **Database Schema:** Prisma schema defines `Category`, `MenuItem`, `Order`, and `OrderItem` with proper enums (`OrderStatus`, `PaymentMethod`, `OrderType`) and foreign keys with strict referential integrity (`onDelete: Restrict / Cascade`).

---

## 4. Verified Technology Stack

| Layer | Technology | Version / Details | Status |
| :--- | :--- | :--- | :--- |
| Framework | Next.js App Router | 14.2.24 | Verified (Production ready) |
| Language | TypeScript | 5.7.3 | Verified |
| Styling | Tailwind CSS | 3.4.17 | Verified |
| Icons | Lucide React | 0.475.0 | Verified |
| Database ORM | Prisma | 5.22.0 | Verified |
| Database | PostgreSQL | Cloud / Local | Verified (Schema defined) |
| BaaS / Auth | Supabase JS | 2.48.1 | Verified (Library client present) |

---

## 5. Domain Model

- **Product / Menu Item:** Category, Name, Description, Price (IDR integer), Image URL, Availability, Stock Count, Badge.
- **Category:** ID, Name, Slug, Display Order, Active Status.
- **Order:** Order Number, Order Type (DINE_IN, TAKEAWAY), Table Number, Customer Name, Cashier Name, Subtotal, Tax (PB1 10%), Total Amount, Status (PENDING, PROCESSING, READY, COMPLETED, CANCELLED), Payment Method (CASH, QRIS, CARD), Amount Paid, Change, Bank Name, Approval Code, Notes.
- **Order Item:** Order ID, MenuItem ID, Quantity, Unit Price (snapshot), Subtotal, Notes.

---

## 6. Database Model

- **Supported Entities in Schema:** Users (implicit/future), Roles (implicit/future), Categories, MenuItems, Orders, OrderItems.
- **Missing Entities in Schema:** Branches/Outlets, Tables, Payments (separate table), KitchenTickets, InventoryItems, Recipes, StockMovements, Suppliers, PurchaseOrders, Customers, Memberships, AuditLogs.

---

## 7. Transaction Model & Order Lifecycle

- **Order States:** `PENDING` → `PROCESSING` → `READY` → `COMPLETED` | `CANCELLED`.
- **Payment State Separation:** Currently coupled inside `Order` status and payment fields. Recommendation: Decouple payment tracking into a dedicated `Payment` table/model in future migrations.
- **Price Snapshot:** Implemented in `OrderItem.unitPrice`, ensuring historical price immutability when catalog prices change.

---

## 8. Authentication & Security

- **Current State:** No active authentication middleware or login screen in the current codebase. Supabase client is initialized (`src/lib/supabase.ts`), but not enforced or wrapped in RLS policies within the repository.
- **Recommendation:** Implement Supabase Auth with Role-Based Access Control (RBAC) in Phase 2.

---

## 9. Offline POS Architecture

- **Current State:** No local database (IndexedDB/Dexie) or sync queue implemented. State is volatile React `useState`.
- **Recommendation:** Introduce IndexedDB storage layer for draft orders, catalog caching, and offline transaction queuing before multi-device rollouts.

---

## 10. Technical Debt & Risks

- **Critical Risks:**
  1. Client-side POS state is not persisted to backend/database. Reloading the browser wipes current cart/order state.
  2. Absence of backend API routes/server actions for order submission.
- **Technical Debt:**
  - Placeholder directories (`src/modules/inventory`, `src/modules/kds`, `src/modules/dashboard`) contain only empty `index.ts` files.

---

## 11. Implementation Gate

**Status:** `READY_WITH_CONDITIONS`

### Conditions for Proceeding to Implementation:
1. Approval of this research report and associated blueprint documents by GPT/Product Owner.
2. Strict adherence to the implementation boundary (focusing on connecting Cashier POS to Prisma/Database and Order persistence first).
3. No destructive database schema changes without explicit approval.

---
*End of Phase Research Report.*
