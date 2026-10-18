CREATE TABLE "RestaurantContentView" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "viewerHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantContentView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantContentView_restaurantId_contentType_contentId_dayKey_viewerHash_key"
ON "RestaurantContentView"("restaurantId", "contentType", "contentId", "dayKey", "viewerHash");

CREATE INDEX "RestaurantContentView_restaurantId_contentType_dayKey_idx"
ON "RestaurantContentView"("restaurantId", "contentType", "dayKey");

ALTER TABLE "RestaurantContentView"
ADD CONSTRAINT "RestaurantContentView_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
