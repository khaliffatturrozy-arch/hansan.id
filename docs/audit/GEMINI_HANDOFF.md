Gemini + Antigravity — Handoff for Repository Preparation

Approved repository preparation tasks
- Remove `.env` from repository and add to `.gitignore` (retain `.env.example`).
- Create new API route files under `app/api/` for `orders` and `menu`.
- Add a minimal integration test that seeds the test DB and validates `POST /api/orders`.

Explicitly prohibited changes
- Do not modify `prisma/schema.prisma`'s monetary fields types (keep `Int` currency storage) without a migration plan.
- Do not push any credential values or service role keys into repo.

Documentation requirements
- Update `README.md` with local dev steps to run Prisma seed, and explain environment variable usage (reference `.env.example`).
- Add a `CONTRIBUTING.md` snippet describing branch naming (`feature/`, `fix/`, `audit/`), PR checks, and required reviewers for DB/schema changes.

Git workflow requirements
- Protect `main`; require PRs and passing CI for merges.
- Agents must create feature branches and never push directly to `main`.

Conditions before handing to Claude
- Secrets removed/rotated from repo.
- CI configured with test DB credentials and seed steps.
- A clean working tree (no uncommitted changes) and documented acceptance criteria present.
