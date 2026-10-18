CREATE TABLE "EventProviderFollow" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventProviderFollow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventProviderFollow_providerId_deviceHash_key"
ON "EventProviderFollow"("providerId", "deviceHash");

CREATE INDEX "EventProviderFollow_providerId_idx"
ON "EventProviderFollow"("providerId");

CREATE INDEX "EventProviderFollow_pushToken_idx"
ON "EventProviderFollow"("pushToken");

ALTER TABLE "EventProviderFollow"
ADD CONSTRAINT "EventProviderFollow_providerId_fkey"
FOREIGN KEY ("providerId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
