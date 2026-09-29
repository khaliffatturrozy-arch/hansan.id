-- Add isPlatform flag to Role model.
-- Platform roles (PLATFORM_ADMIN, PLATFORM_DEVELOPER, PLATFORM_SUPPORT) are
-- structurally distinct from tenant roles and can exist without a real tenant
-- organization. This flag enforces that distinction at the schema level without
-- breaking existing tenant roles (all existing rows default to false).
--
-- organizationId remains NOT NULL for tenant roles. The application layer
-- enforces that platform roles are only created by the platform bootstrap,
-- not by tenant-facing endpoints.

ALTER TABLE "Role"
  ADD COLUMN "isPlatform" BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient platform role queries
CREATE INDEX "Role_isPlatform_idx" ON "Role"("isPlatform");

-- Partial unique constraint: among non-platform roles, organizationId+name must be unique.
-- (The existing unique constraint already covers this for the non-platform case.)
-- No change needed to the existing unique constraint; platform roles will use a
-- synthetic organizationId of 'PLATFORM' which is explicitly reserved.

COMMENT ON COLUMN "Role"."isPlatform" IS 
  'True for platform-level roles (PLATFORM_ADMIN, PLATFORM_DEVELOPER, PLATFORM_SUPPORT). '
  'These roles are not scoped to a tenant organization.';
