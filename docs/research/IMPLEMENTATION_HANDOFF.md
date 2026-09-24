# IMPLEMENTATION HANDOFF — HANSAN POS

## 1. Current Repository State
- Clean Next.js 14 App Router project with Tailwind CSS, Prisma ORM, and Supabase JS.
- Fully polished Cashier POS UI mockup implemented with mock data and interactive cart/payment/receipt modals.

## 2. Architecture That MUST Be Preserved
- Modular monolith folder structure (`src/modules/*`).
- Prisma schema for Category, MenuItem, Order, and OrderItem.
- Price snapshot pattern (`OrderItem.unitPrice`).

## 3. Architecture That MUST Be Changed / Connected
- Connect Cashier POS UI to backend API routes / server actions.
- Replace `MOCK_MENU_ITEMS` in POS view with database fetch via Prisma.
- Implement order submission persistence to PostgreSQL.

## 4. Cashier POS Scope for Phase 2
- Fetch categories and menu items from database.
- Submit cart orders to `/api/orders` (saving Order and OrderItems atomically via Prisma transaction).
- Print / display confirmation receipt.

## 5. Explicit Tasks That Next Agent Must NOT Perform
- Do not build multi-outlet infrastructure.
- Do not implement complex loyalty systems.
- Do not alter the database schema without explicit approval.
- Do not refactor unrelated styling or UI components.

## 6. Acceptance Criteria
- Cashier POS loads menu items from PostgreSQL database.
- Submitting an order creates an `Order` and associated `OrderItem` records in the database with correct price snapshots and tax calculations.
- TypeScript build (`npx tsc --noEmit`) passes with 0 errors.
