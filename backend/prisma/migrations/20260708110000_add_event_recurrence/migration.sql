CREATE TYPE "EventRecurrenceType" AS ENUM ('none', 'weekly');

ALTER TABLE "Event"
  ADD COLUMN "recurrenceType" "EventRecurrenceType" NOT NULL DEFAULT 'none',
  ADD COLUMN "recurrenceWeekdays" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "recurrenceEndAt" TIMESTAMP(3);

CREATE INDEX "Event_recurrenceType_idx" ON "Event"("recurrenceType");
CREATE INDEX "Event_recurrenceEndAt_idx" ON "Event"("recurrenceEndAt");
