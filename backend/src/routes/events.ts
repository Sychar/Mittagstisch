import { FastifyInstance } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { AppContext } from "../context";
import { haversineKm } from "../services/geoService";
import { requireAuth } from "../utils/auth";
import { HttpError, parseOrThrow } from "../utils/http";

const eventTags = [
  "sport",
  "culture",
  "music",
  "party",
  "trip",
  "family",
  "market",
  "workshop",
  "cinema",
  "other"
] as const;

const eventWeekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const eventRecurrenceTypes = ["none", "weekly", "monthly"] as const;
const RECURRENCE_LOOKAHEAD_DAYS = 180;

type EventTagValue = (typeof eventTags)[number];
type EventWeekdayValue = (typeof eventWeekdays)[number];
type EventRecurrenceTypeValue = (typeof eventRecurrenceTypes)[number];

const eventTagSchema = z.enum(eventTags);
const eventWeekdaySchema = z.enum(eventWeekdays);
const eventRecurrenceTypeSchema = z.enum(eventRecurrenceTypes);
const eventSocialLinkSchema = z.object({
  platform: z.string().trim().min(2).max(40),
  url: z.string().trim().url().max(500)
});
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EVENT_IMAGE_SIZE = 10 * 1024 * 1024;
const EVENT_IMAGE_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "events");
const EVENT_IMAGE_UPLOAD_PREFIX = "/uploads/events/";
const RESTAURANT_SETTINGS_DIR = path.resolve(process.cwd(), "uploads", "restaurant-settings");
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");

const discoverEventsSchema = z.object({
  query: z.string().trim().min(2).optional(),
  postalCodeOrCity: z.string().trim().min(2).optional(),
  postalCode: z.string().trim().min(2).optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
  date: z.string().regex(isoDatePattern).optional(),
  tags: z.string().trim().optional()
});

const eventDetailQuerySchema = z.object({
  occurrenceStartAt: z.string().datetime().optional()
});

const eventFollowQuerySchema = z.object({
  providerIds: z.string().trim().max(5000).optional()
});

const eventFollowSchema = z.object({
  token: z.string().trim().min(20).max(300),
  platform: z.enum(["ios", "android"])
});

const eventCancellationSchema = z.object({
  occurrenceStartAt: z.string().datetime(),
  reason: z.string().trim().max(500).optional().or(z.literal(""))
});
const scheduledOccurrenceSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime()
}).refine((value) => new Date(value.endAt).getTime() > new Date(value.startAt).getTime(), {
  message: "Scheduled occurrence endAt must be after startAt",
  path: ["endAt"]
});

const eventPayloadBaseSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().min(2).max(3000),
  tags: z.array(eventTagSchema).min(1).max(5),
  primaryTag: eventTagSchema.optional(),
  venueName: z.string().trim().min(2).max(160),
  address: z.string().trim().min(4).max(240),
  postalCode: z.string().trim().min(4).max(12),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  recurrenceType: eventRecurrenceTypeSchema.optional(),
  recurrenceWeekdays: z.array(eventWeekdaySchema).max(7).optional(),
  recurrenceEndAt: z.string().datetime().nullable().optional().or(z.literal("")),
  scheduledOccurrences: z.array(scheduledOccurrenceSchema).max(200).optional(),
  socialLinks: z.array(eventSocialLinkSchema).max(8).optional(),
  imageUrl: z.string().trim().url().optional().or(z.literal("")),
  ticketUrl: z.string().trim().url().optional().or(z.literal("")),
  contactUrl: z.string().trim().url().optional().or(z.literal("")),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  contactPhone: z.string().trim().min(6).max(40).optional().or(z.literal("")),
  active: z.boolean().optional()
});

const eventPayloadSchema = eventPayloadBaseSchema
  .refine((value) => new Date(value.endAt).getTime() >= new Date(value.startAt).getTime(), {
    message: "endAt must be after startAt",
    path: ["endAt"]
  })
  .refine((value) => (value.recurrenceType || "none") !== "weekly" || Boolean(value.recurrenceWeekdays?.length), {
    message: "Weekly events require at least one weekday",
    path: ["recurrenceWeekdays"]
  })
  .refine((value) => {
    if (!['weekly', 'monthly'].includes(value.recurrenceType || "none") || !value.recurrenceEndAt) return true;
    return new Date(value.recurrenceEndAt).getTime() >= new Date(value.startAt).getTime();
  }, {
    message: "recurrenceEndAt must be after startAt",
    path: ["recurrenceEndAt"]
  });

const eventUpdateSchema = eventPayloadBaseSchema.partial().refine(
  (value) => {
    if (!Object.keys(value).length) return false;
    if (value.startAt && value.endAt) {
      return new Date(value.endAt).getTime() >= new Date(value.startAt).getTime();
    }
    return true;
  },
  { message: "At least one field must be provided" }
).refine((value) => value.recurrenceType !== "weekly" || Boolean(value.recurrenceWeekdays?.length), {
  message: "Weekly events require at least one weekday",
  path: ["recurrenceWeekdays"]
}).refine((value) => {
  if (!['weekly', 'monthly'].includes(value.recurrenceType || "none") || !value.recurrenceEndAt || !value.startAt) return true;
  return new Date(value.recurrenceEndAt).getTime() >= new Date(value.startAt).getTime();
}, {
  message: "recurrenceEndAt must be after startAt",
  path: ["recurrenceEndAt"]
});

const parseTagsQuery = (value: string | undefined): EventTagValue[] => {
  if (!value) return [];
  const seen = new Set<EventTagValue>();
  String(value)
    .split(",")
    .map((entry) => entry.trim())
    .forEach((entry) => {
      if ((eventTags as readonly string[]).includes(entry)) {
        seen.add(entry as EventTagValue);
      }
    });
  return Array.from(seen);
};

const normalizeEventWeekdays = (value: unknown): EventWeekdayValue[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<EventWeekdayValue>();
  value.forEach((entry) => {
    if ((eventWeekdays as readonly string[]).includes(String(entry))) {
      unique.add(String(entry) as EventWeekdayValue);
    }
  });
  return Array.from(unique);
};

const normalizeRecurrenceEndAt = (value: unknown): Date | null => {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateRange = (dateText?: string): { gte: Date; lt: Date } | null => {
  if (!dateText) return null;
  const start = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start, lt: end };
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const eventWeekdayFromDate = (date: Date): EventWeekdayValue => {
  const days: EventWeekdayValue[] = ["sun" as EventWeekdayValue, "mon", "tue", "wed", "thu", "fri", "sat"];
  return days[date.getUTCDay()] || "mon";
};

const copyEventTimeToDate = (date: Date, timeSource: Date): Date =>
  new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    timeSource.getUTCHours(),
    timeSource.getUTCMinutes(),
    timeSource.getUTCSeconds(),
    timeSource.getUTCMilliseconds()
  ));

const getRecurringEventDurationMs = (startAt: Date, endAt: Date): number => {
  const rawDuration = endAt.getTime() - startAt.getTime();
  if (rawDuration > 0 && rawDuration <= 7 * 24 * 60 * 60 * 1000) return rawDuration;
  const startMinutes = startAt.getUTCHours() * 60 + startAt.getUTCMinutes();
  const endMinutes = endAt.getUTCHours() * 60 + endAt.getUTCMinutes();
  const durationMinutes = endMinutes > startMinutes ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
  return Math.max(1, durationMinutes) * 60 * 1000;
};

type EventOccurrenceResult = {
  occurrenceStartAt: Date;
  occurrenceEndAt: Date;
  occurrenceCancelled: boolean;
  cancellationId: string | null;
  cancellationReason: string | null;
};

const findOccurrenceCancellation = (event: any, occurrenceStartAt: Date) => {
  const target = occurrenceStartAt.getTime();
  return (Array.isArray(event?.occurrenceCancellations) ? event.occurrenceCancellations : []).find(
    (entry: any) => new Date(entry?.occurrenceStartAt).getTime() === target
  );
};

const toOccurrenceResult = (startAt: Date, endAt: Date): EventOccurrenceResult => ({
  occurrenceStartAt: startAt,
  occurrenceEndAt: endAt,
  occurrenceCancelled: false,
  cancellationId: null,
  cancellationReason: null
});

const getScheduledEventOccurrences = (event: any): EventOccurrenceResult[] => {
  const primaryStartAt = new Date(event?.startAt);
  const primaryEndAt = new Date(event?.endAt);
  const rows = [
    { startAt: primaryStartAt, endAt: primaryEndAt },
    ...(Array.isArray(event?.scheduledOccurrences) ? event.scheduledOccurrences : []).map((entry: any) => ({
      startAt: new Date(entry?.startAt),
      endAt: new Date(entry?.endAt)
    }))
  ]
    .filter((entry) => !Number.isNaN(entry.startAt.getTime()) && !Number.isNaN(entry.endAt.getTime()))
    .filter((entry) => entry.endAt.getTime() > entry.startAt.getTime())
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const seen = new Set<number>();
  return rows
    .filter((entry) => !seen.has(entry.startAt.getTime()) && seen.add(entry.startAt.getTime()))
    .map((entry) => toOccurrenceResult(entry.startAt, entry.endAt));
};

const getLastUtcDayOfMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const getMonthlyEventOccurrence = (
  event: any,
  now: Date,
  dateRange: { gte: Date; lt: Date } | null | undefined,
  includeCancelled: boolean
): EventOccurrenceResult | null => {
  const startAt = new Date(event.startAt);
  const endAt = new Date(event.endAt);
  const recurrenceEndAt = event.recurrenceEndAt ? new Date(event.recurrenceEndAt) : null;
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null;
  if (recurrenceEndAt && recurrenceEndAt < now) return null;

  const durationMs = getRecurringEventDurationMs(startAt, endAt);
  const lowerBound = dateRange?.gte || (now > startAt ? now : startAt);
  const searchEnd = dateRange?.lt || addDays(startOfUtcDay(lowerBound), RECURRENCE_LOOKAHEAD_DAYS);
  let year = lowerBound.getUTCFullYear();
  let month = lowerBound.getUTCMonth();
  const firstMonth = Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), 1);

  for (;;) {
    const monthStart = Date.UTC(year, month, 1);
    if (monthStart < firstMonth) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      continue;
    }
    const day = Math.min(startAt.getUTCDate(), getLastUtcDayOfMonth(year, month));
    const occurrenceStartAt = new Date(Date.UTC(
      year,
      month,
      day,
      startAt.getUTCHours(),
      startAt.getUTCMinutes(),
      startAt.getUTCSeconds(),
      startAt.getUTCMilliseconds()
    ));
    if (occurrenceStartAt >= searchEnd) return null;
    const occurrenceEndAt = new Date(occurrenceStartAt.getTime() + durationMs);
    if (
      occurrenceStartAt >= startAt &&
      occurrenceEndAt >= now &&
      (!recurrenceEndAt || occurrenceStartAt <= recurrenceEndAt) &&
      (!dateRange || (occurrenceStartAt >= dateRange.gte && occurrenceStartAt < dateRange.lt))
    ) {
      const cancellation = findOccurrenceCancellation(event, occurrenceStartAt);
      if (!cancellation || includeCancelled) {
        return {
          occurrenceStartAt,
          occurrenceEndAt,
          occurrenceCancelled: Boolean(cancellation),
          cancellationId: cancellation?.id || null,
          cancellationReason: normalizeOptional(cancellation?.reason)
        };
      }
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
};

const normalizeScheduledOccurrences = (value: unknown, primaryStartAt: Date): Array<{ startAt: Date; endAt: Date }> => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>([primaryStartAt.getTime()]);
  const normalized: Array<{ startAt: Date; endAt: Date }> = [];
  for (const entry of value) {
    const startAt = new Date((entry as any)?.startAt);
    const endAt = new Date((entry as any)?.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      throw new HttpError(400, "INVALID_INPUT", "Ein zusätzlicher Termin ist ungültig.");
    }
    if (seen.has(startAt.getTime())) {
      throw new HttpError(400, "INVALID_INPUT", "Jeder Termin darf nur einmal vorkommen.");
    }
    seen.add(startAt.getTime());
    normalized.push({ startAt, endAt });
  }
  return normalized.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
};

export const getEventOccurrence = (
  event: any,
  now: Date,
  dateRange?: { gte: Date; lt: Date } | null,
  includeCancelled = false
): EventOccurrenceResult | null => {
  const startAt = new Date(event.startAt);
  const endAt = new Date(event.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null;

  const recurrenceType = String(event.recurrenceType || "none") as EventRecurrenceTypeValue;
  if (recurrenceType === "none") {
    return getScheduledEventOccurrences(event).find((occurrence) => {
      if (occurrence.occurrenceEndAt < now) return false;
      return !dateRange || (
        occurrence.occurrenceStartAt >= dateRange.gte && occurrence.occurrenceStartAt < dateRange.lt
      );
    }) || null;
  }
  if (recurrenceType === "monthly") {
    return getMonthlyEventOccurrence(event, now, dateRange, includeCancelled);
  }

  const weekdays = normalizeEventWeekdays(event.recurrenceWeekdays);
  if (!weekdays.length) return null;

  const durationMs = getRecurringEventDurationMs(startAt, endAt);
  const recurrenceEndAt = event.recurrenceEndAt ? new Date(event.recurrenceEndAt) : null;
  if (recurrenceEndAt && recurrenceEndAt < now) return null;

  const searchStart = startOfUtcDay(dateRange?.gte || (now > startAt ? now : startAt));
  const searchEnd = dateRange?.lt || addDays(searchStart, RECURRENCE_LOOKAHEAD_DAYS);

  for (let day = new Date(searchStart); day < searchEnd; day = addDays(day, 1)) {
    if (!weekdays.includes(eventWeekdayFromDate(day))) continue;
    const occurrenceStartAt = copyEventTimeToDate(day, startAt);
    const occurrenceEndAt = new Date(occurrenceStartAt.getTime() + durationMs);
    if (occurrenceStartAt < startAt) continue;
    if (occurrenceEndAt < now) continue;
    if (recurrenceEndAt && occurrenceStartAt > recurrenceEndAt) continue;
    if (dateRange && (occurrenceStartAt < dateRange.gte || occurrenceStartAt >= dateRange.lt)) continue;
    const cancellation = findOccurrenceCancellation(event, occurrenceStartAt);
    if (cancellation && !includeCancelled) continue;
    return {
      occurrenceStartAt,
      occurrenceEndAt,
      occurrenceCancelled: Boolean(cancellation),
      cancellationId: cancellation?.id || null,
      cancellationReason: normalizeOptional(cancellation?.reason)
    };
  }

  return null;
};

const getUpcomingEventOccurrences = (event: any, now: Date, limit = 12): EventOccurrenceResult[] => {
  if (String(event?.recurrenceType || "none") === "none") {
    return getScheduledEventOccurrences(event)
      .filter((occurrence) => occurrence.occurrenceEndAt >= now)
      .slice(0, limit);
  }
  const results: EventOccurrenceResult[] = [];
  const start = startOfUtcDay(now);
  for (let offset = 0; offset < RECURRENCE_LOOKAHEAD_DAYS && results.length < limit; offset += 1) {
    const dayStart = addDays(start, offset);
    const occurrence = getEventOccurrence(
      event,
      now,
      { gte: dayStart, lt: addDays(dayStart, 1) },
      true
    );
    if (occurrence) results.push(occurrence);
  }
  return results;
};

const toPublicUploadUrl = (
  request: { headers: Record<string, unknown>; protocol?: string },
  prefix: string,
  fileName: string
): string => {
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}${prefix}${fileName}`;
  const host = typeof request.headers.host === "string" ? request.headers.host : "";
  const forwarded = request.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const protocol = typeof forwardedProto === "string" ? forwardedProto : request.protocol ?? "http";
  return host ? `${protocol}://${host}${prefix}${fileName}` : `${prefix}${fileName}`;
};

const isAllowedImageMime = (mimeType: string): boolean =>
  ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(String(mimeType || "").toLowerCase());

const extensionFromMime = (mimeType: string, filename?: string): string => {
  const fromName = path.extname(String(filename || "").split(/[?#]/)[0].trim().toLowerCase());
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(fromName)) return fromName === ".jpeg" ? ".jpg" : fromName;
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
};

const normalizeOptional = (value: unknown): string | null => {
  const text = String(value || "").trim();
  return text || null;
};

const getFollowerDeviceHash = (request: { headers: Record<string, unknown> }): string => {
  const header = request.headers["x-device-id"];
  const raw = Array.isArray(header) ? header[0] : header;
  const deviceId = String(raw || "").trim().slice(0, 180);
  if (!deviceId) throw new HttpError(400, "DEVICE_ID_REQUIRED", "Gerätekennung fehlt.");
  return createHash("sha256").update(deviceId).digest("hex");
};

const parseFollowerProviderIds = (value: string | undefined): string[] =>
  Array.from(
    new Set(
      String(value || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => /^[0-9a-f-]{36}$/i.test(entry))
    )
  ).slice(0, 100);

const normalizeEventSocialLinks = (value: unknown): Array<{ platform: string; url: string }> => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const platform = String((entry as { platform?: unknown }).platform || "").trim();
      const url = String((entry as { url?: unknown }).url || "").trim();
      if (platform.length < 2 || !/^https?:\/\//i.test(url)) return null;
      const key = `${platform.toLowerCase()}|${url.toLowerCase()}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { platform: platform.slice(0, 40), url: url.slice(0, 500) };
    })
    .filter((entry): entry is { platform: string; url: string } => Boolean(entry))
    .slice(0, 8);
};

const normalizeEventTags = (tags: EventTagValue[], primaryTag?: EventTagValue) => {
  const unique = Array.from(new Set(tags));
  const primary = primaryTag && unique.includes(primaryTag) ? primaryTag : unique[0];
  return { tags: unique, primaryTag: primary };
};

export const loadProviderEventSettings = async (providerId: string) => {
  const safeId = String(providerId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) return {};
  try {
    const raw = await readFile(path.join(RESTAURANT_SETTINGS_DIR, `${safeId}.json`), "utf8");
    const parsed = JSON.parse(raw);
    return {
      logoUrl: typeof parsed?.logoUrl === "string" ? parsed.logoUrl : "",
      socialLinks: Array.isArray(parsed?.socialLinks) ? parsed.socialLinks : [],
      eventProfile:
        parsed?.eventProfile && typeof parsed.eventProfile === "object"
          ? {
              offeringsText: String(parsed.eventProfile.offeringsText || ""),
              reservationUrl: String(parsed.eventProfile.reservationUrl || ""),
              contactUrl: String(parsed.eventProfile.contactUrl || ""),
              contactEmail: String(parsed.eventProfile.contactEmail || ""),
              contactPhone: String(parsed.eventProfile.contactPhone || "")
            }
          : {
              offeringsText: "",
              reservationUrl: "",
              contactUrl: "",
              contactEmail: "",
              contactPhone: ""
            }
    };
  } catch {
    return {};
  }
};

const loadProviderSettingsMap = async (events: Array<{ providerId: string }>) => {
  const ids = Array.from(new Set(events.map((event) => event.providerId).filter(Boolean)));
  const entries = await Promise.all(ids.map(async (id) => [id, await loadProviderEventSettings(id)] as const));
  return new Map(entries);
};

export const toPublicEvent = (
  event: any,
  origin?: { lat: number; lng: number } | null,
  providerSettings?: Awaited<ReturnType<typeof loadProviderEventSettings>>,
  occurrence?: EventOccurrenceResult | null,
  upcomingOccurrences?: EventOccurrenceResult[]
) => {
  const provider = event.provider;
  const distanceKm = origin
    ? haversineKm(origin, { lat: Number(event.lat), lng: Number(event.lng) })
    : undefined;
  return {
    id: event.id,
    providerId: event.providerId,
    title: event.title,
    description: event.description,
    tags: event.tags || [],
    primaryTag: event.primaryTag,
    venueName: event.venueName,
    address: event.address,
    postalCode: event.postalCode,
    lat: event.lat,
    lng: event.lng,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    recurrenceType: event.recurrenceType || "none",
    recurrenceWeekdays: normalizeEventWeekdays(event.recurrenceWeekdays),
    recurrenceEndAt: event.recurrenceEndAt ? event.recurrenceEndAt.toISOString() : null,
    scheduledOccurrences: (Array.isArray(event.scheduledOccurrences) ? event.scheduledOccurrences : [])
      .map((entry: any) => ({
        id: entry.id,
        startAt: new Date(entry.startAt).toISOString(),
        endAt: new Date(entry.endAt).toISOString()
      }))
      .sort((a: { startAt: string }, b: { startAt: string }) => Date.parse(a.startAt) - Date.parse(b.startAt)),
    socialLinks: normalizeEventSocialLinks(event.socialLinks),
    occurrenceStartAt: occurrence?.occurrenceStartAt?.toISOString() || event.startAt.toISOString(),
    occurrenceEndAt: occurrence?.occurrenceEndAt?.toISOString() || event.endAt.toISOString(),
    occurrenceCancelled: Boolean(occurrence?.occurrenceCancelled),
    cancellationId: occurrence?.cancellationId || null,
    cancellationReason: occurrence?.cancellationReason || null,
    ...(upcomingOccurrences
      ? {
          upcomingOccurrences: upcomingOccurrences.map((entry) => ({
            occurrenceStartAt: entry.occurrenceStartAt.toISOString(),
            occurrenceEndAt: entry.occurrenceEndAt.toISOString(),
            occurrenceCancelled: entry.occurrenceCancelled,
            cancellationId: entry.cancellationId,
            cancellationReason: entry.cancellationReason
          }))
        }
      : {}),
    imageUrl: event.imageUrl || null,
    ticketUrl: event.ticketUrl || null,
    contactUrl: event.contactUrl || null,
    contactEmail: event.contactEmail || null,
    contactPhone: event.contactPhone || null,
    active: event.active,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    distanceKm,
    provider: provider
      ? {
          id: provider.id,
          name: provider.name,
          email: provider.email,
          phone: provider.phone,
          address: provider.address,
          postalCode: provider.postalCode,
          lat: provider.lat,
          lng: provider.lng,
          approvalStatus: provider.approvalStatus,
          logoUrl: providerSettings?.logoUrl || "",
          socialLinks: providerSettings?.socialLinks || [],
          eventProfile: providerSettings?.eventProfile || {
            offeringsText: "",
            reservationUrl: "",
            contactUrl: "",
            contactEmail: "",
            contactPhone: ""
          }
        }
      : null
  };
};

export const registerEventRoutes = (app: FastifyInstance, ctx: AppContext) => {
  app.get("/api/events/discover", async (request) => {
    if (!ctx.prisma) return [];
    const query = parseOrThrow(discoverEventsSchema, request.query);
    const tags = parseTagsQuery(query.tags);
    const locationQuery = query.postalCodeOrCity || query.query || query.postalCode || "";
    if (!locationQuery) return [];
    const radiusKm = query.radiusKm ?? Number(process.env.DEFAULT_EVENT_RADIUS_KM ?? 30);
    const origin = locationQuery ? await ctx.geoService.resolveSearchCoordinates(locationQuery) : null;
    const dateRange = toDateRange(query.date);
    const now = new Date();
    const searchEnd = dateRange?.lt || addDays(now, RECURRENCE_LOOKAHEAD_DAYS);

    const rows = await ctx.prisma.event.findMany({
      where: {
        active: true,
        ...(tags.length ? { tags: { hasSome: tags } } : {}),
        OR: [
          {
            recurrenceType: "none",
            OR: [
              {
                endAt: { gte: now },
                ...(dateRange ? { startAt: { gte: dateRange.gte, lt: dateRange.lt } } : {})
              },
              {
                scheduledOccurrences: {
                  some: {
                    endAt: { gte: now },
                    ...(dateRange ? { startAt: { gte: dateRange.gte, lt: dateRange.lt } } : {})
                  }
                }
              }
            ]
          },
          {
            recurrenceType: "weekly",
            startAt: { lt: searchEnd },
            OR: [{ recurrenceEndAt: null }, { recurrenceEndAt: { gte: dateRange?.gte || now } }]
          },
          {
            recurrenceType: "monthly",
            startAt: { lt: searchEnd },
            OR: [{ recurrenceEndAt: null }, { recurrenceEndAt: { gte: dateRange?.gte || now } }]
          }
        ],
        provider: { approvalStatus: "approved" }
      },
      include: { provider: true, occurrenceCancellations: true, scheduledOccurrences: true },
      orderBy: [{ startAt: "asc" }],
      take: 200
    });

    const eventOccurrences = rows
      .map((event) => ({ event, occurrence: getEventOccurrence(event, now, dateRange) }))
      .filter((entry): entry is { event: (typeof rows)[number]; occurrence: EventOccurrenceResult } =>
        Boolean(entry.occurrence)
      );
    const providerSettings = await loadProviderSettingsMap(eventOccurrences.map((entry) => entry.event));
    const mapped = eventOccurrences.map(({ event, occurrence }) =>
      toPublicEvent(event, origin, providerSettings.get(event.providerId), occurrence)
    );
    return origin
      ? mapped
          .filter((event) => typeof event.distanceKm !== "number" || event.distanceKm <= radiusKm)
          .sort((a, b) => {
            const aStart = Date.parse(a.occurrenceStartAt);
            const bStart = Date.parse(b.occurrenceStartAt);
            if (aStart !== bStart) return aStart - bStart;
            return Number(a.distanceKm || 0) - Number(b.distanceKm || 0);
          })
      : mapped.sort((a, b) => Date.parse(a.occurrenceStartAt) - Date.parse(b.occurrenceStartAt));
  });

  app.get("/api/events/follows", async (request) => {
    if (!ctx.prisma) return { providerIds: [] };
    const { providerIds } = parseOrThrow(eventFollowQuerySchema, request.query);
    const ids = parseFollowerProviderIds(providerIds);
    if (!ids.length) return { providerIds: [] };

    let deviceHash = "";
    try {
      deviceHash = getFollowerDeviceHash(request);
    } catch {
      return { providerIds: [] };
    }

    const follows = await ctx.prisma.eventProviderFollow.findMany({
      where: { deviceHash, providerId: { in: ids } },
      select: { providerId: true }
    });
    return { providerIds: follows.map((entry) => entry.providerId) };
  });

  app.post("/api/events/providers/:providerId/follow", async (request) => {
    if (!ctx.prisma) throw new HttpError(503, "DB_UNAVAILABLE", "Event-Favoriten benötigen die Datenbank.");
    const { providerId } = request.params as { providerId: string };
    const body = parseOrThrow(eventFollowSchema, request.body);
    const deviceHash = getFollowerDeviceHash(request);
    const activeProvider = await ctx.prisma.event.findFirst({
      where: {
        providerId,
        active: true,
        provider: { approvalStatus: "approved" }
      },
      select: { id: true }
    });
    if (!activeProvider) throw new HttpError(404, "NOT_FOUND", "Veranstalter nicht gefunden.");

    await ctx.prisma.eventProviderFollow.upsert({
      where: { providerId_deviceHash: { providerId, deviceHash } },
      create: { providerId, deviceHash, pushToken: body.token, platform: body.platform },
      update: { pushToken: body.token, platform: body.platform }
    });
    return { following: true };
  });

  app.delete("/api/events/providers/:providerId/follow", async (request) => {
    if (!ctx.prisma) return { following: false };
    const { providerId } = request.params as { providerId: string };
    const deviceHash = getFollowerDeviceHash(request);
    await ctx.prisma.eventProviderFollow.deleteMany({ where: { providerId, deviceHash } });
    return { following: false };
  });

  app.get("/api/events/:id", async (request) => {
    if (!ctx.prisma) throw new HttpError(503, "DB_UNAVAILABLE", "Events require database storage");
    const { id } = request.params as { id: string };
    const query = parseOrThrow(eventDetailQuerySchema, request.query);
    const event = await ctx.prisma.event.findFirst({
      where: {
        id,
        active: true,
        provider: { approvalStatus: "approved" }
      },
      include: { provider: true, occurrenceCancellations: true, scheduledOccurrences: true }
    });
    if (!event) throw new HttpError(404, "NOT_FOUND", "Event not found");

    const now = new Date();
    let occurrence: EventOccurrenceResult | null = null;
    if (query.occurrenceStartAt) {
      const requested = new Date(query.occurrenceStartAt);
      const dayStart = startOfUtcDay(requested);
      occurrence = getEventOccurrence(event, new Date(0), { gte: dayStart, lt: addDays(dayStart, 1) }, true);
      if (!occurrence || occurrence.occurrenceStartAt.getTime() !== requested.getTime()) {
        throw new HttpError(404, "NOT_FOUND", "Event occurrence not found");
      }
    } else {
      occurrence = getEventOccurrence(event, now);
    }
    if (!occurrence) throw new HttpError(404, "NOT_FOUND", "Event occurrence not found");
    return toPublicEvent(event, undefined, await loadProviderEventSettings(event.providerId), occurrence);
  });

  app.get("/api/restaurants/events", async (request) => {
    const providerId = requireAuth(request, ctx.sessionRepo);
    if (!ctx.prisma) return [];
    const rows = await ctx.prisma.event.findMany({
      where: { providerId },
      include: { provider: true, occurrenceCancellations: true, scheduledOccurrences: true },
      orderBy: [{ startAt: "asc" }]
    });
    const providerSettings = await loadProviderSettingsMap(rows);
    const now = new Date();
    return rows.map((event) =>
      toPublicEvent(
        event,
        undefined,
        providerSettings.get(event.providerId),
        undefined,
        getUpcomingEventOccurrences(event, now)
      )
    );
  });

  app.post("/api/restaurants/events", async (request) => {
    const providerId = requireAuth(request, ctx.sessionRepo);
    if (!ctx.prisma) throw new HttpError(503, "DB_UNAVAILABLE", "Events require database storage");
    const body = parseOrThrow(eventPayloadSchema, request.body);
    const coords = await ctx.geoService.resolveRestaurantCoordinates({
      address: body.address,
      postalCode: body.postalCode,
      lat: body.lat,
      lng: body.lng
    });
    if (!coords) throw new HttpError(400, "POSTAL_CODE_UNKNOWN", "Adresse oder Postleitzahl konnte nicht gefunden werden.");
    const { tags, primaryTag } = normalizeEventTags(body.tags, body.primaryTag);
    const recurrenceType = body.recurrenceType || "none";
    const recurrenceWeekdays = recurrenceType === "weekly" ? normalizeEventWeekdays(body.recurrenceWeekdays) : [];
    const recurrenceEndAt = ["weekly", "monthly"].includes(recurrenceType)
      ? normalizeRecurrenceEndAt(body.recurrenceEndAt)
      : null;
    if (["weekly", "monthly"].includes(recurrenceType) && body.scheduledOccurrences?.length) {
      throw new HttpError(400, "INVALID_INPUT", "Wiederholte Events können keine einzelnen Zusatztermine haben.");
    }
    const scheduledOccurrences =
      recurrenceType === "none" ? normalizeScheduledOccurrences(body.scheduledOccurrences, new Date(body.startAt)) : [];
    const created = await ctx.prisma.event.create({
      data: {
        providerId,
        title: body.title,
        description: body.description,
        tags,
        primaryTag,
        venueName: body.venueName,
        address: body.address,
        postalCode: body.postalCode,
        lat: coords.lat,
        lng: coords.lng,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
        recurrenceType,
        recurrenceWeekdays,
        recurrenceEndAt,
        scheduledOccurrences: scheduledOccurrences.length ? { create: scheduledOccurrences } : undefined,
        socialLinks: normalizeEventSocialLinks(body.socialLinks),
        imageUrl: normalizeOptional(body.imageUrl),
        ticketUrl: normalizeOptional(body.ticketUrl),
        contactUrl: normalizeOptional(body.contactUrl),
        contactEmail: normalizeOptional(body.contactEmail),
        contactPhone: normalizeOptional(body.contactPhone),
        active: body.active ?? true
      },
      include: { provider: true, occurrenceCancellations: true, scheduledOccurrences: true }
    });
    if (created.active) {
      void ctx.prisma.eventProviderFollow
        .findMany({ where: { providerId }, select: { pushToken: true } })
        .then((follows) =>
          ctx.pushService.sendToTokens(
            follows.map((follow) => follow.pushToken),
            {
              title: `Neues Event von ${created.provider.name}`,
              body: `${created.title} · ${created.startAt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`,
              data: {
                type: "event_created",
                eventId: created.id,
                occurrenceStartAt: created.startAt.toISOString()
              }
            }
          )
        )
        .catch((error) => {
          request.log.error(
            { error, eventId: created.id, providerId },
            "failed to send event follower push notification"
          );
        });
    }
    return toPublicEvent(
      created,
      undefined,
      await loadProviderEventSettings(providerId),
      undefined,
      getUpcomingEventOccurrences(created, new Date())
    );
  });

  app.patch("/api/restaurants/events/:id", async (request) => {
    const providerId = requireAuth(request, ctx.sessionRepo);
    if (!ctx.prisma) throw new HttpError(503, "DB_UNAVAILABLE", "Events require database storage");
    const { id } = request.params as { id: string };
    const body = parseOrThrow(eventUpdateSchema, request.body);
    const current = await ctx.prisma.event.findUnique({ where: { id }, include: { scheduledOccurrences: true } });
    if (!current) throw new HttpError(404, "NOT_FOUND", "Event not found");
    if (current.providerId !== providerId) throw new HttpError(403, "FORBIDDEN", "Not allowed to edit this event");

    let coords: { lat: number; lng: number } | null = null;
    if (body.address !== undefined || body.postalCode !== undefined || body.lat !== undefined || body.lng !== undefined) {
      coords = await ctx.geoService.resolveRestaurantCoordinates({
        address: body.address ?? current.address,
        postalCode: body.postalCode ?? current.postalCode,
        lat: body.lat,
        lng: body.lng
      });
      if (!coords) throw new HttpError(400, "POSTAL_CODE_UNKNOWN", "Adresse oder Postleitzahl konnte nicht gefunden werden.");
    }

    const nextTags = body.tags ? normalizeEventTags(body.tags, body.primaryTag) : null;
    const nextStartAt = body.startAt ? new Date(body.startAt) : current.startAt;
    const nextRecurrenceType = body.recurrenceType || current.recurrenceType || "none";
    const nextRecurrenceWeekdays =
      nextRecurrenceType === "weekly"
        ? body.recurrenceWeekdays !== undefined
          ? normalizeEventWeekdays(body.recurrenceWeekdays)
          : normalizeEventWeekdays(current.recurrenceWeekdays)
        : [];
    const nextRecurrenceEndAt =
      ["weekly", "monthly"].includes(nextRecurrenceType)
        ? body.recurrenceEndAt !== undefined
          ? normalizeRecurrenceEndAt(body.recurrenceEndAt)
          : current.recurrenceEndAt
        : null;
    const shouldReplaceScheduledOccurrences =
      body.scheduledOccurrences !== undefined || body.startAt !== undefined || body.recurrenceType !== undefined;
    if (["weekly", "monthly"].includes(nextRecurrenceType) && body.scheduledOccurrences?.length) {
      throw new HttpError(400, "INVALID_INPUT", "Wiederholte Events können keine einzelnen Zusatztermine haben.");
    }
    const nextScheduledOccurrences =
      nextRecurrenceType !== "none"
        ? []
        : normalizeScheduledOccurrences(
            body.scheduledOccurrences !== undefined ? body.scheduledOccurrences : current.scheduledOccurrences,
            nextStartAt
          );
    if (nextRecurrenceType === "weekly" && !nextRecurrenceWeekdays.length) {
      throw new HttpError(400, "INVALID_INPUT", "Weekly events require at least one weekday");
    }
    if (nextRecurrenceEndAt && nextRecurrenceEndAt.getTime() < nextStartAt.getTime()) {
      throw new HttpError(400, "INVALID_INPUT", "recurrenceEndAt must be after startAt");
    }
    const updated = await ctx.prisma.event.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        tags: nextTags?.tags,
        primaryTag: nextTags?.primaryTag ?? body.primaryTag,
        venueName: body.venueName,
        address: body.address,
        postalCode: body.postalCode,
        lat: coords?.lat,
        lng: coords?.lng,
        startAt: body.startAt ? new Date(body.startAt) : undefined,
        endAt: body.endAt ? new Date(body.endAt) : undefined,
        recurrenceType: nextRecurrenceType,
        recurrenceWeekdays: nextRecurrenceWeekdays,
        recurrenceEndAt: nextRecurrenceEndAt,
        scheduledOccurrences: shouldReplaceScheduledOccurrences
          ? {
              deleteMany: {},
              ...(nextScheduledOccurrences.length ? { create: nextScheduledOccurrences } : {})
            }
          : undefined,
        socialLinks: body.socialLinks !== undefined ? normalizeEventSocialLinks(body.socialLinks) : undefined,
        imageUrl: body.imageUrl !== undefined ? normalizeOptional(body.imageUrl) : undefined,
        ticketUrl: body.ticketUrl !== undefined ? normalizeOptional(body.ticketUrl) : undefined,
        contactUrl: body.contactUrl !== undefined ? normalizeOptional(body.contactUrl) : undefined,
        contactEmail: body.contactEmail !== undefined ? normalizeOptional(body.contactEmail) : undefined,
        contactPhone: body.contactPhone !== undefined ? normalizeOptional(body.contactPhone) : undefined,
        active: body.active
      },
      include: { provider: true, occurrenceCancellations: true, scheduledOccurrences: true }
    });
    return toPublicEvent(
      updated,
      undefined,
      await loadProviderEventSettings(providerId),
      undefined,
      getUpcomingEventOccurrences(updated, new Date())
    );
  });

  app.post("/api/restaurants/events/:id/cancellations", async (request) => {
    const providerId = requireAuth(request, ctx.sessionRepo);
    if (!ctx.prisma) throw new HttpError(503, "DB_UNAVAILABLE", "Events require database storage");
    const { id } = request.params as { id: string };
    const body = parseOrThrow(eventCancellationSchema, request.body);
    const event = await ctx.prisma.event.findUnique({
      where: { id },
      include: { occurrenceCancellations: true, scheduledOccurrences: true }
    });
    if (!event) throw new HttpError(404, "NOT_FOUND", "Event not found");
    if (event.providerId !== providerId) throw new HttpError(403, "FORBIDDEN", "Not allowed to edit this event");
    if (!["weekly", "monthly"].includes(event.recurrenceType)) {
      throw new HttpError(400, "INVALID_INPUT", "Only recurring event occurrences can be cancelled");
    }

    const requested = new Date(body.occurrenceStartAt);
    const dayStart = startOfUtcDay(requested);
    const occurrence = getEventOccurrence(event, new Date(0), { gte: dayStart, lt: addDays(dayStart, 1) }, true);
    if (!occurrence || occurrence.occurrenceStartAt.getTime() !== requested.getTime()) {
      throw new HttpError(400, "INVALID_INPUT", "Event occurrence is not part of this recurrence");
    }

    const cancellation = await ctx.prisma.eventOccurrenceCancellation.upsert({
      where: {
        eventId_occurrenceStartAt: {
          eventId: event.id,
          occurrenceStartAt: requested
        }
      },
      create: {
        eventId: event.id,
        occurrenceStartAt: requested,
        reason: normalizeOptional(body.reason)
      },
      update: {
        reason: normalizeOptional(body.reason)
      }
    });
    return {
      id: cancellation.id,
      eventId: cancellation.eventId,
      occurrenceStartAt: cancellation.occurrenceStartAt.toISOString(),
      reason: cancellation.reason,
      createdAt: cancellation.createdAt.toISOString(),
      updatedAt: cancellation.updatedAt.toISOString()
    };
  });

  app.delete("/api/restaurants/events/:id/cancellations/:cancellationId", async (request) => {
    const providerId = requireAuth(request, ctx.sessionRepo);
    if (!ctx.prisma) throw new HttpError(503, "DB_UNAVAILABLE", "Events require database storage");
    const { id, cancellationId } = request.params as { id: string; cancellationId: string };
    const cancellation = await ctx.prisma.eventOccurrenceCancellation.findUnique({
      where: { id: cancellationId },
      include: { event: true }
    });
    if (!cancellation || cancellation.eventId !== id) {
      throw new HttpError(404, "NOT_FOUND", "Event cancellation not found");
    }
    if (cancellation.event.providerId !== providerId) {
      throw new HttpError(403, "FORBIDDEN", "Not allowed to edit this event");
    }
    await ctx.prisma.eventOccurrenceCancellation.delete({ where: { id: cancellation.id } });
    return { ok: true };
  });

  app.delete("/api/restaurants/events/:id", async (request) => {
    const providerId = requireAuth(request, ctx.sessionRepo);
    if (!ctx.prisma) throw new HttpError(503, "DB_UNAVAILABLE", "Events require database storage");
    const { id } = request.params as { id: string };
    const current = await ctx.prisma.event.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "NOT_FOUND", "Event not found");
    if (current.providerId !== providerId) throw new HttpError(403, "FORBIDDEN", "Not allowed to delete this event");
    await ctx.prisma.event.delete({ where: { id } });
    return { ok: true };
  });

  app.post("/api/restaurants/events/image", async (request) => {
    const providerId = requireAuth(request, ctx.sessionRepo);
    const fileRequest = request as typeof request & {
      file: (options?: unknown) => Promise<{
        mimetype: string;
        filename?: string;
        file: NodeJS.ReadableStream;
      } | undefined>;
    };

    let part;
    try {
      part = await fileRequest.file({ limits: { files: 1, fileSize: MAX_EVENT_IMAGE_SIZE } });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "FST_REQ_FILE_TOO_LARGE") {
        throw new HttpError(413, "FILE_TOO_LARGE", "File is too large (max 10 MB)");
      }
      throw error;
    }

    if (!part) throw new HttpError(400, "INVALID_INPUT", "No file uploaded");
    const mimeType = String(part.mimetype || "").toLowerCase();
    if (!isAllowedImageMime(mimeType)) {
      throw new HttpError(400, "UNSUPPORTED_FILE_TYPE", "Only image files (JPG, PNG, WEBP) are allowed for event images");
    }

    await mkdir(EVENT_IMAGE_UPLOAD_DIR, { recursive: true });
    const extension = extensionFromMime(mimeType, part.filename);
    const fileName = `${providerId}-event-${Date.now()}-${randomUUID()}${extension}`;
    const filePath = path.join(EVENT_IMAGE_UPLOAD_DIR, fileName);
    await pipeline(part.file, createWriteStream(filePath));
    const imageUrl = toPublicUploadUrl(request, EVENT_IMAGE_UPLOAD_PREFIX, fileName);
    return { imageUrl, mimeType };
  });
};
