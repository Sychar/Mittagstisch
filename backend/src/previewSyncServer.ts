import cors from "@fastify/cors";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { WebsiteSyncError, WebsiteSyncResult, WebsiteSyncSection, WebsiteSyncService } from "./services/websiteSyncService";

type StoredDraft = {
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
  appliedSourceIds: string[];
  skippedSourceIds: string[];
};

const port = Number(process.env.PREVIEW_SYNC_PORT || 4001);
const host = process.env.PREVIEW_SYNC_HOST || "127.0.0.1";
const productionApi = (process.env.PRODUCTION_API_URL || "https://api.nahundfein.com").replace(/\/+$/, "");
const draftDir = process.env.PREVIEW_SYNC_DRAFT_DIR || path.resolve(process.cwd(), "uploads", "website-sync-drafts");
const draftTtlMs = 60 * 60 * 1000;
const service = new WebsiteSyncService();
const controllers = new Map<string, AbortController>();
const jobs = new Map<string, Promise<void>>();

const draftPath = (draftId: string) => {
  if (!/^[a-f0-9-]{36}$/i.test(draftId)) throw new Error("INVALID_DRAFT_ID");
  return path.join(draftDir, `${draftId}.json`);
};

const writeDraft = async (draft: StoredDraft) => {
  await mkdir(draftDir, { recursive: true });
  const target = draftPath(draft.id);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(draft, null, 2), { encoding: "utf-8", mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
};

const readDraft = async (draftId: string): Promise<StoredDraft | null> => {
  try {
    const draft = JSON.parse(await readFile(draftPath(draftId), "utf-8")) as StoredDraft;
    return draft?.id && Date.parse(draft.expiresAt) > Date.now() ? draft : null;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
};

const latestPath = (restaurantId: string) => path.join(draftDir, `${restaurantId}.latest.json`);

const readLatestDraft = async (restaurantId: string): Promise<StoredDraft | null> => {
  try {
    const index = JSON.parse(await readFile(latestPath(restaurantId), "utf-8")) as { draftId?: string };
    return index.draftId ? readDraft(index.draftId) : null;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
};

const setLatestDraft = async (restaurantId: string, draftId: string) => {
  await mkdir(draftDir, { recursive: true });
  const target = latestPath(restaurantId);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({ draftId }), { encoding: "utf-8", mode: 0o600 });
  await rename(temporary, target);
};

const responseForDraft = (draft: StoredDraft | null) => draft ? ({
  id: draft.id,
  websiteUrl: draft.websiteUrl,
  status: draft.status,
  step: draft.step,
  progress: draft.progress,
  createdAt: draft.createdAt,
  completedAt: draft.completedAt || null,
  result: draft.result || null,
  error: draft.error || null,
  appliedSections: draft.appliedSections,
  skippedSections: draft.skippedSections,
  appliedSourceIds: draft.appliedSourceIds,
  skippedSourceIds: draft.skippedSourceIds
}) : { draft: null };

const authorization = (headers: Record<string, unknown>) => String(headers.authorization || "").trim();

const productionRequest = async (route: string, auth: string, init: RequestInit = {}) => {
  const response = await fetch(`${productionApi}${route}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: auth,
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const requireRestaurant = async (headers: Record<string, unknown>): Promise<{ id: string; auth: string }> => {
  const auth = authorization(headers);
  if (!auth) throw Object.assign(new Error("Nicht autorisiert."), { statusCode: 401, code: "UNAUTHORIZED" });
  const { response, payload } = await productionRequest("/api/restaurants/me", auth);
  const restaurantId = String((payload as { restaurant?: { id?: unknown } })?.restaurant?.id || "").trim();
  if (!response.ok || !restaurantId) {
    throw Object.assign(new Error("Die Partner-Sitzung ist abgelaufen. Bitte erneut einloggen."), { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return { id: restaurantId, auth };
};

const normalizeUrl = (value: unknown): string => {
  const raw = String(value || "").trim();
  const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!parsed.hostname || !["http:", "https:"].includes(parsed.protocol)) throw new Error("INVALID_URL");
  parsed.hash = "";
  return parsed.toString();
};

const start = async () => {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true, service: "preview-website-sync" }));

  app.get("/api/restaurants/website-sync", async (request) => {
    const restaurant = await requireRestaurant(request.headers as Record<string, unknown>);
    return responseForDraft(await readLatestDraft(restaurant.id));
  });

  app.post("/api/restaurants/website-sync/cancel", async (request) => {
    const restaurant = await requireRestaurant(request.headers as Record<string, unknown>);
    const draftId = String((request.body as { draftId?: unknown })?.draftId || "");
    const draft = await readDraft(draftId);
    if (!draft || draft.restaurantId !== restaurant.id) throw Object.assign(new Error("Entwurf nicht gefunden."), { statusCode: 404, code: "WEBSITE_SYNC_DRAFT_NOT_FOUND" });
    controllers.get(draft.id)?.abort();
    await jobs.get(draft.id)?.catch(() => undefined);
    const cancelled = { ...draft, status: "cancelled" as const, step: "Analyse abgebrochen", completedAt: new Date().toISOString() };
    await writeDraft(cancelled);
    return responseForDraft(cancelled);
  });

  app.post("/api/restaurants/website-sync/start", async (request) => {
    const restaurant = await requireRestaurant(request.headers as Record<string, unknown>);
    let websiteUrl: string;
    try {
      websiteUrl = normalizeUrl((request.body as { websiteUrl?: unknown })?.websiteUrl);
    } catch {
      throw Object.assign(new Error("Bitte eine gültige Website-Adresse eingeben."), { statusCode: 400, code: "WEBSITE_URL_INVALID" });
    }

    const latest = await readLatestDraft(restaurant.id);
    if (latest?.status === "running") {
      controllers.get(latest.id)?.abort();
      await jobs.get(latest.id)?.catch(() => undefined);
      await writeDraft({ ...latest, status: "cancelled", step: "Analyse abgebrochen", completedAt: new Date().toISOString() });
    }

    const createdAt = new Date().toISOString();
    const draft: StoredDraft = {
      id: randomUUID(),
      restaurantId: restaurant.id,
      websiteUrl,
      status: "running",
      step: "Website wird geprüft",
      progress: 5,
      createdAt,
      expiresAt: new Date(Date.now() + draftTtlMs).toISOString(),
      appliedSections: [],
      skippedSections: [],
      appliedSourceIds: [],
      skippedSourceIds: []
    };
    await writeDraft(draft);
    await setLatestDraft(restaurant.id, draft.id);
    void productionRequest("/api/restaurants/me", restaurant.auth, {
      method: "PATCH",
      body: JSON.stringify({ websiteSyncUrl: websiteUrl })
    }).catch(() => undefined);

    const controller = new AbortController();
    controllers.set(draft.id, controller);
    const job = (async () => {
      try {
        const result = await service.analyze(websiteUrl, async (step, progress) => {
          const current = await readDraft(draft.id);
          if (!current || current.status !== "running") return;
          await writeDraft({ ...current, step, progress: Math.max(current.progress, progress) });
        }, controller.signal);
        const current = await readDraft(draft.id);
        if (!current || current.status !== "running" || controller.signal.aborted) return;
        await writeDraft({
          ...current,
          status: "completed",
          step: "Entwurf ist bereit",
          progress: 100,
          completedAt: new Date().toISOString(),
          result
        });
      } catch (error) {
        const current = await readDraft(draft.id);
        if (!current || controller.signal.aborted) return;
        const known = error instanceof WebsiteSyncError;
        await writeDraft({
          ...current,
          status: "failed",
          step: "Synchronisierung konnte nicht abgeschlossen werden",
          completedAt: new Date().toISOString(),
          error: {
            code: known ? error.code : "WEBSITE_SYNC_FAILED",
            message: known ? error.message : "Die Website konnte nicht vollständig analysiert werden."
          }
        });
      } finally {
        controllers.delete(draft.id);
        jobs.delete(draft.id);
      }
    })();
    jobs.set(draft.id, job);
    return responseForDraft(draft);
  });

  app.post("/api/restaurants/website-sync/apply", async (request, reply) => {
    const restaurant = await requireRestaurant(request.headers as Record<string, unknown>);
    const draftId = String((request.body as { draftId?: unknown })?.draftId || "");
    const draft = await readDraft(draftId);
    if (!draft || draft.restaurantId !== restaurant.id) throw Object.assign(new Error("Entwurf nicht gefunden."), { statusCode: 404, code: "WEBSITE_SYNC_DRAFT_NOT_FOUND" });
    const { response, payload } = await productionRequest("/api/restaurants/website-sync/apply", restaurant.auth, {
      method: "POST",
      body: JSON.stringify(request.body || {})
    });
    reply.status(response.status);
    return payload;
  });

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = Number((error as { statusCode?: unknown }).statusCode) || 500;
    const code = String((error as { code?: unknown }).code || "PREVIEW_SYNC_FAILED");
    const message = error instanceof Error ? error.message : "Website-Synchronisierung fehlgeschlagen.";
    reply.status(statusCode).send({ error: code, message: statusCode >= 500 ? "Website-Synchronisierung fehlgeschlagen." : message });
  });

  await app.listen({ port, host });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
