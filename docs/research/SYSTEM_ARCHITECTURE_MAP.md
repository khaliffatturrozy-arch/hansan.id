# SYSTEM ARCHITECTURE MAP — HANSAN POS

## 1. High-Level Architecture Overview

Hansan POS is structured as a **Modular Monolith** built on Next.js 14 App Router, utilizing TypeScript, Tailwind CSS, Prisma ORM, PostgreSQL, and Supabase.

```text
┌─────────────────────────────────────────────────────────────┐
│                       PRESENTATION LAYER                    │
│   Next.js App Router Pages (`src/app/*`)                    │
│   Feature Modules (`src/modules/pos`, `kds`, `dashboard`, etc)│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION & STATE LAYER                │
│   React Context (`CartContext`, Auth, UI State)             │
│   Server Actions / API Routes (`src/app/api/*`)             │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       DATA ACCESS LAYER                     │
│   Prisma Client (`src/lib/prisma.ts`)                       │
│   Supabase Client (`src/lib/supabase.ts`)                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        DATABASE LAYER                       │
│   PostgreSQL Database (Prisma Schema / Migrations)          │
└─────────────────────────────────────────────────────────────┘
```

## 2. Module Boundary Specifications

- **`src/modules/pos/`**: Cashier POS view, menu grid, cart management, payment modal, thermal receipt modal, POS types.
- **`src/modules/kds/`**: Kitchen Display System (Placeholder).
- **`src/modules/inventory/`**: Inventory management (Placeholder).
- **`src/modules/dashboard/`**: Owner & Manager reporting (Placeholder).
- **`src/lib/`**: Shared singletons (`prisma.ts`, `supabase.ts`, `utils.ts`).
- **`prisma/`**: Database schema (`schema.prisma`) and seed data (`seed.ts`).

## 3. Coupling & Separation Guidelines
- Business logic must reside in service/server layers, not directly inside React components.
- UI components must consume well-defined TypeScript types.
- Database access must be encapsulated through Prisma client instances.
