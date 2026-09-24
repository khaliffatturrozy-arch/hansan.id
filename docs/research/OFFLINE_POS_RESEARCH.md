# OFFLINE POS RESEARCH — HANSAN POS

## 1. Requirement Analysis
- Offline capability is a **Core Requirement** for F&B POS systems to handle internet outages without stopping cashier operations.

## 2. Architecture Recommendation for Offline POS
- **Local Storage / Caching:** Use IndexedDB (via Dexie.js or similar) in future phases to store catalog items, categories, and draft orders locally.
- **Sync Queue:** Outbound offline transactions must be stored in a local sync queue with UUID client transaction IDs (`idempotency_key`).
- **Reconciliation:** When connectivity restores, sync engine pushes queued transactions to Supabase/PostgreSQL, resolving conflicts using server-canonical timestamps.

## 3. Current Repository Status
- Not implemented in current prototype. Current state relies on browser React memory (`useState`).
