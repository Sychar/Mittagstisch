import { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { AppContext } from "../context";
import { DigitalMenuService, DigitalMenuServiceError } from "../services/digitalMenuService";
import { haversineKm } from "../services/geoService";
import { MealSlot, Tag } from "../types";
import { requireAuth } from "../utils/auth";
import { HttpError, parseOrThrow } from "../utils/http";

const mealSlotSchema = z.enum(["breakfast", "lunch", "dinner"]);

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().min(6),
  address: z.string().min(4),
  postalCode: z.string().min(4),
  mealSlots: z.array(mealSlotSchema).min(1).optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional()
});

const updateRestaurantProfileSchema = z
  .object({
    mealSlots: z.array(mealSlotSchema).min(1).optional(),
    tableReservationEnabled: z.boolean().optional(),
    cuisineTypes: z.array(z.string().min(2).max(40)).max(20).optional()
  })
  .refine(
    (value) =>
      value.mealSlots !== undefined ||
      value.tableReservationEnabled !== undefined ||
      value.cuisineTypes !== undefined,
    "At least one field must be provided"
  );

const discoverRestaurantsSchema = z.object({
  postalCode: z.string().min(4),
  radiusKm: z.coerce.number().positive().max(50).optional(),
  mealSlot: mealSlotSchema.optional()
});

const createOfferSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(2),
  price: z.coerce.number().positive(),
  tags: z.array(z.enum(["vegan", "vegetarian", "classic"])).min(1).optional(),
  imageUrl: z.string().url().optional(),
  mealSlot: mealSlotSchema.optional(),
  active: z.boolean().optional(),
  preorderEnabled: z.boolean().optional()
});

const updateOfferSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().min(2).optional(),
  price: z.coerce.number().positive().optional(),
  tags: z.array(z.enum(["vegan", "vegetarian", "classic"])).optional(),
  imageUrl: z.string().url().optional(),
  mealSlot: mealSlotSchema.optional(),
  active: z.boolean().optional(),
  preorderEnabled: z.boolean().optional()
});

const updateOrderSchema = z.object({
  status: z.enum(["confirmed", "cancelled"])
});

const createReservationSchema = z.object({
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(6).max(40).optional(),
  partySize: z.coerce.number().int().positive().max(20),
  reservationTime: z.string().min(5),
  mealSlot: mealSlotSchema.optional(),
  note: z.string().max(500).optional()
});

const updateReservationSchema = z.object({
  status: z.enum(["confirmed", "cancelled"])
});
const saveDigitalMenuSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1).optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      price: z.union([z.coerce.number(), z.string()]),
      category: z.string().min(1)
    })
  )
});

const MAX_MENU_FILE_SIZE = 10 * 1024 * 1024;
const MENU_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "menus");
const MENU_UPLOAD_PREFIX = "/uploads/menus/";
const OFFER_IMAGE_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "offers");
const OFFER_IMAGE_UPLOAD_PREFIX = "/uploads/offers/";
const DIGITAL_MENU_STORAGE_DIR = path.resolve(process.cwd(), "uploads", "digital-menus");
const RESTAURANT_SETTINGS_DIR = path.resolve(process.cwd(), "uploads", "restaurant-settings");
const RESTAURANT_RESERVATIONS_FILE = path.resolve(process.cwd(), "uploads", "reservations.json");
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
const digitalMenuService = new DigitalMenuService();
const digitalMenuCategories = ["Vegan", "Vegetarisch", "Normal"] as const;
type DigitalMenuCategory = (typeof digitalMenuCategories)[number];
type ReservationStatus = "pending" | "confirmed" | "cancelled";
type StoredDigitalMenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: DigitalMenuCategory;
};
type StoredRestaurantSettings = {
  tableReservationEnabled: boolean;
  cuisineTypes: string[];
  updatedAt?: string;
};
type StoredReservation = {
  id: string;
  restaurantId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  partySize: number;
  reservationTime: string;
  mealSlot: MealSlot;
  note?: string;
  status: ReservationStatus;
  createdAt: string;
  updatedAt: string;
};

const isAllowedMenuMime = (mimeType: string): boolean => {
  const allowed = new Set([
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp"
  ]);
  return allowed.has(mimeType.toLowerCase());
};

const isAllowedOfferImageMime = (mimeType: string): boolean => {
  const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
  return allowed.has(mimeType.toLowerCase());
};

const extensionFromMime = (mimeType: string, originalName?: string): string => {
  const fromMime: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
  };
  const mapped = fromMime[mimeType.toLowerCase()];
  if (mapped) return mapped;
  if (!originalName) return ".bin";
  const ext = path.extname(originalName).toLowerCase();
  if (!ext || ext.length > 8) return ".bin";
  return ext;
};

const toPublicUploadUrl = (
  request: { headers: Record<string, unknown>; protocol?: string },
  prefix: string,
  fileName: string
): string => {
  if (PUBLIC_BASE_URL) {
    return `${PUBLIC_BASE_URL}${prefix}${fileName}`;
  }

  const host = typeof request.headers.host === "string" ? request.headers.host : "";
  const forwarded = request.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const protocol = typeof forwardedProto === "string" ? forwardedProto : request.protocol ?? "http";
  if (!host) {
    return `${prefix}${fileName}`;
  }
  return `${protocol}://${host}${prefix}${fileName}`;
};

const resolveStoredMenuFile = (menuUrl?: string): string | null => {
  if (!menuUrl) return null;

  let pathname = "";
  try {
    pathname = new URL(menuUrl).pathname;
  } catch {
    pathname = menuUrl;
  }

  if (!pathname.startsWith(MENU_UPLOAD_PREFIX)) return null;
  const fileName = pathname.slice(MENU_UPLOAD_PREFIX.length);
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    return null;
  }

  return path.join(MENU_UPLOAD_DIR, fileName);
};

const getDigitalMenuPath = (restaurantId: string): string => {
  const safeId = restaurantId.trim();
  if (!/^[a-zA-Z0-9-]+$/.test(safeId)) {
    throw new HttpError(400, "INVALID_INPUT", "Invalid restaurant id");
  }
  return path.join(DIGITAL_MENU_STORAGE_DIR, `${safeId}.json`);
};

const getRestaurantSettingsPath = (restaurantId: string): string => {
  const safeId = restaurantId.trim();
  if (!/^[a-zA-Z0-9-]+$/.test(safeId)) {
    throw new HttpError(400, "INVALID_INPUT", "Invalid restaurant id");
  }
  return path.join(RESTAURANT_SETTINGS_DIR, `${safeId}.json`);
};

const loadRestaurantSettings = async (restaurantId: string): Promise<StoredRestaurantSettings> => {
  const filePath = getRestaurantSettingsPath(restaurantId);
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as {
      tableReservationEnabled?: unknown;
      cuisineTypes?: unknown;
      updatedAt?: unknown;
    };
    const cuisineTypesInput = Array.isArray(parsed?.cuisineTypes) ? parsed.cuisineTypes : [];
    const cuisineTypes = Array.from(
      new Set(
        cuisineTypesInput
          .map((entry) => String(entry || "").trim())
          .filter((entry) => entry.length >= 2)
      )
    );
    return {
      tableReservationEnabled: Boolean(parsed?.tableReservationEnabled),
      cuisineTypes,
      updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : undefined
    };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "ENOENT") {
      return {
        tableReservationEnabled: false,
        cuisineTypes: []
      };
    }
    throw error;
  }
};

const saveRestaurantSettings = async (
  restaurantId: string,
  patch: Partial<StoredRestaurantSettings>
): Promise<StoredRestaurantSettings> => {
  const current = await loadRestaurantSettings(restaurantId);
  const nextCuisineTypes =
    patch.cuisineTypes !== undefined
      ? Array.from(
          new Set(
            patch.cuisineTypes
              .map((entry) => String(entry || "").trim())
              .filter((entry) => entry.length >= 2)
          )
        )
      : current.cuisineTypes;
  const next: StoredRestaurantSettings = {
    tableReservationEnabled:
      patch.tableReservationEnabled !== undefined
        ? Boolean(patch.tableReservationEnabled)
        : current.tableReservationEnabled,
    cuisineTypes: nextCuisineTypes,
    updatedAt: new Date().toISOString()
  };
  const filePath = getRestaurantSettingsPath(restaurantId);
  await mkdir(RESTAURANT_SETTINGS_DIR, { recursive: true });
  await writeFile(filePath, JSON.stringify(next, null, 2), "utf-8");
  return next;
};

const loadReservations = async (): Promise<StoredReservation[]> => {
  try {
    const raw = await readFile(RESTAURANT_RESERVATIONS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as { items?: unknown };
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const normalized: StoredReservation[] = [];

    for (const entry of items) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Partial<StoredReservation>;
      if (
        !record.id ||
        !record.restaurantId ||
        !record.customerName ||
        !record.customerEmail ||
        !record.reservationTime ||
        !record.mealSlot ||
        !record.status
      ) {
        continue;
      }
      const reservationTime = new Date(record.reservationTime);
      if (Number.isNaN(reservationTime.getTime())) {
        continue;
      }

      normalized.push({
        id: String(record.id),
        restaurantId: String(record.restaurantId),
        customerName: String(record.customerName),
        customerEmail: String(record.customerEmail),
        customerPhone: record.customerPhone ? String(record.customerPhone) : undefined,
        partySize: Number(record.partySize || 1),
        reservationTime: reservationTime.toISOString(),
        mealSlot: record.mealSlot as MealSlot,
        note: record.note ? String(record.note) : undefined,
        status:
          record.status === "confirmed" || record.status === "cancelled"
            ? record.status
            : "pending",
        createdAt: record.createdAt ? String(record.createdAt) : new Date().toISOString(),
        updatedAt: record.updatedAt ? String(record.updatedAt) : new Date().toISOString()
      });
    }

    return normalized;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const saveReservations = async (items: StoredReservation[]): Promise<void> => {
  await mkdir(path.dirname(RESTAURANT_RESERVATIONS_FILE), { recursive: true });
  await writeFile(
    RESTAURANT_RESERVATIONS_FILE,
    JSON.stringify({ items }, null, 2),
    "utf-8"
  );
};

const normalizeDigitalCategory = (value: unknown): DigitalMenuCategory => {
  const lowered = String(value || "")
    .trim()
    .toLowerCase();
  if (lowered.includes("vegan")) return "Vegan";
  if (lowered.includes("vegetar")) return "Vegetarisch";
  return "Normal";
};

const normalizeDigitalPrice = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100) / 100;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  let normalized = text
    .replace(/[€\s]/g, "")
    .replace(/,-/g, "")
    .replace(/,--/g, "");

  if (normalized.includes(",") && normalized.includes(".")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(/,/g, ".");
  }

  const match = normalized.match(/\d+(?:\.\d{1,2})?/);
  if (!match) return null;

  const number = Number(match[0]);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number * 100) / 100;
};

const normalizeStoredDigitalItems = (
  items: Array<{
    id?: string;
    name: string;
    description?: string;
    price: unknown;
    category: string;
  }>
): { items: StoredDigitalMenuItem[]; duplicatesRemoved: number; droppedInvalid: number } => {
  const seen = new Set<string>();
  const normalized: StoredDigitalMenuItem[] = [];
  let duplicatesRemoved = 0;
  let droppedInvalid = 0;

  for (const entry of items) {
    const name = String(entry.name || "").trim();
    const price = normalizeDigitalPrice(entry.price);
    if (!name || price === null) {
      droppedInvalid += 1;
      continue;
    }

    const category = normalizeDigitalCategory(entry.category);
    const description = String(entry.description || "").trim();
    const dedupeKey = `${name.toLowerCase()}|${price.toFixed(2)}|${category}`;
    if (seen.has(dedupeKey)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(dedupeKey);

    normalized.push({
      id: entry.id?.trim() || randomUUID(),
      name,
      description: description || undefined,
      price,
      category
    });
  }

  const categoryOrder: Record<DigitalMenuCategory, number> = {
    Vegan: 0,
    Vegetarisch: 1,
    Normal: 2
  };
  normalized.sort((a, b) => {
    const categoryDiff = categoryOrder[a.category] - categoryOrder[b.category];
    if (categoryDiff !== 0) return categoryDiff;
    return a.name.localeCompare(b.name, "de", { sensitivity: "base" });
  });

  return {
    items: normalized,
    duplicatesRemoved,
    droppedInvalid
  };
};

const loadStoredDigitalMenu = async (
  restaurantId: string
): Promise<{ items: StoredDigitalMenuItem[]; updatedAt: string | null }> => {
  const filePath = getDigitalMenuPath(restaurantId);
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as {
      menu?: {
        items?: Array<{
          id?: string;
          name: string;
          description?: string;
          price: unknown;
          category: string;
        }>;
      };
      updatedAt?: string;
    };
    const itemsInput = Array.isArray(parsed?.menu?.items) ? parsed.menu.items : [];
    const normalized = normalizeStoredDigitalItems(itemsInput);
    return {
      items: normalized.items,
      updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : null
    };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "ENOENT") {
      return { items: [], updatedAt: null };
    }
    throw error;
  }
};

const readStreamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
      continue;
    }
    chunks.push(Buffer.from(chunk as string));
  }

  return Buffer.concat(chunks);
};

export const registerRestaurantRoutes = (app: FastifyInstance, ctx: AppContext) => {
  app.post("/api/restaurants/register", async (request) => {
    const body = parseOrThrow(registerSchema, request.body);

    try {
      const restaurant = await ctx.restaurantService.register({
        ...body,
        mealSlots: body.mealSlots as MealSlot[] | undefined
      });
      return { restaurant };
    } catch (error) {
      if (error instanceof Error && error.message === "EMAIL_EXISTS") {
        throw new HttpError(409, "EMAIL_EXISTS", "Email already registered");
      }
      if (error instanceof Error && error.message === "POSTAL_CODE_UNKNOWN") {
        throw new HttpError(400, "POSTAL_CODE_UNKNOWN", "Unknown postal code");
      }
      throw error;
    }
  });

  app.get("/api/restaurants/discover", async (request) => {
    const query = parseOrThrow(discoverRestaurantsSchema, request.query);
    const radiusKm = query.radiusKm ?? Number(process.env.DEFAULT_RADIUS_KM ?? 10);
    const mealSlot = (query.mealSlot as MealSlot | undefined) ?? "lunch";
    const origin = ctx.geoService.getCoordinates(query.postalCode);
    if (!origin) {
      throw new HttpError(400, "POSTAL_CODE_UNKNOWN", "Unknown postal code");
    }

    const restaurants = await ctx.restaurantRepo.list();
    const offers = await ctx.offerRepo.listActive();
    const mealSlotOffers = offers
      .filter((offer) => offer.mealSlot === mealSlot)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const rows = await Promise.all(
      restaurants.map(async (restaurant) => {
        if (restaurant.approvalStatus !== "approved") return null;
        if (!restaurant.mealSlots.includes(mealSlot)) return null;

        const distanceKm = haversineKm(origin, {
          lat: restaurant.lat,
          lng: restaurant.lng
        });
        if (distanceKm > radiusKm) return null;

        const restaurantOffers = mealSlotOffers.filter(
          (offer) => offer.restaurantId === restaurant.id
        );
        const featuredOffer = restaurantOffers[0];
        const settings = await loadRestaurantSettings(restaurant.id);
        let hasDigitalMenu = false;
        try {
          const digitalMenu = await loadStoredDigitalMenu(restaurant.id);
          hasDigitalMenu = digitalMenu.items.length > 0;
        } catch {
          hasDigitalMenu = false;
        }

        return {
          restaurant: {
            ...ctx.restaurantService.toPublic(restaurant),
            cuisineTypes: settings.cuisineTypes
          },
          distanceKm: Number(distanceKm.toFixed(2)),
          mealSlot,
          tableReservationEnabled: settings.tableReservationEnabled,
          cuisineTypes: settings.cuisineTypes,
          hasDigitalMenu,
          ratingAverage: 0,
          ratingCount: 0,
          activeOfferCount: restaurantOffers.length,
          featuredOffer: featuredOffer
            ? {
                id: featuredOffer.id,
                title: featuredOffer.title,
                description: featuredOffer.description,
                price: featuredOffer.price,
                tags: featuredOffer.tags,
                imageUrl: featuredOffer.imageUrl,
                mealSlot: featuredOffer.mealSlot,
                preorderEnabled: featuredOffer.preorderEnabled
              }
            : null
        };
      })
    );

    return rows
      .filter((item) => Boolean(item))
      .sort((a, b) => (a?.distanceKm ?? Number.POSITIVE_INFINITY) - (b?.distanceKm ?? Number.POSITIVE_INFINITY));
  });

  app.get("/api/restaurants/me", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const restaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!restaurant) {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }
    const settings = await loadRestaurantSettings(restaurantId);
    return {
      restaurant: {
        ...ctx.restaurantService.toPublic(restaurant),
        tableReservationEnabled: settings.tableReservationEnabled,
        cuisineTypes: settings.cuisineTypes
      }
    };
  });

  app.patch("/api/restaurants/me", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(updateRestaurantProfileSchema, request.body);

    try {
      const currentRestaurant = await ctx.restaurantRepo.findById(restaurantId);
      if (!currentRestaurant) {
        throw new Error("RESTAURANT_NOT_FOUND");
      }

      const restaurant =
        body.mealSlots !== undefined
          ? await ctx.restaurantService.setMealSlots({
              restaurantId,
              mealSlots: body.mealSlots as MealSlot[]
            })
          : ctx.restaurantService.toPublic(currentRestaurant);

      const settings =
        body.tableReservationEnabled !== undefined || body.cuisineTypes !== undefined
          ? await saveRestaurantSettings(restaurantId, {
              tableReservationEnabled: body.tableReservationEnabled,
              cuisineTypes: body.cuisineTypes
            })
          : await loadRestaurantSettings(restaurantId);

      return {
        restaurant: {
          ...restaurant,
          tableReservationEnabled: settings.tableReservationEnabled,
          cuisineTypes: settings.cuisineTypes
        }
      };
    } catch (error) {
      if (error instanceof Error && error.message === "RESTAURANT_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
      }
      throw error;
    }
  });

  app.get("/api/restaurants/offers", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    return await ctx.offerService.listByRestaurant(restaurantId);
  });

  app.post("/api/restaurants/offers", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(createOfferSchema, request.body);

    const tags: Tag[] = body.tags && body.tags.length ? body.tags : ["classic"];

    try {
      return await ctx.offerService.createOffer({
        restaurantId,
        title: body.title,
        description: body.description,
        price: body.price,
        tags,
        imageUrl: body.imageUrl,
        mealSlot: body.mealSlot as MealSlot | undefined,
        active: body.active,
        preorderEnabled: body.preorderEnabled
      });
    } catch (error) {
      if (error instanceof Error && error.message === "RESTAURANT_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
      }
      if (error instanceof Error && error.message === "MEAL_SLOT_NOT_ENABLED") {
        throw new HttpError(400, "MEAL_SLOT_NOT_ENABLED", "Meal slot is not enabled for this restaurant");
      }
      throw error;
    }
  });

  app.patch("/api/restaurants/offers/:id", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(updateOfferSchema, request.body);
    const { id } = request.params as { id: string };

    if (!Object.keys(body).length) {
      throw new HttpError(400, "INVALID_INPUT", "At least one field must be provided");
    }

    const tags: Tag[] | undefined = body.tags
      ? body.tags.length
        ? body.tags
        : ["classic"]
      : undefined;

    try {
      return await ctx.offerService.updateOffer(restaurantId, id, {
        ...body,
        mealSlot: body.mealSlot as MealSlot | undefined,
        tags
      });
    } catch (error) {
      if (error instanceof Error && error.message === "OFFER_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Offer not found");
      }
      if (error instanceof Error && error.message === "FORBIDDEN") {
        throw new HttpError(403, "FORBIDDEN", "Not allowed to edit this offer");
      }
      if (error instanceof Error && error.message === "RESTAURANT_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
      }
      if (error instanceof Error && error.message === "MEAL_SLOT_NOT_ENABLED") {
        throw new HttpError(400, "MEAL_SLOT_NOT_ENABLED", "Meal slot is not enabled for this restaurant");
      }
      throw error;
    }
  });

  app.get("/api/restaurants/orders", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    return await ctx.orderService.listByRestaurant(restaurantId);
  });

  app.patch("/api/restaurants/orders/:id", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(updateOrderSchema, request.body);
    const { id } = request.params as { id: string };

    try {
      return await ctx.orderService.updateStatus(restaurantId, id, body.status);
    } catch (error) {
      if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Order not found");
      }
      if (error instanceof Error && error.message === "FORBIDDEN") {
        throw new HttpError(403, "FORBIDDEN", "Not allowed to edit this order");
      }
      throw error;
    }
  });

  app.post("/api/restaurants/menu", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const fileRequest = request as typeof request & {
      file: (options?: unknown) => Promise<{
        mimetype: string;
        filename?: string;
        file: NodeJS.ReadableStream;
      } | undefined>;
    };

    let part;
    try {
      part = await fileRequest.file({
        limits: {
          files: 1,
          fileSize: MAX_MENU_FILE_SIZE
        }
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "FST_REQ_FILE_TOO_LARGE") {
        throw new HttpError(413, "FILE_TOO_LARGE", "File is too large (max 10 MB)");
      }
      throw error;
    }

    if (!part) {
      throw new HttpError(400, "INVALID_INPUT", "No file uploaded");
    }

    const mimeType = (part.mimetype || "").toLowerCase();
    if (!isAllowedMenuMime(mimeType)) {
      throw new HttpError(
        400,
        "UNSUPPORTED_FILE_TYPE",
        "Only PDF or image files (JPG, PNG, WEBP) are allowed"
      );
    }

    await mkdir(MENU_UPLOAD_DIR, { recursive: true });

    const extension = extensionFromMime(mimeType, part.filename);
    const fileName = `${restaurantId}-${Date.now()}-${randomUUID()}${extension}`;
    const filePath = path.join(MENU_UPLOAD_DIR, fileName);
    await pipeline(part.file, createWriteStream(filePath));

    const menuUrl = toPublicUploadUrl(request, MENU_UPLOAD_PREFIX, fileName);
    const currentRestaurant = await ctx.restaurantRepo.findById(restaurantId);
    const previousFile = resolveStoredMenuFile(currentRestaurant?.menuUrl);

    let restaurant;
    try {
      restaurant = await ctx.restaurantService.setMenuFile({
        restaurantId,
        menuUrl,
        menuMimeType: mimeType
      });
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      if (error instanceof Error && error.message === "RESTAURANT_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
      }
      throw error;
    }

    if (previousFile && previousFile !== filePath) {
      await unlink(previousFile).catch(() => undefined);
    }

    return {
      menuUrl,
      menuMimeType: mimeType,
      restaurant
    };
  });

  app.post("/api/restaurants/menu/digitalize", async (request) => {
    requireAuth(request, ctx.sessionRepo);
    const fileRequest = request as typeof request & {
      file: (options?: unknown) => Promise<{
        mimetype: string;
        filename?: string;
        file: NodeJS.ReadableStream;
      } | undefined>;
    };

    let part;
    try {
      part = await fileRequest.file({
        limits: {
          files: 1,
          fileSize: MAX_MENU_FILE_SIZE
        }
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "FST_REQ_FILE_TOO_LARGE") {
        throw new HttpError(413, "FILE_TOO_LARGE", "File is too large (max 10 MB)");
      }
      throw error;
    }

    if (!part) {
      throw new HttpError(400, "INVALID_INPUT", "No file uploaded");
    }

    const mimeType = (part.mimetype || "").toLowerCase();
    if (!isAllowedMenuMime(mimeType)) {
      throw new HttpError(
        400,
        "UNSUPPORTED_FILE_TYPE",
        "Only PDF or image files (JPG, PNG, WEBP) are allowed"
      );
    }

    const buffer = await readStreamToBuffer(part.file);
    const filename = part.filename?.trim() || `menu-${Date.now()}`;

    try {
      return await digitalMenuService.analyzeMenuFile({
        buffer,
        filename,
        mimeType
      });
    } catch (error) {
      if (error instanceof DigitalMenuServiceError) {
        if (error.code === "OPENAI_NOT_CONFIGURED") {
          throw new HttpError(500, "OPENAI_NOT_CONFIGURED", error.message);
        }
        if (error.code === "OPENAI_UPLOAD_FAILED" || error.code === "OPENAI_ANALYSIS_FAILED") {
          throw new HttpError(502, "OPENAI_ANALYSIS_FAILED", error.message);
        }
        if (error.code === "MENU_UNREADABLE") {
          throw new HttpError(
            422,
            "MENU_UNREADABLE",
            "Datei konnte nicht sicher gelesen werden. Bitte bessere Qualitaet hochladen."
          );
        }
      }
      throw error;
    }
  });

  app.get("/api/restaurants/menu/digital", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const stored = await loadStoredDigitalMenu(restaurantId);
    return {
      menu: {
        items: stored.items
      },
      updatedAt: stored.updatedAt
    };
  });

  app.put("/api/restaurants/menu/digital", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(saveDigitalMenuSchema, request.body);
    const normalized = normalizeStoredDigitalItems(
      body.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category
      }))
    );

    const filePath = getDigitalMenuPath(restaurantId);
    const updatedAt = new Date().toISOString();
    await mkdir(DIGITAL_MENU_STORAGE_DIR, { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify(
        {
          menu: {
            items: normalized.items
          },
          updatedAt
        },
        null,
        2
      ),
      "utf-8"
    );

    const warnings: string[] = [];
    if (normalized.duplicatesRemoved > 0) {
      warnings.push(`${normalized.duplicatesRemoved} doppelte Eintraege wurden entfernt.`);
    }
    if (normalized.droppedInvalid > 0) {
      warnings.push(`${normalized.droppedInvalid} ungueltige Eintraege wurden entfernt.`);
    }

    return {
      menu: {
        items: normalized.items
      },
      updatedAt,
      warnings
    };
  });

  app.get("/api/restaurants/:id/menu/digital", async (request) => {
    const { id } = request.params as { id: string };
    const restaurant = await ctx.restaurantRepo.findById(id);
    if (!restaurant || restaurant.approvalStatus !== "approved") {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }
    const stored = await loadStoredDigitalMenu(id);
    return {
      menu: {
        items: stored.items
      },
      updatedAt: stored.updatedAt
    };
  });

  app.post("/api/restaurants/:id/reservations", async (request) => {
    const { id: restaurantId } = request.params as { id: string };
    const body = parseOrThrow(createReservationSchema, request.body);
    const restaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!restaurant || restaurant.approvalStatus !== "approved") {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }

    const mealSlot = (body.mealSlot as MealSlot | undefined) ?? "lunch";
    if (!restaurant.mealSlots.includes(mealSlot)) {
      throw new HttpError(400, "MEAL_SLOT_NOT_ENABLED", "Meal slot is not enabled for this restaurant");
    }

    const settings = await loadRestaurantSettings(restaurantId);
    if (!settings.tableReservationEnabled) {
      throw new HttpError(400, "RESERVATION_DISABLED", "Table reservation is disabled for this restaurant");
    }

    const reservationTime = new Date(body.reservationTime);
    if (Number.isNaN(reservationTime.getTime())) {
      throw new HttpError(400, "INVALID_TIME", "Invalid reservation time");
    }

    const all = await loadReservations();
    const nowIso = new Date().toISOString();
    const reservation: StoredReservation = {
      id: randomUUID(),
      restaurantId,
      customerName: body.customerName.trim(),
      customerEmail: body.customerEmail.trim().toLowerCase(),
      customerPhone: body.customerPhone?.trim() || undefined,
      partySize: body.partySize,
      reservationTime: reservationTime.toISOString(),
      mealSlot,
      note: body.note?.trim() || undefined,
      status: "pending",
      createdAt: nowIso,
      updatedAt: nowIso
    };
    all.push(reservation);
    await saveReservations(all);
    return reservation;
  });

  app.get("/api/restaurants/reservations", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const items = await loadReservations();
    return items
      .filter((entry) => entry.restaurantId === restaurantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  app.patch("/api/restaurants/reservations/:id", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(updateReservationSchema, request.body);
    const { id } = request.params as { id: string };
    const items = await loadReservations();
    const index = items.findIndex((entry) => entry.id === id);
    if (index < 0) {
      throw new HttpError(404, "NOT_FOUND", "Reservation not found");
    }
    if (items[index].restaurantId !== restaurantId) {
      throw new HttpError(403, "FORBIDDEN", "Not allowed to edit this reservation");
    }
    items[index] = {
      ...items[index],
      status: body.status as ReservationStatus,
      updatedAt: new Date().toISOString()
    };
    await saveReservations(items);
    return items[index];
  });

  app.post("/api/restaurants/offers/image", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const fileRequest = request as typeof request & {
      file: (options?: unknown) => Promise<{
        mimetype: string;
        filename?: string;
        file: NodeJS.ReadableStream;
      } | undefined>;
    };

    let part;
    try {
      part = await fileRequest.file({
        limits: {
          files: 1,
          fileSize: MAX_MENU_FILE_SIZE
        }
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "FST_REQ_FILE_TOO_LARGE") {
        throw new HttpError(413, "FILE_TOO_LARGE", "File is too large (max 10 MB)");
      }
      throw error;
    }

    if (!part) {
      throw new HttpError(400, "INVALID_INPUT", "No file uploaded");
    }

    const mimeType = (part.mimetype || "").toLowerCase();
    if (!isAllowedOfferImageMime(mimeType)) {
      throw new HttpError(
        400,
        "UNSUPPORTED_FILE_TYPE",
        "Only image files (JPG, PNG, WEBP) are allowed for offer images"
      );
    }

    await mkdir(OFFER_IMAGE_UPLOAD_DIR, { recursive: true });

    const extension = extensionFromMime(mimeType, part.filename);
    const fileName = `${restaurantId}-offer-${Date.now()}-${randomUUID()}${extension}`;
    const filePath = path.join(OFFER_IMAGE_UPLOAD_DIR, fileName);
    await pipeline(part.file, createWriteStream(filePath));

    const imageUrl = toPublicUploadUrl(request, OFFER_IMAGE_UPLOAD_PREFIX, fileName);
    return { imageUrl, mimeType };
  });
};
