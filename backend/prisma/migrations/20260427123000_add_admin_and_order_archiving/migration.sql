-- Add admin account table for DB-based admin authentication.
CREATE TABLE "AdminAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminAccount_email_key" ON "AdminAccount"("email");

-- Extend orders with lifecycle timestamps for auto-archive and soft delete.
ALTER TABLE "Order"
    ADD COLUMN "statusUpdatedAt" TIMESTAMP(3),
    ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Backfill statusUpdatedAt for already finalized rows.
UPDATE "Order"
SET "statusUpdatedAt" = "createdAt"
WHERE "status" IN ('confirmed', 'cancelled')
  AND "statusUpdatedAt" IS NULL;

CREATE INDEX "Order_restaurantId_archivedAt_idx" ON "Order"("restaurantId", "archivedAt");
