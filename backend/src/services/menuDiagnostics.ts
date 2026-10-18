import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";

const MENU_LOG_DIR = path.resolve(process.cwd(), "logs");
const MENU_LOG_RETENTION_DAYS = 30;
const MAX_LOG_TEXT_LENGTH = 240;

export type MenuDiagnosticEntry = {
  diagnosticId: string;
  event: string;
  restaurantId?: string;
  route?: string;
  platform?: string;
  appVersion?: string;
  mode?: string;
  fileCount?: number;
  fileIndex?: number;
  fileName?: string;
  declaredMimeType?: string;
  detectedMimeType?: string;
  bytes?: number;
  model?: string;
  durationMs?: number;
  statusCode?: number;
  errorCode?: string;
  message?: string;
  warnings?: string[];
};

let lastCleanupDate = "";

const formatDateKey = (date = new Date()): string => date.toISOString().slice(0, 10);

const sanitizeText = (value: unknown, maxLength = MAX_LOG_TEXT_LENGTH): string | undefined => {
  const text = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, maxLength) : undefined;
};

export const sanitizeMenuFileName = (value: unknown): string | undefined => {
  const baseName = path.basename(String(value || "").replace(/\\/g, "/"));
  return sanitizeText(baseName, 160);
};

export const createMenuDiagnosticId = (): string =>
  `MENU-${randomBytes(4).toString("hex").toUpperCase()}`;

const cleanupOldLogs = async (todayKey: string): Promise<void> => {
  if (lastCleanupDate === todayKey) return;
  lastCleanupDate = todayKey;

  const cutoff = Date.now() - MENU_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const names = await readdir(MENU_LOG_DIR).catch(() => [] as string[]);
  await Promise.all(
    names
      .filter((name) => /^menu-analysis-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
      .map(async (name) => {
        const dateText = name.slice("menu-analysis-".length, "menu-analysis-YYYY-MM-DD".length);
        const timestamp = Date.parse(`${dateText}T00:00:00.000Z`);
        if (Number.isFinite(timestamp) && timestamp < cutoff) {
          await unlink(path.join(MENU_LOG_DIR, name)).catch(() => undefined);
        }
      })
  );
};

export const writeMenuDiagnostic = async (entry: MenuDiagnosticEntry): Promise<void> => {
  const now = new Date();
  const dateKey = formatDateKey(now);
  try {
    await mkdir(MENU_LOG_DIR, { recursive: true, mode: 0o700 });
    await cleanupOldLogs(dateKey);

    const normalized: Record<string, unknown> = {
      timestamp: now.toISOString(),
      diagnosticId: sanitizeText(entry.diagnosticId, 32),
      event: sanitizeText(entry.event, 80)
    };
    const textFields: Array<keyof MenuDiagnosticEntry> = [
      "restaurantId",
      "route",
      "platform",
      "appVersion",
      "mode",
      "declaredMimeType",
      "detectedMimeType",
      "model",
      "errorCode",
      "message"
    ];
    textFields.forEach((key) => {
      const value = sanitizeText(entry[key]);
      if (value) normalized[key] = value;
    });
    if (entry.fileName) normalized.fileName = sanitizeMenuFileName(entry.fileName);

    const numberFields: Array<keyof MenuDiagnosticEntry> = [
      "fileCount",
      "fileIndex",
      "bytes",
      "durationMs",
      "statusCode"
    ];
    numberFields.forEach((key) => {
      const value = Number(entry[key]);
      if (Number.isFinite(value)) normalized[key] = value;
    });
    if (Array.isArray(entry.warnings) && entry.warnings.length) {
      normalized.warnings = entry.warnings
        .map((warning) => sanitizeText(warning, 180))
        .filter(Boolean)
        .slice(0, 20);
    }

    const filePath = path.join(MENU_LOG_DIR, `menu-analysis-${dateKey}.jsonl`);
    await appendFile(filePath, `${JSON.stringify(normalized)}\n`, {
      encoding: "utf-8",
      mode: 0o600
    });
  } catch {
    // Diagnostics must never break a customer upload.
  }
};

