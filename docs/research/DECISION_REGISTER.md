# DECISION REGISTER — HANSAN POS

| ID | Decision | Current State | Recommendation | Reason | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DEC-01 | Use Prisma ORM with PostgreSQL | Configured in `schema.prisma` | Maintain Prisma | Strong type safety & robust schema migrations | CONFIRMED |
| DEC-02 | Single outlet MVP scope | Single branch architecture | Maintain single outlet for MVP | Reduces initial complexity before multi-outlet scaling | CONFIRMED |
| DEC-03 | Price snapshot in OrderItem | Present in Prisma schema (`unitPrice`) | Maintain snapshot | Prevents historical transaction discrepancies when menu prices change | CONFIRMED |
| DEC-04 | Modular Monolith architecture | Folder structure (`src/modules/*`) | Maintain modular monolith | Optimal for team speed and maintainability at current scale | CONFIRMED |
