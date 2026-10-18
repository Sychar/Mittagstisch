CREATE TYPE "RestaurantReviewVisibilityStatus" AS ENUM ('visible', 'removed');
CREATE TYPE "RestaurantReviewReportReason" AS ENUM (
    'fake_or_no_visit',
    'abusive_or_inappropriate',
    'wrong_restaurant',
    'privacy',
    'other'
);
CREATE TYPE "RestaurantReviewReportStatus" AS ENUM ('pending', 'kept', 'removed');

ALTER TABLE "RestaurantReview"
ADD COLUMN "visibilityStatus" "RestaurantReviewVisibilityStatus" NOT NULL DEFAULT 'visible',
ADD COLUMN "moderatedAt" TIMESTAMP(3),
ADD COLUMN "moderationNote" TEXT;

CREATE TABLE "RestaurantReviewReport" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "reason" "RestaurantReviewReportReason" NOT NULL,
    "note" TEXT,
    "status" "RestaurantReviewReportStatus" NOT NULL DEFAULT 'pending',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" TEXT,
    "resolutionNote" TEXT,
    "restoredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantReviewReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantReviewReport_reviewId_key"
ON "RestaurantReviewReport"("reviewId");

CREATE INDEX "RestaurantReviewReport_status_reportedAt_idx"
ON "RestaurantReviewReport"("status", "reportedAt");

CREATE INDEX "RestaurantReviewReport_restaurantId_status_idx"
ON "RestaurantReviewReport"("restaurantId", "status");

CREATE INDEX "RestaurantReview_restaurantId_visibilityStatus_createdAt_idx"
ON "RestaurantReview"("restaurantId", "visibilityStatus", "createdAt");

ALTER TABLE "RestaurantReviewReport"
ADD CONSTRAINT "RestaurantReviewReport_reviewId_fkey"
FOREIGN KEY ("reviewId") REFERENCES "RestaurantReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestaurantReviewReport"
ADD CONSTRAINT "RestaurantReviewReport_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
