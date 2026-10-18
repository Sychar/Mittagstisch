CREATE TYPE "RestaurantSupportMessageRole" AS ENUM ('user', 'assistant');

CREATE TABLE "RestaurantSupportConversation" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantSupportConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantSupportMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "RestaurantSupportMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "title" TEXT,
    "stepsJson" TEXT,
    "actionTarget" TEXT,
    "actionLabel" TEXT,
    "handoffSuggested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantSupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportKnowledgeArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportKnowledgeArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantSupportConversation_restaurantId_key"
ON "RestaurantSupportConversation"("restaurantId");

CREATE INDEX "RestaurantSupportMessage_conversationId_createdAt_idx"
ON "RestaurantSupportMessage"("conversationId", "createdAt");

CREATE INDEX "RestaurantSupportMessage_role_createdAt_idx"
ON "RestaurantSupportMessage"("role", "createdAt");

CREATE UNIQUE INDEX "SupportKnowledgeArticle_slug_key"
ON "SupportKnowledgeArticle"("slug");

ALTER TABLE "RestaurantSupportConversation"
ADD CONSTRAINT "RestaurantSupportConversation_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestaurantSupportMessage"
ADD CONSTRAINT "RestaurantSupportMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "RestaurantSupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
