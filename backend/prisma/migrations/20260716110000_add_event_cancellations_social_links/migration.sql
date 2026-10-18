ALTER TABLE "Event"
ADD COLUMN "socialLinks" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "EventOccurrenceCancellation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurrenceStartAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOccurrenceCancellation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventOccurrenceCancellation_eventId_occurrenceStartAt_key"
ON "EventOccurrenceCancellation"("eventId", "occurrenceStartAt");

CREATE INDEX "EventOccurrenceCancellation_eventId_occurrenceStartAt_idx"
ON "EventOccurrenceCancellation"("eventId", "occurrenceStartAt");

ALTER TABLE "EventOccurrenceCancellation"
ADD CONSTRAINT "EventOccurrenceCancellation_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
