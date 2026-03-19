-- CreateEnum
CREATE TYPE "RestaurantApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "Restaurant"
ADD COLUMN "approvalStatus" "RestaurantApprovalStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "approvalRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "approvalReviewedAt" TIMESTAMP(3),
ADD COLUMN "approvalNote" TEXT;

-- Keep existing restaurants active after introducing approval workflow
UPDATE "Restaurant"
SET
  "approvalStatus" = 'approved',
  "approvalReviewedAt" = CURRENT_TIMESTAMP
WHERE "approvalStatus" = 'pending';
