import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Session } from "../types";

const DEFAULT_SESSION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionRepo {
  create(session: Session): Session;
  findByToken(token: string): Session | undefined;
  touch(token: string): Session | undefined;
  delete(token: string): void;
  deleteByRestaurantId(restaurantId: string): void;
}

type SessionStorageShape = {
  sessions?: unknown;
};

export class InMemorySessionRepo implements SessionRepo {
  private items = new Map<string, Session>();
  private storagePath: string;

  constructor(storagePath = path.resolve(process.cwd(), "uploads", "auth-sessions.json")) {
    this.storagePath = storagePath;
    this.loadFromDisk();
    this.cleanupExpired();
  }

  create(session: Session): Session {
    this.cleanupExpired();
    this.items.set(session.token, session);
    this.persist();
    return session;
  }

  findByToken(token: string): Session | undefined {
    this.cleanupExpired();
    return this.items.get(token);
  }

  touch(token: string): Session | undefined {
    this.cleanupExpired();
    const current = this.items.get(token);
    if (!current) return undefined;
    const next: Session = { ...current, lastSeenAt: new Date().toISOString() };
    this.items.set(token, next);
    this.persist();
    return next;
  }

  delete(token: string): void {
    if (!token) return;
    if (!this.items.delete(token)) return;
    this.persist();
  }

  deleteByRestaurantId(restaurantId: string): void {
    if (!restaurantId) return;
    let changed = false;
    for (const [token, session] of this.items.entries()) {
      if (session.restaurantId !== restaurantId) continue;
      this.items.delete(token);
      changed = true;
    }
    if (changed) {
      this.persist();
    }
  }

  private loadFromDisk(): void {
    if (!existsSync(this.storagePath)) return;

    try {
      const raw = readFileSync(this.storagePath, "utf-8");
      const parsed = JSON.parse(raw) as SessionStorageShape;
      const list = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
      for (const value of list) {
        const session = this.normalizeStoredSession(value);
        if (!session) continue;
        this.items.set(session.token, session);
      }
    } catch {
      this.items = new Map();
    }
  }

  private persist(): void {
    mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const sessions = Array.from(this.items.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    writeFileSync(this.storagePath, JSON.stringify({ sessions }, null, 2), "utf-8");
  }

  private cleanupExpired(): void {
    const nowMs = Date.now();
    let changed = false;
    for (const [token, session] of this.items.entries()) {
      if (!this.isExpired(session, nowMs)) continue;
      this.items.delete(token);
      changed = true;
    }
    if (changed) {
      this.persist();
    }
  }

  private normalizeStoredSession(value: unknown): Session | null {
    if (!value || typeof value !== "object") return null;
    const raw = value as Partial<Session>;
    const token = String(raw.token || "").trim();
    const restaurantId = String(raw.restaurantId || "").trim();
    const nowIso = new Date().toISOString();
    const createdAt = String(raw.createdAt || "").trim() || nowIso;
    const lastSeenAt = String(raw.lastSeenAt || "").trim() || createdAt;
    let expiresAt = String(raw.expiresAt || "").trim();
    const rememberMe = Boolean(raw.rememberMe);

    if (!token || !restaurantId) return null;

    if (!expiresAt) {
      const createdAtMs = Date.parse(createdAt);
      const baseMs = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
      expiresAt = new Date(baseMs + DEFAULT_SESSION_DAYS * DAY_MS).toISOString();
    }

    const session: Session = {
      token,
      restaurantId,
      createdAt,
      lastSeenAt,
      expiresAt,
      rememberMe
    };

    if (this.isExpired(session)) return null;
    return session;
  }

  private isExpired(session: Session, nowMs = Date.now()): boolean {
    const expiresMs = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresMs)) return true;
    return expiresMs <= nowMs;
  }
}
