import { randomUUID } from "node:crypto";

export type DigitalMenuCategory = "Vegan" | "Vegetarisch" | "Normal";

export type DigitalMenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: DigitalMenuCategory;
};

export type DigitalMenuSection = {
  id: string;
  name: string;
  items: DigitalMenuItem[];
};

export type DigitalMenuResult = {
  menu: {
    sections: DigitalMenuSection[];
  };
  duplicatesRemoved: number;
  warnings: string[];
  model: string;
};

export class DigitalMenuServiceError extends Error {
  code:
    | "OPENAI_NOT_CONFIGURED"
    | "OPENAI_UPLOAD_FAILED"
    | "OPENAI_ANALYSIS_FAILED"
    | "MENU_UNREADABLE";

  constructor(
    code:
      | "OPENAI_NOT_CONFIGURED"
      | "OPENAI_UPLOAD_FAILED"
      | "OPENAI_ANALYSIS_FAILED"
      | "MENU_UNREADABLE",
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

type AnalyzeInput = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

type RawMenuItem = Record<string, unknown>;
type RawMenuSection = {
  name: string;
  items: RawMenuItem[];
};

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
  /\/+$/,
  ""
);
const OPENAI_MODEL = process.env.OPENAI_MENU_MODEL || "gpt-4.1-mini";

const SYSTEM_PROMPT = [
  "You are a precise parser for restaurant menus.",
  "Read the uploaded file and extract ONLY menu dishes (no opening hours, no contact data, no legal text).",
  "Return valid JSON only. No markdown, no explanations.",
  "Schema:",
  '{"sections":[{"name":"string","items":[{"name":"string","description":"string","price":"string","category":"Vegan|Vegetarisch|Normal"}]}]}',
  "If a field is missing in the source, keep it empty but do not invent prices.",
  "Deduplicate obvious duplicates in the response."
].join(" ");
const USER_PROMPT =
  "Extract the menu from this input and return strictly valid JSON with sections/items, prices and category.";

const isImageMime = (mimeType: string): boolean => mimeType.toLowerCase().startsWith("image/");

const normalizeImageMime = (mimeType: string): string => {
  const lowered = mimeType.toLowerCase();
  if (lowered === "image/jpg") return "image/jpeg";
  return lowered || "image/jpeg";
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const asArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

const asString = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const parseJsonFromText = (value: string): unknown => {
  const cleaned = value.trim();
  if (!cleaned) {
    throw new Error("EMPTY_RESPONSE");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const fenced = cleaned
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "");
    try {
      return JSON.parse(fenced);
    } catch {
      const start = fenced.indexOf("{");
      const end = fenced.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return JSON.parse(fenced.slice(start, end + 1));
      }
      throw new Error("INVALID_JSON");
    }
  }
};

const extractOutputText = (payload: Record<string, unknown>): string => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = asArray(payload.output);
  const parts: string[] = [];

  for (const node of output) {
    const nodeRecord = asRecord(node);
    if (!nodeRecord) continue;
    const content = asArray(nodeRecord.content);
    for (const part of content) {
      const partRecord = asRecord(part);
      if (!partRecord) continue;
      const textField = partRecord.text;
      if (typeof textField === "string") {
        parts.push(textField);
        continue;
      }

      const textObj = asRecord(textField);
      if (textObj && typeof textObj.value === "string") {
        parts.push(textObj.value);
      }
    }
  }

  return parts.join("\n").trim();
};

const getErrorMessage = (payload: Record<string, unknown>): string => {
  const error = asRecord(payload.error);
  if (!error) return "";
  const message = asString(error.message);
  return message || "";
};

const normalizePrice = (raw: unknown): number | null => {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw * 100) / 100;
  }

  const text = asString(raw);
  if (!text) return null;

  let cleaned = text
    .replace(/[€$]/g, "")
    .replace(/\s+/g, "")
    .replace(/,-/g, "")
    .replace(/,--/g, "");

  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/,/g, ".");
  }

  const match = cleaned.match(/-?\d+(?:\.\d{1,2})?/);
  if (!match) return null;

  const value = Number(match[0]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
};

const detectCategory = (raw: unknown, name: string, description: string): DigitalMenuCategory => {
  const normalized = [
    asString(raw),
    name,
    description
  ]
    .join(" ")
    .toLowerCase();

  if (
    normalized.includes("vegan") ||
    normalized.includes("plant-based") ||
    normalized.includes("pflanzlich")
  ) {
    return "Vegan";
  }

  if (
    normalized.includes("vegetar") ||
    normalized.includes("ovo-lacto") ||
    normalized.includes("meatless")
  ) {
    return "Vegetarisch";
  }

  return "Normal";
};

const isLikelyItemRecord = (item: RawMenuItem): boolean => {
  return Boolean(
    asString(item.name) ||
      asString(item.title) ||
      asString(item.dish) ||
      asString(item.gericht) ||
      asString(item.price) ||
      asString(item.amount)
  );
};

const extractSections = (raw: unknown): RawMenuSection[] => {
  const root = asRecord(raw);
  if (!root) return [];

  const sectionCandidates =
    asArray(root.sections).length > 0
      ? asArray(root.sections)
      : asArray(root.categories).length > 0
      ? asArray(root.categories)
      : asArray(root.groups).length > 0
      ? asArray(root.groups)
      : [];

  if (sectionCandidates.length > 0) {
    const sections: RawMenuSection[] = [];
    const fallbackItems: RawMenuItem[] = [];

    sectionCandidates.forEach((value, index) => {
      const record = asRecord(value);
      if (!record) return;

      const sectionName =
        asString(record.name) ||
        asString(record.title) ||
        asString(record.label) ||
        asString(record.category) ||
        `Menue ${index + 1}`;

      const sectionItems =
        asArray(record.items).length > 0
          ? asArray(record.items)
          : asArray(record.entries).length > 0
          ? asArray(record.entries)
          : asArray(record.dishes).length > 0
          ? asArray(record.dishes)
          : [];

      if (!sectionItems.length && isLikelyItemRecord(record)) {
        fallbackItems.push(record);
        return;
      }

      const mappedItems = sectionItems
        .map((item) => asRecord(item))
        .filter((item): item is RawMenuItem => Boolean(item));

      if (!mappedItems.length) return;
      sections.push({ name: sectionName, items: mappedItems });
    });

    if (fallbackItems.length) {
      sections.push({ name: "Menue", items: fallbackItems });
    }
    return sections;
  }

  const itemCandidates =
    asArray(root.items).length > 0
      ? asArray(root.items)
      : asArray(root.entries).length > 0
      ? asArray(root.entries)
      : asArray(root.dishes).length > 0
      ? asArray(root.dishes)
      : asArray(raw);

  if (!itemCandidates.length) return [];

  const items = itemCandidates
    .map((item) => asRecord(item))
    .filter((item): item is RawMenuItem => Boolean(item));
  if (!items.length) return [];

  return [{ name: "Menue", items }];
};

const normalizeMenu = (raw: unknown): { sections: DigitalMenuSection[]; duplicatesRemoved: number; warnings: string[] } => {
  const sectionsRaw = extractSections(raw);
  if (!sectionsRaw.length) {
    throw new DigitalMenuServiceError(
      "MENU_UNREADABLE",
      "Datei konnte nicht als Menue gelesen werden"
    );
  }

  let duplicatesRemoved = 0;
  let droppedInvalid = 0;
  const seen = new Set<string>();
  const sections: DigitalMenuSection[] = [];

  sectionsRaw.forEach((section, index) => {
    const sectionName = section.name.trim() || `Menue ${index + 1}`;
    const items: DigitalMenuItem[] = [];

    section.items.forEach((rawItem) => {
      const name =
        asString(rawItem.name) ||
        asString(rawItem.title) ||
        asString(rawItem.dish) ||
        asString(rawItem.gericht);
      const description = asString(rawItem.description) || asString(rawItem.details);
      const price = normalizePrice(rawItem.price ?? rawItem.amount ?? rawItem.cost);
      const category = detectCategory(rawItem.category ?? rawItem.tags, name, description);

      if (!name || price === null) {
        droppedInvalid += 1;
        return;
      }

      const dedupeKey = `${name.toLowerCase()}|${price.toFixed(2)}|${category}`;
      if (seen.has(dedupeKey)) {
        duplicatesRemoved += 1;
        return;
      }
      seen.add(dedupeKey);

      items.push({
        id: randomUUID(),
        name,
        description: description || undefined,
        price,
        category
      });
    });

    if (items.length) {
      sections.push({
        id: randomUUID(),
        name: sectionName,
        items
      });
    }
  });

  if (!sections.length) {
    throw new DigitalMenuServiceError(
      "MENU_UNREADABLE",
      "Datei ist nicht lesbar oder enthaelt keine verwertbaren Gerichte"
    );
  }

  const warnings: string[] = [];
  if (duplicatesRemoved > 0) {
    warnings.push(`${duplicatesRemoved} doppelte Eintraege entfernt.`);
  }
  if (droppedInvalid > 0) {
    warnings.push(`${droppedInvalid} Eintraege ohne gueltigen Namen/Preis verworfen.`);
  }

  return { sections, duplicatesRemoved, warnings };
};

export class DigitalMenuService {
  private readonly apiKey: string | null;
  private readonly model: string;
  private readonly fallbackModel: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || null;
    this.model = OPENAI_MODEL;
    this.fallbackModel = process.env.OPENAI_MENU_FALLBACK_MODEL || "gpt-4.1";
  }

  async analyzeMenuFile(input: AnalyzeInput): Promise<DigitalMenuResult> {
    if (!this.apiKey) {
      throw new DigitalMenuServiceError(
        "OPENAI_NOT_CONFIGURED",
        "OPENAI_API_KEY fehlt im Backend-Environment"
      );
    }

    if (!input.buffer || input.buffer.length === 0) {
      throw new DigitalMenuServiceError("MENU_UNREADABLE", "Leere Datei hochgeladen");
    }

    let fileId = "";
    let outputText = "";
    let modelUsed = this.model;
    try {
      if (isImageMime(input.mimeType)) {
        const imageUrl = `data:${normalizeImageMime(input.mimeType)};base64,${input.buffer.toString("base64")}`;
        const analysis = await this.analyzeWithUserContent([
          {
            type: "input_text",
            text: USER_PROMPT
          },
          {
            type: "input_image",
            image_url: imageUrl
          }
        ]);
        outputText = analysis.text;
        modelUsed = analysis.model;
      } else {
        fileId = await this.uploadFile(input);
        const analysis = await this.analyzeWithUserContent([
          {
            type: "input_text",
            text: USER_PROMPT
          },
          {
            type: "input_file",
            file_id: fileId
          }
        ]);
        outputText = analysis.text;
        modelUsed = analysis.model;
      }

      let parsed: unknown;
      try {
        parsed = parseJsonFromText(outputText);
      } catch {
        throw new DigitalMenuServiceError(
          "MENU_UNREADABLE",
          "OpenAI-Antwort enthaelt kein gueltiges JSON-Menue"
        );
      }

      const normalized = normalizeMenu(parsed);

      return {
        menu: {
          sections: normalized.sections
        },
        duplicatesRemoved: normalized.duplicatesRemoved,
        warnings: normalized.warnings,
        model: modelUsed
      };
    } finally {
      if (fileId) {
        await this.deleteFile(fileId).catch(() => undefined);
      }
    }
  }

  private async uploadFile(input: AnalyzeInput): Promise<string> {
    if (!this.apiKey) {
      throw new DigitalMenuServiceError(
        "OPENAI_NOT_CONFIGURED",
        "OPENAI_API_KEY fehlt im Backend-Environment"
      );
    }

    const purposes = Array.from(
      new Set(
        [process.env.OPENAI_FILE_PURPOSE, "user_data", "assistants"].filter(
          (value): value is string => Boolean(value && value.trim())
        )
      )
    );

    let lastMessage = "OpenAI file upload fehlgeschlagen";

    for (const purpose of purposes) {
      const formData = new FormData();
      const blob = new Blob([input.buffer], {
        type: input.mimeType || "application/octet-stream"
      });
      formData.append("purpose", purpose);
      formData.append("file", blob, input.filename || `menu-${Date.now()}`);

      const response = await fetch(`${OPENAI_BASE_URL}/files`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        },
        body: formData
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        lastMessage = getErrorMessage(payload) || "OpenAI file upload fehlgeschlagen";
        continue;
      }

      const id = asString(payload.id);
      if (!id) {
        lastMessage = "OpenAI hat keine gueltige file id zurueckgegeben";
        continue;
      }

      return id;
    }

    throw new DigitalMenuServiceError("OPENAI_UPLOAD_FAILED", lastMessage);
  }

  private async analyzeWithUserContent(
    userContent: Array<Record<string, unknown>>
  ): Promise<{ text: string; model: string }> {
    if (!this.apiKey) {
      throw new DigitalMenuServiceError(
        "OPENAI_NOT_CONFIGURED",
        "OPENAI_API_KEY fehlt im Backend-Environment"
      );
    }

    const models = Array.from(new Set([this.model, this.fallbackModel].filter(Boolean)));
    let lastMessage = "OpenAI Analyse fehlgeschlagen";

    for (const model of models) {
      const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: SYSTEM_PROMPT
                }
              ]
            },
            {
              role: "user",
              content: userContent
            }
          ]
        })
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        lastMessage = getErrorMessage(payload) || "OpenAI Analyse fehlgeschlagen";
        continue;
      }

      const text = extractOutputText(payload);
      if (!text) {
        lastMessage = "Datei konnte nicht zu einem Menue extrahiert werden";
        continue;
      }

      return {
        text,
        model
      };
    }

    throw new DigitalMenuServiceError("OPENAI_ANALYSIS_FAILED", lastMessage);
  }

  private async deleteFile(fileId: string): Promise<void> {
    if (!this.apiKey) return;

    await fetch(`${OPENAI_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });
  }
}
