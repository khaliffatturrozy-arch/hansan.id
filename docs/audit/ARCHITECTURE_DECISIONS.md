Architecture Decisions — Phase 0.2

Verified decisions (recommended to preserve)
- Currency stored as integer in Prisma (`price`, `subtotal`, `totalAmount`, `amountPaid`, etc.). Keep integer-based IDR representation to avoid floating-point errors.
- Order and OrderItem models include snapshot fields (`unitPrice`, `subtotal`) — preserve to ensure historical price fidelity.

Proposed decisions (for alignment with Phase 1)
- Server-side order API: implement `POST /api/orders` (Next.js route handler) that accepts an idempotency token and writes `Order` and `OrderItem` records via `prisma` with server-side validation.
- Auth model: use Supabase Auth for user sessions; server routes should validate session and use server-side service role where needed.

Non-invasive schema changes
- Add optional `outletId?: String` and `tenantId?: String` to `Order` and `MenuItem` as nullable fields with a migration plan.

Decisions to defer
- Multi-tenant isolation via schema-level tenant columns vs. separate databases (defer until product requirement confirmed).
- Offline-sync strategy and conflict resolution (defer design to Phase 1 after requirements confirmation).
