import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";

const RESET_CODE_TTL_MS = 30 * 60 * 1000;
const MAX_RESET_ATTEMPTS = 5;

type PasswordResetEntry = {
  id: string;
  restaurantId: string;
  email: string;
  salt: string;
  codeHash: string;
  attempts: number;
  createdAt: string;
  expiresAt: string;
};

type PasswordResetStorageShape = {
  codes?: unknown;
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const hashCode = (code: string, salt: string): string =>
  createHash("sha256").update(`${salt}:${code.trim()}`).digest("hex");

const safeEqualHex = (left: string, right: string): boolean => {
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
};

export class PasswordResetStore {
  private items = new Map<string, PasswordResetEntry>();
  private storagePath: string;

  constructor(storagePath = path.resolve(process.cwd(), "uploads", "password-reset-codes.json")) {
    this.storagePath = storagePath;
    this.loadFromDisk();
    this.cleanupExpired();
  }

  create(input: { restaurantId: string; email: string; code: string }): PasswordResetEntry {
    this.cleanupExpired();
    const email = normalizeEmail(input.email);
    const nowMs = Date.now();
    const salt = randomBytes(16).toString("hex");
    const entry: PasswordResetEntry = {
      id: randomUUID(),
      restaurantId: input.restaurantId,
      email,
      salt,
      codeHash: hashCode(input.code, salt),
      attempts: 0,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + RESET_CODE_TTL_MS).toISOString()
    };

    for (const [id, current] of this.items.entries()) {
      if (current.restaurantId === input.restaurantId || current.email === email) {
        this.items.delete(id);
      }
    }

    this.items.set(entry.id, entry);
    this.persist();
    return entry;
  }

  verify(emailInput: string, codeInput: string): PasswordResetEntry | null {
    this.cleanupExpired();
    const email = normalizeEmail(emailInput);
    const code = codeInput.trim();
    const entry = Array.from(this.items.values())
      .filter((item) => item.email === email)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    if (!entry) return null;
    if (entry.attempts >= MAX_RESET_ATTEMPTS) {
      this.items.delete(entry.id);
      this.persist();
      return null;
    }

    const expectedHash = hashCode(code, entry.salt);
    if (!safeEqualHex(entry.codeHash, expectedHash)) {
      const next: PasswordResetEntry = {
        ...entry,
        attempts: entry.attempts + 1
      };
      this.items.set(entry.id, next);
      this.persist();
      return null;
    }

    return entry;
  }

  deleteByRestaurantId(restaurantId: string): void {
    let changed = false;
    for (const [id, entry] of this.items.entries()) {
      if (entry.restaurantId !== restaurantId) continue;
      this.items.delete(id);
      changed = true;
    }
    if (changed) this.persist();
  }

  private loadFromDisk(): void {
    if (!existsSync(this.storagePath)) return;

    try {
      const raw = readFileSync(this.storagePath, "utf-8");
      const parsed = JSON.parse(raw) as PasswordResetStorageShape;
      const list = Array.isArray(parsed?.codes) ? parsed.codes : [];
      for (const value of list) {
        const entry = this.normalizeStoredEntry(value);
        if (!entry) continue;
        this.items.set(entry.id, entry);
      }
    } catch {
      this.items = new Map();
    }
  }

  private persist(): void {
    mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const codes = Array.from(this.items.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    writeFileSync(this.storagePath, JSON.stringify({ codes }, null, 2), "utf-8");
  }

  private cleanupExpired(): void {
    const nowMs = Date.now();
    let changed = false;
    for (const [id, entry] of this.items.entries()) {
      const expiresAtMs = Date.parse(entry.expiresAt);
      if (Number.isFinite(expiresAtMs) && expiresAtMs > nowMs) continue;
      this.items.delete(id);
      changed = true;
    }
    if (changed) this.persist();
  }

  private normalizeStoredEntry(value: unknown): PasswordResetEntry | null {
    if (!value || typeof value !== "object") return null;
    const raw = value as Partial<PasswordResetEntry>;
    const id = String(raw.id || "").trim();
    const restaurantId = String(raw.restaurantId || "").trim();
    const email = normalizeEmail(String(raw.email || ""));
    const salt = String(raw.salt || "").trim();
    const codeHash = String(raw.codeHash || "").trim();
    const createdAt = String(raw.createdAt || "").trim();
    const expiresAt = String(raw.expiresAt || "").trim();
    const attempts = Number(raw.attempts || 0);

    if (!id || !restaurantId || !email || !salt || !codeHash || !createdAt || !expiresAt) {
      return null;
    }

    const entry: PasswordResetEntry = {
      id,
      restaurantId,
      email,
      salt,
      codeHash,
      attempts: Number.isFinite(attempts) ? Math.max(0, attempts) : 0,
      createdAt,
      expiresAt
    };

    if (Date.parse(entry.expiresAt) <= Date.now()) return null;
    return entry;
  }
}
