CREATE TABLE "EventScheduledOccurrence" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventScheduledOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventScheduledOccurrence_eventId_startAt_key"
    ON "EventScheduledOccurrence"("eventId", "startAt");
CREATE INDEX "EventScheduledOccurrence_eventId_startAt_idx"
    ON "EventScheduledOccurrence"("eventId", "startAt");
CREATE INDEX "EventScheduledOccurrence_startAt_endAt_idx"
    ON "EventScheduledOccurrence"("startAt", "endAt");

ALTER TABLE "EventScheduledOccurrence"
    ADD CONSTRAINT "EventScheduledOccurrence_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
