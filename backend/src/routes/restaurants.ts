import { FastifyInstance, FastifyRequest } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { AppContext } from "../context";
import { DigitalMenuService, DigitalMenuServiceError } from "../services/digitalMenuService";
import { SupportChatServiceError } from "../services/supportChatService";
import { WebsiteMenuDraft, WebsiteSyncError, WebsiteSyncResult, WebsiteSyncSection } from "../services/websiteSyncService";
import { haversineKm } from "../services/geoService";
import {
  createMenuDiagnosticId,
  sanitizeMenuFileName,
  writeMenuDiagnostic
} from "../services/menuDiagnostics";
import {
  assertMenuBatchSize,
  MAX_MENU_FILE_SIZE,
  MAX_MENU_FILES,
  MenuUploadError,
  normalizeMenuUpload,
  readMenuUploadStream
} from "../services/menuUploadService";
import { MealSlot, Tag } from "../types";
import { requireAuth } from "../utils/auth";
import { HttpError, parseOrThrow } from "../utils/http";

const mealSlotSchema = z.enum(["breakfast", "lunch", "dinner"]);
const offerTagSchema = z.enum(["vegan", "vegetarian", "classic", "coffee", "icecream"]);
const reservationModeSchema = z.enum(["disabled", "app", "external"]);
const lunchWeekdaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const lunchScheduleModeSchema = z.enum(["dateRange", "weekdays", "openingHours"]);
const openingHoursPeriodSchema = z.object({
  openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
});
const openingHoursDaySchema = z
  .object({
    enabled: z.boolean().optional(),
    openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    periods: z.array(openingHoursPeriodSchema).max(2).optional(),
    // Website sync uses this when a public page says "bis Ende". The internal
    // closeTime remains 00:00 so existing opening-status calculations work.
    openEnded: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    const periods = value.periods || [];
    const toMinutes = (time: string) => {
      const [hours, minutes] = time.split(":").map(Number);
      return hours * 60 + minutes;
    };
    const intervals = periods.map((period, index) => {
      const start = toMinutes(period.openTime);
      const close = toMinutes(period.closeTime);
      if (start === close) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["periods", index],
          message: "Öffnungs- und Schließzeit dürfen nicht gleich sein."
        });
      }
      return { start, end: close <= start ? close + 24 * 60 : close };
    });
    if (intervals.length === 2 && intervals[0].start < intervals[1].end && intervals[1].start < intervals[0].end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periods"],
        message: "Die beiden Öffnungszeiten dürfen sich nicht überschneiden."
      });
    }
  });
const openingHoursSchema = z.object({
  mon: openingHoursDaySchema.optional(),
  tue: openingHoursDaySchema.optional(),
  wed: openingHoursDaySchema.optional(),
  thu: openingHoursDaySchema.optional(),
  fri: openingHoursDaySchema.optional(),
  sat: openingHoursDaySchema.optional(),
  sun: openingHoursDaySchema.optional()
});
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoWeekKeyPattern = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const specialClosureEntrySchema = z.object({
  date: z.string().regex(isoDatePattern),
  reason: z.string().trim().min(2).max(200)
});
const specialClosuresSchema = z.array(specialClosureEntrySchema).max(120);
const socialLinkSchema = z.object({
  platform: z.string().trim().min(2).max(40),
  url: z.string().trim().min(3).max(500)
});
const socialLinksSchema = z.array(socialLinkSchema).max(12);
const providerScopeSchema = z.enum(["food", "events", "catering"]);
const eventProfileSchema = z.object({
  offeringsText: z.string().trim().max(2000).optional(),
  reservationUrl: z.string().trim().max(500).optional(),
  contactUrl: z.string().trim().max(500).optional(),
  contactEmail: z.string().trim().max(320).optional(),
  contactPhone: z.string().trim().max(40).optional()
});
const cateringProfileSchema = z.object({
  offeringsText: z.string().trim().max(2000).optional(),
  contactUrl: z.string().trim().max(500).optional(),
  contactEmail: z.string().trim().max(320).optional(),
  contactPhone: z.string().trim().max(40).optional()
});
const supportChatMessageSchema = z.object({
  message: z.string().trim().min(2).max(2000)
});
const websiteSyncStartSchema = z.object({
  websiteUrl: z.string().trim().max(500).optional()
});
const websiteSyncApplySchema = z.object({
  draftId: z.string().uuid(),
  section: z.enum(["openingHours", "breakfast", "lunch", "dinner", "drinks", "unclassified", "regular"]),
  action: z.enum(["replace", "append", "skip"]),
  // New source-aware clients send this. It prevents one website PDF from
  // accidentally applying every other source that shares the same area.
  sourceId: z.string().trim().min(1).max(160).optional(),
  targetSection: z.enum(["breakfast", "lunch", "dinner", "drinks"]).optional(),
  selectedItemIds: z.array(z.string().trim().min(1).max(160)).max(500).optional(),
  priceOverrides: z.record(z.number().positive().max(99999)).optional().refine(
    (value) => !value || Object.keys(value).length <= 500,
    "Zu viele Preisänderungen."
  )
});

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().min(6),
  address: z.string().min(4),
  postalCode: z.string().min(4),
  termsAccepted: z.boolean().refine((value) => value === true, "AGB muss akzeptiert werden"),
  privacyAccepted: z.boolean().refine((value) => value === true, "Datenschutz muss akzeptiert werden"),
  providerScopes: z.array(providerScopeSchema).min(1).max(3).optional(),
  mealSlots: z.array(mealSlotSchema).optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional()
});

const updateRestaurantProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(6).max(40).optional(),
    address: z.string().trim().min(4).max(240).optional(),
    postalCode: z.string().trim().min(4).max(12).optional(),
    mealSlots: z.array(mealSlotSchema).optional(),
    tableReservationEnabled: z.boolean().optional(),
    reservationMode: reservationModeSchema.optional(),
    reservationExternalLink: z.string().trim().max(500).optional(),
    reservationExternalEmail: z.string().trim().max(320).optional(),
    reservationExternalPhone: z.string().trim().max(40).optional(),
    cuisineTypes: z.array(z.string().min(2).max(40)).max(20).optional(),
    openingHours: openingHoursSchema.optional(),
    specialClosures: specialClosuresSchema.optional(),
    aboutText: z.string().trim().max(2000).optional(),
    websiteSyncUrl: z.string().trim().max(500).optional(),
    socialLinks: socialLinksSchema.optional(),
    providerScopes: z.array(providerScopeSchema).min(1).max(3).optional(),
    eventProfile: eventProfileSchema.optional(),
    eventSetupCompletedAt: z.string().trim().datetime().nullable().optional(),
    cateringProfile: cateringProfileSchema.optional(),
    cateringSetupCompletedAt: z.string().trim().datetime().nullable().optional()
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.email !== undefined ||
      value.phone !== undefined ||
      value.address !== undefined ||
      value.postalCode !== undefined ||
      value.mealSlots !== undefined ||
      value.tableReservationEnabled !== undefined ||
      value.reservationMode !== undefined ||
      value.reservationExternalLink !== undefined ||
      value.reservationExternalEmail !== undefined ||
      value.reservationExternalPhone !== undefined ||
      value.cuisineTypes !== undefined ||
      value.openingHours !== undefined ||
      value.specialClosures !== undefined ||
      value.aboutText !== undefined ||
      value.websiteSyncUrl !== undefined ||
      value.socialLinks !== undefined ||
      value.providerScopes !== undefined ||
      value.eventProfile !== undefined ||
      value.eventSetupCompletedAt !== undefined ||
      value.cateringProfile !== undefined ||
      value.cateringSetupCompletedAt !== undefined,
    "At least one field must be provided"
  );

const updateRestaurantOnboardingDraftSchema = z
  .object({
    mealSlots: z.array(mealSlotSchema).optional(),
    tableReservationEnabled: z.boolean().optional(),
    tableReservationChoiceMade: z.boolean().optional(),
    reservationMode: reservationModeSchema.optional(),
    reservationExternalLink: z.string().trim().max(500).optional(),
    reservationExternalEmail: z.string().trim().max(320).optional(),
    reservationExternalPhone: z.string().trim().max(40).optional(),
    cuisineTypes: z.array(z.string().min(2).max(40)).max(20).optional(),
    openingHours: openingHoursSchema.optional(),
    aboutText: z.string().trim().max(2000).optional(),
    lastStep: z.coerce.number().int().min(0).max(6).optional()
  })
  .refine(
    (value) =>
      value.mealSlots !== undefined ||
      value.tableReservationEnabled !== undefined ||
      value.tableReservationChoiceMade !== undefined ||
      value.reservationMode !== undefined ||
      value.reservationExternalLink !== undefined ||
      value.reservationExternalEmail !== undefined ||
      value.reservationExternalPhone !== undefined ||
      value.cuisineTypes !== undefined ||
      value.openingHours !== undefined ||
      value.aboutText !== undefined ||
      value.lastStep !== undefined,
    "At least one field must be provided"
  );

const discoverRestaurantsSchema = z
  .object({
    query: z.string().trim().min(2).optional(),
    postalCode: z.string().trim().min(2).optional(),
    radiusKm: z.coerce.number().positive().max(50).optional(),
    mealSlot: mealSlotSchema.optional()
  })
  .refine((value) => Boolean(value.query || value.postalCode), "query or postalCode required");
const discoverCateringSchema = z
  .object({
    query: z.string().trim().min(2).optional(),
    postalCode: z.string().trim().min(2).optional(),
    radiusKm: z.coerce.number().positive().max(50).optional()
  })
  .refine((value) => Boolean(value.query || value.postalCode), "query or postalCode required");
const cateringOfferInputSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(2000),
  price: z.coerce.number().positive().max(100000).nullable().optional(),
  imageUrls: z.array(z.string().url().max(500)).max(4).optional(),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional()
});
const cateringOfferUpdateSchema = cateringOfferInputSchema.partial();

const createOfferSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(2),
  price: z.coerce.number().positive(),
  tags: z.array(offerTagSchema).min(1).optional(),
  imageUrl: z.string().url().optional(),
  mealSlot: mealSlotSchema.optional(),
  active: z.boolean().optional(),
  preorderEnabled: z.boolean().optional()
});

const updateOfferSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().min(2).optional(),
  price: z.coerce.number().positive().optional(),
  tags: z.array(offerTagSchema).optional(),
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
const reviewReplySchema = z.object({
  text: z.string().trim().min(2).max(1000)
});
const reviewReportReasonSchema = z.enum([
  "fake_or_no_visit",
  "abusive_or_inappropriate",
  "wrong_restaurant",
  "privacy",
  "other"
]);
const reviewReportSchema = z.object({
  reason: reviewReportReasonSchema,
  note: z.string().trim().max(1000).optional()
});
const REVIEW_REPORT_REASON_LABELS: Record<z.infer<typeof reviewReportReasonSchema>, string> = {
  fake_or_no_visit: "Fake / kein echter Besuch",
  abusive_or_inappropriate: "Beleidigung oder unangemessener Inhalt",
  wrong_restaurant: "Falsches Restaurant",
  privacy: "Datenschutz / persönliche Daten",
  other: "Sonstiges"
};
const createSupportRequestSchema = z.object({
  message: z.string().trim().min(5).max(4000),
  source: z.string().trim().min(2).max(120).optional()
});
const registerPushTokenSchema = z.object({
  token: z.string().min(8).max(400),
  platform: z.enum(["ios", "android"])
});
const unregisterPushTokenSchema = z.object({
  token: z.string().min(8).max(400)
});
const saveDigitalMenuSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1).optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      price: z.union([z.coerce.number(), z.string()]),
      category: z.string().min(1),
      section: z.string().min(1).max(120).optional(),
      allergens: z.array(z.string().min(1).max(120)).max(20).optional()
    })
  ),
  allergens: z.array(z.string().min(1).max(120)).max(60).optional()
});
const saveLunchMenuSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1).optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      price: z.union([z.coerce.number(), z.string()]),
      category: z.string().min(1),
      section: z.string().min(1).max(120).optional(),
      allergens: z.array(z.string().min(1).max(120)).max(20).optional(),
      availableWeekdays: z.array(lunchWeekdaySchema).max(7).optional(),
      repeatWeekly: z.boolean().optional(),
      activeWeekKey: z.string().regex(isoWeekKeyPattern).nullable().optional(),
      availableDates: z.array(z.string().regex(isoDatePattern)).max(31).optional(),
      schedulePending: z.boolean().optional(),
      scheduleMode: lunchScheduleModeSchema.nullable().optional(),
      validFrom: z.string().regex(isoDatePattern).nullable().optional(),
      validUntil: z.string().regex(isoDatePattern).nullable().optional(),
      active: z.boolean().optional()
    })
  ),
  allergens: z.array(z.string().min(1).max(120)).max(60).optional()
}).superRefine((value, context) => {
  value.items.forEach((item, index) => {
    if (item.scheduleMode === "dateRange" && !item.validFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items", index, "validFrom"],
        message: "Bitte ein Von-Datum auswählen."
      });
    }
    if (item.validFrom && item.validUntil && item.validUntil < item.validFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items", index, "validUntil"],
        message: "Das Bis-Datum muss am oder nach dem Von-Datum liegen."
      });
    }
  });
});
const uploadMenuQuerySchema = z.object({
  mode: z.enum(["replace", "append"]).optional()
});
const onboardingMenuUploadQuerySchema = z.object({
  kind: z.enum(["regular", "lunch"]).optional()
});
const digitalizeMenuQuerySchema = z.object({
  kind: z.enum(["regular", "lunch"]).optional()
});
const menuViewSchema = z.object({
  kind: z.enum(["regular", "lunch"])
});
const menuAnalyticsQuerySchema = z
  .object({
    from: z.string().regex(isoDatePattern).optional(),
    to: z.string().regex(isoDatePattern).optional()
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "Das Bis-Datum darf nicht vor dem Von-Datum liegen.",
    path: ["to"]
  });
const contentViewSchema = z
  .object({
    type: z.enum(["offer", "dish", "event"]),
    contentId: z.string().trim().min(1).max(180),
    menuKind: z.enum(["regular", "lunch"]).optional()
  })
  .superRefine((value, context) => {
    if (value.type === "dish" && !value.menuKind) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["menuKind"],
        message: "Menüart fehlt."
      });
    }
  });
const deleteMenuCardQuerySchema = z.object({
  kind: z.enum(["regular", "lunch"]).default("regular"),
  onboarding: z.enum(["true", "false"]).optional()
});
const menuDiagnosticSchema = z.object({
  diagnosticId: z.string().trim().min(8).max(40),
  stage: z.string().trim().min(2).max(80),
  errorCode: z.string().trim().min(2).max(80),
  message: z.string().trim().max(500).optional(),
  fileName: z.string().trim().max(180).optional(),
  declaredMimeType: z.string().trim().max(100).optional(),
  fileCount: z.coerce.number().int().min(0).max(MAX_MENU_FILES).optional()
});

const MAX_PUSH_TOKENS = 20;
const MAX_DIGITAL_MENU_FILES = MAX_MENU_FILES;
const MAX_REVIEW_IMAGES = 5;
const MENU_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "menus");
const MENU_UPLOAD_PREFIX = "/uploads/menus/";
const OFFER_IMAGE_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "offers");
const OFFER_IMAGE_UPLOAD_PREFIX = "/uploads/offers/";
const CATERING_IMAGE_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "catering");
const CATERING_IMAGE_UPLOAD_PREFIX = "/uploads/catering/";
const RESTAURANT_LOGO_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "restaurant-logos");
const RESTAURANT_LOGO_UPLOAD_PREFIX = "/uploads/restaurant-logos/";
const REVIEW_IMAGE_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "reviews");
const REVIEW_IMAGE_UPLOAD_PREFIX = "/uploads/reviews/";
const DIGITAL_MENU_STORAGE_DIR = path.resolve(process.cwd(), "uploads", "digital-menus");
const LUNCH_MENU_STORAGE_DIR = path.resolve(process.cwd(), "uploads", "lunch-menus");
const RESTAURANT_SETTINGS_DIR = path.resolve(process.cwd(), "uploads", "restaurant-settings");
const WEBSITE_SYNC_DRAFT_DIR = process.env.PREVIEW_SYNC_DRAFT_DIR || path.resolve(process.cwd(), "uploads", "website-sync-drafts");
const RESTAURANT_RESERVATIONS_FILE = path.resolve(process.cwd(), "uploads", "reservations.json");
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
const digitalMenuService = new DigitalMenuService();
const WEBSITE_SYNC_DRAFT_TTL_MS = 60 * 60 * 1000;

type StoredWebsiteSyncDraft = {
  id: string;
  restaurantId: string;
  websiteUrl: string;
  status: "running" | "completed" | "failed" | "cancelled";
  step: string;
  progress: number;
  createdAt: string;
  completedAt?: string;
  expiresAt: string;
  result?: WebsiteSyncResult;
  error?: { code: string; message: string };
  appliedSections: WebsiteSyncSection[];
  skippedSections: WebsiteSyncSection[];
  appliedSourceIds?: string[];
  skippedSourceIds?: string[];
};

const websiteSyncJobs = new Map<string, Promise<void>>();
const websiteSyncControllers = new Map<string, AbortController>();

const getWebsiteSyncDraftPath = (draftId: string): string => {
  if (!/^[a-f0-9-]{36}$/i.test(draftId)) {
    throw new HttpError(400, "INVALID_INPUT", "Ungültiger Synchronisierungsentwurf.");
  }
  return path.join(WEBSITE_SYNC_DRAFT_DIR, `${draftId}.json`);
};

const writeWebsiteSyncDraft = async (draft: StoredWebsiteSyncDraft): Promise<void> => {
  const filePath = getWebsiteSyncDraftPath(draft.id);
  await mkdir(WEBSITE_SYNC_DRAFT_DIR, { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(draft, null, 2), { encoding: "utf-8", mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
};

const readWebsiteSyncDraft = async (draftId: string): Promise<StoredWebsiteSyncDraft | null> => {
  try {
    const raw = await readFile(getWebsiteSyncDraftPath(draftId), "utf-8");
    const parsed = JSON.parse(raw) as StoredWebsiteSyncDraft;
    if (!parsed || !parsed.id || !parsed.restaurantId || !parsed.status || Date.parse(parsed.expiresAt) <= Date.now()) {
      return null;
    }
    return parsed;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
};

const findLatestWebsiteSyncDraft = async (restaurantId: string): Promise<StoredWebsiteSyncDraft | null> => {
  // Draft IDs are returned to the app immediately; a small index avoids exposing another restaurant's drafts.
  const indexPath = path.join(WEBSITE_SYNC_DRAFT_DIR, `${restaurantId}.latest.json`);
  try {
    const index = JSON.parse(await readFile(indexPath, "utf-8")) as { draftId?: string };
    return index.draftId ? readWebsiteSyncDraft(index.draftId) : null;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
};

const setLatestWebsiteSyncDraft = async (restaurantId: string, draftId: string): Promise<void> => {
  await mkdir(WEBSITE_SYNC_DRAFT_DIR, { recursive: true });
  const filePath = path.join(WEBSITE_SYNC_DRAFT_DIR, `${restaurantId}.latest.json`);
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify({ draftId }), { encoding: "utf-8", mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
};

const websiteSyncResponse = (draft: StoredWebsiteSyncDraft | null) => draft ? ({
  id: draft.id,
  websiteUrl: draft.websiteUrl,
  status: draft.status,
  step: draft.step,
  progress: draft.progress,
  createdAt: draft.createdAt,
  completedAt: draft.completedAt ?? null,
  result: draft.result ?? null,
  error: draft.error ?? null,
  appliedSections: draft.appliedSections,
  skippedSections: draft.skippedSections,
  appliedSourceIds: draft.appliedSourceIds ?? [],
  skippedSourceIds: draft.skippedSourceIds ?? []
}) : { draft: null };

const getMenuClientContext = (request: FastifyRequest) => ({
  platform: String(request.headers["x-client-platform"] || "").trim().slice(0, 40),
  appVersion: String(request.headers["x-client-version"] || "").trim().slice(0, 40)
});

const toMenuHttpError = (error: unknown, diagnosticId: string): HttpError => {
  if (error instanceof HttpError) {
    const details =
      error.details && typeof error.details === "object"
        ? { ...(error.details as Record<string, unknown>), diagnosticId }
        : { diagnosticId };
    return new HttpError(error.status, error.code, error.message, details);
  }
  if (error instanceof MenuUploadError) {
    return new HttpError(error.status, error.code, error.message, {
      ...(error.details || {}),
      diagnosticId
    });
  }
  const code = (error as { code?: string })?.code;
  if (code === "FST_REQ_FILE_TOO_LARGE") {
    return new HttpError(413, "FILE_TOO_LARGE", "Datei ist größer als 10 MB.", {
      maxBytes: MAX_MENU_FILE_SIZE,
      diagnosticId
    });
  }
  if (code === "FST_FILES_LIMIT") {
    return new HttpError(400, "TOO_MANY_FILES", `Maximal ${MAX_MENU_FILES} Dateien sind erlaubt.`, {
      diagnosticId
    });
  }
  if (code === "ERR_STREAM_PREMATURE_CLOSE") {
    return new HttpError(
      400,
      "UPLOAD_INTERRUPTED",
      "Der Datei-Upload wurde unterbrochen. Bitte Verbindung prüfen und erneut versuchen.",
      { diagnosticId }
    );
  }
  return new HttpError(500, "MENU_PROCESSING_FAILED", "Menü konnte nicht verarbeitet werden.", {
    diagnosticId
  });
};
const digitalMenuCategories = ["Vegan", "Vegetarisch", "Normal", "Getränke"] as const;
type DigitalMenuCategory = (typeof digitalMenuCategories)[number];
type ReservationStatus = "pending" | "confirmed" | "cancelled";
type ReservationMode = "disabled" | "app" | "external";
const openingHourDayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type OpeningHourDayKey = (typeof openingHourDayKeys)[number];
type StoredOpeningHoursDay = {
  enabled: boolean;
  openTime: string;
  closeTime: string;
  periods: Array<{ openTime: string; closeTime: string }>;
  openEnded: boolean;
};
type StoredOpeningHours = Record<OpeningHourDayKey, StoredOpeningHoursDay>;
type StoredSpecialClosure = {
  date: string;
  reason: string;
};
type StoredDigitalMenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: DigitalMenuCategory;
  section: string;
  allergens?: string[];
};
type StoredDigitalMenu = {
  items: StoredDigitalMenuItem[];
  allergens: string[];
  updatedAt: string | null;
};
type LunchScheduleMode = "dateRange" | "weekdays" | "openingHours";
type StoredLunchMenuItem = StoredDigitalMenuItem & {
  availableWeekdays: LunchWeekdayKey[];
  repeatWeekly: boolean;
  activeWeekKey: string | null;
  schedulePending: boolean;
  scheduleMode: LunchScheduleMode | null;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
};
type StoredLunchMenu = {
  items: StoredLunchMenuItem[];
  allergens: string[];
  updatedAt: string | null;
};
type StoredOnboardingDraft = {
  mealSlots: MealSlot[];
  cuisineTypes: string[];
  tableReservationEnabled: boolean;
  tableReservationChoiceMade: boolean;
  reservationMode: ReservationMode;
  reservationExternalLink: string;
  reservationExternalEmail: string;
  reservationExternalPhone: string;
  openingHours: StoredOpeningHours;
  aboutText: string;
  menuFiles: StoredMenuFile[];
  digitalMenu: StoredDigitalMenu;
  lunchMenuFiles: StoredMenuFile[];
  lunchMenu: StoredLunchMenu;
  lastStep: number;
  updatedAt?: string;
};
type StoredMenuFile = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  uploadedAt: string;
};
type StoredPushToken = {
  token: string;
  platform: "ios" | "android";
  createdAt: string;
  lastSeenAt: string;
};
type StoredSocialLink = {
  platform: string;
  url: string;
};
type ProviderScope = "food" | "events" | "catering";
type StoredEventProfile = {
  offeringsText: string;
  reservationUrl: string;
  contactUrl: string;
  contactEmail: string;
  contactPhone: string;
};
type StoredCateringProfile = {
  offeringsText: string;
  contactUrl: string;
  contactEmail: string;
  contactPhone: string;
};
type StoredRestaurantSettings = {
  tableReservationEnabled: boolean;
  reservationMode: ReservationMode;
  reservationExternalLink: string;
  reservationExternalEmail: string;
  reservationExternalPhone: string;
  logoUrl: string;
  cuisineTypes: string[];
  openingHours: StoredOpeningHours;
  specialClosures: StoredSpecialClosure[];
  aboutText: string;
  websiteSyncUrl: string;
  socialLinks: StoredSocialLink[];
  providerScopes: ProviderScope[];
  eventProfile: StoredEventProfile;
  eventSetupCompletedAt?: string;
  cateringProfile: StoredCateringProfile;
  cateringSetupCompletedAt?: string;
  menuFiles: StoredMenuFile[];
  lunchMenuFiles: StoredMenuFile[];
  useDigitalMenuAsLunch: boolean;
  pushTokens: StoredPushToken[];
  onboardingHintSeenAt?: string;
  onboardingCompletedAt?: string;
  onboardingDraft?: StoredOnboardingDraft;
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

const DEFAULT_OPEN_TIME = "11:00";
const DEFAULT_CLOSE_TIME = "22:00";
const RESTAURANT_TIME_ZONE = "Europe/Berlin";
const reservationModeValues: ReservationMode[] = ["disabled", "app", "external"];
const reservationEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type LunchWeekdayKey = z.infer<typeof lunchWeekdaySchema>;

const createDefaultOpeningHours = (): StoredOpeningHours => ({
  mon: { enabled: false, openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME, periods: [], openEnded: false },
  tue: { enabled: false, openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME, periods: [], openEnded: false },
  wed: { enabled: false, openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME, periods: [], openEnded: false },
  thu: { enabled: false, openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME, periods: [], openEnded: false },
  fri: { enabled: false, openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME, periods: [], openEnded: false },
  sat: { enabled: false, openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME, periods: [], openEnded: false },
  sun: { enabled: false, openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME, periods: [], openEnded: false }
});

const normalizeSpecialClosureDate = (value: unknown): string => {
  const text = String(value || "").trim();
  if (!isoDatePattern.test(text)) return "";
  const [yearText, monthText, dayText] = text.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return "";
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return text;
};

const normalizeStoredSpecialClosures = (value: unknown): StoredSpecialClosure[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, StoredSpecialClosure>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const date = normalizeSpecialClosureDate((entry as { date?: unknown }).date);
    const reason = String((entry as { reason?: unknown }).reason || "").trim().slice(0, 200);
    if (!date || reason.length < 2) continue;
    if (!unique.has(date)) {
      unique.set(date, { date, reason });
    }
  }
  return Array.from(unique.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const toDateKeyInRestaurantTimeZone = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESTAURANT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((entry) => entry.type === "year")?.value || "";
  const month = parts.find((entry) => entry.type === "month")?.value || "";
  const day = parts.find((entry) => entry.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : "";
};

const getRecentDateKeysInRestaurantTimeZone = (days: number): string[] => {
  const today = toDateKeyInRestaurantTimeZone(new Date());
  if (!today) return [];
  const [year, month, day] = today.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day, 12));
  return Array.from({ length: Math.max(1, days) }, (_, index) => {
    const entry = new Date(cursor);
    entry.setUTCDate(cursor.getUTCDate() - (days - index - 1));
    return entry.toISOString().slice(0, 10);
  });
};

const getDateKeysInRange = (from: string, to: string, maxDays = 366): string[] => {
  if (!isoDatePattern.test(from) || !isoDatePattern.test(to) || from > to) return [];
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const cursor = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay, 12));
  const end = new Date(Date.UTC(toYear, toMonth - 1, toDay, 12));
  const values: string[] = [];
  while (cursor <= end && values.length <= maxDays) {
    values.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return values.length > maxDays ? [] : values;
};

const toIsoWeekKeyFromDateParts = (year: number, month: number, day: number): string => {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNumber = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const weekNumber = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${weekYear}-W${String(weekNumber).padStart(2, "0")}`;
};

const toIsoWeekKeyInRestaurantTimeZone = (value: string | Date): string => {
  const dateKey = toDateKeyInRestaurantTimeZone(value);
  if (!dateKey) return "";
  const [yearText, monthText, dayText] = dateKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
  return toIsoWeekKeyFromDateParts(year, month, day);
};

const normalizeLunchWeekKey = (value: unknown): string | null => {
  const text = String(value || "").trim();
  if (!isoWeekKeyPattern.test(text)) return null;
  return text;
};

const lunchWeekdayKeys: LunchWeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const normalizeLunchWeekdays = (value: unknown): LunchWeekdayKey[] => {
  if (!Array.isArray(value)) return [];
  return lunchWeekdayKeys.filter((dayKey) => value.includes(dayKey));
};

const normalizeLunchScheduleMode = (value: unknown): LunchScheduleMode | null => {
  if (value === "dateRange" || value === "weekdays" || value === "openingHours") {
    return value;
  }
  return null;
};

const normalizeLunchValidityDate = (value: unknown): string | null => {
  const text = String(value || "").trim();
  return isoDatePattern.test(text) ? text : null;
};

const toLunchWeekdayKeyInRestaurantTimeZone = (value: string | Date): LunchWeekdayKey | null => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: RESTAURANT_TIME_ZONE,
    weekday: "short"
  }).format(date);

  if (weekday === "Mon") return "mon";
  if (weekday === "Tue") return "tue";
  if (weekday === "Wed") return "wed";
  if (weekday === "Thu") return "thu";
  if (weekday === "Fri") return "fri";
  if (weekday === "Sat") return "sat";
  if (weekday === "Sun") return "sun";
  return null;
};

const createEmptyStoredDigitalMenu = (): StoredDigitalMenu => ({
  items: [],
  allergens: [],
  updatedAt: null
});

const createEmptyStoredLunchMenu = (): StoredLunchMenu => ({
  items: [],
  allergens: [],
  updatedAt: null
});

const normalizeStoredReservationMode = (
  value: unknown,
  fallbackEnabled = false
): ReservationMode => {
  const text = String(value || "").trim().toLowerCase();
  if (reservationModeValues.includes(text as ReservationMode)) {
    return text as ReservationMode;
  }
  return fallbackEnabled ? "app" : "disabled";
};

const isReservationModeEnabled = (mode: ReservationMode): boolean => mode !== "disabled";

const normalizeReservationExternalLink = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
};

const normalizeWebsiteSyncUrl = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:" || !parsed.hostname) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const normalizeReservationExternalEmail = (value: unknown): string => {
  const text = String(value || "").trim().toLowerCase();
  if (!text || !reservationEmailPattern.test(text)) return "";
  return text.slice(0, 320);
};

const normalizeReservationExternalPhone = (value: unknown): string => {
  const text = String(value || "").trim();
  if (!text || text.length < 6) return "";
  return text.slice(0, 40);
};

const hasReservationExternalContact = (
  link: string,
  email: string,
  phone: string
): boolean => Boolean(link || email || phone);

const validateProvidedReservationContacts = (input: {
  reservationExternalLink?: unknown;
  reservationExternalEmail?: unknown;
  reservationExternalPhone?: unknown;
}): string[] => {
  const errors: string[] = [];
  const rawLink = String(input.reservationExternalLink || "").trim();
  const rawEmail = String(input.reservationExternalEmail || "").trim();
  const rawPhone = String(input.reservationExternalPhone || "").trim();

  if (rawLink && !normalizeReservationExternalLink(rawLink)) {
    errors.push("Bitte einen gültigen Reservierungs-Link eingeben.");
  }
  if (rawEmail && !normalizeReservationExternalEmail(rawEmail)) {
    errors.push("Bitte eine gültige Reservierungs-E-Mail eingeben.");
  }
  if (rawPhone && !normalizeReservationExternalPhone(rawPhone)) {
    errors.push("Bitte eine gültige Reservierungs-Telefonnummer eingeben.");
  }

  return errors;
};

const createDefaultOnboardingDraft = (): StoredOnboardingDraft => ({
  mealSlots: [],
  cuisineTypes: [],
  tableReservationEnabled: false,
  tableReservationChoiceMade: false,
  reservationMode: "disabled",
  reservationExternalLink: "",
  reservationExternalEmail: "",
  reservationExternalPhone: "",
  openingHours: createDefaultOpeningHours(),
  aboutText: "",
  menuFiles: [],
  digitalMenu: createEmptyStoredDigitalMenu(),
  lunchMenuFiles: [],
  lunchMenu: createEmptyStoredLunchMenu(),
  lastStep: 0
});

const normalizeStoredMealSlots = (value: unknown): MealSlot[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (entry): entry is MealSlot =>
          entry === "breakfast" || entry === "lunch" || entry === "dinner"
      )
    )
  );
};

const normalizeOnboardingLastStep = (value: unknown): number => {
  const number = Number(value);
  if (!Number.isInteger(number)) return 0;
  return Math.max(0, Math.min(6, number));
};

const normalizeTimeText = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return fallback;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const normalizeOpeningHourPeriods = (
  value: unknown,
  fallbackOpenTime: string,
  fallbackCloseTime: string
): Array<{ openTime: string; closeTime: string }> => {
  const source = Array.isArray(value) ? value : [];
  const periods = source
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      openTime: normalizeTimeText(entry.openTime, fallbackOpenTime),
      closeTime: normalizeTimeText(entry.closeTime, fallbackCloseTime)
    }))
    .filter((entry, index, entries) =>
      entry.openTime !== entry.closeTime &&
      entries.findIndex(
        (candidate) => candidate.openTime === entry.openTime && candidate.closeTime === entry.closeTime
      ) === index
    )
    .slice(0, 2);

  return periods.length ? periods : [{ openTime: fallbackOpenTime, closeTime: fallbackCloseTime }];
};

const normalizeOpeningHours = (value: unknown): StoredOpeningHours => {
  const base = createDefaultOpeningHours();
  if (!value || typeof value !== "object") return base;
  const record = value as Record<string, unknown>;
  for (const day of openingHourDayKeys) {
    const dayRaw = record[day];
    if (!dayRaw || typeof dayRaw !== "object") continue;
    const dayRecord = dayRaw as Record<string, unknown>;
    const openTime = normalizeTimeText(dayRecord.openTime, DEFAULT_OPEN_TIME);
    const closeTime = normalizeTimeText(dayRecord.closeTime, DEFAULT_CLOSE_TIME);
    const periods = Boolean(dayRecord.enabled)
      ? normalizeOpeningHourPeriods(dayRecord.periods, openTime, closeTime)
      : [];
    base[day] = {
      enabled: Boolean(dayRecord.enabled),
      // Keep legacy readers working with the first period.
      openTime: periods[0]?.openTime || openTime,
      closeTime: periods[0]?.closeTime || closeTime,
      periods,
      openEnded: Boolean(dayRecord.enabled) && Boolean(dayRecord.openEnded)
    };
  }
  return base;
};

const normalizeAboutText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 2000);
};

const normalizeLogoUrl = (value: unknown): string => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("/")) return text.slice(0, 2000);
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString().slice(0, 2000);
  } catch {
    return "";
  }
};

const normalizeSocialLinks = (value: unknown): StoredSocialLink[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const links: StoredSocialLink[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { platform?: unknown; url?: unknown };
    const platform = String(record.platform || "").trim().slice(0, 40);
    const rawUrl = String(record.url || "").trim();
    if (platform.length < 2 || !rawUrl) continue;
    const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    let normalizedUrl = "";
    try {
      const parsed = new URL(withProtocol);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      normalizedUrl = parsed.toString().slice(0, 500);
    } catch {
      continue;
    }
    const key = `${platform.toLowerCase()}|${normalizedUrl.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ platform, url: normalizedUrl });
  }

  return links.slice(0, 12);
};

const normalizeProviderScopes = (value: unknown): ProviderScope[] => {
  const source = Array.isArray(value) ? value : ["food"];
  const scopes = Array.from(
    new Set(
      source.filter(
        (entry): entry is ProviderScope =>
          entry === "food" || entry === "events" || entry === "catering"
      )
    )
  );
  return scopes.length ? scopes : ["food"];
};

const normalizeEventProfile = (value: unknown): StoredEventProfile => {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    offeringsText: normalizeAboutText(record.offeringsText),
    reservationUrl: normalizeReservationExternalLink(record.reservationUrl),
    contactUrl: normalizeReservationExternalLink(record.contactUrl),
    contactEmail: normalizeReservationExternalEmail(record.contactEmail),
    contactPhone: normalizeReservationExternalPhone(record.contactPhone)
  };
};

const normalizeCateringProfile = (value: unknown): StoredCateringProfile => {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    offeringsText: normalizeAboutText(record.offeringsText),
    contactUrl: normalizeReservationExternalLink(record.contactUrl),
    contactEmail: normalizeReservationExternalEmail(record.contactEmail),
    contactPhone: normalizeReservationExternalPhone(record.contactPhone)
  };
};

const normalizeOptionalIsoDate = (value: unknown): string | undefined => {
  const text = String(value || "").trim();
  if (!text) return undefined;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
};

const allowedMenuMimeByExtension: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

const normalizeAllowedMenuMime = (mimeType: string, filename?: string): string => {
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  const canonicalMimeType =
    normalizedMimeType === "image/jpg" ? "image/jpeg" : normalizedMimeType;
  const allowedMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);
  if (allowedMimeTypes.has(canonicalMimeType)) return canonicalMimeType;

  const ext = path.extname(String(filename || "").split(/[?#]/)[0].trim()).toLowerCase();
  return allowedMenuMimeByExtension[ext] || "";
};

const unsupportedMenuFileTypeMessage = (filename?: string): string => {
  const cleanName = String(filename || "").trim();
  return cleanName
    ? `Only PDF or image files (JPG, PNG, WEBP) are allowed: ${cleanName}`
    : "Only PDF or image files (JPG, PNG, WEBP) are allowed";
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

const inferMenuMimeTypeFromName = (name: string): string => {
  const ext = path.extname(String(name || "").split(/[?#]/)[0].trim().toLowerCase());
  if (allowedMenuMimeByExtension[ext]) return allowedMenuMimeByExtension[ext];
  return "application/octet-stream";
};

const normalizeStoredMenuFiles = (value: unknown): StoredMenuFile[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: StoredMenuFile[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Partial<StoredMenuFile>;
    const id = String(record.id || "").trim();
    const name = String(record.name || "").trim();
    const url = String(record.url || "").trim();
    const uploadedAt = String(record.uploadedAt || "").trim();
    const mimeTypeRaw = String(record.mimeType || "").trim().toLowerCase();
    const mimeType = mimeTypeRaw || inferMenuMimeTypeFromName(name || url);
    if (!id || !name || !url || !uploadedAt) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      name,
      url,
      mimeType,
      uploadedAt
    });
  }

  normalized.sort((a, b) => {
    const aMs = Date.parse(a.uploadedAt);
    const bMs = Date.parse(b.uploadedAt);
    if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
      return bMs - aMs;
    }
    return b.uploadedAt.localeCompare(a.uploadedAt);
  });

  return normalized;
};

const normalizeStoredPushTokens = (value: unknown): StoredPushToken[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: StoredPushToken[] = [];
  const nowIso = new Date().toISOString();

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Partial<StoredPushToken>;
    const token = String(record.token || "").trim();
    const platform =
      record.platform === "ios" || record.platform === "android"
        ? record.platform
        : null;
    if (!token || !platform) continue;
    if (seen.has(token)) continue;
    seen.add(token);

    const createdAt = String(record.createdAt || "").trim() || nowIso;
    const lastSeenAt = String(record.lastSeenAt || "").trim() || createdAt;
    normalized.push({
      token,
      platform,
      createdAt,
      lastSeenAt
    });
  }

  normalized.sort((a, b) => {
    const aMs = Date.parse(a.lastSeenAt);
    const bMs = Date.parse(b.lastSeenAt);
    if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
      return bMs - aMs;
    }
    return b.lastSeenAt.localeCompare(a.lastSeenAt);
  });

  return normalized.slice(0, MAX_PUSH_TOKENS);
};

const deriveMenuFileNameFromUrl = (menuUrl: string, mimeType?: string): string => {
  if (!menuUrl) return mimeType === "application/pdf" ? "menu.pdf" : "menu.jpg";

  let pathname = "";
  try {
    pathname = new URL(menuUrl).pathname;
  } catch {
    pathname = menuUrl;
  }

  const basename = decodeURIComponent(path.basename(pathname || "")).trim();
  if (basename) return basename;
  return mimeType === "application/pdf" ? "menu.pdf" : "menu.jpg";
};

const resolveMenuFilesForRestaurant = (
  restaurant: { id: string; menuUrl?: string; menuMimeType?: string; createdAt?: string },
  settingsMenuFiles: StoredMenuFile[]
): StoredMenuFile[] => {
  const stored = normalizeStoredMenuFiles(settingsMenuFiles);
  if (stored.length) return stored;
  if (!restaurant.menuUrl) return [];

  return [
    {
      id: `legacy-${restaurant.id}`,
      name: deriveMenuFileNameFromUrl(restaurant.menuUrl, restaurant.menuMimeType),
      url: restaurant.menuUrl,
      mimeType: String(restaurant.menuMimeType || "").toLowerCase() || inferMenuMimeTypeFromName(restaurant.menuUrl),
      uploadedAt: restaurant.createdAt || new Date().toISOString()
    }
  ];
};

const toRestaurantWithSettings = (
  restaurant: {
    id: string;
    menuUrl?: string;
    menuMimeType?: string;
    createdAt?: string;
    [key: string]: unknown;
  },
  settings: StoredRestaurantSettings
) => ({
  ...restaurant,
  tableReservationEnabled: settings.tableReservationEnabled,
  reservationMode: settings.reservationMode,
  reservationExternalLink: settings.reservationExternalLink,
  reservationExternalEmail: settings.reservationExternalEmail,
  reservationExternalPhone: settings.reservationExternalPhone,
  logoUrl: settings.logoUrl,
  cuisineTypes: settings.cuisineTypes,
  openingHours: settings.openingHours,
  specialClosures: settings.specialClosures,
  aboutText: settings.aboutText,
  websiteSyncUrl: settings.websiteSyncUrl,
  socialLinks: settings.socialLinks,
  providerScopes: settings.providerScopes,
  eventProfile: settings.eventProfile,
  eventSetupCompletedAt: settings.eventSetupCompletedAt ?? null,
  cateringProfile: settings.cateringProfile,
  cateringSetupCompletedAt: settings.cateringSetupCompletedAt ?? null,
  onboardingHintNeeded: !settings.onboardingCompletedAt,
  onboardingRequired: !settings.onboardingCompletedAt,
  onboardingCompletedAt: settings.onboardingCompletedAt ?? null,
  onboardingDraft: settings.onboardingDraft ?? null,
  lunchMenuFiles: settings.lunchMenuFiles,
  menuFiles: resolveMenuFilesForRestaurant(
    {
      id: restaurant.id,
      menuUrl: typeof restaurant.menuUrl === "string" ? restaurant.menuUrl : undefined,
      menuMimeType: typeof restaurant.menuMimeType === "string" ? restaurant.menuMimeType : undefined,
      createdAt: typeof restaurant.createdAt === "string" ? restaurant.createdAt : undefined
    },
    settings.menuFiles
  )
});

const getRestaurantPushTokensFromSettings = (settings: StoredRestaurantSettings): string[] =>
  normalizeStoredPushTokens(settings.pushTokens).map((entry) => entry.token);

const getDigitalMenuPath = (restaurantId: string): string => {
  const safeId = restaurantId.trim();
  if (!/^[a-zA-Z0-9-]+$/.test(safeId)) {
    throw new HttpError(400, "INVALID_INPUT", "Invalid restaurant id");
  }
  return path.join(DIGITAL_MENU_STORAGE_DIR, `${safeId}.json`);
};

const getLunchMenuPath = (restaurantId: string): string => {
  const safeId = restaurantId.trim();
  if (!/^[a-zA-Z0-9-]+$/.test(safeId)) {
    throw new HttpError(400, "INVALID_INPUT", "Invalid restaurant id");
  }
  return path.join(LUNCH_MENU_STORAGE_DIR, `${safeId}.json`);
};

const getRestaurantSettingsPath = (restaurantId: string): string => {
  const safeId = restaurantId.trim();
  if (!/^[a-zA-Z0-9-]+$/.test(safeId)) {
    throw new HttpError(400, "INVALID_INPUT", "Invalid restaurant id");
  }
  return path.join(RESTAURANT_SETTINGS_DIR, `${safeId}.json`);
};

export const loadRestaurantSettings = async (restaurantId: string): Promise<StoredRestaurantSettings> => {
  const filePath = getRestaurantSettingsPath(restaurantId);
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as {
      tableReservationEnabled?: unknown;
      reservationMode?: unknown;
      reservationExternalLink?: unknown;
      reservationExternalEmail?: unknown;
      reservationExternalPhone?: unknown;
      logoUrl?: unknown;
      cuisineTypes?: unknown;
      openingHours?: unknown;
      specialClosures?: unknown;
      aboutText?: unknown;
      websiteSyncUrl?: unknown;
      socialLinks?: unknown;
      providerScopes?: unknown;
      eventProfile?: unknown;
      eventSetupCompletedAt?: unknown;
      cateringProfile?: unknown;
      cateringSetupCompletedAt?: unknown;
      menuFiles?: unknown;
      lunchMenuFiles?: unknown;
      useDigitalMenuAsLunch?: unknown;
      pushTokens?: unknown;
      onboardingHintSeenAt?: unknown;
      onboardingCompletedAt?: unknown;
      onboardingDraft?: unknown;
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
    const reservationMode = normalizeStoredReservationMode(
      parsed?.reservationMode,
      Boolean(parsed?.tableReservationEnabled)
    );
    return {
      tableReservationEnabled: isReservationModeEnabled(reservationMode),
      reservationMode,
      reservationExternalLink: normalizeReservationExternalLink(parsed?.reservationExternalLink),
      reservationExternalEmail: normalizeReservationExternalEmail(parsed?.reservationExternalEmail),
      reservationExternalPhone: normalizeReservationExternalPhone(parsed?.reservationExternalPhone),
      logoUrl: normalizeLogoUrl(parsed?.logoUrl),
      cuisineTypes,
      openingHours: normalizeOpeningHours(parsed?.openingHours),
      specialClosures: normalizeStoredSpecialClosures(parsed?.specialClosures),
      aboutText: normalizeAboutText(parsed?.aboutText),
      websiteSyncUrl: normalizeWebsiteSyncUrl(parsed?.websiteSyncUrl),
      socialLinks: normalizeSocialLinks(parsed?.socialLinks),
      providerScopes: normalizeProviderScopes(parsed?.providerScopes),
      eventProfile: normalizeEventProfile(parsed?.eventProfile),
      eventSetupCompletedAt: normalizeOptionalIsoDate(parsed?.eventSetupCompletedAt),
      cateringProfile: normalizeCateringProfile(parsed?.cateringProfile),
      cateringSetupCompletedAt: normalizeOptionalIsoDate(parsed?.cateringSetupCompletedAt),
      menuFiles: normalizeStoredMenuFiles(parsed?.menuFiles),
      lunchMenuFiles: normalizeStoredMenuFiles(parsed?.lunchMenuFiles),
      useDigitalMenuAsLunch: parsed?.useDigitalMenuAsLunch === true,
      pushTokens: normalizeStoredPushTokens(parsed?.pushTokens),
      onboardingHintSeenAt:
        typeof parsed?.onboardingHintSeenAt === "string" &&
        parsed.onboardingHintSeenAt.trim()
          ? parsed.onboardingHintSeenAt.trim()
          : undefined,
      onboardingCompletedAt:
        typeof parsed?.onboardingCompletedAt === "string" &&
        parsed.onboardingCompletedAt.trim()
          ? parsed.onboardingCompletedAt.trim()
          : undefined,
      onboardingDraft: normalizeStoredOnboardingDraft(parsed?.onboardingDraft),
      updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : undefined
    };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "ENOENT") {
      return {
        tableReservationEnabled: false,
        reservationMode: "disabled",
        reservationExternalLink: "",
        reservationExternalEmail: "",
        reservationExternalPhone: "",
        logoUrl: "",
        cuisineTypes: [],
        openingHours: createDefaultOpeningHours(),
        specialClosures: [],
        aboutText: "",
        websiteSyncUrl: "",
        socialLinks: [],
        providerScopes: ["food"],
        eventProfile: normalizeEventProfile(undefined),
        eventSetupCompletedAt: undefined,
        cateringProfile: normalizeCateringProfile(undefined),
        cateringSetupCompletedAt: undefined,
        menuFiles: [],
        lunchMenuFiles: [],
        useDigitalMenuAsLunch: false,
        pushTokens: [],
        onboardingHintSeenAt: undefined,
        onboardingCompletedAt: undefined,
        onboardingDraft: undefined
      };
    }
    throw error;
  }
};

const saveRestaurantSettings = async (
  restaurantId: string,
  patch: {
    tableReservationEnabled?: boolean;
    reservationMode?: unknown;
    reservationExternalLink?: unknown;
    reservationExternalEmail?: unknown;
    reservationExternalPhone?: unknown;
    logoUrl?: unknown;
    cuisineTypes?: string[];
    openingHours?: unknown;
    specialClosures?: unknown;
    aboutText?: string;
    websiteSyncUrl?: unknown;
    socialLinks?: unknown;
    providerScopes?: unknown;
    eventProfile?: unknown;
    eventSetupCompletedAt?: string | null;
    cateringProfile?: unknown;
    cateringSetupCompletedAt?: string | null;
    menuFiles?: unknown;
    lunchMenuFiles?: unknown;
    useDigitalMenuAsLunch?: boolean;
    pushTokens?: unknown;
    onboardingHintSeenAt?: string;
    onboardingCompletedAt?: string | null;
    onboardingDraft?: unknown | null;
  }
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
  const nextOnboardingDraft =
    patch.onboardingDraft === null
      ? undefined
      : patch.onboardingDraft !== undefined
      ? normalizeStoredOnboardingDraft(patch.onboardingDraft)
      : current.onboardingDraft;
  if (nextOnboardingDraft) {
    nextOnboardingDraft.updatedAt = new Date().toISOString();
  }
  const nextReservationMode =
    patch.reservationMode !== undefined
      ? normalizeStoredReservationMode(patch.reservationMode, current.tableReservationEnabled)
      : patch.tableReservationEnabled !== undefined
      ? normalizeStoredReservationMode(undefined, Boolean(patch.tableReservationEnabled))
      : current.reservationMode;
  const nextReservationExternalLink =
    patch.reservationExternalLink !== undefined
      ? normalizeReservationExternalLink(patch.reservationExternalLink)
      : current.reservationExternalLink;
  const nextReservationExternalEmail =
    patch.reservationExternalEmail !== undefined
      ? normalizeReservationExternalEmail(patch.reservationExternalEmail)
      : current.reservationExternalEmail;
  const nextReservationExternalPhone =
    patch.reservationExternalPhone !== undefined
      ? normalizeReservationExternalPhone(patch.reservationExternalPhone)
      : current.reservationExternalPhone;
  const next: StoredRestaurantSettings = {
    tableReservationEnabled: isReservationModeEnabled(nextReservationMode),
    reservationMode: nextReservationMode,
    reservationExternalLink: nextReservationExternalLink,
    reservationExternalEmail: nextReservationExternalEmail,
    reservationExternalPhone: nextReservationExternalPhone,
    logoUrl:
      patch.logoUrl !== undefined
        ? normalizeLogoUrl(patch.logoUrl)
        : current.logoUrl,
    cuisineTypes: nextCuisineTypes,
    openingHours:
      patch.openingHours !== undefined
        ? normalizeOpeningHours(patch.openingHours)
        : current.openingHours,
    specialClosures:
      patch.specialClosures !== undefined
        ? normalizeStoredSpecialClosures(patch.specialClosures)
        : current.specialClosures,
    aboutText:
      patch.aboutText !== undefined
        ? normalizeAboutText(patch.aboutText)
        : current.aboutText,
    websiteSyncUrl:
      patch.websiteSyncUrl !== undefined
        ? normalizeWebsiteSyncUrl(patch.websiteSyncUrl)
        : current.websiteSyncUrl,
    socialLinks:
      patch.socialLinks !== undefined
        ? normalizeSocialLinks(patch.socialLinks)
        : current.socialLinks,
    providerScopes:
      patch.providerScopes !== undefined
        ? normalizeProviderScopes(patch.providerScopes)
        : current.providerScopes,
    eventProfile:
      patch.eventProfile !== undefined
        ? normalizeEventProfile(patch.eventProfile)
        : current.eventProfile,
    eventSetupCompletedAt:
      patch.eventSetupCompletedAt === null
        ? undefined
        : patch.eventSetupCompletedAt !== undefined
        ? normalizeOptionalIsoDate(patch.eventSetupCompletedAt)
        : current.eventSetupCompletedAt,
    cateringProfile:
      patch.cateringProfile !== undefined
        ? normalizeCateringProfile(patch.cateringProfile)
        : current.cateringProfile,
    cateringSetupCompletedAt:
      patch.cateringSetupCompletedAt === null
        ? undefined
        : patch.cateringSetupCompletedAt !== undefined
        ? normalizeOptionalIsoDate(patch.cateringSetupCompletedAt)
        : current.cateringSetupCompletedAt,
    menuFiles:
      patch.menuFiles !== undefined
        ? normalizeStoredMenuFiles(patch.menuFiles)
        : current.menuFiles,
    lunchMenuFiles:
      patch.lunchMenuFiles !== undefined
        ? normalizeStoredMenuFiles(patch.lunchMenuFiles)
        : current.lunchMenuFiles,
    useDigitalMenuAsLunch:
      patch.useDigitalMenuAsLunch !== undefined
        ? Boolean(patch.useDigitalMenuAsLunch)
        : current.useDigitalMenuAsLunch,
    pushTokens:
      patch.pushTokens !== undefined
        ? normalizeStoredPushTokens(patch.pushTokens)
        : current.pushTokens,
    onboardingHintSeenAt:
      patch.onboardingHintSeenAt !== undefined
        ? patch.onboardingHintSeenAt.trim() || undefined
        : current.onboardingHintSeenAt,
    onboardingCompletedAt:
      patch.onboardingCompletedAt === null
        ? undefined
        : patch.onboardingCompletedAt !== undefined
        ? patch.onboardingCompletedAt.trim() || undefined
        : current.onboardingCompletedAt,
    onboardingDraft: nextOnboardingDraft,
    updatedAt: new Date().toISOString()
  };
  if (
    next.reservationMode === "external" &&
    !hasReservationExternalContact(
      next.reservationExternalLink,
      next.reservationExternalEmail,
      next.reservationExternalPhone
    )
  ) {
    throw new HttpError(
      400,
      "RESERVATION_EXTERNAL_CONTACT_REQUIRED",
      "Bitte mindestens Link, E-Mail oder Telefon für externe Reservierungen angeben."
    );
  }
  const filePath = getRestaurantSettingsPath(restaurantId);
  await mkdir(RESTAURANT_SETTINGS_DIR, { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(next, null, 2), {
      encoding: "utf-8",
      mode: 0o600
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return next;
};

const restoreRestaurantSettingsSnapshot = async (
  restaurantId: string,
  snapshot: StoredRestaurantSettings
): Promise<void> => {
  const filePath = getRestaurantSettingsPath(restaurantId);
  await mkdir(RESTAURANT_SETTINGS_DIR, { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(snapshot, null, 2), {
      encoding: "utf-8",
      mode: 0o600
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
};

const mergeOnboardingDraft = (
  current: StoredOnboardingDraft | undefined,
  patch: {
    mealSlots?: unknown;
    cuisineTypes?: unknown;
    tableReservationEnabled?: boolean;
    tableReservationChoiceMade?: boolean;
    reservationMode?: unknown;
    reservationExternalLink?: unknown;
    reservationExternalEmail?: unknown;
    reservationExternalPhone?: unknown;
    openingHours?: unknown;
    aboutText?: unknown;
    menuFiles?: unknown;
    digitalMenu?: unknown;
    lunchMenuFiles?: unknown;
    lunchMenu?: unknown;
    lastStep?: unknown;
  }
): StoredOnboardingDraft => {
  const base = current ? { ...current } : createDefaultOnboardingDraft();
  const cuisineTypesInput = Array.isArray(patch.cuisineTypes) ? patch.cuisineTypes : undefined;
  const nextReservationMode =
    patch.reservationMode !== undefined
      ? normalizeStoredReservationMode(patch.reservationMode, base.tableReservationEnabled)
      : patch.tableReservationEnabled !== undefined
      ? normalizeStoredReservationMode(undefined, Boolean(patch.tableReservationEnabled))
      : base.reservationMode;
  return {
    mealSlots:
      patch.mealSlots !== undefined
        ? normalizeStoredMealSlots(patch.mealSlots)
        : base.mealSlots,
    cuisineTypes:
      cuisineTypesInput !== undefined
        ? Array.from(
            new Set(
              cuisineTypesInput
                .map((entry) => String(entry || "").trim())
                .filter((entry) => entry.length >= 2)
            )
          )
        : base.cuisineTypes,
    tableReservationEnabled:
      isReservationModeEnabled(nextReservationMode),
    tableReservationChoiceMade:
      patch.tableReservationChoiceMade !== undefined
        ? Boolean(patch.tableReservationChoiceMade)
        : base.tableReservationChoiceMade,
    reservationMode: nextReservationMode,
    reservationExternalLink:
      patch.reservationExternalLink !== undefined
        ? normalizeReservationExternalLink(patch.reservationExternalLink)
        : base.reservationExternalLink,
    reservationExternalEmail:
      patch.reservationExternalEmail !== undefined
        ? normalizeReservationExternalEmail(patch.reservationExternalEmail)
        : base.reservationExternalEmail,
    reservationExternalPhone:
      patch.reservationExternalPhone !== undefined
        ? normalizeReservationExternalPhone(patch.reservationExternalPhone)
        : base.reservationExternalPhone,
    openingHours:
      patch.openingHours !== undefined
        ? normalizeOpeningHours(patch.openingHours)
        : base.openingHours,
    aboutText:
      patch.aboutText !== undefined ? normalizeAboutText(patch.aboutText) : base.aboutText,
    menuFiles:
      patch.menuFiles !== undefined ? normalizeStoredMenuFiles(patch.menuFiles) : base.menuFiles,
    digitalMenu:
      patch.digitalMenu !== undefined
        ? normalizeStoredDigitalMenuValue(patch.digitalMenu)
        : base.digitalMenu,
    lunchMenuFiles:
      patch.lunchMenuFiles !== undefined
        ? normalizeStoredMenuFiles(patch.lunchMenuFiles)
        : base.lunchMenuFiles,
    lunchMenu:
      patch.lunchMenu !== undefined
        ? normalizeStoredLunchMenuValue(patch.lunchMenu)
        : base.lunchMenu,
    lastStep:
      patch.lastStep !== undefined
        ? normalizeOnboardingLastStep(patch.lastStep)
        : base.lastStep,
    updatedAt: new Date().toISOString()
  };
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

const toDigitalMenuDetectionText = (...values: unknown[]): string =>
  values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss");

const digitalMenuDrinkPatterns = [
  /\bgetranke?\b/,
  /\bdrinks?\b/,
  /\bbeverages?\b/,
  /\bsoftdrinks?\b/,
  /\balkoholfrei\b/,
  /\bheissgetranke?\b/,
  /\bkaltgetranke?\b/,
  /\bespresso\b/,
  /\bmilchkaffee\b/,
  /\bkaffee\b/,
  /\bcoffee\b/,
  /\bkakao\b/,
  /\bcappuccino\b/,
  /\bamericano\b/,
  /\bcortado\b/,
  /\bflat\s*white\b/,
  /\blatte\b/,
  /\bmacchiato\b/,
  /\bmocha\b/,
  /\bmokka\b/,
  /\bchai\b/,
  /\bmatcha\b/,
  /tee\b/,
  /\btea\b/,
  /\beistee\b/,
  /\bheisse?\s+zitrone\b/,
  /\bheisser?\s+ingwer\b/,
  /\bzitrone\s*(?:&|und)\s*ingwer\b/,
  /wasser/,
  /\bviva\s+con\s+aqua\b/,
  /\baqua\b/,
  /\bmineral\b/,
  /\bcola\b/,
  /\bfanta\b/,
  /\bsprite\b/,
  /\bspezi\b/,
  /\blimonade\b/,
  /\blimos?\b/,
  /\bsaft\b/,
  /schorle/,
  /\bsmoothie\b/,
  /\bmate\b/,
  /\bcharitea\b/,
  /\bbier\b/,
  /\bpils\b/,
  /\bweizen\b/,
  /\bradler\b/,
  /\brotwein\b/,
  /\bweisswein\b/,
  /\brosewein\b/,
  /\bwein\b/,
  /weinschorle/,
  /\bsecco\b/,
  /\bprosecco\b/,
  /\baperol\b/,
  /\bspritz\b/,
  /\bcocktails?\b/,
  /\blongdrinks?\b/,
  /\bmojito\b/,
  /\bgin\b/,
  /\bvodka\b/,
  /\bwodka\b/,
  /\bwhisky\b/,
  /\brum\b/,
  /\bschnaps\b/,
  /\blikor\b/,
  /\bingwershot\b/,
  /\b(?:espresso|matcha|sirup)\s*shot\b/
];

const digitalMenuFoodPatterns = [
  /\bfruhstuck\b/,
  /\bbowls?\b/,
  /\blunch\s*bowls?\b/,
  /\bkuchen\b/,
  /\bmusli\b/,
  /\bbrot\b/,
  /\bcroissants?\b/,
  /\bsalate?\b/,
  /\bsalat\b/,
  /\bsuppen?\b/,
  /\bpasta\b/,
  /\bnudeln?\b/,
  /\bsandwich(?:es)?\b/,
  /\bstullen?\b/,
  /\bsnacks?\b/
];

const isDigitalMenuDrinkText = (...values: unknown[]): boolean => {
  const text = toDigitalMenuDetectionText(...values);
  return Boolean(text && digitalMenuDrinkPatterns.some((pattern) => pattern.test(text)));
};

const isDigitalMenuFoodText = (...values: unknown[]): boolean => {
  const text = toDigitalMenuDetectionText(...values);
  return Boolean(text && digitalMenuFoodPatterns.some((pattern) => pattern.test(text)));
};

const normalizeDigitalCategory = (
  value: unknown,
  name: unknown = "",
  description: unknown = "",
  section: unknown = ""
): DigitalMenuCategory => {
  const lowered = toDigitalMenuDetectionText(value, section, name, description);
  const foodIdentity =
    isDigitalMenuFoodText(name) || (isDigitalMenuFoodText(section) && !isDigitalMenuDrinkText(name));
  if (foodIdentity) {
    if (lowered.includes("vegan")) return "Vegan";
    if (lowered.includes("vegetar")) return "Vegetarisch";
    return "Normal";
  }
  if (isDigitalMenuDrinkText(value, section, name)) return "Getränke";
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

const normalizeDigitalSection = (
  value: unknown,
  category: DigitalMenuCategory
): string => {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (text) {
    if (category === "Getränke" && !isDigitalMenuDrinkText(text)) {
      return "Getränke";
    }
    return text.slice(0, 120);
  }
  if (category === "Vegan") return "Vegan";
  if (category === "Vegetarisch") return "Vegetarisch";
  if (category === "Getränke") return "Getränke";
  return "Fleischgerichte";
};

const normalizeStoredDigitalItems = (
  items: Array<{
    id?: string;
    name: string;
    description?: string;
    price: unknown;
    category: string;
    section?: unknown;
    allergens?: unknown;
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

    const description = String(entry.description || "").trim();
    const category = normalizeDigitalCategory(entry.category, name, description, entry.section);
    const section = normalizeDigitalSection(entry.section, category);
    const allergens = normalizeAllergenList(entry.allergens).slice(0, 20);
    const dedupeKey = `${name.toLowerCase()}|${price.toFixed(2)}|${category}|${section.toLowerCase()}`;
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
      category,
      section,
      allergens: allergens.length ? allergens : undefined
    });
  }

  return {
    items: normalized,
    duplicatesRemoved,
    droppedInvalid
  };
};

type WebsiteImportArea = "breakfast" | "dinner" | "drinks";

const websiteImportAreaForStoredItem = (item: StoredDigitalMenuItem): WebsiteImportArea => {
  if (item.category === "Getränke") return "drinks";
  const text = `${item.section || ""} ${item.name || ""}`.toLocaleLowerCase("de-DE");
  if (/fr[üu]hst[üu]ck|brunch/.test(text)) return "breakfast";
  return "dinner";
};

const websiteImportSectionName = (area: WebsiteImportArea): string => {
  if (area === "breakfast") return "Frühstück";
  if (area === "drinks") return "Getränke";
  return "Abendessen";
};

const websiteDraftMenuForSection = (
  result: WebsiteSyncResult,
  section: "breakfast" | "lunch" | "dinner" | "drinks" | "regular"
): WebsiteMenuDraft | undefined => {
  if (section === "dinner") return result.menus.dinner || result.menus.regular;
  if (section === "regular") return result.menus.regular || result.menus.dinner;
  return result.menus[section];
};

const websiteDraftSourceForId = (result: WebsiteSyncResult, sourceId: string): WebsiteMenuDraft | undefined =>
  (result.menuSources || []).find((source) => source.id === sourceId)
  || (result.unclassifiedMenu?.id === sourceId ? result.unclassifiedMenu : undefined)
  || Object.values(result.menus || {}).find((source) => source?.id === sourceId);

const normalizeLunchMenuAvailableDates = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    const date = normalizeSpecialClosureDate(entry);
    if (!date || seen.has(date)) continue;
    seen.add(date);
    normalized.push(date);
  }

  return normalized.sort((a, b) => a.localeCompare(b)).slice(0, 31);
};

const normalizeStoredLunchMenuItems = (
  items: Array<{
    id?: string;
    name: string;
    description?: string;
    price: unknown;
    category: string;
    section?: unknown;
    allergens?: unknown;
    availableWeekdays?: unknown;
    repeatWeekly?: unknown;
    activeWeekKey?: unknown;
    availableDates?: unknown;
    schedulePending?: unknown;
    scheduleMode?: unknown;
    validFrom?: unknown;
    validUntil?: unknown;
    active?: unknown;
  }>
): { items: StoredLunchMenuItem[]; duplicatesRemoved: number; droppedInvalid: number } => {
  const seen = new Set<string>();
  const normalized: StoredLunchMenuItem[] = [];
  let duplicatesRemoved = 0;
  let droppedInvalid = 0;

  for (const entry of items) {
    const name = String(entry.name || "").trim();
    const price = normalizeDigitalPrice(entry.price);
    if (!name || price === null) {
      droppedInvalid += 1;
      continue;
    }

    const description = String(entry.description || "").trim();
    const category = normalizeDigitalCategory(entry.category, name, description, entry.section);
    const section = normalizeDigitalSection(entry.section, category);
    const allergens = normalizeAllergenList(entry.allergens).slice(0, 20);
    const legacyAvailableDates = normalizeLunchMenuAvailableDates(entry.availableDates);
    let availableWeekdays = normalizeLunchWeekdays(entry.availableWeekdays);
    let repeatWeekly = entry.repeatWeekly === undefined ? true : Boolean(entry.repeatWeekly);
    let activeWeekKey = normalizeLunchWeekKey(entry.activeWeekKey);
    let schedulePending = entry.schedulePending === true;
    let scheduleMode = normalizeLunchScheduleMode(entry.scheduleMode);
    let validFrom = normalizeLunchValidityDate(entry.validFrom);
    let validUntil = normalizeLunchValidityDate(entry.validUntil);

    if (validFrom && validUntil && validUntil < validFrom) {
      validUntil = null;
    }

    if (scheduleMode === "dateRange" && !validFrom) {
      scheduleMode = "openingHours";
    }
    if (scheduleMode === "dateRange" && !availableWeekdays.length) {
      availableWeekdays = [...lunchWeekdayKeys];
    }
    if (scheduleMode === "weekdays" && !availableWeekdays.length) {
      availableWeekdays = [...lunchWeekdayKeys];
    }
    if (scheduleMode === "openingHours") {
      availableWeekdays = [];
      validFrom = null;
      validUntil = null;
    }

    if (!availableWeekdays.length && legacyAvailableDates.length) {
      const firstWeekKey = toIsoWeekKeyInRestaurantTimeZone(legacyAvailableDates[0]);
      const legacyWeekdays = legacyAvailableDates
        .filter((dateText) => toIsoWeekKeyInRestaurantTimeZone(dateText) === firstWeekKey)
        .map((dateText) => toLunchWeekdayKeyInRestaurantTimeZone(dateText))
        .filter((entry): entry is LunchWeekdayKey => Boolean(entry));
      availableWeekdays = normalizeLunchWeekdays(legacyWeekdays);
      repeatWeekly = false;
      activeWeekKey = firstWeekKey || activeWeekKey;
      schedulePending = false;
    }

    if (scheduleMode) {
      schedulePending = false;
      repeatWeekly = scheduleMode !== "dateRange";
      activeWeekKey = null;
    } else if (schedulePending && !availableWeekdays.length) {
      // Drafts from the previous app version must remain saveable and visible.
      scheduleMode = "openingHours";
      schedulePending = false;
      repeatWeekly = true;
      activeWeekKey = null;
      validFrom = null;
      validUntil = null;
    } else if (availableWeekdays.length) {
      schedulePending = false;
    } else if (!schedulePending) {
      // Old menus without an explicit schedule follow restaurant opening days.
      scheduleMode = "openingHours";
    }

    if (schedulePending) {
      activeWeekKey = null;
    } else if (repeatWeekly) {
      activeWeekKey = null;
    } else if (!activeWeekKey) {
      activeWeekKey = toIsoWeekKeyInRestaurantTimeZone(new Date());
    }
    const active = entry.active === undefined ? true : Boolean(entry.active);
    const dedupeKey = `${name.toLowerCase()}|${price.toFixed(2)}|${category}|${section.toLowerCase()}`;

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
      category,
      section,
      allergens: allergens.length ? allergens : undefined,
      availableWeekdays,
      repeatWeekly,
      activeWeekKey,
      schedulePending,
      scheduleMode,
      validFrom,
      validUntil,
      active
    });
  }

  return {
    items: normalized,
    duplicatesRemoved,
    droppedInvalid
  };
};

const normalizeAllergenList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    const text = String(entry || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);
  }

  return normalized.slice(0, 60);
};

const normalizeStoredDigitalMenuValue = (value: unknown): StoredDigitalMenu => {
  if (!value || typeof value !== "object") return createEmptyStoredDigitalMenu();
  const parsed = value as {
    items?: Array<{
      id?: string;
      name: string;
      description?: string;
      price: unknown;
      category: string;
      section?: unknown;
      allergens?: unknown;
    }>;
    allergens?: unknown;
    updatedAt?: string | null;
  };
  const itemsInput = Array.isArray(parsed.items) ? parsed.items : [];
  const normalized = normalizeStoredDigitalItems(itemsInput);
  return {
    items: normalized.items,
    allergens: normalizeAllergenList(parsed.allergens),
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
        ? parsed.updatedAt.trim()
        : null
  };
};

const normalizeStoredLunchMenuValue = (value: unknown): StoredLunchMenu => {
  if (!value || typeof value !== "object") return createEmptyStoredLunchMenu();
  const parsed = value as {
    items?: Array<{
      id?: string;
      name: string;
      description?: string;
      price: unknown;
      category: string;
      section?: unknown;
      allergens?: unknown;
      availableWeekdays?: unknown;
      repeatWeekly?: unknown;
      activeWeekKey?: unknown;
      availableDates?: unknown;
      schedulePending?: unknown;
      scheduleMode?: unknown;
      validFrom?: unknown;
      validUntil?: unknown;
      active?: unknown;
    }>;
    allergens?: unknown;
    updatedAt?: string | null;
  };
  const itemsInput = Array.isArray(parsed.items) ? parsed.items : [];
  const normalized = normalizeStoredLunchMenuItems(itemsInput);
  return {
    items: normalized.items,
    allergens: normalizeAllergenList(parsed.allergens),
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
        ? parsed.updatedAt.trim()
        : null
  };
};

const normalizeStoredOnboardingDraft = (value: unknown): StoredOnboardingDraft | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const parsed = value as {
    mealSlots?: unknown;
    cuisineTypes?: unknown;
    tableReservationEnabled?: unknown;
    tableReservationChoiceMade?: unknown;
    reservationMode?: unknown;
    reservationExternalLink?: unknown;
    reservationExternalEmail?: unknown;
    reservationExternalPhone?: unknown;
    openingHours?: unknown;
    aboutText?: unknown;
    menuFiles?: unknown;
    digitalMenu?: unknown;
    lunchMenuFiles?: unknown;
    lunchMenu?: unknown;
    lastStep?: unknown;
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
  const reservationMode = normalizeStoredReservationMode(
    parsed.reservationMode,
    Boolean(parsed.tableReservationEnabled)
  );
  return {
    mealSlots: normalizeStoredMealSlots(parsed.mealSlots),
    cuisineTypes,
    tableReservationEnabled: isReservationModeEnabled(reservationMode),
    tableReservationChoiceMade: Boolean(parsed.tableReservationChoiceMade),
    reservationMode,
    reservationExternalLink: normalizeReservationExternalLink(parsed.reservationExternalLink),
    reservationExternalEmail: normalizeReservationExternalEmail(parsed.reservationExternalEmail),
    reservationExternalPhone: normalizeReservationExternalPhone(parsed.reservationExternalPhone),
    openingHours: normalizeOpeningHours(parsed.openingHours),
    aboutText: normalizeAboutText(parsed.aboutText),
    menuFiles: normalizeStoredMenuFiles(parsed.menuFiles),
    digitalMenu: normalizeStoredDigitalMenuValue(parsed.digitalMenu),
    lunchMenuFiles: normalizeStoredMenuFiles(parsed.lunchMenuFiles),
    lunchMenu: normalizeStoredLunchMenuValue(parsed.lunchMenu),
    lastStep: normalizeOnboardingLastStep(parsed.lastStep),
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
        ? parsed.updatedAt.trim()
        : undefined
  };
};

const loadStoredDigitalMenu = async (
  restaurantId: string
): Promise<StoredDigitalMenu> => {
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
          section?: unknown;
          allergens?: unknown;
        }>;
        allergens?: unknown;
      };
      allergens?: unknown;
      updatedAt?: string;
    };
    const allergensInput =
      parsed?.menu?.allergens !== undefined ? parsed.menu.allergens : parsed?.allergens;
    return normalizeStoredDigitalMenuValue({
      items: parsed?.menu?.items,
      allergens: allergensInput,
      updatedAt: parsed?.updatedAt
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "ENOENT") {
      return createEmptyStoredDigitalMenu();
    }
    throw error;
  }
};

const loadStoredLunchMenu = async (
  restaurantId: string
): Promise<StoredLunchMenu> => {
  const filePath = getLunchMenuPath(restaurantId);
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
          section?: unknown;
          allergens?: unknown;
          availableWeekdays?: unknown;
          repeatWeekly?: unknown;
          activeWeekKey?: unknown;
          availableDates?: unknown;
          schedulePending?: unknown;
          scheduleMode?: unknown;
          validFrom?: unknown;
          validUntil?: unknown;
          active?: unknown;
        }>;
        allergens?: unknown;
      };
      allergens?: unknown;
      updatedAt?: string;
    };
    const allergensInput =
      parsed?.menu?.allergens !== undefined ? parsed.menu.allergens : parsed?.allergens;
    return normalizeStoredLunchMenuValue({
      items: parsed?.menu?.items,
      allergens: allergensInput,
      updatedAt: parsed?.updatedAt
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "ENOENT") {
      return createEmptyStoredLunchMenu();
    }
    throw error;
  }
};

const saveStoredDigitalMenu = async (
  restaurantId: string,
  payload: { items: StoredDigitalMenuItem[]; allergens: string[]; updatedAt?: string | null }
): Promise<StoredDigitalMenu> => {
  const filePath = getDigitalMenuPath(restaurantId);
  const updatedAt =
    typeof payload.updatedAt === "string" && payload.updatedAt.trim()
      ? payload.updatedAt.trim()
      : new Date().toISOString();
  await mkdir(DIGITAL_MENU_STORAGE_DIR, { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      JSON.stringify(
      {
        menu: {
          items: payload.items,
          allergens: payload.allergens
        },
        updatedAt
      },
      null,
      2
      ),
      { encoding: "utf-8", mode: 0o600 }
    );
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return {
    items: payload.items,
    allergens: payload.allergens,
    updatedAt
  };
};

const saveStoredLunchMenu = async (
  restaurantId: string,
  payload: { items: StoredLunchMenuItem[]; allergens: string[]; updatedAt?: string | null }
): Promise<StoredLunchMenu> => {
  const filePath = getLunchMenuPath(restaurantId);
  const updatedAt =
    typeof payload.updatedAt === "string" && payload.updatedAt.trim()
      ? payload.updatedAt.trim()
      : new Date().toISOString();
  await mkdir(LUNCH_MENU_STORAGE_DIR, { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      JSON.stringify(
      {
        menu: {
          items: payload.items,
          allergens: payload.allergens
        },
        updatedAt
      },
      null,
      2
      ),
      { encoding: "utf-8", mode: 0o600 }
    );
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return {
    items: payload.items,
    allergens: payload.allergens,
    updatedAt
  };
};

const buildLunchMenuFromDigitalMenu = (
  digitalMenu: StoredDigitalMenu,
  updatedAt: string
): StoredLunchMenu => ({
  items: digitalMenu.items.map((item) => ({
    ...item,
    id: `digital-lunch-${item.id}`,
    allergens: Array.isArray(item.allergens) ? item.allergens : [],
    availableWeekdays: [],
    repeatWeekly: true,
    activeWeekKey: null,
    schedulePending: false,
    scheduleMode: "openingHours",
    validFrom: null,
    validUntil: null,
    active: true
  })),
  allergens: digitalMenu.allergens,
  updatedAt
});

type LunchVisibilitySettings = Pick<StoredRestaurantSettings, "openingHours" | "specialClosures">;

const isLunchItemVisibleForDate = (
  item: StoredLunchMenuItem,
  value: Date,
  settings?: LunchVisibilitySettings
): boolean => {
  const todayWeekday = toLunchWeekdayKeyInRestaurantTimeZone(value);
  const todayWeekKey = toIsoWeekKeyInRestaurantTimeZone(value);
  const todayDateKey = toDateKeyInRestaurantTimeZone(value);
  if (!todayWeekday || !todayWeekKey || !todayDateKey || item.active === false) return false;

  if (settings?.specialClosures.some((entry) => entry.date === todayDateKey)) {
    return false;
  }

  if (item.scheduleMode === "openingHours") {
    const enabledDays = lunchWeekdayKeys.filter(
      (weekday) => settings?.openingHours?.[weekday]?.enabled
    );
    return enabledDays.length ? enabledDays.includes(todayWeekday) : true;
  }
  if (item.scheduleMode === "dateRange") {
    if (!item.validFrom || todayDateKey < item.validFrom) return false;
    if (item.validUntil && todayDateKey > item.validUntil) return false;
    return !item.availableWeekdays.length || item.availableWeekdays.includes(todayWeekday);
  }
  if (item.scheduleMode === "weekdays") {
    return item.availableWeekdays.includes(todayWeekday);
  }

  if (!item.availableWeekdays.includes(todayWeekday)) return false;
  if (item.repeatWeekly) return true;
  return item.activeWeekKey === todayWeekKey;
};

const filterLunchMenuForDate = (
  stored: StoredLunchMenu,
  value: Date,
  settings?: LunchVisibilitySettings
): StoredLunchMenu => {
  const todayWeekday = toLunchWeekdayKeyInRestaurantTimeZone(value);
  if (!todayWeekday) {
    return { items: [], allergens: stored.allergens, updatedAt: stored.updatedAt };
  }

  return {
    items: stored.items.filter((item) => isLunchItemVisibleForDate(item, value, settings)),
    allergens: stored.allergens,
    updatedAt: stored.updatedAt
  };
};

const filterLunchMenuForCurrentWeek = (
  stored: StoredLunchMenu,
  value: Date,
  settings?: LunchVisibilitySettings
): StoredLunchMenu => {
  const weekKey = toIsoWeekKeyInRestaurantTimeZone(value);
  const dateKey = toDateKeyInRestaurantTimeZone(value);
  const weekday = toLunchWeekdayKeyInRestaurantTimeZone(value);
  if (!weekKey || !dateKey || !weekday) {
    return {
      items: [],
      allergens: stored.allergens,
      updatedAt: stored.updatedAt
    };
  }

  const referenceDate = new Date(`${dateKey}T12:00:00Z`);
  referenceDate.setUTCDate(referenceDate.getUTCDate() - lunchWeekdayKeys.indexOf(weekday));
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(referenceDate);
    day.setUTCDate(referenceDate.getUTCDate() + index);
    return day;
  });

  return {
    items: stored.items.filter((item) =>
      weekDates.some((date) => isLunchItemVisibleForDate(item, date, settings))
    ),
    allergens: stored.allergens,
    updatedAt: stored.updatedAt
  };
};

const toPublicLunchMenuItems = (items: StoredLunchMenuItem[]) =>
  items.map(({ schedulePending: _schedulePending, ...item }) => item);

const hasEnabledOpeningHours = (openingHours: StoredOpeningHours): boolean =>
  openingHourDayKeys.some((dayKey) => Boolean(openingHours?.[dayKey]?.enabled));

const isValidOnboardingDraftForCompletion = (
  draft: StoredOnboardingDraft | undefined
): draft is StoredOnboardingDraft =>
  Boolean(
    draft &&
      draft.mealSlots.length > 0 &&
      draft.cuisineTypes.length > 0 &&
      draft.tableReservationChoiceMade &&
      (draft.reservationMode !== "external" ||
        hasReservationExternalContact(
          draft.reservationExternalLink,
          draft.reservationExternalEmail,
          draft.reservationExternalPhone
        )) &&
      hasEnabledOpeningHours(draft.openingHours)
  );

const backfillExistingRestaurantOnboardingCompletion = async (
  app: FastifyInstance,
  ctx: AppContext
): Promise<void> => {
  try {
    const restaurants = await ctx.restaurantRepo.list();
    const completedAt = new Date().toISOString();
    for (const restaurant of restaurants) {
      const settings = await loadRestaurantSettings(restaurant.id);
      if (settings.onboardingCompletedAt || settings.onboardingDraft) continue;
      await saveRestaurantSettings(restaurant.id, {
        onboardingCompletedAt: completedAt
      });
    }
  } catch (error) {
    app.log.error({ error }, "failed to backfill restaurant onboarding completion");
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

const requirePrisma = (ctx: AppContext): NonNullable<AppContext["prisma"]> => {
  if (!ctx.prisma) {
    throw new HttpError(503, "PRISMA_REQUIRED", "Diese Funktion benötigt die Datenbank.");
  }
  return ctx.prisma;
};

type ReviewImageLike = {
  id: string;
  url: string;
  mimeType: string;
  createdAt: Date;
};

type ReviewLike = {
  id: string;
  restaurantId: string;
  rating: number;
  text: string;
  authorName: string | null;
  replyText: string | null;
  replyCreatedAt: Date | null;
  replyUpdatedAt: Date | null;
  restaurantSeenAt: Date | null;
  visibilityStatus?: "visible" | "removed";
  moderatedAt?: Date | null;
  moderationNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
  images?: ReviewImageLike[];
  report?: {
    id: string;
    reason: string;
    note: string | null;
    status: string;
    reportedAt: Date;
    resolvedAt: Date | null;
    resolutionNote: string | null;
    restoredAt: Date | null;
  } | null;
};

const serializeReview = (review: ReviewLike, includePrivate = false) => ({
  id: review.id,
  restaurantId: review.restaurantId,
  rating: review.rating,
  text: review.text,
  authorName: review.authorName || "Gast",
  images: (review.images || []).map((image) => ({
    id: image.id,
    url: image.url,
    mimeType: image.mimeType,
    createdAt: image.createdAt.toISOString()
  })),
  replyText: review.replyText || "",
  replyCreatedAt: review.replyCreatedAt?.toISOString() || null,
  replyUpdatedAt: review.replyUpdatedAt?.toISOString() || null,
  createdAt: review.createdAt.toISOString(),
  updatedAt: review.updatedAt.toISOString(),
  ...(includePrivate
    ? {
        restaurantSeenAt: review.restaurantSeenAt?.toISOString() || null,
        isUnread: !review.restaurantSeenAt,
        visibilityStatus: review.visibilityStatus || "visible",
        moderatedAt: review.moderatedAt?.toISOString() || null,
        moderationNote: review.moderationNote || "",
        report: review.report
          ? {
              id: review.report.id,
              reason: review.report.reason,
              note: review.report.note || "",
              status: review.report.status,
              reportedAt: review.report.reportedAt.toISOString(),
              resolvedAt: review.report.resolvedAt?.toISOString() || null,
              resolutionNote: review.report.resolutionNote || "",
              restoredAt: review.report.restoredAt?.toISOString() || null
            }
          : null
      }
    : {})
});

const getRequestIp = (request: { ip?: string; headers: Record<string, unknown> }): string | undefined => {
  const forwarded = request.headers["x-forwarded-for"];
  const forwardedText = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstForwarded = typeof forwardedText === "string" ? forwardedText.split(",")[0]?.trim() : "";
  return firstForwarded || request.ip || undefined;
};

const getReviewStatsMap = async (
  ctx: AppContext,
  restaurantIds: string[]
): Promise<Map<string, { ratingAverage: number; ratingCount: number }>> => {
  if (!ctx.prisma || !restaurantIds.length) return new Map();
  const rows = await ctx.prisma.restaurantReview.groupBy({
    by: ["restaurantId"],
    where: { restaurantId: { in: restaurantIds }, visibilityStatus: "visible" },
    _avg: { rating: true },
    _count: { _all: true }
  });
  return new Map(
    rows.map((row) => [
      row.restaurantId,
      {
        ratingAverage: Number(row._avg.rating || 0),
        ratingCount: Number(row._count._all || 0)
      }
    ])
  );
};

type BufferedUpload = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

const parseMultipartFieldText = (value: unknown): string => {
  if (Buffer.isBuffer(value)) return value.toString("utf-8");
  return String(value ?? "");
};

type RegistrationUploadInput = {
  body: z.infer<typeof registerSchema>;
  regularMenuFiles: BufferedUpload[];
  lunchMenuFiles: BufferedUpload[];
};

const parseBooleanField = (value: string): boolean => {
  const text = value.trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on";
};

const parseMealSlotsField = (value: string): unknown => {
  const text = value.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall back to comma-separated values
  }
  return text.split(",").map((entry) => entry.trim()).filter(Boolean);
};

const parseStringArrayField = (value: string): unknown => {
  const text = value.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall back to comma-separated values
  }
  return text.split(",").map((entry) => entry.trim()).filter(Boolean);
};

const parseRegistrationMultipart = async (
  request: FastifyRequest
): Promise<RegistrationUploadInput> => {
  const multipartRequest = request as typeof request & {
    parts: (options?: unknown) => AsyncIterable<{
      type?: string;
      fieldname?: string;
      value?: unknown;
      mimetype?: string;
      filename?: string;
      file?: NodeJS.ReadableStream;
    }>;
  };
  const fields: Record<string, unknown> = {};
  const regularMenuFiles: BufferedUpload[] = [];
  const lunchMenuFiles: BufferedUpload[] = [];
  let totalUploadBytes = 0;

  try {
    const parts = multipartRequest.parts({
      limits: {
        files: MAX_MENU_FILES * 2,
        fileSize: MAX_MENU_FILE_SIZE
      }
    });

    for await (const part of parts) {
      if (part.type === "field" && part.fieldname) {
        const value = parseMultipartFieldText(part.value);
        if (part.fieldname === "termsAccepted" || part.fieldname === "privacyAccepted") {
          fields[part.fieldname] = parseBooleanField(value);
        } else if (part.fieldname === "lat" || part.fieldname === "lng") {
          fields[part.fieldname] = value ? Number(value) : undefined;
        } else if (part.fieldname === "mealSlots") {
          fields[part.fieldname] = parseMealSlotsField(value);
        } else if (part.fieldname === "providerScopes") {
          fields[part.fieldname] = parseStringArrayField(value);
        } else {
          fields[part.fieldname] = value;
        }
        continue;
      }

      if (part.type === "file" && part.file) {
        const fieldname = String(part.fieldname || "");
        const target =
          fieldname === "lunchMenuFiles" || fieldname === "lunchMenuFile"
            ? lunchMenuFiles
            : fieldname === "regularMenuFiles" || fieldname === "regularMenuFile" || fieldname === "menuFiles"
            ? regularMenuFiles
            : null;
        if (!target) {
          await readStreamToBuffer(part.file);
          continue;
        }
        if (target.length >= MAX_MENU_FILES) {
          throw new HttpError(
            400,
            "TOO_MANY_FILES",
            `Maximal ${MAX_MENU_FILES} Dateien pro Kartenbereich erlaubt.`
          );
        }
        const rawBuffer = await readMenuUploadStream(part.file, part.filename);
        totalUploadBytes += rawBuffer.length;
        assertMenuBatchSize(totalUploadBytes);
        const normalized = await normalizeMenuUpload({
          buffer: rawBuffer,
          filename: part.filename,
          declaredMimeType: part.mimetype
        });
        target.push({
          buffer: normalized.buffer,
          filename: normalized.filename || `${fieldname}-${target.length + 1}`,
          mimeType: normalized.mimeType
        });
      }
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof MenuUploadError) {
      throw new HttpError(error.status, error.code, error.message, error.details);
    }
    const code = (error as { code?: string })?.code;
    if (code === "FST_REQ_FILE_TOO_LARGE") {
      throw new HttpError(413, "FILE_TOO_LARGE", "File is too large (max 10 MB)");
    }
    if (code === "FST_FILES_LIMIT") {
      throw new HttpError(400, "TOO_MANY_FILES", "Zu viele Dateien hochgeladen.");
    }
    throw error;
  }

  return {
    body: parseOrThrow(registerSchema, fields),
    regularMenuFiles,
    lunchMenuFiles
  };
};

const writeBufferedMenuFiles = async (
  request: { headers: Record<string, unknown>; protocol?: string },
  restaurantId: string,
  files: BufferedUpload[],
  prefixLabel: string
): Promise<Array<{ filePath: string; entry: StoredMenuFile }>> => {
  await mkdir(MENU_UPLOAD_DIR, { recursive: true });
  const written: Array<{ filePath: string; entry: StoredMenuFile }> = [];
  for (const file of files) {
    const extension = extensionFromMime(file.mimeType, file.filename);
    const fileName = `${restaurantId}-${prefixLabel}-${Date.now()}-${randomUUID()}${extension}`;
    const filePath = path.join(MENU_UPLOAD_DIR, fileName);
    await writeFile(filePath, file.buffer);
    const url = toPublicUploadUrl(request, MENU_UPLOAD_PREFIX, fileName);
    written.push({
      filePath,
      entry: {
        id: randomUUID(),
        name: file.filename || deriveMenuFileNameFromUrl(url, file.mimeType),
        url,
        mimeType: file.mimeType,
        uploadedAt: new Date().toISOString()
      }
    });
  }
  return written;
};

export const registerRestaurantRoutes = (app: FastifyInstance, ctx: AppContext, websiteSyncOnly = false) => {
  if (!websiteSyncOnly) void backfillExistingRestaurantOnboardingCompletion(app, ctx);

  app.post("/api/restaurants/register", async (request) => {
    const isMultipart =
      typeof (request as FastifyRequest & { isMultipart?: () => boolean }).isMultipart === "function" &&
      Boolean((request as FastifyRequest & { isMultipart: () => boolean }).isMultipart());
    const parsedRegistration = isMultipart
      ? await parseRegistrationMultipart(request)
      : {
          body: parseOrThrow(registerSchema, request.body),
          regularMenuFiles: [] as BufferedUpload[],
          lunchMenuFiles: [] as BufferedUpload[]
        };
    const { body, regularMenuFiles, lunchMenuFiles } = parsedRegistration;

    try {
      const restaurant = await ctx.restaurantService.register({
        ...body,
        mealSlots: body.mealSlots as MealSlot[] | undefined
      });
      const writtenFiles: string[] = [];
      try {
        const regularFiles = await writeBufferedMenuFiles(request, restaurant.id, regularMenuFiles, "regular-menu");
        const lunchFiles = await writeBufferedMenuFiles(request, restaurant.id, lunchMenuFiles, "lunch-menu");
        writtenFiles.push(...regularFiles.map((item) => item.filePath), ...lunchFiles.map((item) => item.filePath));

        let nextRestaurant = restaurant;
        if (regularFiles[0]) {
          nextRestaurant = await ctx.restaurantService.setMenuFile({
            restaurantId: restaurant.id,
            menuUrl: regularFiles[0].entry.url,
            menuMimeType: regularFiles[0].entry.mimeType
          });
        }
        if (regularFiles.length || lunchFiles.length || body.providerScopes !== undefined) {
          await saveRestaurantSettings(restaurant.id, {
            providerScopes: body.providerScopes,
            menuFiles: regularFiles.map((item) => item.entry),
            lunchMenuFiles: lunchFiles.map((item) => item.entry)
          });
        }
        restaurant.menuUrl = nextRestaurant.menuUrl;
        restaurant.menuMimeType = nextRestaurant.menuMimeType;
      } catch (error) {
        for (const filePath of writtenFiles) {
          await unlink(filePath).catch(() => undefined);
        }
        if (ctx.prisma) {
          await ctx.prisma.restaurant.delete({ where: { id: restaurant.id } }).catch(() => undefined);
        }
        throw error;
      }

      void ctx.emailService
        .sendRestaurantRegistrationNotifyAdmin({
          restaurantName: restaurant.name,
          restaurantEmail: restaurant.email,
          phone: restaurant.phone,
          address: restaurant.address,
          postalCode: restaurant.postalCode,
          requestedAtIso: restaurant.approvalRequestedAt
        })
        .catch((error) => {
          request.log.error(
            { error, restaurantEmail: restaurant.email },
            "failed to send registration email to admin"
          );
        });

      void ctx.emailService
        .sendRestaurantRegistrationReceived({
          restaurantName: restaurant.name,
          restaurantEmail: restaurant.email
        })
        .catch((error) => {
          request.log.error(
            { error, restaurantEmail: restaurant.email },
            "failed to send registration email to restaurant user"
          );
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
    const searchText = query.query || query.postalCode || "";
    const origin = await ctx.geoService.resolveSearchCoordinates(searchText);
    if (!origin) {
      throw new HttpError(400, "LOCATION_UNKNOWN", "Ort oder Postleitzahl nicht gefunden");
    }

    const restaurants = await ctx.restaurantRepo.list();
    const offers = await ctx.offerRepo.listActive();
    const reviewStats = await getReviewStatsMap(ctx, restaurants.map((restaurant) => restaurant.id));
    const today = new Date();
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
        const stats = reviewStats.get(restaurant.id) || { ratingAverage: 0, ratingCount: 0 };
        let hasDigitalMenu = false;
        let lunchMenu = createEmptyStoredLunchMenu();
        let hasLunchMenu = false;
        try {
          const digitalMenu = await loadStoredDigitalMenu(restaurant.id);
          hasDigitalMenu = digitalMenu.items.length > 0;
        } catch {
          hasDigitalMenu = false;
        }
        if (mealSlot === "lunch") {
          try {
            const storedLunchMenu = await loadStoredLunchMenu(restaurant.id);
            lunchMenu = filterLunchMenuForDate(storedLunchMenu, today, settings);
            hasLunchMenu =
              filterLunchMenuForCurrentWeek(storedLunchMenu, today, settings).items.length > 0;
          } catch {
            lunchMenu = createEmptyStoredLunchMenu();
            hasLunchMenu = false;
          }
        }

        return {
          restaurant: {
            ...ctx.restaurantService.toPublic(restaurant),
            reservationMode: settings.reservationMode,
            reservationExternalLink: settings.reservationExternalLink,
            reservationExternalEmail: settings.reservationExternalEmail,
            reservationExternalPhone: settings.reservationExternalPhone,
            logoUrl: settings.logoUrl,
            cuisineTypes: settings.cuisineTypes,
            openingHours: settings.openingHours,
            specialClosures: settings.specialClosures,
            aboutText: settings.aboutText,
            socialLinks: settings.socialLinks,
            providerScopes: settings.providerScopes,
            eventProfile: settings.eventProfile,
            eventSetupCompletedAt: settings.eventSetupCompletedAt ?? null,
            hasLunchMenu
          },
          distanceKm: Number(distanceKm.toFixed(2)),
          mealSlot,
          tableReservationEnabled: settings.tableReservationEnabled,
          reservationMode: settings.reservationMode,
          reservationExternalLink: settings.reservationExternalLink,
          reservationExternalEmail: settings.reservationExternalEmail,
          reservationExternalPhone: settings.reservationExternalPhone,
          cuisineTypes: settings.cuisineTypes,
          openingHours: settings.openingHours,
          specialClosures: settings.specialClosures,
          aboutText: settings.aboutText,
          socialLinks: settings.socialLinks,
          providerScopes: settings.providerScopes,
          eventProfile: settings.eventProfile,
          eventSetupCompletedAt: settings.eventSetupCompletedAt ?? null,
          hasDigitalMenu,
          hasLunchMenu,
          lunchMenu:
            mealSlot === "lunch"
              ? {
                  items: toPublicLunchMenuItems(lunchMenu.items),
                  allergens: lunchMenu.allergens,
                  updatedAt: lunchMenu.updatedAt
                }
              : undefined,
          ratingAverage: stats.ratingAverage,
          ratingCount: stats.ratingCount,
          activeOfferCount: restaurantOffers.length,
          offers: restaurantOffers.map((offer) => ({
            id: offer.id,
            title: offer.title,
            description: offer.description,
            price: offer.price,
            tags: offer.tags,
            imageUrl: offer.imageUrl,
            mealSlot: offer.mealSlot,
            preorderEnabled: offer.preorderEnabled
          })),
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

  app.get("/api/catering/discover", async (request) => {
    const query = parseOrThrow(discoverCateringSchema, request.query);
    const radiusKm = query.radiusKm ?? Number(process.env.DEFAULT_RADIUS_KM ?? 10);
    const searchText = query.query || query.postalCode || "";
    const origin = await ctx.geoService.resolveSearchCoordinates(searchText);
    if (!origin) {
      throw new HttpError(400, "LOCATION_UNKNOWN", "Ort oder Postleitzahl nicht gefunden");
    }

    const restaurants = await ctx.restaurantRepo.list();
    const activeOffersByRestaurant = new Map<string, Array<{
      id: string;
      title: string;
      description: string;
      price: number | null;
      imageUrls: string[];
    }>>();
    if (ctx.prisma) {
      const activeOffers = await ctx.prisma.cateringOffer.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, restaurantId: true, title: true, description: true, price: true, imageUrls: true }
      });
      activeOffers.forEach((offer) => {
        const current = activeOffersByRestaurant.get(offer.restaurantId) || [];
        current.push({
          id: offer.id,
          title: offer.title,
          description: offer.description,
          price: offer.price === null ? null : Number(offer.price),
          imageUrls: offer.imageUrls || []
        });
        activeOffersByRestaurant.set(offer.restaurantId, current);
      });
    }
    const rows = await Promise.all(
      restaurants.map(async (restaurant) => {
        if (restaurant.approvalStatus !== "approved") return null;
        const settings = await loadRestaurantSettings(restaurant.id);
        const profile = settings.cateringProfile;
        const hasPublicContact = Boolean(profile.contactUrl || profile.contactEmail || profile.contactPhone || restaurant.phone);
        if (
          !settings.providerScopes.includes("catering") ||
          !settings.cateringSetupCompletedAt ||
          !profile.offeringsText ||
          !hasPublicContact
        ) {
          return null;
        }

        const distanceKm = haversineKm(origin, { lat: restaurant.lat, lng: restaurant.lng });
        if (distanceKm > radiusKm) return null;
        return {
          id: restaurant.id,
          name: restaurant.name,
          address: restaurant.address,
          postalCode: restaurant.postalCode,
          phone: restaurant.phone,
          email: restaurant.email,
          lat: restaurant.lat,
          lng: restaurant.lng,
          distanceKm: Number(distanceKm.toFixed(2)),
          logoUrl: settings.logoUrl,
          socialLinks: settings.socialLinks,
          cateringProfile: profile,
          cateringOffers: activeOffersByRestaurant.get(restaurant.id) || []
        };
      })
    );

    return rows
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  });

  const requireCateringOffersStore = () => {
    if (!ctx.prisma) {
      throw new HttpError(503, "CATERING_OFFERS_UNAVAILABLE", "Catering-Angebote sind momentan nicht verfügbar.");
    }
    return ctx.prisma;
  };

  const assertCateringConfigured = async (restaurantId: string) => {
    const settings = await loadRestaurantSettings(restaurantId);
    if (!settings.providerScopes.includes("catering") || !settings.cateringSetupCompletedAt) {
      throw new HttpError(400, "CATERING_NOT_ENABLED", "Bitte Catering zuerst in den Einstellungen aktivieren und speichern.");
    }
  };

  app.get("/api/restaurants/catering/offers", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const prisma = requireCateringOffersStore();
    const offers = await prisma.cateringOffer.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
    return offers.map((offer) => ({ ...offer, price: offer.price === null ? null : Number(offer.price) }));
  });

  app.post("/api/restaurants/catering/offers", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const prisma = requireCateringOffersStore();
    await assertCateringConfigured(restaurantId);
    const body = parseOrThrow(cateringOfferInputSchema, request.body);
    const nextSortOrder = body.sortOrder ?? (await prisma.cateringOffer.count({ where: { restaurantId } }));
    const offer = await prisma.cateringOffer.create({
      data: {
        restaurantId,
        title: body.title,
        description: body.description,
        price: body.price ?? null,
        imageUrls: body.imageUrls ?? [],
        active: body.active ?? true,
        sortOrder: nextSortOrder
      }
    });
    return { ...offer, price: offer.price === null ? null : Number(offer.price), imageUrls: offer.imageUrls || [] };
  });

  app.patch("/api/restaurants/catering/offers/:id", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const prisma = requireCateringOffersStore();
    const id = String((request.params as { id?: string }).id || "").trim();
    const body = parseOrThrow(cateringOfferUpdateSchema, request.body);
    const existing = await prisma.cateringOffer.findFirst({ where: { id, restaurantId } });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Catering-Angebot nicht gefunden.");
    const offer = await prisma.cateringOffer.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.price !== undefined ? { price: body.price } : {}),
        ...(body.imageUrls !== undefined ? { imageUrls: body.imageUrls } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {})
      }
    });
    return { ...offer, price: offer.price === null ? null : Number(offer.price), imageUrls: offer.imageUrls || [] };
  });

  app.delete("/api/restaurants/catering/offers/:id", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const prisma = requireCateringOffersStore();
    const id = String((request.params as { id?: string }).id || "").trim();
    const existing = await prisma.cateringOffer.findFirst({ where: { id, restaurantId } });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Catering-Angebot nicht gefunden.");
    await prisma.cateringOffer.delete({ where: { id } });
    return { ok: true, id };
  });

  app.post("/api/restaurants/catering/images", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    await assertCateringConfigured(restaurantId);
    const fileRequest = request as typeof request & {
      file: (options?: unknown) => Promise<{
        mimetype: string;
        filename?: string;
        file: NodeJS.ReadableStream;
      } | undefined>;
    };

    let part;
    try {
      part = await fileRequest.file({ limits: { files: 1, fileSize: MAX_MENU_FILE_SIZE } });
    } catch (error) {
      if ((error as { code?: string })?.code === "FST_REQ_FILE_TOO_LARGE") {
        throw new HttpError(413, "FILE_TOO_LARGE", "Bild ist zu groß (maximal 10 MB).");
      }
      throw error;
    }
    if (!part) throw new HttpError(400, "INVALID_INPUT", "Keine Bilddatei hochgeladen.");
    const mimeType = String(part.mimetype || "").toLowerCase();
    if (!isAllowedOfferImageMime(mimeType)) {
      throw new HttpError(400, "UNSUPPORTED_FILE_TYPE", "Nur JPG, PNG oder WEBP sind für Catering-Bilder erlaubt.");
    }
    await mkdir(CATERING_IMAGE_UPLOAD_DIR, { recursive: true });
    const extension = extensionFromMime(mimeType, part.filename);
    const fileName = `${restaurantId}-catering-${Date.now()}-${randomUUID()}${extension}`;
    await pipeline(part.file, createWriteStream(path.join(CATERING_IMAGE_UPLOAD_DIR, fileName)));
    return {
      imageUrl: toPublicUploadUrl(request, CATERING_IMAGE_UPLOAD_PREFIX, fileName),
      mimeType
    };
  });

  app.get("/api/restaurants/me", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const restaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!restaurant) {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }
    const settings = await loadRestaurantSettings(restaurantId);
    return {
      restaurant: toRestaurantWithSettings(ctx.restaurantService.toPublic(restaurant), settings)
    };
  });

  app.patch("/api/restaurants/me", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(updateRestaurantProfileSchema, request.body);
    const contactInputErrors = validateProvidedReservationContacts(body);
    if (contactInputErrors.length) {
      throw new HttpError(400, "INVALID_RESERVATION_CONTACT", contactInputErrors.join(" "));
    }

    try {
      const currentRestaurant = await ctx.restaurantRepo.findById(restaurantId);
      if (!currentRestaurant) {
        throw new Error("RESTAURANT_NOT_FOUND");
      }

      const hasRestaurantProfilePatch =
        body.name !== undefined ||
        body.email !== undefined ||
        body.phone !== undefined ||
        body.address !== undefined ||
        body.postalCode !== undefined ||
        body.mealSlots !== undefined;

      const restaurant = hasRestaurantProfilePatch
        ? await ctx.restaurantService.updateProfile({
            restaurantId,
            name: body.name,
            email: body.email,
            phone: body.phone,
            address: body.address,
            postalCode: body.postalCode,
            mealSlots: body.mealSlots as MealSlot[] | undefined
          })
        : ctx.restaurantService.toPublic(currentRestaurant);

      const settings =
        body.tableReservationEnabled !== undefined ||
        body.reservationMode !== undefined ||
        body.reservationExternalLink !== undefined ||
        body.reservationExternalEmail !== undefined ||
        body.reservationExternalPhone !== undefined ||
        body.cuisineTypes !== undefined ||
        body.openingHours !== undefined ||
        body.specialClosures !== undefined ||
        body.aboutText !== undefined ||
        body.websiteSyncUrl !== undefined ||
        body.socialLinks !== undefined ||
        body.providerScopes !== undefined ||
        body.eventProfile !== undefined ||
        body.eventSetupCompletedAt !== undefined ||
        body.cateringProfile !== undefined ||
        body.cateringSetupCompletedAt !== undefined
          ? await saveRestaurantSettings(restaurantId, {
              tableReservationEnabled: body.tableReservationEnabled,
              reservationMode: body.reservationMode,
              reservationExternalLink: body.reservationExternalLink,
              reservationExternalEmail: body.reservationExternalEmail,
              reservationExternalPhone: body.reservationExternalPhone,
              cuisineTypes: body.cuisineTypes,
              openingHours: body.openingHours,
              specialClosures: body.specialClosures,
              aboutText: body.aboutText,
              websiteSyncUrl: body.websiteSyncUrl,
              socialLinks: body.socialLinks,
              providerScopes: body.providerScopes,
              eventProfile: body.eventProfile,
              eventSetupCompletedAt: body.eventSetupCompletedAt,
              cateringProfile: body.cateringProfile,
              cateringSetupCompletedAt: body.cateringSetupCompletedAt
            })
          : await loadRestaurantSettings(restaurantId);

      return {
        restaurant: toRestaurantWithSettings(restaurant, settings)
      };
    } catch (error) {
      if (error instanceof Error && error.message === "RESTAURANT_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
      }
      if (error instanceof Error && error.message === "EMAIL_EXISTS") {
        throw new HttpError(409, "EMAIL_EXISTS", "Email already registered");
      }
      if (error instanceof Error && error.message === "POSTAL_CODE_UNKNOWN") {
        throw new HttpError(400, "POSTAL_CODE_UNKNOWN", "Unknown postal code");
      }
      throw error;
    }
  });

  app.get("/api/restaurants/website-sync", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const draft = await findLatestWebsiteSyncDraft(restaurantId);
    return websiteSyncResponse(draft);
  });

  app.post("/api/restaurants/website-sync/cancel", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const { draftId } = parseOrThrow(z.object({ draftId: z.string().uuid() }), request.body);
    const draft = await readWebsiteSyncDraft(draftId);
    if (!draft || draft.restaurantId !== restaurantId) throw new HttpError(404, "WEBSITE_SYNC_DRAFT_NOT_FOUND", "Entwurf nicht gefunden.");
    if (draft.status === "running") {
      websiteSyncControllers.get(draft.id)?.abort();
      await websiteSyncJobs.get(draft.id)?.catch(() => undefined);
      draft.status = "cancelled";
      draft.step = "Analyse abgebrochen";
      await writeWebsiteSyncDraft(draft);
    }
    return websiteSyncResponse(draft);
  });

  app.post("/api/restaurants/website-sync/start", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(websiteSyncStartSchema, request.body);
    const settings = await loadRestaurantSettings(restaurantId);
    const requestedUrl = body.websiteUrl !== undefined ? body.websiteUrl : settings.websiteSyncUrl;
    const websiteUrl = normalizeWebsiteSyncUrl(requestedUrl);
    if (!websiteUrl) {
      throw new HttpError(400, "WEBSITE_URL_INVALID", "Bitte eine gültige Website-Adresse eingeben.");
    }

    const latestDraft = await findLatestWebsiteSyncDraft(restaurantId);
    if (latestDraft?.status === "running") {
      if (latestDraft.websiteUrl === websiteUrl && websiteSyncJobs.has(latestDraft.id)) return websiteSyncResponse(latestDraft);
      websiteSyncControllers.get(latestDraft.id)?.abort();
      await websiteSyncJobs.get(latestDraft.id)?.catch(() => undefined);
      await writeWebsiteSyncDraft({ ...latestDraft, status: "cancelled", step: "Analyse abgebrochen" });
    }

    // Saving the URL is harmless configuration. Imported data is still only saved after explicit confirmation.
    if (!websiteSyncOnly) await saveRestaurantSettings(restaurantId, { websiteSyncUrl: websiteUrl });
    const createdAt = new Date().toISOString();
    const draft: StoredWebsiteSyncDraft = {
      id: randomUUID(),
      restaurantId,
      websiteUrl,
      status: "running",
      step: "Website wird geprüft",
      progress: 5,
      createdAt,
      expiresAt: new Date(Date.now() + WEBSITE_SYNC_DRAFT_TTL_MS).toISOString(),
      appliedSections: [],
      skippedSections: [],
      appliedSourceIds: [],
      skippedSourceIds: []
    };
    await writeWebsiteSyncDraft(draft);
    await setLatestWebsiteSyncDraft(restaurantId, draft.id);

    const controller = new AbortController();
    websiteSyncControllers.set(draft.id, controller);
    const job = (async () => {
      try {
        const result = await ctx.websiteSyncService.analyze(websiteUrl, async (step, progress) => {
          const current = await readWebsiteSyncDraft(draft.id);
          if (!current || current.status !== "running") return;
          await writeWebsiteSyncDraft({ ...current, step, progress: Math.max(current.progress, progress) });
        }, controller.signal);
        const current = await readWebsiteSyncDraft(draft.id);
        if (!current || current.status !== "running" || controller.signal.aborted) return;
        await writeWebsiteSyncDraft({
          ...current,
          status: "completed",
          step: "Entwurf ist bereit",
          progress: 100,
          completedAt: new Date().toISOString(),
          result
        });
      } catch (error) {
        const current = await readWebsiteSyncDraft(draft.id);
        if (!current || controller.signal.aborted) return;
        const known = error instanceof WebsiteSyncError;
        await writeWebsiteSyncDraft({
          ...current,
          status: "failed",
          step: "Synchronisierung konnte nicht abgeschlossen werden",
          completedAt: new Date().toISOString(),
          error: {
            code: known ? error.code : "WEBSITE_SYNC_FAILED",
            message: known ? error.message : "Die Website konnte nicht vollständig analysiert werden. Bitte später erneut versuchen."
          }
        });
        app.log.warn({ err: error, restaurantId, draftId: draft.id }, "website synchronization failed");
      } finally {
        websiteSyncJobs.delete(draft.id);
        websiteSyncControllers.delete(draft.id);
      }
    })();
    websiteSyncJobs.set(draft.id, job);
    return websiteSyncResponse(draft);
  });

  app.post("/api/restaurants/website-sync/apply", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(websiteSyncApplySchema, request.body);
    const draft = await readWebsiteSyncDraft(body.draftId);
    if (!draft || draft.restaurantId !== restaurantId) {
      throw new HttpError(404, "WEBSITE_SYNC_DRAFT_NOT_FOUND", "Der Synchronisierungsentwurf wurde nicht gefunden oder ist abgelaufen.");
    }
    if (draft.status !== "completed" || !draft.result) {
      throw new HttpError(409, "WEBSITE_SYNC_NOT_READY", "Der Website-Entwurf ist noch nicht bereit.");
    }

    const requestedSection = body.section as WebsiteSyncSection;
    const source = body.sourceId ? websiteDraftSourceForId(draft.result, body.sourceId) : undefined;
    if (body.sourceId && !source) {
      throw new HttpError(400, "WEBSITE_SYNC_SOURCE_NOT_FOUND", "Diese Menüquelle gehört nicht zu diesem Website-Entwurf.");
    }
    if (body.sourceId && requestedSection === "openingHours") {
      throw new HttpError(400, "WEBSITE_SYNC_INVALID_SOURCE", "Öffnungszeiten können nicht aus einer Menüquelle übernommen werden.");
    }

    // Older clients still apply an aggregate area. New clients apply one exact
    // source and may only choose a target area for deliberately unclassified data.
    const sourceSection = source?.section === "regular" ? "dinner" : source?.section;
    const section: WebsiteSyncSection = source
      ? sourceSection === "unclassified"
        ? (body.targetSection || "unclassified")
        : sourceSection || "unclassified"
      : requestedSection === "regular"
        ? "dinner"
        : requestedSection;
    if (source && sourceSection !== "unclassified" && body.targetSection && body.targetSection !== section) {
      throw new HttpError(400, "WEBSITE_SYNC_INVALID_TARGET", "Eine eindeutig erkannte Menüquelle kann nicht in einen anderen Bereich verschoben werden.");
    }
    if (source && section === "unclassified" && body.action !== "skip") {
      throw new HttpError(400, "WEBSITE_SYNC_TARGET_REQUIRED", "Bitte ordne diese unklare Quelle zuerst einem Menübereich zu.");
    }

    const isSkipped = body.action === "skip";
    const alreadyHandled = source
      ? (draft.appliedSourceIds ?? []).includes(source.id) || (draft.skippedSourceIds ?? []).includes(source.id)
      : draft.appliedSections.includes(section) || draft.skippedSections.includes(section);
    if (alreadyHandled) {
      throw new HttpError(409, "WEBSITE_SYNC_ALREADY_APPLIED", "Dieser Bereich wurde bereits bestätigt.");
    }

    if (!isSkipped && section === "openingHours") {
      const hasOpenDay = Object.values(draft.result.openingHours || {}).some((entry) => entry?.enabled);
      if (!draft.result.openingHours || !hasOpenDay) {
        throw new HttpError(400, "WEBSITE_SYNC_SECTION_EMPTY", "Auf der Website wurden keine verwertbaren Öffnungszeiten gefunden.");
      }
      const result = draft.result as WebsiteSyncResult & { openingHoursConflicts?: string[] };
      if (result.openingHoursConflicts?.length) throw new HttpError(409, "WEBSITE_SYNC_HOURS_CONFLICT", "Widersprüchliche Öffnungszeiten bitte manuell in den Einstellungen pflegen.");
      const settings = await loadRestaurantSettings(restaurantId);
      const detected = Object.fromEntries(
        Object.entries(draft.result.openingHours)
          .filter(([, value]) => (value as { detected?: boolean }).detected === true)
          .map(([day, value]) => {
            const entry = value as { enabled: boolean; openTime: string; closeTime: string; openEnded?: boolean };
            return [day, {
              enabled: entry.enabled,
              openTime: entry.openTime,
              closeTime: entry.closeTime,
              openEnded: Boolean(entry.openEnded)
            }];
          })
      );
      await saveRestaurantSettings(restaurantId, { openingHours: { ...settings.openingHours, ...detected } });
    }

    if (!isSkipped && (section === "breakfast" || section === "dinner" || section === "drinks")) {
      const menu = source || websiteDraftMenuForSection(draft.result, section);
      if (!menu?.items.length) {
        throw new HttpError(400, "WEBSITE_SYNC_SECTION_EMPTY", "Für diesen Bereich wurden keine Gerichte erkannt.");
      }
      const availableIds = new Set(menu.items.map((item) => item.id));
      const selectedIds = body.selectedItemIds?.length ? body.selectedItemIds : menu.items.map((item) => item.id);
      if (selectedIds.some((itemId) => !availableIds.has(itemId))) {
        throw new HttpError(400, "WEBSITE_SYNC_INVALID_SELECTION", "Die ausgewählten Gerichte gehören nicht zu diesem Website-Entwurf.");
      }
      if (Object.keys(body.priceOverrides || {}).some((itemId) => !availableIds.has(itemId))) {
        throw new HttpError(400, "WEBSITE_SYNC_INVALID_SELECTION", "Eine Preisänderung gehört nicht zu diesem Website-Entwurf.");
      }
      const selectedIdSet = new Set(selectedIds);
      const selectedItems = menu.items
        .filter((item) => selectedIdSet.has(item.id))
        .map((item) => item.price === null && body.priceOverrides?.[item.id] !== undefined
          ? { ...item, price: body.priceOverrides[item.id] }
          : item);
      if (!selectedItems.length) {
        throw new HttpError(400, "WEBSITE_SYNC_SECTION_EMPTY", "Bitte mindestens ein Gericht auswählen oder den Bereich überspringen.");
      }
      const missingPriceCount = selectedItems.filter((item) => item.price === null).length;
      if (missingPriceCount) {
        throw new HttpError(400, "WEBSITE_SYNC_PRICES_MISSING", `${missingPriceCount} Gericht${missingPriceCount === 1 ? " benötigt" : "e benötigen"} vor dem Übernehmen einen Preis.`);
      }
      const existing = await loadStoredDigitalMenu(restaurantId);
      const imported = normalizeStoredDigitalItems(selectedItems.map((item) => ({
        ...item,
        category: section === "drinks" ? "Getränke" : item.category,
        section: websiteImportSectionName(section)
      }))).items;
      const unrelated = existing.items.filter((item) => websiteImportAreaForStoredItem(item) !== section);
      const currentArea = existing.items.filter((item) => websiteImportAreaForStoredItem(item) === section);
      const nextItems = body.action === "replace"
        ? [...unrelated, ...imported]
        : [...unrelated, ...currentArea, ...imported];
      const normalized = normalizeStoredDigitalItems(nextItems);
      await saveStoredDigitalMenu(restaurantId, {
        items: normalized.items,
        allergens: normalizeAllergenList([...existing.allergens, ...menu.allergens]),
        updatedAt: new Date().toISOString()
      });
      if (section === "breakfast" || section === "dinner") {
        const restaurant = await ctx.restaurantRepo.findById(restaurantId);
        if (restaurant && !restaurant.mealSlots.includes(section)) {
          await ctx.restaurantService.setMealSlots({ restaurantId, mealSlots: [...restaurant.mealSlots, section] });
        }
      }
    }

    if (!isSkipped && section === "lunch") {
      const menu = source || websiteDraftMenuForSection(draft.result, "lunch");
      if (!menu?.items.length) {
        throw new HttpError(400, "WEBSITE_SYNC_SECTION_EMPTY", "Für den Mittagstisch wurden keine Gerichte erkannt.");
      }
      const availableIds = new Set(menu.items.map((item) => item.id));
      const selectedIds = body.selectedItemIds?.length ? body.selectedItemIds : menu.items.map((item) => item.id);
      if (selectedIds.some((itemId) => !availableIds.has(itemId))) {
        throw new HttpError(400, "WEBSITE_SYNC_INVALID_SELECTION", "Die ausgewählten Gerichte gehören nicht zu diesem Website-Entwurf.");
      }
      if (Object.keys(body.priceOverrides || {}).some((itemId) => !availableIds.has(itemId))) {
        throw new HttpError(400, "WEBSITE_SYNC_INVALID_SELECTION", "Eine Preisänderung gehört nicht zu diesem Website-Entwurf.");
      }
      const selectedIdSet = new Set(selectedIds);
      const selectedItems = menu.items
        .filter((item) => selectedIdSet.has(item.id))
        .map((item) => item.price === null && body.priceOverrides?.[item.id] !== undefined
          ? { ...item, price: body.priceOverrides[item.id] }
          : item);
      if (!selectedItems.length) {
        throw new HttpError(400, "WEBSITE_SYNC_SECTION_EMPTY", "Bitte mindestens ein Gericht auswählen oder den Bereich überspringen.");
      }
      const missingPriceCount = selectedItems.filter((item) => item.price === null).length;
      if (missingPriceCount) {
        throw new HttpError(400, "WEBSITE_SYNC_PRICES_MISSING", `${missingPriceCount} Gericht${missingPriceCount === 1 ? " benötigt" : "e benötigen"} vor dem Übernehmen einen Preis.`);
      }
      const existing = await loadStoredLunchMenu(restaurantId);
      const imported = normalizeStoredLunchMenuItems(selectedItems.map((item) => ({
        ...item,
        scheduleMode: "openingHours",
        availableWeekdays: [],
        repeatWeekly: true,
        activeWeekKey: null,
        active: true
      }))).items;
      const normalized = normalizeStoredLunchMenuItems(
        body.action === "replace" ? imported : [...existing.items, ...imported]
      );
      await saveStoredLunchMenu(restaurantId, {
        items: normalized.items,
        allergens: normalizeAllergenList([...existing.allergens, ...menu.allergens]),
        updatedAt: new Date().toISOString()
      });
      const restaurant = await ctx.restaurantRepo.findById(restaurantId);
      if (restaurant && !restaurant.mealSlots.includes("lunch")) {
        await ctx.restaurantService.setMealSlots({ restaurantId, mealSlots: [...restaurant.mealSlots, "lunch"] });
      }
    }

    const nextDraft: StoredWebsiteSyncDraft = {
      ...draft,
      appliedSections: source || isSkipped || draft.appliedSections.includes(section)
        ? draft.appliedSections
        : [...draft.appliedSections, section],
      skippedSections: source || !isSkipped || draft.skippedSections.includes(section)
        ? draft.skippedSections
        : [...draft.skippedSections, section],
      appliedSourceIds: source && !isSkipped && !(draft.appliedSourceIds ?? []).includes(source.id)
        ? [...(draft.appliedSourceIds ?? []), source.id]
        : (draft.appliedSourceIds ?? []),
      skippedSourceIds: source && isSkipped && !(draft.skippedSourceIds ?? []).includes(source.id)
        ? [...(draft.skippedSourceIds ?? []), source.id]
        : (draft.skippedSourceIds ?? [])
    };
    await writeWebsiteSyncDraft(nextDraft);
    return websiteSyncResponse(nextDraft);
  });

  app.patch("/api/restaurants/me/onboarding-draft", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(updateRestaurantOnboardingDraftSchema, request.body);
    const contactInputErrors = validateProvidedReservationContacts(body);
    if (contactInputErrors.length) {
      throw new HttpError(400, "INVALID_RESERVATION_CONTACT", contactInputErrors.join(" "));
    }
    const currentRestaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!currentRestaurant) {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }
    const currentSettings = await loadRestaurantSettings(restaurantId);
    const nextDraft = mergeOnboardingDraft(currentSettings.onboardingDraft, {
      mealSlots: body.mealSlots,
      tableReservationEnabled: body.tableReservationEnabled,
      tableReservationChoiceMade: body.tableReservationChoiceMade,
      reservationMode: body.reservationMode,
      reservationExternalLink: body.reservationExternalLink,
      reservationExternalEmail: body.reservationExternalEmail,
      reservationExternalPhone: body.reservationExternalPhone,
      cuisineTypes: body.cuisineTypes,
      openingHours: body.openingHours,
      aboutText: body.aboutText,
      lastStep: body.lastStep
    });
    if (
      nextDraft.tableReservationChoiceMade &&
      nextDraft.reservationMode === "external" &&
      !hasReservationExternalContact(
        nextDraft.reservationExternalLink,
        nextDraft.reservationExternalEmail,
        nextDraft.reservationExternalPhone
      )
    ) {
      throw new HttpError(
        400,
        "RESERVATION_EXTERNAL_CONTACT_REQUIRED",
        "Bitte mindestens Link, E-Mail oder Telefon für externe Reservierungen angeben."
      );
    }
    const nextSettings = await saveRestaurantSettings(restaurantId, {
      onboardingDraft: nextDraft
    });
    return {
      onboardingDraft: nextSettings.onboardingDraft ?? null,
      restaurant: toRestaurantWithSettings(
        ctx.restaurantService.toPublic(currentRestaurant),
        nextSettings
      )
    };
  });

  app.post("/api/restaurants/me/onboarding-complete", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const currentRestaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!currentRestaurant) {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }
    const currentSettings = await loadRestaurantSettings(restaurantId);
    const draft = currentSettings.onboardingDraft;
    if (!isValidOnboardingDraftForCompletion(draft)) {
      throw new HttpError(
        400,
        "ONBOARDING_INCOMPLETE",
        "Bitte alle Pflichtschritte der Einrichtung abschließen."
      );
    }
    const previousDigitalMenu = await loadStoredDigitalMenu(restaurantId);
    const previousLunchMenu = await loadStoredLunchMenu(restaurantId);
    const completedAt = new Date().toISOString();
    const hasLunchDraftItems = draft.lunchMenu.items.some((item) => item.active !== false);
    const mealSlots = normalizeStoredMealSlots(
      hasLunchDraftItems && !draft.mealSlots.includes("lunch")
        ? [...draft.mealSlots, "lunch"]
        : draft.mealSlots
    );
    const completedMenuFiles = draft.menuFiles.length ? draft.menuFiles : currentSettings.menuFiles;
    const completedLunchMenuFiles = draft.lunchMenuFiles.length
      ? draft.lunchMenuFiles
      : currentSettings.lunchMenuFiles;

    try {
      const liveRestaurant = await ctx.restaurantService.setMealSlots({
        restaurantId,
        mealSlots
      });
      if (!liveRestaurant) {
        throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
      }

      let nextRestaurant = liveRestaurant;
      const primaryMenuFile = completedMenuFiles[0] || null;
      if (primaryMenuFile) {
        const updatedMenuRestaurant = await ctx.restaurantService.setMenuFile({
          restaurantId,
          menuUrl: primaryMenuFile.url,
          menuMimeType: primaryMenuFile.mimeType
        });
        if (updatedMenuRestaurant) nextRestaurant = updatedMenuRestaurant;
      }

      await saveStoredDigitalMenu(restaurantId, {
        items: draft.digitalMenu.items,
        allergens: draft.digitalMenu.allergens,
        updatedAt: draft.digitalMenu.updatedAt || completedAt
      });
      await saveStoredLunchMenu(restaurantId, {
        items: draft.lunchMenu.items,
        allergens: draft.lunchMenu.allergens,
        updatedAt: draft.lunchMenu.updatedAt || completedAt
      });

      const nextSettings = await saveRestaurantSettings(restaurantId, {
        tableReservationEnabled: draft.tableReservationEnabled,
        reservationMode: draft.reservationMode,
        reservationExternalLink: draft.reservationExternalLink,
        reservationExternalEmail: draft.reservationExternalEmail,
        reservationExternalPhone: draft.reservationExternalPhone,
        cuisineTypes: draft.cuisineTypes,
        openingHours: draft.openingHours,
        aboutText: draft.aboutText,
        menuFiles: completedMenuFiles,
        lunchMenuFiles: completedLunchMenuFiles,
        onboardingCompletedAt: completedAt,
        onboardingDraft: null
      });

      return {
        restaurant: toRestaurantWithSettings(nextRestaurant, nextSettings)
      };
    } catch (error) {
      const rollbackResults = await Promise.allSettled([
        ctx.restaurantRepo.updateMealSlots(restaurantId, currentRestaurant.mealSlots),
        ctx.restaurantRepo.updateMenu(restaurantId, {
          menuUrl: currentRestaurant.menuUrl ?? null,
          menuMimeType: currentRestaurant.menuMimeType ?? null
        }),
        saveStoredDigitalMenu(restaurantId, previousDigitalMenu),
        saveStoredLunchMenu(restaurantId, previousLunchMenu),
        restoreRestaurantSettingsSnapshot(restaurantId, currentSettings)
      ]);
      if (rollbackResults.some((result) => result.status === "rejected")) {
        app.log.error({ restaurantId, rollbackResults }, "onboarding rollback incomplete");
      }
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        500,
        "ONBOARDING_SAVE_FAILED",
        "Einrichtung konnte nicht gespeichert werden. Deine bisherigen Daten wurden beibehalten."
      );
    }
  });

  app.post("/api/restaurants/me/onboarding-hint-seen", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const restaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!restaurant) {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }

    const currentSettings = await loadRestaurantSettings(restaurantId);
    const seenAt = currentSettings.onboardingHintSeenAt || new Date().toISOString();

    if (!currentSettings.onboardingHintSeenAt) {
      await saveRestaurantSettings(restaurantId, {
        onboardingHintSeenAt: seenAt
      });
    }

    return {
      ok: true,
      onboardingHintSeenAt: seenAt
    };
  });

  app.post("/api/restaurants/support-request", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(createSupportRequestSchema, request.body);
    const restaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!restaurant) {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }

    await ctx.emailService.sendRestaurantSupportRequest({
      restaurantName: restaurant.name,
      restaurantEmail: restaurant.email,
      phone: restaurant.phone,
      message: body.message,
      source: body.source
    });

    return {
      ok: true
    };
  });

  app.get("/api/restaurants/support/chat", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    try {
      const messages = await ctx.supportChatService.getMessages(restaurantId);
      return { messages };
    } catch (error) {
      if (error instanceof SupportChatServiceError) {
        throw new HttpError(
          error.code === "SUPPORT_CHAT_UNAVAILABLE" ? 503 : 500,
          error.code,
          error.message
        );
      }
      throw error;
    }
  });

  app.post("/api/restaurants/support/chat/messages", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(supportChatMessageSchema, request.body);
    try {
      const message = await ctx.supportChatService.sendMessage(restaurantId, body.message);
      return { message };
    } catch (error) {
      if (error instanceof SupportChatServiceError) {
        throw new HttpError(
          error.code === "SUPPORT_RATE_LIMIT"
            ? 429
            : error.code === "SUPPORT_CHAT_UNAVAILABLE"
            ? 503
            : 502,
          error.code,
          error.message
        );
      }
      throw error;
    }
  });

  app.post("/api/restaurants/push-token", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(registerPushTokenSchema, request.body);
    const nowIso = new Date().toISOString();
    const settings = await loadRestaurantSettings(restaurantId);
    const existing = normalizeStoredPushTokens(settings.pushTokens);

    const index = existing.findIndex((entry) => entry.token === body.token);
    const nextPushTokens =
      index >= 0
        ? existing.map((entry, entryIndex) =>
            entryIndex === index
              ? {
                  ...entry,
                  platform: body.platform,
                  lastSeenAt: nowIso
                }
              : entry
          )
        : [
            {
              token: body.token,
              platform: body.platform,
              createdAt: nowIso,
              lastSeenAt: nowIso
            },
            ...existing
          ];

    await saveRestaurantSettings(restaurantId, {
      pushTokens: nextPushTokens
    });
    return { ok: true, count: normalizeStoredPushTokens(nextPushTokens).length };
  });

  app.delete("/api/restaurants/push-token", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(unregisterPushTokenSchema, request.body);
    const settings = await loadRestaurantSettings(restaurantId);
    const existing = normalizeStoredPushTokens(settings.pushTokens);
    const nextPushTokens = existing.filter((entry) => entry.token !== body.token);

    if (nextPushTokens.length !== existing.length) {
      await saveRestaurantSettings(restaurantId, {
        pushTokens: nextPushTokens
      });
    }

    return { ok: true, count: nextPushTokens.length };
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

  app.delete("/api/restaurants/offers/:id", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const { id } = request.params as { id: string };

    try {
      await ctx.offerService.deleteOffer(restaurantId, id);
      return { ok: true };
    } catch (error) {
      if (error instanceof Error && error.message === "OFFER_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Offer not found");
      }
      if (error instanceof Error && error.message === "FORBIDDEN") {
        throw new HttpError(403, "FORBIDDEN", "Not allowed to delete this offer");
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
      const before = await ctx.orderRepo.findById(id);
      const updated = await ctx.orderService.updateStatus(restaurantId, id, body.status);

      if (before && before.status !== updated.status) {
        try {
          const [restaurant, offer] = await Promise.all([
            ctx.restaurantRepo.findById(updated.restaurantId),
            ctx.offerRepo.findById(updated.offerId)
          ]);
          if (restaurant && (updated.status === "confirmed" || updated.status === "cancelled")) {
            void ctx.emailService
              .sendOrderStatus({
                customerEmail: updated.customerEmail,
                customerName: updated.customerName,
                restaurantName: restaurant.name,
                offerTitle: offer?.title || "Vorbestellung",
                status: updated.status
              })
              .catch((error) => {
                request.log.error(
                  { error, orderId: updated.id, restaurantId: updated.restaurantId },
                  "failed to send order status email"
                );
              });
          }
        } catch (error) {
          request.log.error(
            { error, orderId: updated.id, restaurantId: updated.restaurantId },
            "order status side effects failed"
          );
        }
      }

      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Order not found");
      }
      if (error instanceof Error && error.message === "FORBIDDEN") {
        throw new HttpError(403, "FORBIDDEN", "Not allowed to edit this order");
      }
      if (error instanceof Error && error.message === "ORDER_ARCHIVED") {
        throw new HttpError(409, "ORDER_ARCHIVED", "Order is archived");
      }
      throw error;
    }
  });

  app.delete("/api/restaurants/orders/:id", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const { id } = request.params as { id: string };

    try {
      const archived = await ctx.orderService.archiveOrder(restaurantId, id);
      return { order: archived };
    } catch (error) {
      if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Order not found");
      }
      if (error instanceof Error && error.message === "FORBIDDEN") {
        throw new HttpError(403, "FORBIDDEN", "Not allowed to delete this order");
      }
      if (error instanceof Error && error.message === "ORDER_NOT_FINAL") {
        throw new HttpError(
          400,
          "ORDER_NOT_FINAL",
          "Only confirmed or cancelled orders can be archived"
        );
      }
      throw error;
    }
  });

  app.post("/api/restaurants/menu", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const query = parseOrThrow(uploadMenuQuerySchema, request.query);
    const uploadMode = query.mode ?? "replace";
    const diagnosticId = createMenuDiagnosticId();
    const startedAt = Date.now();
    const client = getMenuClientContext(request);
    await writeMenuDiagnostic({
      diagnosticId,
      event: "upload_started",
      restaurantId,
      route: "/api/restaurants/menu",
      mode: uploadMode,
      ...client
    });
    const fileRequest = request as typeof request & {
      file: (options?: unknown) => Promise<{
        mimetype: string;
        filename?: string;
        file: NodeJS.ReadableStream;
      } | undefined>;
    };
    try {
      const part = await fileRequest.file({
        limits: {
          files: 1,
          fileSize: MAX_MENU_FILE_SIZE
        }
      });
      if (!part) {
        throw new HttpError(400, "INVALID_INPUT", "Keine Datei hochgeladen.");
      }
      const rawBuffer = await readMenuUploadStream(part.file, part.filename);
      assertMenuBatchSize(rawBuffer.length);
      const normalized = await normalizeMenuUpload({
        buffer: rawBuffer,
        filename: part.filename,
        declaredMimeType: part.mimetype
      });
      await writeMenuDiagnostic({
        diagnosticId,
        event: "file_normalized",
        restaurantId,
        route: "/api/restaurants/menu",
        fileCount: 1,
        fileIndex: 1,
        fileName: normalized.filename,
        declaredMimeType: part.mimetype,
        detectedMimeType: normalized.mimeType,
        bytes: normalized.originalBytes,
        ...client
      });

      const currentRestaurant = await ctx.restaurantRepo.findById(restaurantId);
      if (!currentRestaurant) {
        throw new HttpError(404, "NOT_FOUND", "Restaurant nicht gefunden.");
      }
      const currentSettings = await loadRestaurantSettings(restaurantId);
      const existingMenuFiles = resolveMenuFilesForRestaurant(currentRestaurant, currentSettings.menuFiles);
      if (uploadMode === "append" && existingMenuFiles.length >= MAX_MENU_FILES) {
        throw new HttpError(
          400,
          "MENU_LIMIT_REACHED",
          `Maximal ${MAX_MENU_FILES} Menü-Dateien erlaubt. Bitte erst löschen oder überschreiben.`
        );
      }

      await mkdir(MENU_UPLOAD_DIR, { recursive: true });
      const extension = extensionFromMime(normalized.mimeType, normalized.filename);
      const fileName = `${restaurantId}-${Date.now()}-${randomUUID()}${extension}`;
      const filePath = path.join(MENU_UPLOAD_DIR, fileName);
      await writeFile(filePath, normalized.buffer);

      const nowIso = new Date().toISOString();
      const menuUrl = toPublicUploadUrl(request, MENU_UPLOAD_PREFIX, fileName);
      const nextEntry: StoredMenuFile = {
        id: randomUUID(),
        name: normalized.filename,
        url: menuUrl,
        mimeType: normalized.mimeType,
        uploadedAt: nowIso
      };
      const nextMenuFiles = uploadMode === "append" ? [nextEntry, ...existingMenuFiles] : [nextEntry];
      const filesToDelete =
        uploadMode === "replace"
          ? existingMenuFiles
              .map((item) => resolveStoredMenuFile(item.url))
              .filter((value): value is string => Boolean(value))
          : [];

      let nextSettings: StoredRestaurantSettings;
      try {
        nextSettings = await saveRestaurantSettings(restaurantId, { menuFiles: nextMenuFiles });
      } catch (error) {
        await unlink(filePath).catch(() => undefined);
        throw error;
      }

      let restaurant;
      try {
        restaurant = await ctx.restaurantService.setMenuFile({
          restaurantId,
          menuUrl,
          menuMimeType: normalized.mimeType
        });
      } catch (error) {
        await saveRestaurantSettings(restaurantId, { menuFiles: currentSettings.menuFiles }).catch(
          () => undefined
        );
        await unlink(filePath).catch(() => undefined);
        if (error instanceof Error && error.message === "RESTAURANT_NOT_FOUND") {
          throw new HttpError(404, "NOT_FOUND", "Restaurant nicht gefunden.");
        }
        throw error;
      }

      for (const previousPath of Array.from(new Set(filesToDelete))) {
        if (previousPath === filePath) continue;
        await unlink(previousPath).catch(() => undefined);
      }

      await writeMenuDiagnostic({
        diagnosticId,
        event: "upload_completed",
        restaurantId,
        route: "/api/restaurants/menu",
        mode: uploadMode,
        fileCount: 1,
        durationMs: Date.now() - startedAt,
        statusCode: 200,
        ...client
      });
      return {
        diagnosticId,
        menuUrl,
        menuMimeType: normalized.mimeType,
        filesProcessed: 1,
        restaurant: toRestaurantWithSettings(restaurant, nextSettings)
      };
    } catch (error) {
      const mapped = toMenuHttpError(error, diagnosticId);
      await writeMenuDiagnostic({
        diagnosticId,
        event: "upload_failed",
        restaurantId,
        route: "/api/restaurants/menu",
        mode: uploadMode,
        durationMs: Date.now() - startedAt,
        statusCode: mapped.status,
        errorCode: mapped.code,
        message: mapped.message,
        fileName: sanitizeMenuFileName((mapped.details as Record<string, unknown> | undefined)?.fileName),
        ...client
      });
      throw mapped;
    }
  });

  app.delete("/api/restaurants/menu", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const currentRestaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!currentRestaurant) {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }

    const settings = await loadRestaurantSettings(restaurantId);
    const existingMenuFiles = resolveMenuFilesForRestaurant(currentRestaurant, settings.menuFiles);
    const updated = await ctx.restaurantRepo.updateMenu(restaurantId, {
      menuUrl: null,
      menuMimeType: null
    });
    if (!updated) {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }

    let nextSettings: StoredRestaurantSettings;
    try {
      nextSettings = await saveRestaurantSettings(restaurantId, {
        menuFiles: []
      });
    } catch {
      nextSettings = {
        ...settings,
        menuFiles: [],
        updatedAt: new Date().toISOString()
      };
    }

    const filesToDelete = [
      ...existingMenuFiles
        .map((item) => resolveStoredMenuFile(item.url))
        .filter((value): value is string => Boolean(value)),
      resolveStoredMenuFile(currentRestaurant.menuUrl)
    ].filter((value): value is string => Boolean(value));

    for (const filePath of Array.from(new Set(filesToDelete))) {
      await unlink(filePath).catch(() => undefined);
    }

    return {
      restaurant: toRestaurantWithSettings(ctx.restaurantService.toPublic(updated), nextSettings)
    };
  });

  app.delete("/api/restaurants/menu/card", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const { kind, onboarding } = parseOrThrow(deleteMenuCardQuerySchema, request.query);
    const isLunchMenu = kind === "lunch";
    const isOnboarding = onboarding === "true";
    const currentRestaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!currentRestaurant) {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }

    const currentSettings = await loadRestaurantSettings(restaurantId);
    const sourceFiles = normalizeStoredMenuFiles(
      isOnboarding
        ? isLunchMenu
          ? currentSettings.onboardingDraft?.lunchMenuFiles
          : currentSettings.onboardingDraft?.menuFiles
        : isLunchMenu
        ? currentSettings.lunchMenuFiles
        : resolveMenuFilesForRestaurant(currentRestaurant, currentSettings.menuFiles)
    );
    const sourcePaths = sourceFiles
      .map((item) => resolveStoredMenuFile(item.url))
      .filter((value): value is string => Boolean(value));
    const previousDigitalMenu = isOnboarding ? null : await loadStoredDigitalMenu(restaurantId);
    const previousLunchMenu = isOnboarding ? null : await loadStoredLunchMenu(restaurantId);
    const clearsLinkedLunch = !isOnboarding && !isLunchMenu && currentSettings.useDigitalMenuAsLunch;

    let nextSettings: StoredRestaurantSettings;
    let nextRestaurant = currentRestaurant;
    try {
      if (isOnboarding) {
        const nextDraft = mergeOnboardingDraft(currentSettings.onboardingDraft, {
          ...(isLunchMenu
            ? { lunchMenuFiles: [], lunchMenu: createEmptyStoredLunchMenu() }
            : { menuFiles: [], digitalMenu: createEmptyStoredDigitalMenu() })
        });
        nextSettings = await saveRestaurantSettings(restaurantId, { onboardingDraft: nextDraft });
      } else {
        if (!isLunchMenu) {
          const updatedRestaurant = await ctx.restaurantRepo.updateMenu(restaurantId, {
            menuUrl: null,
            menuMimeType: null
          });
          if (!updatedRestaurant) {
            throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
          }
          nextRestaurant = updatedRestaurant;
        }

        nextSettings = await saveRestaurantSettings(restaurantId, {
          ...(isLunchMenu ? { lunchMenuFiles: [] } : { menuFiles: [], useDigitalMenuAsLunch: false })
        });
        if (isLunchMenu) {
          await saveStoredLunchMenu(restaurantId, createEmptyStoredLunchMenu());
        } else {
          await saveStoredDigitalMenu(restaurantId, createEmptyStoredDigitalMenu());
          if (clearsLinkedLunch) {
            await saveStoredLunchMenu(restaurantId, createEmptyStoredLunchMenu());
          }
        }
      }
    } catch (error) {
      const rollbacks: Array<Promise<unknown>> = [
        restoreRestaurantSettingsSnapshot(restaurantId, currentSettings)
      ];
      if (!isOnboarding && previousDigitalMenu && previousLunchMenu) {
        rollbacks.push(
          saveStoredDigitalMenu(restaurantId, previousDigitalMenu),
          saveStoredLunchMenu(restaurantId, previousLunchMenu),
          ctx.restaurantRepo.updateMenu(restaurantId, {
            menuUrl: currentRestaurant.menuUrl ?? null,
            menuMimeType: currentRestaurant.menuMimeType ?? null
          })
        );
      }
      const rollbackResults = await Promise.allSettled(rollbacks);
      if (rollbackResults.some((result) => result.status === "rejected")) {
        request.log.error({ restaurantId, rollbackResults }, "menu card deletion rollback incomplete");
      }
      if (error instanceof HttpError) throw error;
      throw new HttpError(500, "MENU_DELETE_FAILED", "Karte konnte nicht gelöscht werden.");
    }

    const generatedMenuPaths = isOnboarding
      ? []
      : [
          isLunchMenu ? getLunchMenuPath(restaurantId) : getDigitalMenuPath(restaurantId),
          ...(clearsLinkedLunch ? [getLunchMenuPath(restaurantId)] : [])
        ];
    for (const filePath of Array.from(new Set([...sourcePaths, ...generatedMenuPaths]))) {
      await unlink(filePath).catch(() => undefined);
    }

    return {
      restaurant: toRestaurantWithSettings(ctx.restaurantService.toPublic(nextRestaurant), nextSettings),
      menu: { items: [], allergens: [] },
      updatedAt: null
    };
  });

  app.post("/api/restaurants/menu/onboarding", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const query = parseOrThrow(onboardingMenuUploadQuerySchema, request.query);
    const kind = query.kind ?? "regular";
    const diagnosticId = createMenuDiagnosticId();
    const startedAt = Date.now();
    const client = getMenuClientContext(request);
    await writeMenuDiagnostic({
      diagnosticId,
      event: "onboarding_upload_started",
      restaurantId,
      route: "/api/restaurants/menu/onboarding",
      mode: kind,
      ...client
    });

    const multipartRequest = request as typeof request & {
      parts: (options?: unknown) => AsyncIterable<{
        type?: string;
        mimetype: string;
        filename?: string;
        file?: NodeJS.ReadableStream;
      }>;
    };

    const uploadedFiles: Array<{ filePath: string; entry: StoredMenuFile }> = [];
    try {
      const currentRestaurant = await ctx.restaurantRepo.findById(restaurantId);
      if (!currentRestaurant) {
        throw new HttpError(404, "NOT_FOUND", "Restaurant nicht gefunden.");
      }
      const parts = multipartRequest.parts({
        limits: {
          files: MAX_MENU_FILES,
          fileSize: MAX_MENU_FILE_SIZE
        }
      });

      await mkdir(MENU_UPLOAD_DIR, { recursive: true });
      let totalBytes = 0;
      for await (const part of parts) {
        if (part.type !== "file" || !part.file) continue;
        const rawBuffer = await readMenuUploadStream(part.file, part.filename);
        totalBytes += rawBuffer.length;
        assertMenuBatchSize(totalBytes);
        const normalized = await normalizeMenuUpload({
          buffer: rawBuffer,
          filename: part.filename,
          declaredMimeType: part.mimetype
        });
        const extension = extensionFromMime(normalized.mimeType, normalized.filename);
        const fileName = `${restaurantId}-${Date.now()}-${randomUUID()}${extension}`;
        const filePath = path.join(MENU_UPLOAD_DIR, fileName);
        await writeFile(filePath, normalized.buffer);

        const menuUrl = toPublicUploadUrl(request, MENU_UPLOAD_PREFIX, fileName);
        uploadedFiles.push({
          filePath,
          entry: {
            id: randomUUID(),
            name: normalized.filename,
            url: menuUrl,
            mimeType: normalized.mimeType,
            uploadedAt: new Date().toISOString()
          }
        });
        await writeMenuDiagnostic({
          diagnosticId,
          event: "onboarding_file_normalized",
          restaurantId,
          route: "/api/restaurants/menu/onboarding",
          mode: kind,
          fileCount: uploadedFiles.length,
          fileIndex: uploadedFiles.length,
          fileName: normalized.filename,
          declaredMimeType: part.mimetype,
          detectedMimeType: normalized.mimeType,
          bytes: normalized.originalBytes,
          ...client
        });
      }
      if (!uploadedFiles.length) {
        throw new HttpError(400, "INVALID_INPUT", "Keine Datei hochgeladen.");
      }

      const currentSettings = await loadRestaurantSettings(restaurantId);
      const previousDraftFiles = normalizeStoredMenuFiles(
        kind === "lunch"
          ? currentSettings.onboardingDraft?.lunchMenuFiles
          : currentSettings.onboardingDraft?.menuFiles
      );
      const nextDraft = mergeOnboardingDraft(currentSettings.onboardingDraft, {
        ...(kind === "lunch"
          ? { lunchMenuFiles: uploadedFiles.map((item) => item.entry) }
          : { menuFiles: uploadedFiles.map((item) => item.entry) }),
        lastStep: 5
      });
      const nextSettings = await saveRestaurantSettings(restaurantId, {
        onboardingDraft: nextDraft
      });
      const previousFilePaths = previousDraftFiles
        .map((item) => resolveStoredMenuFile(item.url))
        .filter((value): value is string => Boolean(value));
      for (const previousPath of Array.from(new Set(previousFilePaths))) {
        await unlink(previousPath).catch(() => undefined);
      }
      await writeMenuDiagnostic({
        diagnosticId,
        event: "onboarding_upload_completed",
        restaurantId,
        route: "/api/restaurants/menu/onboarding",
        mode: kind,
        fileCount: uploadedFiles.length,
        durationMs: Date.now() - startedAt,
        statusCode: 200,
        ...client
      });
      return {
        diagnosticId,
        filesProcessed: uploadedFiles.length,
        restaurant: toRestaurantWithSettings(
          ctx.restaurantService.toPublic(currentRestaurant),
          nextSettings
        ),
        onboardingDraft: nextSettings.onboardingDraft ?? null,
        menuFiles:
          kind === "lunch"
            ? nextSettings.onboardingDraft?.lunchMenuFiles ?? []
            : nextSettings.onboardingDraft?.menuFiles ?? []
      };
    } catch (error) {
      for (const file of uploadedFiles) {
        await unlink(file.filePath).catch(() => undefined);
      }
      const mapped = toMenuHttpError(error, diagnosticId);
      await writeMenuDiagnostic({
        diagnosticId,
        event: "onboarding_upload_failed",
        restaurantId,
        route: "/api/restaurants/menu/onboarding",
        mode: kind,
        fileCount: uploadedFiles.length,
        durationMs: Date.now() - startedAt,
        statusCode: mapped.status,
        errorCode: mapped.code,
        message: mapped.message,
        fileName: sanitizeMenuFileName((mapped.details as Record<string, unknown> | undefined)?.fileName),
        ...client
      });
      throw mapped;
    }
  });

  app.post("/api/restaurants/menu/digitalize", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const query = parseOrThrow(digitalizeMenuQuerySchema, request.query);
    const kind = query.kind === "lunch" ? "lunch" : "regular";
    const diagnosticId = createMenuDiagnosticId();
    const startedAt = Date.now();
    const client = getMenuClientContext(request);
    await writeMenuDiagnostic({
      diagnosticId,
      event: "analysis_upload_started",
      restaurantId,
      route: "/api/restaurants/menu/digitalize",
      mode: kind,
      ...client
    });
    const multipartRequest = request as typeof request & {
      parts: (options?: unknown) => AsyncIterable<{
        type?: string;
        mimetype: string;
        filename?: string;
        file?: NodeJS.ReadableStream;
      }>;
    };

    const inputs: Array<{ buffer: Buffer; filename: string; mimeType: string }> = [];
    try {
      const parts = multipartRequest.parts({
        limits: {
          files: MAX_DIGITAL_MENU_FILES,
          fileSize: MAX_MENU_FILE_SIZE
        }
      });

      let totalBytes = 0;
      for await (const part of parts) {
        if (part.type !== "file" || !part.file) {
          continue;
        }
        const rawBuffer = await readMenuUploadStream(part.file, part.filename);
        totalBytes += rawBuffer.length;
        assertMenuBatchSize(totalBytes);
        const normalized = await normalizeMenuUpload({
          buffer: rawBuffer,
          filename: part.filename,
          declaredMimeType: part.mimetype
        });
        inputs.push({
          buffer: normalized.buffer,
          filename: normalized.filename,
          mimeType: normalized.mimeType
        });
        await writeMenuDiagnostic({
          diagnosticId,
          event: "analysis_file_normalized",
          restaurantId,
          route: "/api/restaurants/menu/digitalize",
          fileCount: inputs.length,
          fileIndex: inputs.length,
          fileName: normalized.filename,
          declaredMimeType: part.mimetype,
          detectedMimeType: normalized.mimeType,
          bytes: normalized.originalBytes,
          ...client
        });
      }
      if (!inputs.length) {
        throw new HttpError(400, "INVALID_INPUT", "Keine Datei hochgeladen.");
      }

      await writeMenuDiagnostic({
        diagnosticId,
        event: "analysis_started",
        restaurantId,
        route: "/api/restaurants/menu/digitalize",
        fileCount: inputs.length,
        ...client
      });
      const result = await digitalMenuService.analyzeMenuFiles(inputs, {
        kind,
        referenceDate: toDateKeyInRestaurantTimeZone(new Date())
      });
      await writeMenuDiagnostic({
        diagnosticId,
        event: "analysis_completed",
        restaurantId,
        route: "/api/restaurants/menu/digitalize",
        mode: kind,
        fileCount: inputs.length,
        model: result.model,
        warnings: result.warnings,
        durationMs: Date.now() - startedAt,
        statusCode: 200,
        ...client
      });
      return {
        ...result,
        diagnosticId,
        filesProcessed: inputs.length
      };
    } catch (error) {
      let mapped: HttpError;
      if (error instanceof DigitalMenuServiceError) {
        if (error.code === "OPENAI_NOT_CONFIGURED") {
          mapped = new HttpError(500, error.code, "KI-Analyse ist derzeit nicht verfügbar.", {
            diagnosticId
          });
        } else if (error.code === "OPENAI_TIMEOUT") {
          mapped = new HttpError(
            504,
            "AI_TIMEOUT",
            "Die Menüanalyse hat länger als 5 Minuten gedauert. Bitte erneut versuchen.",
            { diagnosticId }
          );
        } else if (
          error.code === "OPENAI_UPLOAD_FAILED" ||
          error.code === "OPENAI_ANALYSIS_FAILED"
        ) {
          mapped = new HttpError(
            502,
            "OPENAI_ANALYSIS_FAILED",
            "Die KI konnte das Menü gerade nicht verarbeiten. Bitte erneut versuchen.",
            { diagnosticId }
          );
        } else {
          mapped = new HttpError(
            422,
            "MENU_UNREADABLE",
            "Die Datei konnte nicht sicher gelesen werden. Bitte Qualität prüfen oder ein anderes Foto verwenden.",
            { diagnosticId }
          );
        }
      } else {
        mapped = toMenuHttpError(error, diagnosticId);
      }
      await writeMenuDiagnostic({
        diagnosticId,
        event: "analysis_failed",
        restaurantId,
        route: "/api/restaurants/menu/digitalize",
        mode: kind,
        fileCount: inputs.length,
        durationMs: Date.now() - startedAt,
        statusCode: mapped.status,
        errorCode: mapped.code,
        message: error instanceof Error ? error.message : mapped.message,
        fileName: sanitizeMenuFileName((mapped.details as Record<string, unknown> | undefined)?.fileName),
        ...client
      });
      throw mapped;
    }
  });

  app.post("/api/restaurants/menu/diagnostics", async (request, reply) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(menuDiagnosticSchema, request.body);
    const client = getMenuClientContext(request);
    await writeMenuDiagnostic({
      diagnosticId: body.diagnosticId,
      event: `client_${body.stage}`,
      restaurantId,
      route: "/api/restaurants/menu/diagnostics",
      errorCode: body.errorCode,
      message: body.message,
      fileName: body.fileName,
      declaredMimeType: body.declaredMimeType,
      fileCount: body.fileCount,
      ...client
    });
    return reply.status(204).send();
  });

  app.get("/api/restaurants/menu/digital", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const stored = await loadStoredDigitalMenu(restaurantId);
    return {
      menu: {
        items: stored.items,
        allergens: stored.allergens
      },
      updatedAt: stored.updatedAt
    };
  });

  app.get("/api/restaurants/menu/lunch", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const stored = await loadStoredLunchMenu(restaurantId);
    return {
      menu: {
        items: stored.items,
        allergens: stored.allergens
      },
      updatedAt: stored.updatedAt
    };
  });

  app.get("/api/restaurants/menu/onboarding/digital", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const settings = await loadRestaurantSettings(restaurantId);
    const stored = settings.onboardingDraft?.digitalMenu || createEmptyStoredDigitalMenu();
    return {
      menu: {
        items: stored.items,
        allergens: stored.allergens
      },
      updatedAt: stored.updatedAt
    };
  });

  app.get("/api/restaurants/menu/onboarding/lunch", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const settings = await loadRestaurantSettings(restaurantId);
    const stored = settings.onboardingDraft?.lunchMenu || createEmptyStoredLunchMenu();
    return {
      menu: { items: stored.items, allergens: stored.allergens },
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
        category: item.category,
        section: item.section,
        allergens: item.allergens
      }))
    );
    const allergens = normalizeAllergenList(body.allergens);

    const updatedAt = new Date().toISOString();
    const settings = await loadRestaurantSettings(restaurantId);
    const nextDigitalMenu: StoredDigitalMenu = {
      items: normalized.items,
      allergens,
      updatedAt
    };
    const previousDigitalMenu = await loadStoredDigitalMenu(restaurantId);
    const previousLunchMenu = settings.useDigitalMenuAsLunch
      ? await loadStoredLunchMenu(restaurantId)
      : null;

    try {
      await saveStoredDigitalMenu(restaurantId, nextDigitalMenu);
      if (settings.useDigitalMenuAsLunch) {
        await saveStoredLunchMenu(
          restaurantId,
          buildLunchMenuFromDigitalMenu(nextDigitalMenu, updatedAt)
        );
        if (nextDigitalMenu.items.length) {
          const restaurant = await ctx.restaurantRepo.findById(restaurantId);
          if (restaurant && !restaurant.mealSlots.includes("lunch")) {
            await ctx.restaurantService.setMealSlots({
              restaurantId,
              mealSlots: [...restaurant.mealSlots, "lunch"]
            });
          }
        }
      }
    } catch (error) {
      const rollbacks: Array<Promise<unknown>> = [
        saveStoredDigitalMenu(restaurantId, previousDigitalMenu)
      ];
      if (previousLunchMenu) {
        rollbacks.push(saveStoredLunchMenu(restaurantId, previousLunchMenu));
      }
      const rollbackResults = await Promise.allSettled(rollbacks);
      if (rollbackResults.some((result) => result.status === "rejected")) {
        app.log.error({ restaurantId, rollbackResults }, "digital menu synchronization rollback incomplete");
      }
      throw error;
    }

    const warnings: string[] = [];
    if (normalized.duplicatesRemoved > 0) {
      warnings.push(`${normalized.duplicatesRemoved} doppelte Eintraege wurden entfernt.`);
    }
    if (normalized.droppedInvalid > 0) {
      warnings.push(`${normalized.droppedInvalid} ungueltige Eintraege wurden entfernt.`);
    }

    return {
      menu: {
        items: normalized.items,
        allergens
      },
      updatedAt,
      lunchSynced: settings.useDigitalMenuAsLunch,
      warnings
    };
  });

  app.put("/api/restaurants/menu/lunch", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(saveLunchMenuSchema, request.body);
    const normalized = normalizeStoredLunchMenuItems(
      body.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        section: item.section,
        allergens: item.allergens,
        availableWeekdays: item.availableWeekdays,
        repeatWeekly: item.repeatWeekly,
        activeWeekKey: item.activeWeekKey,
        availableDates: item.availableDates,
        schedulePending: item.schedulePending,
        scheduleMode: item.scheduleMode,
        validFrom: item.validFrom,
        validUntil: item.validUntil,
        active: item.active
      }))
    );
    const allergens = normalizeAllergenList(body.allergens);
    const updatedAt = new Date().toISOString();

    await saveStoredLunchMenu(restaurantId, {
      items: normalized.items,
      allergens,
      updatedAt
    });

    const hasActiveLunchItems = normalized.items.some((item) => item.active !== false);
    if (hasActiveLunchItems) {
      const restaurant = await ctx.restaurantRepo.findById(restaurantId);
      if (!restaurant) {
        throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
      }
      if (!restaurant.mealSlots.includes("lunch")) {
        await ctx.restaurantService.setMealSlots({
          restaurantId,
          mealSlots: [...restaurant.mealSlots, "lunch"]
        });
      }
    }

    const warnings: string[] = [];
    if (normalized.duplicatesRemoved > 0) {
      warnings.push(`${normalized.duplicatesRemoved} doppelte Eintraege wurden entfernt.`);
    }
    if (normalized.droppedInvalid > 0) {
      warnings.push(`${normalized.droppedInvalid} ungueltige Eintraege wurden entfernt.`);
    }

    return {
      menu: {
        items: normalized.items,
        allergens
      },
      updatedAt,
      warnings
    };
  });

  app.put("/api/restaurants/menu/onboarding/digital", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(saveDigitalMenuSchema, request.body);
    const normalized = normalizeStoredDigitalItems(
      body.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        section: item.section,
        allergens: item.allergens
      }))
    );
    const allergens = normalizeAllergenList(body.allergens);
    const updatedAt = new Date().toISOString();
    const currentSettings = await loadRestaurantSettings(restaurantId);
    const nextDraft = mergeOnboardingDraft(currentSettings.onboardingDraft, {
      digitalMenu: {
        items: normalized.items,
        allergens,
        updatedAt
      },
      lastStep: 5
    });
    await saveRestaurantSettings(restaurantId, {
      onboardingDraft: nextDraft
    });

    const warnings: string[] = [];
    if (normalized.duplicatesRemoved > 0) {
      warnings.push(`${normalized.duplicatesRemoved} doppelte Eintraege wurden entfernt.`);
    }
    if (normalized.droppedInvalid > 0) {
      warnings.push(`${normalized.droppedInvalid} ungueltige Eintraege wurden entfernt.`);
    }

    return {
      menu: {
        items: normalized.items,
        allergens
      },
      updatedAt,
      warnings
    };
  });

  app.put("/api/restaurants/menu/onboarding/lunch", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(saveLunchMenuSchema, request.body);
    const normalized = normalizeStoredLunchMenuItems(
      body.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        section: item.section,
        allergens: item.allergens,
        availableWeekdays: item.availableWeekdays,
        repeatWeekly: item.repeatWeekly,
        activeWeekKey: item.activeWeekKey,
        availableDates: item.availableDates,
        schedulePending: item.schedulePending,
        scheduleMode: item.scheduleMode,
        validFrom: item.validFrom,
        validUntil: item.validUntil,
        active: item.active
      }))
    );
    const allergens = normalizeAllergenList(body.allergens);
    const updatedAt = new Date().toISOString();
    const currentSettings = await loadRestaurantSettings(restaurantId);
    const nextDraft = mergeOnboardingDraft(currentSettings.onboardingDraft, {
      lunchMenu: { items: normalized.items, allergens, updatedAt },
      lastStep: 5
    });
    await saveRestaurantSettings(restaurantId, { onboardingDraft: nextDraft });

    const warnings: string[] = [];
    if (normalized.duplicatesRemoved > 0) {
      warnings.push(`${normalized.duplicatesRemoved} doppelte Eintraege wurden entfernt.`);
    }
    if (normalized.droppedInvalid > 0) {
      warnings.push(`${normalized.droppedInvalid} ungueltige Eintraege wurden entfernt.`);
    }
    return {
      menu: { items: normalized.items, allergens },
      updatedAt,
      warnings
    };
  });

  app.get("/api/restaurants/:id/reviews", async (request) => {
    const { id: restaurantId } = request.params as { id: string };
    const restaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!restaurant || restaurant.approvalStatus !== "approved") {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }

    const prisma = requirePrisma(ctx);
    const reviews = await prisma.restaurantReview.findMany({
      where: { restaurantId, visibilityStatus: "visible" },
      include: { images: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return reviews.map((review) => serializeReview(review));
  });

  app.post("/api/restaurants/:id/reviews", async (request) => {
    const { id: restaurantId } = request.params as { id: string };
    const restaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!restaurant || restaurant.approvalStatus !== "approved") {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }

    const multipartRequest = request as typeof request & {
      parts: (options?: unknown) => AsyncIterable<{
        type?: string;
        fieldname?: string;
        value?: unknown;
        mimetype?: string;
        filename?: string;
        file?: NodeJS.ReadableStream;
      }>;
    };

    const fields: Record<string, string> = {};
    const images: BufferedUpload[] = [];
    try {
      const parts = multipartRequest.parts({
        limits: {
          files: MAX_REVIEW_IMAGES,
          fileSize: MAX_MENU_FILE_SIZE
        }
      });

      for await (const part of parts) {
        if (part.type === "file" && part.file) {
          const mimeType = String(part.mimetype || "").toLowerCase();
          if (!isAllowedOfferImageMime(mimeType)) {
            throw new HttpError(
              400,
              "UNSUPPORTED_FILE_TYPE",
              "Only image files (JPG, PNG, WEBP) are allowed for reviews"
            );
          }
          if (images.length >= MAX_REVIEW_IMAGES) {
            throw new HttpError(400, "TOO_MANY_FILES", `Maximal ${MAX_REVIEW_IMAGES} Bilder erlaubt.`);
          }
          images.push({
            buffer: await readStreamToBuffer(part.file),
            filename: String(part.filename || "").trim() || `review-${images.length + 1}`,
            mimeType
          });
          continue;
        }

        if (part.type === "field" && part.fieldname) {
          fields[part.fieldname] = parseMultipartFieldText(part.value).trim();
        }
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const code = (error as { code?: string })?.code;
      if (code === "FST_REQ_FILE_TOO_LARGE") {
        throw new HttpError(413, "FILE_TOO_LARGE", "File is too large (max 10 MB)");
      }
      if (code === "FST_FILES_LIMIT") {
        throw new HttpError(400, "TOO_MANY_FILES", `Maximal ${MAX_REVIEW_IMAGES} Bilder erlaubt.`);
      }
      throw error;
    }

    const rating = Number(fields.rating);
    const text = String(fields.text || "").trim();
    const authorName = String(fields.authorName || "").trim().slice(0, 80);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new HttpError(400, "INVALID_RATING", "Bitte 1 bis 5 Sterne auswählen.");
    }
    if (text.length < 2 || text.length > 2000) {
      throw new HttpError(400, "INVALID_TEXT", "Bitte einen Bewertungstext eingeben.");
    }

    const prisma = requirePrisma(ctx);
    const created = await prisma.restaurantReview.create({
      data: {
        restaurantId,
        rating,
        text,
        authorName: authorName || null,
        deviceId: typeof request.headers["x-device-id"] === "string" ? request.headers["x-device-id"].slice(0, 120) : null,
        requestIp: getRequestIp(request) || null
      },
      include: { images: true }
    });

    const writtenFiles: string[] = [];
    try {
      await mkdir(REVIEW_IMAGE_UPLOAD_DIR, { recursive: true });
      const imageRows = [];
      for (const image of images) {
        const extension = extensionFromMime(image.mimeType, image.filename);
        const fileName = `${created.id}-${Date.now()}-${randomUUID()}${extension}`;
        const filePath = path.join(REVIEW_IMAGE_UPLOAD_DIR, fileName);
        await writeFile(filePath, image.buffer);
        writtenFiles.push(filePath);
        imageRows.push({
          reviewId: created.id,
          url: toPublicUploadUrl(request, REVIEW_IMAGE_UPLOAD_PREFIX, fileName),
          mimeType: image.mimeType
        });
      }
      if (imageRows.length) {
        await prisma.restaurantReviewImage.createMany({ data: imageRows });
      }
    } catch (error) {
      for (const filePath of writtenFiles) {
        await unlink(filePath).catch(() => undefined);
      }
      await prisma.restaurantReview.delete({ where: { id: created.id } }).catch(() => undefined);
      throw error;
    }

    const review = await prisma.restaurantReview.findUnique({
      where: { id: created.id },
      include: { images: { orderBy: { createdAt: "asc" } } }
    });
    if (!review) {
      throw new HttpError(500, "REVIEW_CREATE_FAILED", "Bewertung konnte nicht gespeichert werden.");
    }

    const settings = await loadRestaurantSettings(restaurantId);
    void ctx.emailService
      .sendRestaurantReviewReceived({
        restaurantName: restaurant.name,
        restaurantEmail: restaurant.email,
        rating: review.rating,
        authorName: review.authorName,
        text: review.text
      })
      .catch((error) => {
        request.log.error(
          { error, reviewId: review.id, restaurantId },
          "failed to send restaurant review email"
        );
      });

    const pushTokens = getRestaurantPushTokensFromSettings(settings);
    if (pushTokens.length) {
      void ctx.pushService
        .sendToTokens(pushTokens, {
          title: "Neue Bewertung",
          body: `${review.rating} Sterne · ${review.authorName || "Gast"}`,
          data: {
            type: "review_created",
            reviewId: review.id,
            restaurantId
          }
        })
        .catch((error) => {
          request.log.error(
            { error, reviewId: review.id, restaurantId },
            "failed to send push notification for review"
          );
        });
    }

    return serializeReview(review);
  });

  app.get("/api/restaurants/reviews", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const prisma = requirePrisma(ctx);
    const reviews = await prisma.restaurantReview.findMany({
      where: { restaurantId },
      include: {
        images: { orderBy: { createdAt: "asc" } },
        report: true
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return reviews.map((review) => serializeReview(review, true));
  });

  app.post("/api/restaurants/reviews/:id/reply", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const { id } = request.params as { id: string };
    const body = parseOrThrow(reviewReplySchema, request.body);
    const prisma = requirePrisma(ctx);
    const current = await prisma.restaurantReview.findUnique({ where: { id } });
    if (!current) {
      throw new HttpError(404, "NOT_FOUND", "Review not found");
    }
    if (current.restaurantId !== restaurantId) {
      throw new HttpError(403, "FORBIDDEN", "Not allowed to answer this review");
    }
    const now = new Date();
    const updated = await prisma.restaurantReview.update({
      where: { id },
      data: {
        replyText: body.text,
        replyCreatedAt: current.replyCreatedAt || now,
        replyUpdatedAt: now,
        restaurantSeenAt: current.restaurantSeenAt || now
      },
      include: { images: { orderBy: { createdAt: "asc" } }, report: true }
    });
    return serializeReview(updated, true);
  });

  app.post("/api/restaurants/reviews/:id/read", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const { id } = request.params as { id: string };
    const prisma = requirePrisma(ctx);
    const current = await prisma.restaurantReview.findUnique({ where: { id } });
    if (!current) {
      throw new HttpError(404, "NOT_FOUND", "Review not found");
    }
    if (current.restaurantId !== restaurantId) {
      throw new HttpError(403, "FORBIDDEN", "Not allowed to mark this review");
    }
    const updated = await prisma.restaurantReview.update({
      where: { id },
      data: { restaurantSeenAt: current.restaurantSeenAt || new Date() },
      include: { images: { orderBy: { createdAt: "asc" } }, report: true }
    });
    return serializeReview(updated, true);
  });

  app.post("/api/restaurants/reviews/:id/report", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const { id } = request.params as { id: string };
    const body = parseOrThrow(reviewReportSchema, request.body);
    const prisma = requirePrisma(ctx);
    const current = await prisma.restaurantReview.findUnique({
      where: { id },
      include: { report: true }
    });
    if (!current) {
      throw new HttpError(404, "NOT_FOUND", "Bewertung wurde nicht gefunden.");
    }
    if (current.restaurantId !== restaurantId) {
      throw new HttpError(403, "FORBIDDEN", "Diese Bewertung gehört nicht zu deinem Restaurant.");
    }

    let createdReport = false;
    if (!current.report) {
      try {
        await prisma.restaurantReviewReport.create({
          data: {
            reviewId: id,
            restaurantId,
            reason: body.reason,
            note: body.note || null
          }
        });
        createdReport = true;
      } catch (error) {
        if ((error as { code?: string })?.code !== "P2002") throw error;
      }
    }

    const review = await prisma.restaurantReview.findUnique({
      where: { id },
      include: {
        images: { orderBy: { createdAt: "asc" } },
        report: true,
        restaurant: { select: { name: true, email: true } }
      }
    });
    if (!review || !review.report) {
      throw new HttpError(500, "REVIEW_REPORT_FAILED", "Meldung konnte nicht gespeichert werden.");
    }

    if (createdReport) {
      void ctx.emailService
        .sendRestaurantReviewReportNotifyAdmin({
          restaurantName: review.restaurant.name,
          restaurantEmail: review.restaurant.email,
          reviewId: review.id,
          rating: review.rating,
          authorName: review.authorName,
          text: review.text,
          reasonLabel: REVIEW_REPORT_REASON_LABELS[review.report.reason],
          note: review.report.note
        })
        .catch((error) => {
          request.log.error(
            { error, reviewId: review.id, restaurantId },
            "failed to send review report admin email"
          );
        });
    }

    return {
      review: serializeReview(review, true),
      alreadyReported: !createdReport
    };
  });

  app.get("/api/restaurants/menu/analytics", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const prisma = requirePrisma(ctx);
    const query = parseOrThrow(menuAnalyticsQuerySchema, request.query);
    const today = toDateKeyInRestaurantTimeZone(new Date());
    const defaultDayKeys = getRecentDateKeysInRestaurantTimeZone(7);
    const requestedTo = query.to || today;
    const requestedFrom = query.from || defaultDayKeys[0] || today;
    const dayKeys = getDateKeysInRange(requestedFrom, requestedTo);
    if (!dayKeys.length) {
      throw new HttpError(
        400,
        "ANALYTICS_RANGE_INVALID",
        "Bitte einen Zeitraum von maximal 366 Tagen mit gültigem Von- und Bis-Datum wählen."
      );
    }
    const grouped = dayKeys.length
      ? await prisma.restaurantMenuView.groupBy({
          by: ["menuKind", "dayKey"],
          where: { restaurantId, dayKey: { in: dayKeys } },
          _count: { _all: true }
        })
      : [];
    const values = new Map(
      grouped.map((entry) => [`${entry.menuKind}:${entry.dayKey}`, entry._count._all])
    );
    const totalGrouped = await prisma.restaurantMenuView.groupBy({
      by: ["menuKind"],
      where: { restaurantId },
      _count: { _all: true }
    });
    const totals = new Map(totalGrouped.map((entry) => [entry.menuKind, entry._count._all]));
    const contentGrouped = dayKeys.length
      ? await prisma.restaurantContentView.groupBy({
          by: ["contentType", "dayKey"],
          where: { restaurantId, dayKey: { in: dayKeys } },
          _count: { _all: true }
        })
      : [];
    const contentValues = new Map(
      contentGrouped.map((entry) => [`${entry.contentType}:${entry.dayKey}`, entry._count._all])
    );
    const contentDetailsGrouped = await prisma.restaurantContentView.groupBy({
      by: ["contentType", "contentId", "contentTitle"],
      where: { restaurantId, dayKey: { in: dayKeys } },
      _count: { _all: true }
    });
    const contentTotalGrouped = await prisma.restaurantContentView.groupBy({
      by: ["contentType"],
      where: { restaurantId },
      _count: { _all: true }
    });
    const contentTotals = new Map(
      contentTotalGrouped.map((entry) => [entry.contentType, entry._count._all])
    );
    const offerIds = contentDetailsGrouped
      .filter((entry) => entry.contentType === "offer")
      .map((entry) => entry.contentId);
    const eventIds = contentDetailsGrouped
      .filter((entry) => entry.contentType === "event")
      .map((entry) => entry.contentId);
    const currentOffers = offerIds.length
      ? await prisma.offer.findMany({
          where: { restaurantId, id: { in: offerIds } },
          select: { id: true, title: true }
        })
      : [];
    const offerTitleById = new Map(currentOffers.map((offer) => [offer.id, offer.title]));
    const currentEvents = eventIds.length
      ? await prisma.event.findMany({
          where: { providerId: restaurantId, id: { in: eventIds } },
          select: { id: true, title: true }
        })
      : [];
    const eventTitleById = new Map(currentEvents.map((event) => [event.id, event.title]));
    const [regularMenu, lunchMenu] = await Promise.all([
      loadStoredDigitalMenu(restaurantId),
      loadStoredLunchMenu(restaurantId)
    ]);
    const dishTitleById = new Map<string, string>();
    for (const item of [...regularMenu.items, ...lunchMenu.items]) {
      const id = String(item?.id || "").trim();
      const title = String(item?.name || "").trim();
      if (id && title && !dishTitleById.has(id)) dishTitleById.set(id, title);
    }
    const serializeKind = (kind: "regular" | "lunch") => ({
      total: totals.get(kind) || 0,
      rangeTotal: dayKeys.reduce((sum, date) => sum + (values.get(`${kind}:${date}`) || 0), 0),
      days: dayKeys.map((date) => ({ date, views: values.get(`${kind}:${date}`) || 0 }))
    });
    const serializeContent = (type: "offer" | "dish" | "event") => {
      const mergedItems = new Map<string, { id: string; title: string; views: number }>();
      for (const entry of contentDetailsGrouped.filter((candidate) => candidate.contentType === type)) {
        const current = mergedItems.get(entry.contentId);
        const fallbackTitle =
          type === "offer"
            ? offerTitleById.get(entry.contentId) || "Nicht mehr verfügbares Angebot"
            : type === "event"
            ? eventTitleById.get(entry.contentId) || "Nicht mehr verfügbares Event"
            : dishTitleById.get(entry.contentId) || "Nicht mehr im Menü";
        const title = String(entry.contentTitle || current?.title || fallbackTitle).trim() || fallbackTitle;
        mergedItems.set(entry.contentId, {
          id: entry.contentId,
          title,
          views: (current?.views || 0) + entry._count._all
        });
      }
      const items = Array.from(mergedItems.values()).sort(
        (left, right) => right.views - left.views || left.title.localeCompare(right.title, "de")
      );
      return {
        total: contentTotals.get(type) || 0,
        rangeTotal: dayKeys.reduce((sum, date) => sum + (contentValues.get(`${type}:${date}`) || 0), 0),
        days: dayKeys.map((date) => ({ date, views: contentValues.get(`${type}:${date}`) || 0 })),
        items
      };
    };

    return {
      range: { from: requestedFrom, to: requestedTo },
      regular: serializeKind("regular"),
      lunch: serializeKind("lunch"),
      offers: serializeContent("offer"),
      dishes: serializeContent("dish"),
      events: serializeContent("event")
    };
  });

  app.post("/api/restaurants/:id/menu/views", async (request, reply) => {
    const { id: restaurantId } = request.params as { id: string };
    const { kind } = parseOrThrow(menuViewSchema, request.body);
    const restaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!restaurant || restaurant.approvalStatus !== "approved") {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }

    const deviceId = String(request.headers["x-device-id"] || "").trim().slice(0, 180);
    if (!deviceId) {
      return reply.status(204).send();
    }

    const menu =
      kind === "lunch"
        ? filterLunchMenuForCurrentWeek(await loadStoredLunchMenu(restaurantId), new Date(), await loadRestaurantSettings(restaurantId))
        : await loadStoredDigitalMenu(restaurantId);
    if (!menu.items.length) {
      return reply.status(204).send();
    }

    const dayKey = toDateKeyInRestaurantTimeZone(new Date());
    if (!dayKey) {
      return reply.status(204).send();
    }
    const viewerHash = createHash("sha256").update(deviceId).digest("hex");
    const prisma = requirePrisma(ctx);
    try {
      await prisma.restaurantMenuView.create({
        data: { restaurantId, menuKind: kind, dayKey, viewerHash }
      });
      return { counted: true };
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        return { counted: false };
      }
      throw error;
    }
  });

  app.post("/api/restaurants/:id/content/views", async (request, reply) => {
    const { id: restaurantId } = request.params as { id: string };
    const body = parseOrThrow(contentViewSchema, request.body);
    const restaurant = await ctx.restaurantRepo.findById(restaurantId);
    if (!restaurant || restaurant.approvalStatus !== "approved") {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }

    const deviceId = String(request.headers["x-device-id"] || "").trim().slice(0, 180);
    const dayKey = toDateKeyInRestaurantTimeZone(new Date());
    if (!deviceId || !dayKey) return reply.status(204).send();

    const prisma = requirePrisma(ctx);
    let contentTitle = "";
    if (body.type === "offer") {
      const offer = await prisma.offer.findFirst({
        where: { id: body.contentId, restaurantId, active: true },
        select: { id: true, title: true }
      });
      if (!offer) return reply.status(204).send();
      contentTitle = offer.title;
    } else if (body.type === "event") {
      const event = await prisma.event.findFirst({
        where: { id: body.contentId, providerId: restaurantId, active: true },
        select: { id: true, title: true }
      });
      if (!event) return reply.status(204).send();
      contentTitle = event.title;
    } else {
      const settings = await loadRestaurantSettings(restaurantId);
      const menu =
        body.menuKind === "lunch"
          ? filterLunchMenuForDate(await loadStoredLunchMenu(restaurantId), new Date(), settings)
          : await loadStoredDigitalMenu(restaurantId);
      const item = menu.items.find((entry) => entry.id === body.contentId);
      if (!item) {
        return reply.status(204).send();
      }
      contentTitle = String(item.name || "").trim();
    }

    const viewerHash = createHash("sha256").update(deviceId).digest("hex");
    try {
      await prisma.restaurantContentView.create({
        data: {
          restaurantId,
          contentType: body.type,
          contentId: body.contentId,
          contentTitle: contentTitle || null,
          dayKey,
          viewerHash
        }
      });
      return { counted: true };
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") return { counted: false };
      throw error;
    }
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
        items: stored.items,
        allergens: stored.allergens
      },
      updatedAt: stored.updatedAt
    };
  });

  app.get("/api/restaurants/:id/menu/lunch", async (request) => {
    const { id } = request.params as { id: string };
    const restaurant = await ctx.restaurantRepo.findById(id);
    if (!restaurant || restaurant.approvalStatus !== "approved") {
      throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
    }
    const settings = await loadRestaurantSettings(id);
    const stored = filterLunchMenuForCurrentWeek(
      await loadStoredLunchMenu(id),
      new Date(),
      settings
    );
    return {
      menu: {
        items: toPublicLunchMenuItems(stored.items),
        allergens: stored.allergens
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
    if (settings.reservationMode === "external") {
      throw new HttpError(
        400,
        "RESERVATION_EXTERNAL",
        "Dieses Restaurant nutzt externe Reservierungen. Bitte Portal, E-Mail oder Telefon verwenden."
      );
    }
    if (!settings.tableReservationEnabled) {
      throw new HttpError(400, "RESERVATION_DISABLED", "Table reservation is disabled for this restaurant");
    }

    const reservationTime = new Date(body.reservationTime);
    if (Number.isNaN(reservationTime.getTime())) {
      throw new HttpError(400, "INVALID_TIME", "Invalid reservation time");
    }
    const reservationDateKey = toDateKeyInRestaurantTimeZone(reservationTime);
    const specialClosure = settings.specialClosures.find((entry) => entry.date === reservationDateKey);
    if (specialClosure) {
      throw new HttpError(
        400,
        "SPECIAL_CLOSURE",
        `Restaurant geschlossen am ${specialClosure.date}: ${specialClosure.reason}`
      );
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

    void ctx.emailService
      .sendReservationReceived({
        customerEmail: reservation.customerEmail,
        customerName: reservation.customerName,
        restaurantName: restaurant.name,
        partySize: reservation.partySize,
        reservationTimeIso: reservation.reservationTime
      })
      .catch((error) => {
        request.log.error(
          { error, reservationId: reservation.id, restaurantId },
          "failed to send reservation received email"
        );
      });

    const reservationPushTokens = getRestaurantPushTokensFromSettings(settings);
    if (reservationPushTokens.length) {
      void ctx.pushService
        .sendToTokens(reservationPushTokens, {
          title: "Neue Reservierung",
          body: `${reservation.customerName} · ${reservation.partySize} Personen`,
          data: {
            type: "reservation_created",
            reservationId: reservation.id,
            restaurantId
          }
        })
        .catch((error) => {
          request.log.error(
            { error, reservationId: reservation.id, restaurantId },
            "failed to send push notification for reservation"
          );
        });
    }

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
    const previous = items[index];
    items[index] = {
      ...previous,
      status: body.status as ReservationStatus,
      updatedAt: new Date().toISOString()
    };
    await saveReservations(items);
    const updated = items[index];

    if (
      previous.status !== updated.status &&
      (updated.status === "confirmed" || updated.status === "cancelled")
    ) {
      try {
        const restaurant = await ctx.restaurantRepo.findById(updated.restaurantId);
        if (restaurant) {
          void ctx.emailService
            .sendReservationStatus({
              customerEmail: updated.customerEmail,
              customerName: updated.customerName,
              restaurantName: restaurant.name,
              status: updated.status
            })
            .catch((error) => {
              request.log.error(
                { error, reservationId: updated.id, restaurantId },
                "failed to send reservation status email"
              );
            });
        }
      } catch (error) {
        request.log.error(
          { error, reservationId: updated.id, restaurantId },
          "reservation status side effects failed"
        );
      }
    }

    return updated;
  });

  app.post("/api/restaurants/logo", async (request) => {
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
        "Only image files (JPG, PNG, WEBP) are allowed for restaurant logos"
      );
    }

    await mkdir(RESTAURANT_LOGO_UPLOAD_DIR, { recursive: true });

    const extension = extensionFromMime(mimeType, part.filename);
    const fileName = `${restaurantId}-logo-${Date.now()}-${randomUUID()}${extension}`;
    const filePath = path.join(RESTAURANT_LOGO_UPLOAD_DIR, fileName);
    await pipeline(part.file, createWriteStream(filePath));

    const logoUrl = toPublicUploadUrl(request, RESTAURANT_LOGO_UPLOAD_PREFIX, fileName);
    const settings = await saveRestaurantSettings(restaurantId, { logoUrl });
    return { logoUrl: settings.logoUrl, mimeType };
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
