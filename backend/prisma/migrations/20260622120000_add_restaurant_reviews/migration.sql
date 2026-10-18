CREATE TABLE "RestaurantReview" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "authorName" TEXT,
    "deviceId" TEXT,
    "requestIp" TEXT,
    "replyText" TEXT,
    "replyCreatedAt" TIMESTAMP(3),
    "replyUpdatedAt" TIMESTAMP(3),
    "restaurantSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantReviewImage" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantReviewImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RestaurantReview_restaurantId_createdAt_idx" ON "RestaurantReview"("restaurantId", "createdAt");
CREATE INDEX "RestaurantReview_restaurantId_restaurantSeenAt_idx" ON "RestaurantReview"("restaurantId", "restaurantSeenAt");
CREATE INDEX "RestaurantReviewImage_reviewId_idx" ON "RestaurantReviewImage"("reviewId");

ALTER TABLE "RestaurantReview" ADD CONSTRAINT "RestaurantReview_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantReviewImage" ADD CONSTRAINT "RestaurantReviewImage_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "RestaurantReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
