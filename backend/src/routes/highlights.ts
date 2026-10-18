import { FastifyInstance } from "fastify";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AppContext } from "../context";
import { HttpError, parseOrThrow } from "../utils/http";
import { requireAdminAuth } from "./admin";
import { getEventOccurrence, loadProviderEventSettings, toPublicEvent } from "./events";
import { loadRestaurantSettings } from "./restaurants";

const HIGHLIGHT_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "highlights");
const HIGHLIGHT_UPLOAD_PREFIX = "/uploads/highlights/";
const PUBLIC_APP_URL = String(process.env.PUBLIC_APP_URL || "https://app.nahundfein.com").replace(/\/+$/, "");
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const highlightTypeSchema = z.enum(["event", "offer", "restaurant"]);

const candidateQuerySchema = z.object({
  type: highlightTypeSchema.optional(),
  query: z.string().trim().max(120).optional()
});
const createHighlightSchema = z.object({
  type: highlightTypeSchema,
  targetId: z.string().uuid(),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional()
});
const updateHighlightSchema = z.object({
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");
const resolveItemsSchema = z.object({
  items: z.array(z.object({ type: highlightTypeSchema, targetId: z.string().uuid() })).max(100)
});

const absoluteUploadUrl = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}${text.startsWith("/") ? text : `/${text}`}` : text;
};

const targetIdForHighlight = (highlight: any) =>
  highlight.type === "event"
    ? highlight.eventId
    : highlight.type === "offer"
      ? highlight.offerId
      : highlight.restaurantId;

const removeManagedImage = async (imageUrl?: string | null) => {
  const text = String(imageUrl || "");
  const markerIndex = text.indexOf(HIGHLIGHT_UPLOAD_PREFIX);
  if (markerIndex < 0) return;
  const fileName = path.basename(text.slice(markerIndex + HIGHLIGHT_UPLOAD_PREFIX.length));
  if (!fileName) return;
  await unlink(path.join(HIGHLIGHT_UPLOAD_DIR, fileName)).catch(() => undefined);
};

const resolveTarget = async (ctx: AppContext, type: string, targetId: string) => {
  if (!ctx.prisma) throw new HttpError(503, "DATABASE_REQUIRED", "Highlights benötigen die Datenbank.");

  if (type === "event") {
    const event = await ctx.prisma.event.findFirst({
      where: { id: targetId, active: true, provider: { approvalStatus: "approved" } },
      include: { provider: true, occurrenceCancellations: true, scheduledOccurrences: true }
    });
    if (!event) return null;
    const occurrence = getEventOccurrence(event, new Date());
    if (!occurrence) return null;
    const settings = await loadProviderEventSettings(event.providerId);
    const publicEvent = toPublicEvent(event, null, settings, occurrence);
    return {
      type: "event",
      targetId: event.id,
      title: event.title,
      subtitle: event.provider.name,
      description: event.description,
      address: [event.venueName, event.address, event.postalCode].filter(Boolean).join(" · "),
      sourceImageUrl: event.imageUrl || settings.logoUrl || "",
      shareUrl: `${PUBLIC_APP_URL}/events/${encodeURIComponent(event.id)}?occurrenceStartAt=${encodeURIComponent(occurrence.occurrenceStartAt.toISOString())}`,
      target: publicEvent
    };
  }

  if (type === "offer") {
    const offer = await ctx.prisma.offer.findFirst({
      where: { id: targetId, active: true, restaurant: { approvalStatus: "approved" } },
      include: { restaurant: true }
    });
    if (!offer) return null;
    const settings = await loadRestaurantSettings(offer.restaurantId);
    return {
      type: "offer",
      targetId: offer.id,
      title: offer.title,
      subtitle: offer.restaurant.name,
      description: offer.description,
      address: [offer.restaurant.address, offer.restaurant.postalCode].filter(Boolean).join(" · "),
      sourceImageUrl: offer.imageUrl || settings.logoUrl || "",
      shareUrl: `${PUBLIC_APP_URL}/offers/${encodeURIComponent(offer.id)}`,
      target: {
        id: offer.id,
        restaurantId: offer.restaurantId,
        title: offer.title,
        description: offer.description,
        price: Number(offer.price),
        tags: offer.tags,
        imageUrl: offer.imageUrl || null,
        mealSlot: offer.mealSlot,
        active: offer.active,
        preorderEnabled: offer.preorderEnabled,
        restaurant: {
          id: offer.restaurant.id,
          name: offer.restaurant.name,
          address: offer.restaurant.address,
          postalCode: offer.restaurant.postalCode,
          phone: offer.restaurant.phone,
          lat: offer.restaurant.lat,
          lng: offer.restaurant.lng,
          mealSlots: offer.restaurant.mealSlots,
          menuUrl: offer.restaurant.menuUrl,
          menuMimeType: offer.restaurant.menuMimeType,
          logoUrl: settings.logoUrl,
          openingHours: settings.openingHours,
          specialClosures: settings.specialClosures,
          cuisineTypes: settings.cuisineTypes,
          socialLinks: settings.socialLinks,
          aboutText: settings.aboutText,
          reservationMode: settings.reservationMode,
          reservationExternalLink: settings.reservationExternalLink,
          reservationExternalEmail: settings.reservationExternalEmail,
          reservationExternalPhone: settings.reservationExternalPhone
        }
      }
    };
  }

  const restaurant = await ctx.prisma.restaurant.findFirst({
    where: { id: targetId, approvalStatus: "approved" }
  });
  if (!restaurant) return null;
  const settings = await loadRestaurantSettings(restaurant.id);
  return {
    type: "restaurant",
    targetId: restaurant.id,
    title: restaurant.name,
    subtitle: "Restaurant",
    description: settings.aboutText || "Restaurant in deiner Nähe",
    address: [restaurant.address, restaurant.postalCode].filter(Boolean).join(" · "),
    sourceImageUrl: settings.logoUrl || "",
    shareUrl: PUBLIC_APP_URL,
    target: {
      id: restaurant.id,
      name: restaurant.name,
      address: restaurant.address,
      postalCode: restaurant.postalCode,
      phone: restaurant.phone,
      lat: restaurant.lat,
      lng: restaurant.lng,
      mealSlots: restaurant.mealSlots,
      menuUrl: restaurant.menuUrl,
      menuMimeType: restaurant.menuMimeType,
      logoUrl: settings.logoUrl,
      openingHours: settings.openingHours,
      specialClosures: settings.specialClosures,
      cuisineTypes: settings.cuisineTypes,
      socialLinks: settings.socialLinks,
      aboutText: settings.aboutText,
      reservationMode: settings.reservationMode,
      reservationExternalLink: settings.reservationExternalLink,
      reservationExternalEmail: settings.reservationExternalEmail,
      reservationExternalPhone: settings.reservationExternalPhone
    }
  };
};

const serializeHighlight = async (ctx: AppContext, highlight: any) => {
  const targetId = targetIdForHighlight(highlight);
  if (!targetId) return null;
  const content = await resolveTarget(ctx, highlight.type, targetId);
  if (!content) return null;
  return {
    id: highlight.id,
    active: highlight.active,
    sortOrder: highlight.sortOrder,
    customImageUrl: absoluteUploadUrl(highlight.customImageUrl),
    imageUrl: absoluteUploadUrl(highlight.customImageUrl) || absoluteUploadUrl(content.sourceImageUrl),
    createdAt: highlight.createdAt.toISOString(),
    updatedAt: highlight.updatedAt.toISOString(),
    ...content
  };
};

const assertTargetExists = async (ctx: AppContext, type: string, targetId: string) => {
  const target = await resolveTarget(ctx, type, targetId);
  if (!target) throw new HttpError(404, "TARGET_NOT_AVAILABLE", "Der ausgewählte Inhalt ist nicht öffentlich verfügbar.");
};

export const registerHighlightRoutes = (app: FastifyInstance, ctx: AppContext) => {
  app.get("/api/highlights", async () => {
    if (!ctx.prisma) return [];
    const rows = await ctx.prisma.featuredHighlight.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
    });
    const resolved = await Promise.all(rows.map((row) => serializeHighlight(ctx, row)));
    return resolved.filter(Boolean);
  });

  app.post("/api/discovery/items/resolve", async (request) => {
    const body = parseOrThrow(resolveItemsSchema, request.body);
    const resolved = await Promise.all(
      body.items.map(async (item) => {
        const content = await resolveTarget(ctx, item.type, item.targetId);
        return content ? { id: `${item.type}:${item.targetId}`, imageUrl: absoluteUploadUrl(content.sourceImageUrl), ...content } : null;
      })
    );
    return resolved.filter(Boolean);
  });

  app.get("/api/admin/highlights", async (request) => {
    requireAdminAuth(request);
    if (!ctx.prisma) throw new HttpError(503, "DATABASE_REQUIRED", "Highlights benötigen die Datenbank.");
    const rows = await ctx.prisma.featuredHighlight.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
    });
    const resolved = await Promise.all(rows.map((row) => serializeHighlight(ctx, row)));
    return resolved.filter(Boolean);
  });

  app.get("/api/admin/highlights/candidates", async (request) => {
    requireAdminAuth(request);
    if (!ctx.prisma) throw new HttpError(503, "DATABASE_REQUIRED", "Highlights benötigen die Datenbank.");
    const query = parseOrThrow(candidateQuerySchema, request.query);
    const needle = String(query.query || "").toLowerCase();
    const types = query.type ? [query.type] : ["event", "offer", "restaurant"];
    const candidates: any[] = [];

    if (types.includes("event")) {
      const rows = await ctx.prisma.event.findMany({
        where: { active: true, provider: { approvalStatus: "approved" } },
        include: { provider: true, occurrenceCancellations: true, scheduledOccurrences: true },
        orderBy: { startAt: "asc" },
        take: 250
      });
      for (const event of rows) {
        if (!getEventOccurrence(event, new Date())) continue;
        candidates.push({ type: "event", targetId: event.id, title: event.title, subtitle: event.provider.name, imageUrl: event.imageUrl || "" });
      }
    }
    if (types.includes("offer")) {
      const rows = await ctx.prisma.offer.findMany({
        where: { active: true, restaurant: { approvalStatus: "approved" } },
        include: { restaurant: true },
        orderBy: { updatedAt: "desc" },
        take: 250
      });
      candidates.push(...rows.map((offer) => ({
        type: "offer", targetId: offer.id, title: offer.title, subtitle: offer.restaurant.name, imageUrl: offer.imageUrl || ""
      })));
    }
    if (types.includes("restaurant")) {
      const rows = await ctx.prisma.restaurant.findMany({
        where: { approvalStatus: "approved" },
        orderBy: { name: "asc" },
        take: 500
      });
      for (const restaurant of rows) {
        const settings = await loadRestaurantSettings(restaurant.id);
        candidates.push({ type: "restaurant", targetId: restaurant.id, title: restaurant.name, subtitle: restaurant.postalCode, imageUrl: settings.logoUrl || "" });
      }
    }

    const existing = await ctx.prisma.featuredHighlight.findMany();
    const existingKeys = new Set(existing.map((row) => `${row.type}:${targetIdForHighlight(row)}`));
    return candidates
      .filter((item) => !needle || `${item.title} ${item.subtitle}`.toLowerCase().includes(needle))
      .map((item) => ({ ...item, highlighted: existingKeys.has(`${item.type}:${item.targetId}`) }))
      .slice(0, 300);
  });

  app.post("/api/admin/highlights", async (request) => {
    requireAdminAuth(request);
    if (!ctx.prisma) throw new HttpError(503, "DATABASE_REQUIRED", "Highlights benötigen die Datenbank.");
    const body = parseOrThrow(createHighlightSchema, request.body);
    await assertTargetExists(ctx, body.type, body.targetId);
    const relationData = body.type === "event"
      ? { eventId: body.targetId }
      : body.type === "offer"
        ? { offerId: body.targetId }
        : { restaurantId: body.targetId };
    try {
      const highestSortOrder = body.sortOrder === undefined
        ? await ctx.prisma.featuredHighlight.aggregate({ _max: { sortOrder: true } })
        : null;
      const row = await ctx.prisma.featuredHighlight.create({
        data: {
          type: body.type,
          ...relationData,
          active: body.active ?? true,
          sortOrder: body.sortOrder ?? ((highestSortOrder?._max.sortOrder ?? -10) + 10)
        }
      });
      return await serializeHighlight(ctx, row);
    } catch (error: any) {
      if (error?.code === "P2002") throw new HttpError(409, "HIGHLIGHT_EXISTS", "Dieser Inhalt ist bereits als Highlight angelegt.");
      throw error;
    }
  });

  app.patch("/api/admin/highlights/:id", async (request) => {
    requireAdminAuth(request);
    if (!ctx.prisma) throw new HttpError(503, "DATABASE_REQUIRED", "Highlights benötigen die Datenbank.");
    const { id } = request.params as { id: string };
    const body = parseOrThrow(updateHighlightSchema, request.body);
    const existing = await ctx.prisma.featuredHighlight.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Highlight wurde nicht gefunden.");
    const row = await ctx.prisma.featuredHighlight.update({ where: { id }, data: body });
    return await serializeHighlight(ctx, row);
  });

  app.post("/api/admin/highlights/:id/image", async (request) => {
    requireAdminAuth(request);
    if (!ctx.prisma) throw new HttpError(503, "DATABASE_REQUIRED", "Highlights benötigen die Datenbank.");
    const { id } = request.params as { id: string };
    const existing = await ctx.prisma.featuredHighlight.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Highlight wurde nicht gefunden.");
    const file = await request.file();
    if (!file) throw new HttpError(400, "IMAGE_REQUIRED", "Bitte ein Bild auswählen.");
    const allowed = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);
    const extension = allowed.get(file.mimetype);
    if (!extension) throw new HttpError(400, "INVALID_IMAGE", "Erlaubt sind JPG, PNG und WEBP.");
    const buffer = await file.toBuffer();
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new HttpError(400, "INVALID_IMAGE_SIZE", "Das Bild darf maximal 10 MB groß sein.");
    await mkdir(HIGHLIGHT_UPLOAD_DIR, { recursive: true });
    const fileName = `${id}-${Date.now()}${extension}`;
    await writeFile(path.join(HIGHLIGHT_UPLOAD_DIR, fileName), buffer);
    const imageUrl = `${HIGHLIGHT_UPLOAD_PREFIX}${fileName}`;
    const row = await ctx.prisma.featuredHighlight.update({ where: { id }, data: { customImageUrl: imageUrl } });
    await removeManagedImage(existing.customImageUrl);
    return await serializeHighlight(ctx, row);
  });

  app.delete("/api/admin/highlights/:id", async (request) => {
    requireAdminAuth(request);
    if (!ctx.prisma) throw new HttpError(503, "DATABASE_REQUIRED", "Highlights benötigen die Datenbank.");
    const { id } = request.params as { id: string };
    const existing = await ctx.prisma.featuredHighlight.findUnique({ where: { id } });
    if (!existing) return { ok: true };
    await ctx.prisma.featuredHighlight.delete({ where: { id } });
    await removeManagedImage(existing.customImageUrl);
    return { ok: true };
  });
};
