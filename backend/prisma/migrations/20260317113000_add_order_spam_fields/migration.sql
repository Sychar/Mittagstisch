-- Add order identity and anti-spam support fields.
ALTER TABLE "Order"
ADD COLUMN "customerEmail" TEXT,
ADD COLUMN "deviceId" TEXT,
ADD COLUMN "requestIp" TEXT;

UPDATE "Order"
SET "customerEmail" = 'unknown@example.com'
WHERE "customerEmail" IS NULL;

ALTER TABLE "Order"
ALTER COLUMN "customerEmail" SET NOT NULL;

CREATE INDEX "Order_restaurantId_customerEmail_idx" ON "Order"("restaurantId", "customerEmail");
CREATE INDEX "Order_restaurantId_deviceId_idx" ON "Order"("restaurantId", "deviceId");
