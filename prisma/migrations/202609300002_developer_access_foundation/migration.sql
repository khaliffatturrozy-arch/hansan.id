-- ─────────────────────────────────────────────────────────────────────────────
-- HANSAN — Developer Access Foundation
--
-- PURPOSE
--   Tenant-independent platform/developer authorization boundary.
--   DeveloperAccess rows are grant records only: they bind a real Supabase Auth
--   identity (authUserId) to platform access. No tenant data is involved.
--
-- SCOPE
--   Schema only. No row is created, updated, or deleted. The initial
--   production database is allowed to remain empty and stays empty.
--
-- SAFETY
--   CREATE TABLE + indexes only. No backfill, no seed, no data migration,
--   no destructive statement. Safe against an empty database.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "DeveloperAccess" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    CONSTRAINT "DeveloperAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperAccess_authUserId_key" ON "DeveloperAccess"("authUserId");

-- CreateIndex
CREATE INDEX "DeveloperAccess_status_idx" ON "DeveloperAccess"("status");
