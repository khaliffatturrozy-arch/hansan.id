# RISK REGISTER — HANSAN POS

| ID | Risk | Category | Probability | Impact | Severity | Mitigation | Phase |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| RS-01 | Data loss during network outage | Offline / Reliability | High | High | Critical | Implement IndexedDB local caching & sync queue | Phase 3 |
| RS-02 | Price changes affecting historical orders | Transaction Integrity | Medium | High | High | Use price snapshots (`OrderItem.unitPrice`) | Implemented in Prisma Schema |
| RS-03 | Unauthorized cashier access | Security | Medium | High | High | Enforce Supabase Auth & role checks | Phase 2 |
| RS-04 | Concurrent stock overselling | Inventory | Medium | Medium | Medium | Implement database transactions (`prisma.$transaction`) | Phase 2 |
