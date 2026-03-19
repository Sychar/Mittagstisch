-- CreateEnum
CREATE TYPE "MealSlot" AS ENUM ('breakfast', 'lunch', 'dinner');

-- AlterTable
ALTER TABLE "Restaurant"
ADD COLUMN "mealSlots" "MealSlot"[] NOT NULL DEFAULT ARRAY['lunch']::"MealSlot"[];

-- AlterTable
ALTER TABLE "Offer"
ADD COLUMN "mealSlot" "MealSlot" NOT NULL DEFAULT 'lunch';
