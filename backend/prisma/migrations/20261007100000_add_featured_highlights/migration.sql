CREATE TYPE "FeaturedHighlightType" AS ENUM ('event', 'offer', 'restaurant');

CREATE TABLE "FeaturedHighlight" (
    "id" TEXT NOT NULL,
    "type" "FeaturedHighlightType" NOT NULL,
    "eventId" TEXT,
    "offerId" TEXT,
    "restaurantId" TEXT,
    "customImageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeaturedHighlight_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeaturedHighlight_target_check" CHECK (
      ("type" = 'event' AND "eventId" IS NOT NULL AND "offerId" IS NULL AND "restaurantId" IS NULL) OR
      ("type" = 'offer' AND "eventId" IS NULL AND "offerId" IS NOT NULL AND "restaurantId" IS NULL) OR
      ("type" = 'restaurant' AND "eventId" IS NULL AND "offerId" IS NULL AND "restaurantId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "FeaturedHighlight_eventId_key" ON "FeaturedHighlight"("eventId");
CREATE UNIQUE INDEX "FeaturedHighlight_offerId_key" ON "FeaturedHighlight"("offerId");
CREATE UNIQUE INDEX "FeaturedHighlight_restaurantId_key" ON "FeaturedHighlight"("restaurantId");
CREATE INDEX "FeaturedHighlight_active_sortOrder_idx" ON "FeaturedHighlight"("active", "sortOrder");
CREATE INDEX "FeaturedHighlight_type_idx" ON "FeaturedHighlight"("type");

ALTER TABLE "FeaturedHighlight" ADD CONSTRAINT "FeaturedHighlight_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeaturedHighlight" ADD CONSTRAINT "FeaturedHighlight_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeaturedHighlight" ADD CONSTRAINT "FeaturedHighlight_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
