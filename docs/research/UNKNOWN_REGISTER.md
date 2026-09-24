# UNKNOWN REGISTER — HANSAN POS

| ID | Question | Why it matters | Possible Options | Current Evidence | Decision Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| UN-01 | Will offline sync use client-side SQLite (WASM) or IndexedDB? | Determines local storage architecture for offline POS | 1. IndexedDB (Dexie)<br>2. PGLite / SQLite WASM | Not yet decided | Product / Tech Lead |
| UN-02 | What is the exact PB1 tax calculation rule for service charges? | Financial accuracy in receipts | 1. 10% PB1 only<br>2. 10% PB1 + 5% Service | Prisma schema has `taxPb1` | Business Owner |
| UN-03 | Should cashier shifts be tracked in MVP? | Cash reconciliation at end of shift | 1. Yes (Shift table)<br>2. No (Single continuous session) | Not in Prisma schema | Product Owner |
