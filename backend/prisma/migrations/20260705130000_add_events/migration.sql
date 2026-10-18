CREATE TYPE "EventTag" AS ENUM ('sport', 'culture', 'music', 'party', 'trip', 'family', 'market', 'workshop', 'cinema', 'other');

CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" "EventTag"[] DEFAULT ARRAY[]::"EventTag"[],
    "primaryTag" "EventTag" NOT NULL,
    "venueName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "imageUrl" TEXT,
    "ticketUrl" TEXT,
    "contactUrl" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Event_providerId_idx" ON "Event"("providerId");
CREATE INDEX "Event_startAt_idx" ON "Event"("startAt");
CREATE INDEX "Event_endAt_idx" ON "Event"("endAt");
CREATE INDEX "Event_active_startAt_idx" ON "Event"("active", "startAt");

ALTER TABLE "Event" ADD CONSTRAINT "Event_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
