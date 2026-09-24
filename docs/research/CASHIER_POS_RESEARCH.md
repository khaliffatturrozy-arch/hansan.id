# CASHIER POS RESEARCH — HANSAN POS

## 1. Cashier POS Workflow

```text
Open Shift / Login
      ↓
Select Catalog & Categories (Search / Filter)
      ↓
Add Items to Cart (Quantity, Notes, Modifiers)
      ↓
Select Order Type (Dine-in / Takeaway) & Table / Customer
      ↓
Review Subtotal, PB1 Tax (10%), Grand Total
      ↓
Trigger Payment Modal (Cash / QRIS / Card)
      ↓
Confirm Payment & Generate Thermal Receipt
      ↓
Persist Order & OrderItems to Database
```

## 2. Component Structure in Repository
- `PosCashierView.tsx`: Main container view.
- `CategoryTabs.tsx`: Category filtering.
- `SearchBar.tsx`: Search input.
- `MenuCard.tsx`: Product item display card.
- `CartSidebar.tsx`: Cart items list, summary calculations, checkout trigger.
- `PaymentModal.tsx`: Payment method selection and calculator.
- `ReceiptModal.tsx`: Thermal receipt preview and print simulation.

## 3. Gap Analysis
- UI components and interactions are fully built and working with mock data.
- Backend data fetching (Prisma/Supabase) and order persistence API routes need to be implemented in Phase 2.
