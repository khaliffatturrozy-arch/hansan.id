PHASE 0 — Git & Workflow Observations

Current branch & working tree
- Current branch detected: `main` (local git). `git status` shows modified files and untracked directories.
- Noted modified files (examples):
  - [src/app/layout.tsx](src/app/layout.tsx) (modified)
  - [tailwind.config.ts](tailwind.config.ts) (modified)

Untracked or new files/directories
- `src/context/` and `src/data/` were shown as untracked in `git status` output during the audit (verify locally before committing).

Recent commits
- The workspace contains git history; I captured a short status during the audit but did not alter commits.

Suggested branch and handoff rules for agent/automation
- Agents should never push directly to `main`. Use a protected `main` branch and create feature branches: `feature/xxx`, `fix/xxx`, `audit/phase-0`.
- CI should run `npm ci`, `npm run build`, `npm run lint` and `prisma migrate status` (or `db push` in dev) on PRs.

Files needing attention before Phase 1 planning
- Resolve the uncommitted modifications in `src/app/layout.tsx` and `tailwind.config.ts` (review and commit or stash) so the working tree is clean for reproducible builds.
