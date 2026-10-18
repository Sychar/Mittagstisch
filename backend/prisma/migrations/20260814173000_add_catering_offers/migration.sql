CREATE TABLE "CateringOffer" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CateringOffer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CateringOffer_restaurantId_active_sortOrder_idx"
ON "CateringOffer"("restaurantId", "active", "sortOrder");

ALTER TABLE "CateringOffer"
ADD CONSTRAINT "CateringOffer_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
