# TECHNICAL DEBT — HANSAN POS

| ID | Category | Problem | Evidence | Impact | Recommended Action | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| TD-01 | Architecture | POS UI relies entirely on mock data & in-memory state | `src/modules/pos/types/pos.ts` | Orders are lost on page reload; no persistence | Implement API routes / server actions to fetch menu from DB and save orders via Prisma | High |
| TD-02 | Modules | Placeholder module directories are empty | `src/modules/inventory/`, `kds/`, `dashboard/` | Incomplete feature scaffolding | Implement modules progressively following MVP priority | Medium |
| TD-03 | Security | No authentication middleware or login guard | `src/app/` | Anyone can access cashier view | Implement Supabase Auth & protected routes in Phase 2 | High |
