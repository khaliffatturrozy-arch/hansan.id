CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Outlet" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "organizationId" TEXT NOT NULL,
    "outletId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "StaffRole" (
    "staffId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("staffId", "roleId")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorStaffId" TEXT,
    "actorUserId" TEXT,
    "organizationId" TEXT,
    "outletId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_slug_key" UNIQUE ("slug");
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_organizationId_slug_key" UNIQUE ("organizationId", "slug");
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_authUserId_key" UNIQUE ("authUserId");
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_email_key" UNIQUE ("email");
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_name_key" UNIQUE ("name");
ALTER TABLE "Role" ADD CONSTRAINT "Role_code_key" UNIQUE ("code");
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_name_key" UNIQUE ("organizationId", "name");
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffRole" ADD CONSTRAINT "StaffRole_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffRole" ADD CONSTRAINT "StaffRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorStaffId_fkey" FOREIGN KEY ("actorStaffId") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
    ADD COLUMN "organizationId" TEXT,
    ADD COLUMN "outletId" TEXT,
    ADD COLUMN "staffId" TEXT;

ALTER TABLE "Order"
    ADD CONSTRAINT "Order_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
    ADD CONSTRAINT "Order_outletId_fkey"
    FOREIGN KEY ("outletId") REFERENCES "Outlet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
    ADD CONSTRAINT "Order_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Organization_slug_idx" ON "Organization" ("slug");
CREATE INDEX "Outlet_organizationId_idx" ON "Outlet" ("organizationId");
CREATE INDEX "Staff_organizationId_idx" ON "Staff" ("organizationId");
CREATE INDEX "Staff_outletId_idx" ON "Staff" ("outletId");
CREATE INDEX "Role_organizationId_idx" ON "Role" ("organizationId");
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog" ("organizationId");
CREATE INDEX "AuditLog_outletId_idx" ON "AuditLog" ("outletId");
CREATE INDEX "Order_organizationId_idx" ON "Order" ("organizationId");
CREATE INDEX "Order_outletId_idx" ON "Order" ("outletId");
CREATE INDEX "Order_staffId_idx" ON "Order" ("staffId");
