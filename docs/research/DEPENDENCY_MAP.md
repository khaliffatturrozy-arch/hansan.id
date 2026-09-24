# DEPENDENCY MAP — HANSAN POS

## 1. Domain Implementation Order

```text
1. Database Schema & Prisma Client (Done)
      ↓
2. Environment Configuration & Supabase Connection (Done)
      ↓
3. API Routes / Server Actions for Catalog & Categories (Next)
      ↓
4. Order Creation & Persistence Backend (Next)
      ↓
5. Cashier POS UI integration with backend API (Next)
      ↓
6. KDS & Kitchen Display Routing
      ↓
7. Reporting & Owner Dashboard
```

## 2. Package Dependencies (`package.json`)
- `@prisma/client` & `prisma`
- `@supabase/supabase-js`
- `next`, `react`, `react-dom`
- `clsx`, `tailwind-merge`, `lucide-react`
- `tailwindcss`, `postcss`, `autoprefixer`
- `typescript`, `ts-node`
