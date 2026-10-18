import { randomUUID } from "node:crypto";

export type DigitalMenuCategory = "Vegan" | "Vegetarisch" | "Normal" | "Getränke";

export type DigitalMenuItem = {
  id: string;
  name: string;
  description?: string;
  // Website cards sometimes list dishes but deliberately omit prices. Keep those
  // entries visible for review instead of silently deleting them.
  price: number | null;
  category: DigitalMenuCategory;
  section?: string;
  allergens?: string[];
};

export type DigitalMenuSection = {
  id: string;
  name: string;
  items: DigitalMenuItem[];
};

export type DigitalMenuResult = {
  menu: {
    sections: DigitalMenuSection[];
    allergens: string[];
  };
  duplicatesRemoved: number;
  warnings: string[];
  model: string;
  lunchValidity: LunchValiditySuggestion;
};

export type LunchValiditySuggestion = {
  type: "none" | "dateRange" | "weekdays";
  validFrom: string | null;
  validUntil: string | null;
  weekdays: Array<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun">;
};

export type WebsiteMenuArea = "breakfast" | "lunch" | "dinner" | "drinks";
export type WebsiteMenuClassification = WebsiteMenuArea | "unclassified";
export type WebsiteMenuSourceArea = {
  area: WebsiteMenuClassification;
  recognizedHeading: string;
  confidence: "high" | "medium" | "low";
  menu: {
    sections: DigitalMenuSection[];
    allergens: string[];
  };
  lunchValidity: LunchValiditySuggestion;
  warnings: string[];
};
export type WebsiteMenuSourceAnalysis = {
  areas: WebsiteMenuSourceArea[];
  warnings: string[];
  model: string;
};

export type WebsiteMenuGlobalInput = {
  id: string;
  name: string;
  description: string;
  price: number | null;
  section: string;
  recognizedHeading: string;
  suggestedArea: WebsiteMenuClassification;
  confidence: "high" | "medium" | "low";
};

export type WebsiteMenuGlobalAssignment = {
  itemId: string;
  area: WebsiteMenuClassification;
  confidence: "high" | "medium" | "low";
  duplicateOfItemId: string | null;
};

export type WebsiteMenuGlobalAnalysis = {
  assignments: WebsiteMenuGlobalAssignment[];
  warnings: string[];
  model: string;
};

type WebsiteAnalysisOptions = {
  useFallbackModel?: boolean;
};

export class DigitalMenuServiceError extends Error {
  code:
    | "OPENAI_NOT_CONFIGURED"
    | "OPENAI_UPLOAD_FAILED"
    | "OPENAI_ANALYSIS_FAILED"
    | "OPENAI_TIMEOUT"
    | "MENU_UNREADABLE";

  constructor(
    code:
      | "OPENAI_NOT_CONFIGURED"
      | "OPENAI_UPLOAD_FAILED"
      | "OPENAI_ANALYSIS_FAILED"
      | "OPENAI_TIMEOUT"
      | "MENU_UNREADABLE",
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

export type AnalyzeInput = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

type AnalyzeOptions = {
  kind?: "regular" | "lunch";
  referenceDate?: string;
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
// Website imports are intentionally more conservative than the fast manual import.
// A website source can contain several different menus and must be split correctly.
const OPENAI_WEBSITE_MENU_MODEL = "gpt-4.1";
const OPENAI_WEBSITE_MENU_FALLBACK_MODEL = process.env.OPENAI_WEBSITE_MENU_FALLBACK_MODEL || "gpt-5";

const BASE_SYSTEM_PROMPT = [
  "You are a precise parser for restaurant menus.",
  "Read the uploaded file and extract menu dishes. Ignore opening hours, contact data and legal text.",
  "Return valid JSON only. No markdown, no explanations.",
  "Schema:",
  '{"sections":[{"name":"string","items":[{"name":"string","description":"string","price":"string","category":"Vegan|Vegetarisch|Normal|Getränke","allergens":["string"]}]}],"allergens":["string"]}',
  "Keep section names as they appear in the source menu (for example Mittagessen, Abendessen, Salate, Dessert).",
  "Classify pure drinks and beverages as Getränke, including coffee, tea, water, beer, wine, soft drinks, juices, cocktails and hot drinks.",
  "Do not classify meal combos, breakfast, bowls or food bundles as Getränke just because a drink is included; keep their food category.",
  "If allergens are visible, include them in each item when possible and also in allergens as a global list. If none are clearly visible, return empty arrays.",
  "If a field is missing in the source, keep it empty but do not invent prices.",
  "Deduplicate obvious duplicates in the response."
].join(" ");
const buildSystemPrompt = (options: AnalyzeOptions): string => {
  const kind = options.kind === "lunch" ? "lunch" : "regular";
  const referenceDate = /^\d{4}-\d{2}-\d{2}$/.test(String(options.referenceDate || ""))
    ? String(options.referenceDate)
    : new Date().toISOString().slice(0, 10);
  if (kind !== "lunch") {
    return `${BASE_SYSTEM_PROMPT} This is a regular menu.`;
  }
  return [
    BASE_SYSTEM_PROMPT,
    'For lunch menus the response additionally contains: "lunchValidity":{"type":"none|dateRange|weekdays","validFrom":"YYYY-MM-DD or empty","validUntil":"YYYY-MM-DD or empty","weekdays":["mon|tue|wed|thu|fri|sat|sun"]}.',
    `This is a lunch menu. The reference date is ${referenceDate}.`,
    "Also extract the common validity printed for the lunch menu, but never invent it.",
    "For an explicit calendar range, return type dateRange and ISO dates in validFrom/validUntil.",
    "If day and month are printed without a year, resolve them to the nearest plausible current or upcoming range using the reference date.",
    "For weekday text without concrete calendar dates, return type weekdays and the matching weekday keys.",
    "If no common validity is clearly printed, return type none, empty dates and an empty weekdays array."
  ].join(" ");
};
const buildUserPrompt = (options: AnalyzeOptions): string =>
  options.kind === "lunch"
    ? "Extract the lunch menu from these ordered pages and return strictly valid JSON with sections/items, prices, category and lunchValidity."
    : "Extract the menu from these ordered pages and return strictly valid JSON with sections/items, prices and category.";
const WEBSITE_MENU_SYSTEM_PROMPT = [
  "You are a precise parser for one public restaurant website menu source.",
  "Read only the uploaded source. Do not use its filename, URL or external knowledge to decide the meal time.",
  "Split the source by headings and the actual dishes into breakfast, lunch, dinner, drinks or unclassified.",
  "A single PDF or image may contain multiple areas and must then return multiple areas.",
  "Use breakfast for Frühstück/Brunch, lunch for Mittagstisch/Lunch/Tageskarte, dinner for Abendessen/Hauptkarte/Speisekarte, and drinks for Getränke/coffee/wine/beer.",
  "For every classified area, return the exact visible heading that proves the classification and use high or medium confidence only when that heading or clear dish context is visible.",
  "If no area can be proven, return unclassified with low confidence. Never guess.",
  "Extract every visible dish, even when the website does not show a price. For a missing price, return an empty price string; never invent a price.",
  "Only extract dishes and prices that are visible in the source. Ignore opening hours, contact data, legal text, logos, vouchers and decorative photos.",
  "A single shop product, add-on, merchandise item, event text or marketing paragraph is not a menu. Return no areas when the source has no list or structured group of restaurant dishes or drinks.",
  "Classify pure beverages as Getränke. Food bundles containing a drink remain food.",
  "Return valid JSON only. No markdown and no explanations."
].join(" ");
const OPENAI_FILE_UPLOAD_TIMEOUT_MS = 2 * 60 * 1000;
const OPENAI_ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000;
const OPENAI_DELETE_TIMEOUT_MS = 30 * 1000;
const OPENAI_RETRY_DELAY_MS = 1200;
const MENU_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                price: { type: "string" },
                category: {
                  type: "string",
                  enum: ["Vegan", "Vegetarisch", "Normal", "Getränke"]
                },
                allergens: { type: "array", items: { type: "string" } }
              },
              required: ["name", "description", "price", "category", "allergens"]
            }
          }
        },
        required: ["name", "items"]
      }
    },
    allergens: { type: "array", items: { type: "string" } },
    lunchValidity: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["none", "dateRange", "weekdays"] },
        validFrom: { type: "string" },
        validUntil: { type: "string" },
        weekdays: {
          type: "array",
          items: { type: "string", enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }
        }
      },
      required: ["type", "validFrom", "validUntil", "weekdays"]
    }
  },
  required: ["sections", "allergens", "lunchValidity"]
} as const;

const REGULAR_MENU_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sections: MENU_RESPONSE_SCHEMA.properties.sections,
    allergens: MENU_RESPONSE_SCHEMA.properties.allergens
  },
  required: ["sections", "allergens"]
} as const;

const WEBSITE_MENU_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    areas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          area: { type: "string", enum: ["breakfast", "lunch", "dinner", "drinks", "unclassified"] },
          recognizedHeading: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          sections: MENU_RESPONSE_SCHEMA.properties.sections,
          allergens: MENU_RESPONSE_SCHEMA.properties.allergens,
          lunchValidity: MENU_RESPONSE_SCHEMA.properties.lunchValidity
        },
        required: ["area", "recognizedHeading", "confidence", "sections", "allergens", "lunchValidity"]
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  },
  required: ["areas", "warnings"]
} as const;

const WEBSITE_MENU_GLOBAL_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          itemId: { type: "string" },
          area: { type: "string", enum: ["breakfast", "lunch", "dinner", "drinks", "unclassified"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          duplicateOfItemId: { type: ["string", "null"] }
        },
        required: ["itemId", "area", "confidence", "duplicateOfItemId"]
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  },
  required: ["assignments", "warnings"]
} as const;

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new DigitalMenuServiceError(
        "OPENAI_TIMEOUT",
        `OpenAI request exceeded ${Math.round(timeoutMs / 1000)} seconds`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const isTransientStatus = (status: number): boolean => status === 429 || status >= 500;

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

const toDetectionText = (...values: unknown[]): string =>
  values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => asString(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss");

const drinkDetectionPatterns = [
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

const foodDetectionPatterns = [
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

const isDrinkMenuText = (...values: unknown[]): boolean => {
  const normalized = toDetectionText(...values);
  return Boolean(normalized && drinkDetectionPatterns.some((pattern) => pattern.test(normalized)));
};

const isFoodMenuText = (...values: unknown[]): boolean => {
  const normalized = toDetectionText(...values);
  return Boolean(normalized && foodDetectionPatterns.some((pattern) => pattern.test(normalized)));
};

const detectCategory = (
  raw: unknown,
  name: string,
  description: string,
  sectionName = ""
): DigitalMenuCategory => {
  const normalized = toDetectionText(raw, sectionName, name, description);
  const foodIdentity =
    isFoodMenuText(name) || (isFoodMenuText(sectionName) && !isDrinkMenuText(name));

  if (foodIdentity) {
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
  }

  if (isDrinkMenuText(raw, sectionName, name)) {
    return "Getränke";
  }

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
  const source = asRecord(root.menu) || root;

  const sectionCandidates =
    asArray(source.sections).length > 0
      ? asArray(source.sections)
      : asArray(source.categories).length > 0
      ? asArray(source.categories)
      : asArray(source.groups).length > 0
      ? asArray(source.groups)
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
    asArray(source.items).length > 0
      ? asArray(source.items)
      : asArray(source.entries).length > 0
      ? asArray(source.entries)
      : asArray(source.dishes).length > 0
      ? asArray(source.dishes)
      : asArray(raw);

  if (!itemCandidates.length) return [];

  const items = itemCandidates
    .map((item) => asRecord(item))
    .filter((item): item is RawMenuItem => Boolean(item));
  if (!items.length) return [];

  return [{ name: "Menue", items }];
};

const normalizeItemAllergens = (raw: unknown): string[] => {
  if (raw == null) return [];

  const collected: string[] = [];
  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      const text = asString(entry);
      if (text) collected.push(text);
    });
  } else if (typeof raw === "string") {
    raw
      .split(/\r?\n|;|,/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => collected.push(entry));
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  collected.forEach((entry) => {
    const clean = entry
      .replace(/^[\-•\d\)\.\s]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(clean);
  });
  return normalized.slice(0, 20);
};

const normalizeMenu = (
  raw: unknown,
  options: { allowMissingPrice?: boolean } = {}
): { sections: DigitalMenuSection[]; duplicatesRemoved: number; warnings: string[] } => {
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
      const category = detectCategory(rawItem.category ?? rawItem.tags, name, description, sectionName);
      const allergens = normalizeItemAllergens(
        rawItem.allergens ??
          rawItem.allergene ??
          rawItem.allergen ??
          rawItem.allergy ??
          rawItem.allergyList ??
          rawItem.allergenList
      );

      if (!name || (price === null && !options.allowMissingPrice)) {
        droppedInvalid += 1;
        return;
      }

      const dedupeKey = `${name.toLowerCase()}|${price === null ? "missing" : price.toFixed(2)}|${category}|${sectionName.toLowerCase()}`;
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
        category,
        section: sectionName,
        allergens: allergens.length ? allergens : undefined
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

const normalizeAllergens = (raw: unknown): string[] => {
  const root = asRecord(raw);
  if (!root) return [];
  const menuRecord = asRecord(root.menu);

  const candidates: unknown[] = [];
  const listKeys = [
    "allergens",
    "allergene",
    "allergyList",
    "allergenList",
    "allergen_info",
    "allergy_info"
  ];
  listKeys.forEach((key) => {
    if (root[key] !== undefined) {
      candidates.push(root[key]);
    }
    if (menuRecord && menuRecord[key] !== undefined) {
      candidates.push(menuRecord[key]);
    }
  });

  const flattened: string[] = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      candidate.forEach((entry) => {
        const text = asString(entry);
        if (text) flattened.push(text);
      });
      continue;
    }
    if (typeof candidate === "string") {
      candidate
        .split(/\r?\n|;|,/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .forEach((entry) => flattened.push(entry));
      continue;
    }
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of flattened) {
    const clean = entry
      .replace(/^[\-•\d\)\.\s]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(clean);
  }

  return normalized.slice(0, 60);
};

const emptyLunchValidity = (): LunchValiditySuggestion => ({
  type: "none",
  validFrom: null,
  validUntil: null,
  weekdays: []
});

const normalizeLunchValidity = (
  raw: unknown,
  kind: "regular" | "lunch"
): LunchValiditySuggestion => {
  if (kind !== "lunch") return emptyLunchValidity();
  const root = asRecord(raw);
  const value = asRecord(root?.lunchValidity);
  if (!value) return emptyLunchValidity();

  const validDate = (input: unknown): string | null => {
    const text = asString(input);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  };
  const weekdayOrder: LunchValiditySuggestion["weekdays"] = [
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun"
  ];
  const weekdays = weekdayOrder.filter(
    (weekday) => Array.isArray(value.weekdays) && value.weekdays.includes(weekday)
  );
  const validFrom = validDate(value.validFrom);
  const validUntil = validDate(value.validUntil);
  const type = asString(value.type);

  if (type === "dateRange" && validFrom && (!validUntil || validUntil >= validFrom)) {
    return { type: "dateRange", validFrom, validUntil, weekdays: [] };
  }
  if (type === "weekdays" && weekdays.length) {
    return { type: "weekdays", validFrom: null, validUntil: null, weekdays };
  }
  return emptyLunchValidity();
};

const websiteAreas: WebsiteMenuClassification[] = ["breakfast", "lunch", "dinner", "drinks", "unclassified"];

const normalizeWebsiteMenuAnalysis = (raw: unknown): Omit<WebsiteMenuSourceAnalysis, "model"> => {
  const root = asRecord(raw);
  const sourceAreas = asArray(root?.areas);
  const warnings = asArray(root?.warnings).map(asString).filter(Boolean).slice(0, 30);
  const areas: WebsiteMenuSourceArea[] = [];

  sourceAreas.forEach((rawArea) => {
    const record = asRecord(rawArea);
    if (!record) return;
    const rawAreaName = asString(record.area) as WebsiteMenuClassification;
    if (!websiteAreas.includes(rawAreaName)) return;
    const recognizedHeading = asString(record.recognizedHeading).slice(0, 180);
    const rawConfidence = asString(record.confidence);
    const confidence = rawConfidence === "high" || rawConfidence === "medium" || rawConfidence === "low" ? rawConfidence : "low";
    let normalized;
    try {
    normalized = normalizeMenu({ sections: asArray(record.sections) }, { allowMissingPrice: true });
    } catch {
      return;
    }
    if (!normalized.sections.length) return;

    // A classification without visible evidence is deliberately not imported automatically.
    const area = rawAreaName !== "unclassified" && recognizedHeading && confidence !== "low" ? rawAreaName : "unclassified";
    const menu = {
      sections: normalized.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({
          ...item,
          category: area === "drinks" ? "Getränke" : item.category
        }))
      })),
      allergens: normalizeAllergens({ allergens: record.allergens })
    };
    areas.push({
      area,
      recognizedHeading: recognizedHeading || "Keine eindeutige Überschrift erkannt",
      confidence: area === "unclassified" ? "low" : confidence,
      menu,
      lunchValidity: normalizeLunchValidity({ lunchValidity: record.lunchValidity }, area === "lunch" ? "lunch" : "regular"),
      warnings: normalized.warnings
    });
  });

  if (!areas.length) {
    throw new DigitalMenuServiceError("MENU_UNREADABLE", "Die Quelle enthält keine eindeutig lesbaren Gerichte");
  }
  return { areas, warnings };
};

const normalizeWebsiteGlobalAnalysis = (
  raw: unknown,
  validItemIds: Set<string>
): Omit<WebsiteMenuGlobalAnalysis, "model"> => {
  const root = asRecord(raw);
  const seen = new Set<string>();
  const assignments: WebsiteMenuGlobalAssignment[] = [];

  asArray(root?.assignments).forEach((rawAssignment) => {
    const record = asRecord(rawAssignment);
    if (!record) return;
    const itemId = asString(record.itemId);
    const area = asString(record.area) as WebsiteMenuClassification;
    const rawConfidence = asString(record.confidence);
    if (!validItemIds.has(itemId) || seen.has(itemId) || !websiteAreas.includes(area)) return;
    const duplicateCandidate = record.duplicateOfItemId === null ? null : asString(record.duplicateOfItemId);
    const duplicateOfItemId = duplicateCandidate && duplicateCandidate !== itemId && validItemIds.has(duplicateCandidate)
      ? duplicateCandidate
      : null;
    assignments.push({
      itemId,
      area,
      confidence: rawConfidence === "high" || rawConfidence === "medium" || rawConfidence === "low"
        ? rawConfidence
        : "low",
      duplicateOfItemId
    });
    seen.add(itemId);
  });

  if (!assignments.length) {
    throw new DigitalMenuServiceError("MENU_UNREADABLE", "Die gemeinsame Menüzuordnung war nicht lesbar");
  }
  const warnings = asArray(root?.warnings).map(asString).filter(Boolean).slice(0, 30);
  return { assignments, warnings };
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

  async analyzeMenuFile(input: AnalyzeInput, options: AnalyzeOptions = {}): Promise<DigitalMenuResult> {
    return this.analyzeMenuFiles([input], options);
  }

  async analyzeMenuFiles(inputs: AnalyzeInput[], options: AnalyzeOptions = {}): Promise<DigitalMenuResult> {
    if (!this.apiKey) {
      throw new DigitalMenuServiceError(
        "OPENAI_NOT_CONFIGURED",
        "OPENAI_API_KEY fehlt im Backend-Environment"
      );
    }

    const normalizedInputs = Array.isArray(inputs) ? inputs.filter(Boolean) : [];
    if (!normalizedInputs.length) {
      throw new DigitalMenuServiceError("MENU_UNREADABLE", "Keine Datei hochgeladen");
    }

    for (const input of normalizedInputs) {
      if (!input.buffer || input.buffer.length === 0) {
        throw new DigitalMenuServiceError("MENU_UNREADABLE", "Leere Datei hochgeladen");
      }
    }

    const uploadedFileIds: string[] = [];
    try {
      const userContent: Array<Record<string, unknown>> = [
        {
          type: "input_text",
          text: buildUserPrompt(options)
        }
      ];

      normalizedInputs.forEach((input, index) => {
        userContent.push({
          type: "input_text",
          text: `Seite ${index + 1}`
        });
        if (isImageMime(input.mimeType)) {
          const imageUrl = `data:${normalizeImageMime(input.mimeType)};base64,${input.buffer.toString(
            "base64"
          )}`;
          userContent.push({
            type: "input_image",
            image_url: imageUrl
          });
          return;
        }
        userContent.push({
          type: "input_file",
          file_id: ""
        });
      });

      for (let index = 0; index < normalizedInputs.length; index += 1) {
        const input = normalizedInputs[index];
        if (isImageMime(input.mimeType)) continue;
        const fileId = await this.uploadFile(input);
        uploadedFileIds.push(fileId);
        const textMarkerIndex = 1 + index * 2;
        const targetIndex = textMarkerIndex + 1;
        userContent[targetIndex] = {
          type: "input_file",
          file_id: fileId
        };
      }

      return await this.analyzeWithUserContent(userContent, options);
    } finally {
      if (uploadedFileIds.length) {
        await Promise.all(uploadedFileIds.map((fileId) => this.deleteFile(fileId).catch(() => undefined)));
      }
    }
  }

  /**
   * Website menus are sometimes real HTML tables instead of a PDF or image.
   * They use the same validated model response and normalization as file imports.
   */
  async analyzeMenuText(text: string, options: AnalyzeOptions = {}): Promise<DigitalMenuResult> {
    if (!this.apiKey) {
      throw new DigitalMenuServiceError(
        "OPENAI_NOT_CONFIGURED",
        "OPENAI_API_KEY fehlt im Backend-Environment"
      );
    }

    const normalizedText = String(text || "").replace(/\s+/g, " ").trim();
    if (normalizedText.length < 30) {
      throw new DigitalMenuServiceError("MENU_UNREADABLE", "Die Website enthält keinen lesbaren Menütext");
    }

    return this.analyzeWithUserContent(
      [
        {
          type: "input_text",
          text: `${buildUserPrompt(options)}\n\nWebsite-Menütext (nur diese Daten auswerten, nichts erfinden):\n${normalizedText.slice(0, 30000)}`
        }
      ],
      options
    );
  }

  /**
   * Website imports must let the model split one source into several meal areas.
   * This deliberately uses gpt-4.1 instead of the faster manual-import model.
   */
  async analyzeWebsiteMenuFiles(
    inputs: AnalyzeInput[],
    options: WebsiteAnalysisOptions = {}
  ): Promise<WebsiteMenuSourceAnalysis> {
    if (!this.apiKey) {
      throw new DigitalMenuServiceError("OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY fehlt im Backend-Environment");
    }
    const normalizedInputs = Array.isArray(inputs) ? inputs.filter(Boolean) : [];
    if (!normalizedInputs.length || normalizedInputs.some((input) => !input.buffer?.length)) {
      throw new DigitalMenuServiceError("MENU_UNREADABLE", "Keine lesbare Menüdatei gefunden");
    }

    const uploadedFileIds: string[] = [];
    try {
      const userContent: Array<Record<string, unknown>> = [
        { type: "input_text", text: "Analysiere diese einzelne Menüquelle vollständig und teile sie nach ihren sichtbaren Überschriften auf." }
      ];
      normalizedInputs.forEach((input, index) => {
        userContent.push({ type: "input_text", text: `Datei oder Seite ${index + 1}` });
        if (isImageMime(input.mimeType)) {
          userContent.push({
            type: "input_image",
            image_url: `data:${normalizeImageMime(input.mimeType)};base64,${input.buffer.toString("base64")}`
          });
        } else {
          userContent.push({ type: "input_file", file_id: "" });
        }
      });
      for (let index = 0; index < normalizedInputs.length; index += 1) {
        const input = normalizedInputs[index];
        if (isImageMime(input.mimeType)) continue;
        const fileId = await this.uploadFile(input);
        uploadedFileIds.push(fileId);
        userContent[2 + index * 2] = { type: "input_file", file_id: fileId };
      }
      return await this.analyzeWebsiteWithUserContent(
        userContent,
        options.useFallbackModel ? OPENAI_WEBSITE_MENU_FALLBACK_MODEL : OPENAI_WEBSITE_MENU_MODEL
      );
    } finally {
      await Promise.all(uploadedFileIds.map((fileId) => this.deleteFile(fileId).catch(() => undefined)));
    }
  }

  async analyzeWebsiteMenuText(
    text: string,
    options: WebsiteAnalysisOptions = {}
  ): Promise<WebsiteMenuSourceAnalysis> {
    if (!this.apiKey) {
      throw new DigitalMenuServiceError("OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY fehlt im Backend-Environment");
    }
    const normalizedText = String(text || "").replace(/\s+/g, " ").trim();
    if (normalizedText.length < 30) {
      throw new DigitalMenuServiceError("MENU_UNREADABLE", "Die Website enthält keinen lesbaren Menütext");
    }
    return this.analyzeWebsiteWithUserContent([
      {
        type: "input_text",
        text: `Analysiere diesen Website-Menütext vollständig. Nichts erfinden.\n\n${normalizedText.slice(0, 30000)}`
      }
    ], options.useFallbackModel ? OPENAI_WEBSITE_MENU_FALLBACK_MODEL : OPENAI_WEBSITE_MENU_MODEL);
  }

  async classifyWebsiteMenuItemsGlobally(
    items: WebsiteMenuGlobalInput[],
    options: WebsiteAnalysisOptions = {}
  ): Promise<WebsiteMenuGlobalAnalysis> {
    if (!this.apiKey) {
      throw new DigitalMenuServiceError("OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY fehlt im Backend-Environment");
    }
    const normalizedItems = items
      .filter((item) => item?.id && item?.name)
      .slice(0, 800);
    if (!normalizedItems.length) {
      throw new DigitalMenuServiceError("MENU_UNREADABLE", "Keine Gerichte für die gemeinsame Zuordnung gefunden");
    }
    const validItemIds = new Set(normalizedItems.map((item) => item.id));
    const model = options.useFallbackModel ? OPENAI_WEBSITE_MENU_FALLBACK_MODEL : OPENAI_WEBSITE_MENU_MODEL;
    const prompt = [
      "Ordne alle bereits aus den Restaurant-Menüquellen gelesenen Gerichte gemeinsam zu.",
      "Nutze sichtbare Überschriften, Abschnitt und Gerichtsdaten, niemals URL oder externes Wissen.",
      "Bereiche: breakfast, lunch, dinner, drinks oder unclassified.",
      "Markiere nur eindeutige Dubletten mit duplicateOfItemId. Unterschiedliche Größen, Beilagen, Varianten oder Preise bleiben getrennt.",
      "Einzelne Shop-Produkte, Add-ons, Gutscheine, Eventtexte und reine Werbetexte gehören nicht in einen Menübereich; ordne sie unclassified zu.",
      "Erfinde keine Preise oder Inhalte. Gib für jede itemId genau eine Zuordnung zurück.",
      JSON.stringify(normalizedItems)
    ].join("\n");

    let lastMessage = "Gemeinsame Website-Menüanalyse fehlgeschlagen";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const requestBody: Record<string, unknown> = {
          model,
          text: {
            format: {
              type: "json_schema",
              name: "website_restaurant_menu_global",
              strict: true,
              schema: WEBSITE_MENU_GLOBAL_RESPONSE_SCHEMA
            }
          },
          input: [
            {
              role: "system",
              content: [{
                type: "input_text",
                text: "Du prüfst gemeinsam extrahierte Restaurantgerichte. Bewahre echte Varianten, entferne nur sichere Dubletten und rate niemals. Antworte nur als gültiges JSON."
              }]
            },
            { role: "user", content: [{ type: "input_text", text: prompt }] }
          ]
        };
        if (model === OPENAI_WEBSITE_MENU_MODEL) requestBody.temperature = 0;
        const response = await fetchWithTimeout(
          `${OPENAI_BASE_URL}/responses`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
          },
          OPENAI_ANALYSIS_TIMEOUT_MS
        );
        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          lastMessage = getErrorMessage(payload) || lastMessage;
          if (attempt === 0 && isTransientStatus(response.status)) {
            await wait(OPENAI_RETRY_DELAY_MS);
            continue;
          }
          break;
        }
        const output = extractOutputText(payload);
        if (!output) throw new Error("EMPTY_RESPONSE");
        const normalized = normalizeWebsiteGlobalAnalysis(parseJsonFromText(output), validItemIds);
        return { ...normalized, model };
      } catch (error) {
        if (error instanceof DigitalMenuServiceError && error.code === "OPENAI_NOT_CONFIGURED") throw error;
        lastMessage = error instanceof Error ? error.message : lastMessage;
        if (attempt === 0) {
          await wait(OPENAI_RETRY_DELAY_MS);
          continue;
        }
      }
    }
    throw new DigitalMenuServiceError("OPENAI_ANALYSIS_FAILED", lastMessage);
  }

  private async analyzeWebsiteWithUserContent(
    userContent: Array<Record<string, unknown>>,
    model = OPENAI_WEBSITE_MENU_MODEL
  ): Promise<WebsiteMenuSourceAnalysis> {
    if (!this.apiKey) {
      throw new DigitalMenuServiceError("OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY fehlt im Backend-Environment");
    }

    let lastMessage = "Website-Menüanalyse fehlgeschlagen";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await fetchWithTimeout(
          `${OPENAI_BASE_URL}/responses`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model,
              ...(model === OPENAI_WEBSITE_MENU_MODEL ? { temperature: 0 } : {}),
              text: {
                format: {
                  type: "json_schema",
                  name: "website_restaurant_menu",
                  strict: true,
                  schema: WEBSITE_MENU_RESPONSE_SCHEMA
                }
              },
              input: [
                { role: "system", content: [{ type: "input_text", text: WEBSITE_MENU_SYSTEM_PROMPT }] },
                { role: "user", content: userContent }
              ]
            })
          },
          OPENAI_ANALYSIS_TIMEOUT_MS
        );
      } catch (error) {
        if (error instanceof DigitalMenuServiceError) throw error;
        lastMessage = error instanceof Error ? error.message : lastMessage;
        if (attempt === 0) {
          await wait(OPENAI_RETRY_DELAY_MS);
          continue;
        }
        break;
      }

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        lastMessage = getErrorMessage(payload) || lastMessage;
        if (attempt === 0 && isTransientStatus(response.status)) {
          await wait(OPENAI_RETRY_DELAY_MS);
          continue;
        }
        break;
      }

      try {
        const text = extractOutputText(payload);
        if (!text) throw new Error("EMPTY_RESPONSE");
        const normalized = normalizeWebsiteMenuAnalysis(parseJsonFromText(text));
        return { ...normalized, model };
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : "Ungültige Website-Menüantwort";
        break;
      }
    }
    throw new DigitalMenuServiceError("OPENAI_ANALYSIS_FAILED", lastMessage);
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
      for (let attempt = 0; attempt < 2; attempt += 1) {
        // FormData bodies are one-shot on some runtimes, so rebuild them for each retry.
        const formData = new FormData();
        const binary = Uint8Array.from(input.buffer);
        const blob = new Blob([binary.buffer], {
          type: input.mimeType || "application/octet-stream"
        });
        formData.append("purpose", purpose);
        formData.append("file", blob, input.filename || `menu-${Date.now()}`);
        let response: Response;
        try {
          response = await fetchWithTimeout(
            `${OPENAI_BASE_URL}/files`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${this.apiKey}` },
              body: formData
            },
            OPENAI_FILE_UPLOAD_TIMEOUT_MS
          );
        } catch (error) {
          if (error instanceof DigitalMenuServiceError) throw error;
          lastMessage = error instanceof Error ? error.message : "OpenAI file upload fehlgeschlagen";
          if (attempt === 0) {
            await wait(OPENAI_RETRY_DELAY_MS);
            continue;
          }
          break;
        }

        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          lastMessage = getErrorMessage(payload) || "OpenAI file upload fehlgeschlagen";
          if (attempt === 0 && isTransientStatus(response.status)) {
            await wait(OPENAI_RETRY_DELAY_MS);
            continue;
          }
          break;
        }

        const id = asString(payload.id);
        if (id) return id;
        lastMessage = "OpenAI hat keine gueltige file id zurueckgegeben";
        break;
      }
    }

    throw new DigitalMenuServiceError("OPENAI_UPLOAD_FAILED", lastMessage);
  }

  private async analyzeWithUserContent(
    userContent: Array<Record<string, unknown>>,
    options: AnalyzeOptions
  ): Promise<DigitalMenuResult> {
    if (!this.apiKey) {
      throw new DigitalMenuServiceError(
        "OPENAI_NOT_CONFIGURED",
        "OPENAI_API_KEY fehlt im Backend-Environment"
      );
    }

    const models = Array.from(new Set([this.model, this.fallbackModel].filter(Boolean)));
    let lastMessage = "OpenAI Analyse fehlgeschlagen";

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let response: Response;
        try {
          response = await fetchWithTimeout(
            `${OPENAI_BASE_URL}/responses`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model,
                temperature: 0,
                text: {
                  format: {
                    type: "json_schema",
                    name: "restaurant_menu",
                    strict: true,
                    schema:
                      options.kind === "lunch"
                        ? MENU_RESPONSE_SCHEMA
                        : REGULAR_MENU_RESPONSE_SCHEMA
                  }
                },
                input: [
                  {
                    role: "system",
                    content: [{ type: "input_text", text: buildSystemPrompt(options) }]
                  },
                  {
                    role: "user",
                    content: userContent
                  }
                ]
              })
            },
            OPENAI_ANALYSIS_TIMEOUT_MS
          );
        } catch (error) {
          if (error instanceof DigitalMenuServiceError) throw error;
          lastMessage = error instanceof Error ? error.message : "OpenAI Analyse fehlgeschlagen";
          if (attempt === 0) {
            await wait(OPENAI_RETRY_DELAY_MS);
            continue;
          }
          break;
        }

        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          lastMessage = getErrorMessage(payload) || "OpenAI Analyse fehlgeschlagen";
          if (attempt === 0 && isTransientStatus(response.status)) {
            await wait(OPENAI_RETRY_DELAY_MS);
            continue;
          }
          break;
        }

        const text = extractOutputText(payload);
        if (!text) {
          lastMessage = "Datei konnte nicht zu einem Menue extrahiert werden";
          break;
        }

        try {
          const parsed = parseJsonFromText(text);
          const normalized = normalizeMenu(parsed);
          const allergens = normalizeAllergens(parsed);
          const lunchValidity = normalizeLunchValidity(
            parsed,
            options.kind === "lunch" ? "lunch" : "regular"
          );
          if (!allergens.length) {
            normalized.warnings.push("Keine Allergene sicher erkannt. Bitte manuell ergänzen.");
          }
          return {
            menu: { sections: normalized.sections, allergens },
            duplicatesRemoved: normalized.duplicatesRemoved,
            warnings: normalized.warnings,
            model,
            lunchValidity
          };
        } catch (error) {
          lastMessage = error instanceof Error ? error.message : "Ungueltige Menue-Antwort";
          break;
        }
      }
    }

    throw new DigitalMenuServiceError("OPENAI_ANALYSIS_FAILED", lastMessage);
  }

  private async deleteFile(fileId: string): Promise<void> {
    if (!this.apiKey) return;

    await fetchWithTimeout(
      `${OPENAI_BASE_URL}/files/${encodeURIComponent(fileId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.apiKey}` }
      },
      OPENAI_DELETE_TIMEOUT_MS
    );
  }
}
