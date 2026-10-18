CREATE TABLE "RestaurantMenuView" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "menuKind" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "viewerHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantMenuView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantMenuView_restaurantId_menuKind_dayKey_viewerHash_key"
ON "RestaurantMenuView"("restaurantId", "menuKind", "dayKey", "viewerHash");

CREATE INDEX "RestaurantMenuView_restaurantId_menuKind_dayKey_idx"
ON "RestaurantMenuView"("restaurantId", "menuKind", "dayKey");

ALTER TABLE "RestaurantMenuView"
ADD CONSTRAINT "RestaurantMenuView_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
