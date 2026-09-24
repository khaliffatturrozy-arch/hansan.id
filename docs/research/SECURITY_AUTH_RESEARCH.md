# SECURITY & AUTHENTICATION RESEARCH — HANSAN POS

## 1. Current State
- Supabase client is initialized in `src/lib/supabase.ts`.
- No authentication guards, login screens, or RLS policies are currently enforced in the application layer.

## 2. Security & Authorization Recommendations
- **Authentication:** Implement Supabase Auth (Email/Password or PIN-based login for cashiers).
- **Authorization (RBAC):** Define roles (`OWNER`, `MANAGER`, `CASHIER`, `KITCHEN`).
- **Row Level Security (RLS):** Apply PostgreSQL RLS policies in Supabase for tenant/outlet data isolation when multi-outlet is introduced.
- **Secrets Management:** Ensure `.env` and sensitive API keys are never committed to git.
