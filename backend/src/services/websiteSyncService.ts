import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { PDFDocument } from "pdf-lib";
import {
  DigitalMenuService,
  DigitalMenuServiceError,
  WebsiteMenuGlobalAnalysis,
  WebsiteMenuGlobalInput,
  WebsiteMenuClassification,
  WebsiteMenuSourceArea
} from "./digitalMenuService";
import { MAX_MENU_BATCH_SIZE, MAX_MENU_FILE_SIZE, normalizeMenuUpload } from "./menuUploadService";

export type WebsiteMenuArea = "breakfast" | "lunch" | "dinner" | "drinks";
// `regular` is retained only for website-sync drafts created before the four-area split.
export type WebsiteSyncSection = "openingHours" | WebsiteMenuArea | "unclassified" | "regular";
export type WebsiteOpeningHours = Record<
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
  { enabled: boolean; openTime: string; closeTime: string; openEnded?: boolean; detected?: boolean }
>;
export type WebsiteMenuItem = {
  id: string;
  name: string;
  description: string;
  price: number | null;
  category: "Vegan" | "Vegetarisch" | "Normal" | "Getränke";
  section: string;
  allergens: string[];
  sourceUrl?: string;
  sourceUrls?: string[];
  duplicateGroup?: string;
  pageNumber?: number | null;
  recognizedHeading?: string;
  confidence?: "high" | "medium" | "low";
};
export type WebsiteMenuDraft = {
  id: string;
  section: WebsiteMenuArea | "unclassified" | "regular";
  sourceUrls: string[];
  sourceUrl: string;
  pageNumber: number | null;
  recognizedHeading: string;
  confidence: "high" | "medium" | "low";
  unclassified: boolean;
  items: WebsiteMenuItem[];
  allergens: string[];
  warnings: string[];
};
export type WebsiteSyncResult = {
  websiteUrl: string;
  scannedAt: string;
  openingHours: WebsiteOpeningHours | null;
  openingHoursNotes: string[];
  openingHoursUnknownDays?: Array<keyof WebsiteOpeningHours>;
  openingHoursConflicts?: string[];
  menus: Partial<Record<WebsiteMenuArea | "regular", WebsiteMenuDraft>>;
  unclassifiedMenu?: WebsiteMenuDraft;
  menuSources: WebsiteMenuDraft[];
  menuScan: { checkedSources: number; analyzedSources: number; failedSources: number };
  warnings: string[];
};

export class WebsiteSyncError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

type Candidate = {
  url: string;
  section: WebsiteMenuArea;
  label: string;
  priority: number;
  source: "link" | "image" | "embed" | "sitemap";
  depth: number;
  purpose: "menu" | "hours";
};
type DownloadedFile = { buffer: Buffer; filename: string; mimeType: string; url: string; priority: number; hash: string };
type FileAnalysisSource = DownloadedFile & { type: "file"; chunk: number; pageNumber: number | null };
type HtmlMenuSource = { url: string; text: string; priority: number; hash: string };
type RenderedPage = { html: string; finalUrl: string; stable: boolean };

const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const dayIndex = new Map<string, number>([
  ["montag", 0], ["mo", 0],
  ["dienstag", 1], ["di", 1],
  ["mittwoch", 2], ["mi", 2],
  ["donnerstag", 3], ["do", 3],
  ["freitag", 4], ["fr", 4],
  ["samstag", 5], ["sa", 5],
  ["sonntag", 6], ["so", 6]
]);
const MAX_REDIRECTS = 4;
const MAX_HTML_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 25_000;
const MAX_MENU_PAGE_CANDIDATES = 40;
const MAX_RENDERED_MENU_PAGES = 12;
const MAX_SITEMAPS = 8;
const MAX_CRAWL_DEPTH = 3;
const MAX_HTML_CHUNKS_PER_PAGE = 8;
const MAX_WEBSITE_MENU_FILES = 20;
const MAX_ANALYSIS_UNITS = 64;
const MAX_PARALLEL_ANALYSES = 2;
const HTML_CHUNK_SIZE = 24_000;
const HTML_CHUNK_OVERLAP = 1_500;
const RENDER_TIMEOUT_MS = 25_000;

const createOpeningHours = (): WebsiteOpeningHours =>
  dayKeys.reduce((result, day) => {
    result[day] = { enabled: false, openTime: "11:00", closeTime: "22:00", openEnded: false, detected: false };
    return result;
  }, {} as WebsiteOpeningHours);

const normalizeWebsiteUrl = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) throw new WebsiteSyncError("WEBSITE_URL_REQUIRED", "Bitte die Website-Adresse eingeben.");
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("protocol");
    if (!parsed.hostname) throw new Error("host");
    parsed.hash = "";
    return parsed.toString();
  } catch {
    throw new WebsiteSyncError("WEBSITE_URL_INVALID", "Die Website-Adresse ist ungültig.");
  }
};

export const resolveDiscoveredWebsiteUrl = (rawValue: unknown, pageUrl: string): string => {
  const decoded = decodeHtml(String(rawValue || "")).trim();
  if (!decoded) throw new TypeError("empty website source URL");
  return canonicalUrl(new URL(decoded, pageUrl).toString());
};

const isPrivateIp = (address: string): boolean => {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1" || address.startsWith("fe80:" ) || address.startsWith("fc") || address.startsWith("fd")) return true;
  if (isIP(address) !== 4) return false;
  const parts = address.split(".").map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
  );
};

const assertPublicUrl = async (value: string): Promise<URL> => {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new WebsiteSyncError("WEBSITE_URL_BLOCKED", "Nur öffentliche http- oder https-Webseiten sind erlaubt.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new WebsiteSyncError("WEBSITE_URL_BLOCKED", "Diese Website-Adresse ist nicht öffentlich erreichbar.");
  }
  const resolved = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!resolved.length || resolved.some((entry) => isPrivateIp(entry.address))) {
    throw new WebsiteSyncError("WEBSITE_URL_BLOCKED", "Diese Website-Adresse ist nicht öffentlich erreichbar.");
  }
  return url;
};

const fetchPublic = async (input: string): Promise<Response> => {
  let url = await assertPublicUrl(input);
  for (let index = 0; index <= MAX_REDIRECTS; index += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "NahUndFein-WebsiteSync/1.0 (+https://app.nahundfein.com)" }
      });
    } catch {
      throw new WebsiteSyncError("WEBSITE_UNREACHABLE", "Die Website konnte nicht geladen werden.");
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || index === MAX_REDIRECTS) {
        throw new WebsiteSyncError("WEBSITE_REDIRECT_FAILED", "Die Website hat zu viele oder ungültige Weiterleitungen.");
      }
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new WebsiteSyncError("WEBSITE_UNREACHABLE", "Die Website konnte nicht geladen werden.");
    return response;
  }
  throw new WebsiteSyncError("WEBSITE_REDIRECT_FAILED", "Die Website konnte nicht geladen werden.");
};

const renderPublicHtml = async (browser: Browser, input: string): Promise<RenderedPage | null> => {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(RENDER_TIMEOUT_MS);
  page.setDefaultTimeout(RENDER_TIMEOUT_MS);
  try {
    await page.route("**/*", async (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      if (!["document", "script", "xhr", "fetch", "stylesheet"].includes(resourceType)) {
        await route.abort();
        return;
      }
      try {
        await assertPublicUrl(request.url());
        await route.continue();
      } catch {
        await route.abort();
      }
    });
    await page.goto(input, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
    await page.evaluate(async () => {
      const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const maximum = Math.min(document.documentElement.scrollHeight, 12_000);
      for (let offset = 0; offset < maximum; offset += 900) {
        window.scrollTo(0, offset);
        await delay(120);
      }
      window.scrollTo(0, 0);
    }).catch(() => undefined);

    let previousLength = 0;
    let stableChecks = 0;
    let html = "";
    for (let check = 0; check < 6; check += 1) {
      html = await page.content();
      if (Math.abs(html.length - previousLength) < 32) stableChecks += 1;
      else stableChecks = 0;
      if (stableChecks >= 2) break;
      previousLength = html.length;
      await page.waitForTimeout(500);
    }
    return { html, finalUrl: page.url(), stable: stableChecks >= 2 };
  } catch {
    return null;
  } finally {
    await page.close().catch(() => undefined);
  }
};

const readResponseBuffer = async (response: Response, maximumBytes: number, errorCode: string, errorMessage: string): Promise<Buffer> => {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new WebsiteSyncError(errorCode, errorMessage);
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maximumBytes) {
        throw new WebsiteSyncError(errorCode, errorMessage);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
};

const namedHtmlEntities: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  nbsp: " ",
  euro: "EUR",
  ndash: "–",
  mdash: "—",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß"
};

const decodeHtml = (value: string): string =>
  value
    .replace(/&([a-z]+);/gi, (match, name) => namedHtmlEntities[name] || namedHtmlEntities[name.toLowerCase()] || match)
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_, hex, decimal) => String.fromCodePoint(Number.parseInt(hex || decimal, hex ? 16 : 10)));

const textFromHtml = (value: string): string =>
  decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(?:p|div|li|section|article|h[1-6]|tr|table)>|<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

const contentHash = (value: Buffer | string): string =>
  createHash("sha256").update(value).digest("hex");

const canonicalUrl = (value: string): string => {
  const url = new URL(value);
  url.hash = "";
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => {
    url.searchParams.delete(key);
  });
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
};

const sourceUrlIdentity = (value: string): string => {
  const url = new URL(canonicalUrl(value));
  if (/\.(?:jpe?g|png|webp|heic|heif)(?:$|\?)/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/-\d{2,5}x\d{2,5}(?=\.(?:jpe?g|png|webp|heic|heif)$)/i, "");
    ["format", "width", "height", "w", "h", "quality", "q", "fit", "crop", "auto", "dpr"].forEach((key) => {
      url.searchParams.delete(key);
    });
  }
  return url.toString();
};

const nearestVisibleHeading = (html: string, index: number): string => {
  // Squarespace image blocks contain a large amount of markup between a visible
  // heading and its image. 30k still stays local to the block, while covering
  // those generated wrappers.
  const nearbyHtml = html.slice(Math.max(0, index - 30000), index);
  const matches = Array.from(
    nearbyHtml.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|data-marquee-items\s*=\s*["']([^"']+)["']/gi)
  );
  const latest = matches[matches.length - 1];
  return latest ? textFromHtml(latest[1] || latest[2] || "").slice(0, 220) : "";
};

const classifyMenu = (value: string): Candidate["section"] | null => {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // URL decoding is only a classification aid; malformed URLs are handled separately.
  }
  const text = decodeHtml(decoded).toLocaleLowerCase("de-DE");
  if (/fr[üu]hst[üu]ck|brunch/.test(text)) return "breakfast";
  if (/mittag|lunch|tageskarte/.test(text)) return "lunch";
  if (/getr[aä]nk|drinks?|coffee|kaffee|wein|bier|bar/.test(text)) return "drinks";
  if (/abend|dinner|speisekarte|men[üu]|food|essen/.test(text)) return "dinner";
  return null;
};

const isTechnicalMenuPlaceholderUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    const path = url.pathname.toLocaleLowerCase("en-US");
    return (
      /(?:^|\.)parastorage\.com$/i.test(url.hostname) &&
      (/\/restaurant-menus-showcase-ooi\//.test(path) || /(?:^|[_-])menus?_side_image(?:[_-]|\.)/.test(path))
    );
  } catch {
    return false;
  }
};

const extractCandidates = (
  html: string,
  pageUrl: string,
  options: { depth?: number; pageIsMenu?: boolean } = {}
): Candidate[] => {
  const candidates: Candidate[] = [];
  const page = new URL(pageUrl);
  const depth = options.depth || 0;
  const append = (
    rawUrl: string,
    label: string,
    source: Candidate["source"],
    nearbyText = ""
  ) => {
    if (!rawUrl || rawUrl.startsWith("#") || /^mailto:|^tel:|^javascript:/i.test(rawUrl)) return;
    try {
      const url = resolveDiscoveredWebsiteUrl(rawUrl, pageUrl);
      // Wix ships this asset with its menu widget. It is a decorative example,
      // not restaurant-owned menu content and must never reach the AI scanner.
      if (isTechnicalMenuPlaceholderUrl(url)) return;
      // Never classify hidden HTML/CSS attributes. Names such as `menu-item` are common
      // navigation classes and caused unrelated links to be mistaken for a menu.
      const cleanLabel = textFromHtml(label);
      // Image-only menu cards often have an empty alt attribute and a generic file name.
      // Use only visible text immediately before the image as a fallback; never CSS classes.
      // URL text is only useful for finding a possible source. The model below is
      // the only component that assigns breakfast, lunch, dinner or drinks.
      // A visible label such as "Anfahrt" is more trustworthy than a generic
      // path like /karte. URL hints are only used for icon-only links.
      const directSection = classifyMenu(cleanLabel) || (!cleanLabel ? classifyMenu(url) : null);
      const contextSection = source !== "link" ? classifyMenu(nearbyText) : null;
      const inferredSection = directSection || contextSection;
      const menuHint = isLikelyMenuReference(`${cleanLabel} ${url} ${nearbyText}`);
      const hoursHint = isLikelyHoursReference(`${cleanLabel} ${url}`);
      const target = new URL(url);
      const sameWebsite = target.hostname === page.hostname || target.hostname.endsWith(`.${page.hostname}`) || page.hostname.endsWith(`.${target.hostname}`);
      const fileLike = /\.(?:pdf|jpe?g|png|webp|heic|heif)(?:$|\?)/i.test(url);
      const irrelevantPage = /datenschutz|privacy|impressum|agb|terms|login|account|warenkorb|cart|checkout|job|karriere|presse|veranstaltung|events?|gutschein|voucher|galerie|gallery/i.test(`${cleanLabel} ${target.pathname}`);
      const boundedGenericPage = source === "link" && sameWebsite && depth < 2 && !irrelevantPage;
      if (source === "link" && !fileLike && (!sameWebsite || (!menuHint && !hoursHint && !boundedGenericPage))) return;
      if (source !== "link" && !fileLike && !menuHint) return;
      if ((source === "image" || source === "embed") && !menuHint && !options.pageIsMenu) return;
      const searchable = `${cleanLabel} ${url}`.toLocaleLowerCase("de-DE");
      // Do not infer a menu from a food, terrace or voucher photo. For images we
      // require a document-like filename/alt text; meal words alone are not enough.
      const menuDocumentHint = /menu|men[üu]|speisekarte|mittagskarte|fr[üu]hst[üu]ckskarte|getr[aä]nkekarte|plakat|karte|pdf/.test(searchable);
      const decorative = /logo|header|hero|team|about|ueber-uns|über-uns|wellpass|portrait|gallery|galerie|gutschein|voucher/.test(searchable);
      // A heading alone is not enough for images: websites commonly place normal food photos
      // below a lunch heading. Only document-like images may inherit the nearby menu heading.
      if ((source === "image" || source === "embed") && decorative && !menuDocumentHint) return;
      candidates.push({
        url,
        section: inferredSection || "dinner",
        label: cleanLabel.slice(0, 160),
        priority: directSection ? 220 + (menuDocumentHint ? 30 : 0) : contextSection ? 160 + (menuDocumentHint ? 40 : 0) : menuHint ? 100 : hoursHint ? 80 : options.pageIsMenu ? 30 : boundedGenericPage ? 12 : 5,
        source,
        depth: depth + 1,
        purpose: hoursHint && !menuHint ? "hours" : "menu"
      });
    } catch {
      // Ignore malformed third-party links.
    }
  };
  for (const match of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    append(match[1], match[2], "link");
  }
  for (const match of html.matchAll(/<(?:img|source)\b([^>]*)>/gi)) {
    const attributes = match[1] || "";
    const alt = attributes.match(/(?:alt|title)\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const nearbyHeading = nearestVisibleHeading(html, match.index || 0);
    const directSources = Array.from(attributes.matchAll(/(?:^|\s)(?:src|data-src|data-lazy-src)\s*=\s*["']([^"']+)["']/gi)).map((entry) => entry[1]);
    const srcsets = Array.from(attributes.matchAll(/(?:^|\s)(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi))
      .map((entry) => entry[1].split(",").map((part) => part.trim()).filter(Boolean))
      .flatMap((entries) => entries.length ? [entries[entries.length - 1].split(/\s+/)[0]] : []);
    const uniqueSources = new Map<string, string>();
    [...directSources, ...srcsets].forEach((sourceUrl) => {
      try {
        uniqueSources.set(sourceUrlIdentity(new URL(sourceUrl, pageUrl).toString()), sourceUrl);
      } catch {
        // Malformed responsive image candidates are ignored independently.
      }
    });
    uniqueSources.forEach((sourceUrl) => append(sourceUrl, alt, "image", nearbyHeading));
  }
  for (const match of html.matchAll(/<(?:iframe|embed|object)\b([^>]*)>/gi)) {
    const attributes = match[1] || "";
    const source = attributes.match(/(?:src|data)\s*=\s*["']([^"']+)["']/i)?.[1];
    const title = attributes.match(/title\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    if (source) append(source, title, "embed", nearestVisibleHeading(html, match.index || 0));
  }
  return Array.from(new Map(candidates.map((item) => [item.url, item])).values())
    .sort((a, b) => b.priority - a.priority);
};

const isHtml = (contentType: string, url: string) => contentType.includes("text/html") || /\.(?:html?|php)(?:$|\?)/i.test(url);
const isMenuFile = (contentType: string, url: string) =>
  /application\/pdf|image\/(?:jpeg|png|webp|heic|heif)/i.test(contentType) || /\.(?:pdf|jpe?g|png|webp|heic|heif)(?:$|\?)/i.test(url);

// These terms are discovery hints only. They never decide whether the source is
// breakfast, lunch, dinner or drinks; that decision belongs to the content model.
const isLikelyMenuReference = (value: string): boolean =>
  /menu|men[üu]|speisekarte|mittag|lunch|tageskarte|fr[üu]hst[üu]ck|brunch|getr[aä]nk|drinks?|food|essen|karte/i.test(
    decodeHtml(value)
  );

const isLikelyHoursReference = (value: string): boolean =>
  /[öo]ffnungszeiten?|opening(?:-?hours)?|kontakt|contact|anfahrt|location/i.test(decodeHtml(value));

// A link called "Speisekarte" can still lead to a navigation landing page.
// Analyze pages without prices only when the visible text contains real menu
// structure, otherwise it would create a misleading AI error for the owner.
const hasVisibleMenuStructure = (text: string): boolean => {
  const headings = text.match(/fr[üu]hst[üu]ck|brunch|vorspeisen?|vorab|salate?|hauptg[aä]nge|dessert|s[üu][ßs]es|getr[aä]nke|weine?|kaffee|mittagstisch|tageskarte/gi) || [];
  const uniqueHeadings = new Set(headings.map((heading) => heading.toLocaleLowerCase("de-DE"))).size;
  // A lunch card can have only one clear heading, but it still contains a
  // substantial list. A short navigation page such as Central's /menue page
  // must not pass this check.
  const prices = text.match(/\b\d{1,3}(?:[.,]\d{2})\s*(?:€|eur)\b/gi) || [];
  const substantialLines = text.split("\n").filter((line) => line.trim().length >= 5 && line.trim().length <= 180).length;
  return prices.length >= 2 || uniqueHeadings >= 2 || (uniqueHeadings >= 1 && substantialLines >= 3);
};

const extractSitemapUrls = (xml: string, websiteUrl: string): string[] => {
  const root = new URL(websiteUrl);
  const urls = Array.from(xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi))
    .map((match) => decodeHtml(match[1]).trim())
    .filter(Boolean)
    .flatMap((value) => {
      try {
        const url = new URL(value);
        return url.hostname === root.hostname ? [canonicalUrl(url.toString())] : [];
      } catch {
        return [];
      }
    });
  return [...new Set(urls)].slice(0, MAX_MENU_PAGE_CANDIDATES * 4);
};

const chunkMenuText = (text: string): string[] => {
  const normalized = String(text || "").trim();
  if (!normalized) return [];
  if (normalized.length <= HTML_CHUNK_SIZE) return [normalized];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length && chunks.length < MAX_HTML_CHUNKS_PER_PAGE) {
    let end = Math.min(normalized.length, start + HTML_CHUNK_SIZE);
    if (end < normalized.length) {
      const boundary = Math.max(normalized.lastIndexOf("\n", end), normalized.lastIndexOf(". ", end));
      if (boundary > start + HTML_CHUNK_SIZE / 2) end = boundary + 1;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - HTML_CHUNK_OVERLAP);
  }
  return chunks;
};

const splitPdfIntoAnalysisPages = async (file: DownloadedFile): Promise<FileAnalysisSource[]> => {
  if (file.mimeType !== "application/pdf") {
    return [{ type: "file", ...file, chunk: 0, pageNumber: null }];
  }
  try {
    const source = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    if (source.getPageCount() <= 1) {
      return [{ type: "file", ...file, chunk: 0, pageNumber: 1 }];
    }
    const pages: FileAnalysisSource[] = [];
    for (let pageIndex = 0; pageIndex < source.getPageCount(); pageIndex += 1) {
      const pageDocument = await PDFDocument.create();
      const [page] = await pageDocument.copyPages(source, [pageIndex]);
      pageDocument.addPage(page);
      const bytes = await pageDocument.save();
      const filename = file.filename.replace(/\.pdf$/i, `-seite-${pageIndex + 1}.pdf`);
      pages.push({
        type: "file",
        ...file,
        buffer: Buffer.from(bytes),
        filename,
        hash: `${file.hash}:page:${pageIndex + 1}`,
        chunk: pageIndex,
        pageNumber: pageIndex + 1
      });
    }
    return pages;
  } catch {
    // Encrypted or malformed PDFs still get one ordinary analysis attempt.
    return [{ type: "file", ...file, chunk: 0, pageNumber: null }];
  }
};

const itemIdForWebsiteSource = (sourceId: string, sectionIndex: number, itemIndex: number): string =>
  `website-${sourceId}-${sectionIndex + 1}-${itemIndex + 1}`;

const normalizeDishName = (value: string): string =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const comparablePrice = (value: number | null): string => value === null ? "" : value.toFixed(2);

const similarity = (left: string, right: string): number => {
  if (left === right) return 1;
  const leftWords = new Set(left.split(" ").filter((word) => word.length > 2));
  const rightWords = new Set(right.split(" ").filter((word) => word.length > 2));
  if (!leftWords.size || !rightWords.size) return 0;
  let common = 0;
  leftWords.forEach((word) => { if (rightWords.has(word)) common += 1; });
  return common / Math.max(leftWords.size, rightWords.size);
};

const sameWebsiteDish = (left: WebsiteMenuItem, right: WebsiteMenuItem): boolean => {
  const leftName = normalizeDishName(left.name);
  const rightName = normalizeDishName(right.name);
  if (!leftName || !rightName) return false;
  const leftPrice = comparablePrice(left.price);
  const rightPrice = comparablePrice(right.price);
  if (leftName === rightName) return !leftPrice || !rightPrice || leftPrice === rightPrice;
  // Keep fuzzy matching deliberately strict: it removes variants of the same dish
  // without merging two different dishes that merely share an ingredient.
  return similarity(leftName, rightName) >= 0.9 && (!leftPrice || !rightPrice || leftPrice === rightPrice);
};

const mergeWebsiteMenuItems = (items: WebsiteMenuItem[]): WebsiteMenuItem[] => {
  const groups: WebsiteMenuItem[][] = [];
  items.forEach((item) => {
    const group = groups.find((entries) => (
      Boolean(item.duplicateGroup && entries.some((entry) => entry.duplicateGroup === item.duplicateGroup))
      || sameWebsiteDish(entries[0], item)
    ));
    if (group) group.push(item);
    else groups.push([item]);
  });
  return groups.map((entries, index) => {
    const preferred = entries.find((item) => item.price !== null) || entries[0];
    const description = [...entries]
      .map((item) => String(item.description || "").trim())
      .sort((left, right) => right.length - left.length)[0] || "";
    const sourceUrls = [...new Set(entries.flatMap((item) => item.sourceUrls || [item.sourceUrl]).filter(Boolean) as string[])];
    return {
      ...preferred,
      description,
      allergens: [...new Set(entries.flatMap((item) => item.allergens || []))],
      sourceUrl: sourceUrls[0] || preferred.sourceUrl,
      sourceUrls,
      duplicateGroup: `merged-${index + 1}`
    };
  });
};

const aggregateWebsiteMenuDraft = (
  id: string,
  section: WebsiteMenuDraft["section"],
  drafts: WebsiteMenuDraft[]
): WebsiteMenuDraft => ({
  id,
  section,
  sourceUrls: [...new Set(drafts.flatMap((draft) => draft.sourceUrls))],
  sourceUrl: drafts[0].sourceUrl,
  pageNumber: null,
  recognizedHeading: drafts.length === 1 ? drafts[0].recognizedHeading : "Mehrere erkannte Quellen",
  confidence: drafts.some((draft) => draft.confidence === "low")
    ? "low"
    : drafts.some((draft) => draft.confidence === "medium")
      ? "medium"
      : "high",
  unclassified: section === "unclassified",
  items: mergeWebsiteMenuItems(drafts.flatMap((draft) => draft.items)),
  allergens: [...new Set(drafts.flatMap((draft) => draft.allergens))],
  warnings: [...new Set(drafts.flatMap((draft) => draft.warnings))]
});

const sourceDraftsFromAnalysis = (
  sourceId: string,
  sourceUrl: string,
  analysisAreas: WebsiteMenuSourceArea[],
  pageNumber: number | null = null
): WebsiteMenuDraft[] => {
  const drafts: WebsiteMenuDraft[] = [];
  analysisAreas.forEach((area, areaIndex) => {
      const items = area.menu.sections.flatMap((entry, sectionIndex) =>
        entry.items.map((item, itemIndex) => ({
          id: itemIdForWebsiteSource(`${sourceId}-${areaIndex + 1}`, sectionIndex, itemIndex),
          name: item.name,
          description: item.description || "",
          price: item.price,
          category: area.area === "drinks" ? "Getränke" : item.category,
          section: entry.name || area.recognizedHeading,
          allergens: item.allergens || [],
          sourceUrl,
          pageNumber,
          recognizedHeading: area.recognizedHeading,
          confidence: area.confidence
        }))
      );
      if (!items.length) return;
      const section = area.area as WebsiteMenuClassification;
      drafts.push({
        id: `${sourceId}-${areaIndex + 1}`,
        section,
        sourceUrls: [sourceUrl],
        sourceUrl,
        pageNumber,
        recognizedHeading: area.recognizedHeading,
        confidence: area.confidence,
        unclassified: section === "unclassified",
        items,
        allergens: area.menu.allergens,
        warnings: area.warnings
      });
    });
  return drafts;
};

const websiteAnalysisScore = (areas: WebsiteMenuSourceArea[]): number =>
  areas.reduce((score, area) => {
    const itemCount = area.menu.sections.reduce((total, section) => total + section.items.length, 0);
    const confidenceScore = area.confidence === "high" ? 3 : area.confidence === "medium" ? 2 : 0;
    return score + itemCount * confidenceScore + (area.area === "unclassified" ? 0 : itemCount);
  }, 0);

const websiteAnalysisNeedsFallback = (areas: WebsiteMenuSourceArea[]): boolean => {
  const itemCount = areas.reduce((total, area) => total + area.menu.sections.reduce((sum, section) => sum + section.items.length, 0), 0);
  if (!itemCount) return true;
  const uncertainItems = areas.reduce((total, area) => {
    const count = area.menu.sections.reduce((sum, section) => sum + section.items.length, 0);
    return total + (area.area === "unclassified" || area.confidence === "low" ? count : 0);
  }, 0);
  return uncertainItems / itemCount >= 0.35;
};

const globalAnalysisNeedsFallback = (analysis: WebsiteMenuGlobalAnalysis, expectedItems: number): boolean => {
  if (analysis.assignments.length < expectedItems * 0.9) return true;
  const uncertain = analysis.assignments.filter((assignment) => (
    assignment.area === "unclassified" || assignment.confidence === "low"
  )).length;
  return uncertain / Math.max(1, analysis.assignments.length) >= 0.25;
};

const globalAnalysisScore = (analysis: WebsiteMenuGlobalAnalysis): number =>
  analysis.assignments.reduce((score, assignment) => (
    score
    + (assignment.area === "unclassified" ? 0 : 2)
    + (assignment.confidence === "high" ? 2 : assignment.confidence === "medium" ? 1 : 0)
  ), 0);

const applyGlobalWebsiteClassification = (
  drafts: WebsiteMenuDraft[],
  analysis: WebsiteMenuGlobalAnalysis
): WebsiteMenuDraft[] => {
  const assignments = new Map(analysis.assignments.map((assignment) => [assignment.itemId, assignment]));
  const duplicateRoots = new Map<string, string>();
  const resolveDuplicateRoot = (itemId: string): string => {
    const visited = new Set<string>();
    let current = itemId;
    while (!visited.has(current)) {
      visited.add(current);
      const next = assignments.get(current)?.duplicateOfItemId;
      if (!next) break;
      current = next;
    }
    return current;
  };
  analysis.assignments.forEach((assignment) => {
    duplicateRoots.set(assignment.itemId, resolveDuplicateRoot(assignment.itemId));
  });
  const globallyClassified: WebsiteMenuDraft[] = [];

  drafts.forEach((draft) => {
    const byArea = new Map<WebsiteMenuDraft["section"], WebsiteMenuItem[]>();
    draft.items.forEach((item) => {
      const assignment = assignments.get(item.id);
      const area = assignment?.area || draft.section;
      const current = byArea.get(area) || [];
      current.push({
        ...item,
        confidence: assignment?.confidence || item.confidence,
        duplicateGroup: duplicateRoots.get(item.id) || item.duplicateGroup
      });
      byArea.set(area, current);
    });
    byArea.forEach((items, area) => {
      if (!items.length) return;
      const confidence = items.some((item) => item.confidence === "low")
        ? "low"
        : items.some((item) => item.confidence === "medium") ? "medium" : draft.confidence;
      globallyClassified.push({
        ...draft,
        id: `${draft.id}-${area}`,
        section: area,
        confidence,
        unclassified: area === "unclassified",
        items,
        warnings: [...new Set([...draft.warnings, ...analysis.warnings])]
      });
    });
  });
  return globallyClassified;
};

const menuAreaLabel = (section: WebsiteMenuArea): string => ({
  breakfast: "das Frühstück",
  lunch: "den Mittagstisch",
  dinner: "das Abendessen",
  drinks: "die Getränkekarte"
})[section];

const structuredHeadingPattern: Record<WebsiteMenuArea, RegExp> = {
  breakfast: /fr[üu]hst[üu]ck|brunch/i,
  lunch: /mittag|lunch|tageskarte/i,
  dinner: /abend|dinner|speisekarte|hauptkarte|essen/i,
  drinks: /getr[aä]nk|drinks?|kaffee|wein|bier|cocktail/i
};

const extractStructuredHtmlMenu = (html: string, section: WebsiteMenuArea): string | null => {
  const text = textFromHtml(html);
  const startMatch = structuredHeadingPattern[section].exec(text);
  if (!startMatch || startMatch.index === undefined) return null;
  const start = startMatch.index;
  let end = text.length;
  for (const [otherSection, pattern] of Object.entries(structuredHeadingPattern) as Array<[WebsiteMenuArea, RegExp]>) {
    if (otherSection === section) continue;
    const match = new RegExp(pattern.source, pattern.flags).exec(text.slice(start + startMatch[0].length));
    if (match?.index !== undefined) {
      end = Math.min(end, start + startMatch[0].length + match.index);
    }
  }
  const areaText = text.slice(start, end).trim();
  return /\b\d{1,3}(?:[.,]\d{2})\s*(?:€|eur)\b/i.test(areaText) ? areaText.slice(0, 30000) : null;
};

const fileNameFromUrl = (url: string, contentType: string, index: number): string => {
  const pathname = new URL(url).pathname;
  const raw = decodeURIComponent(pathname.split("/").pop() || "").replace(/[^a-zA-Z0-9._-]/g, "-");
  if (raw && /\.[a-z0-9]{2,5}$/i.test(raw)) return raw.slice(0, 140);
  return `website-menu-${index + 1}${contentType.includes("pdf") ? ".pdf" : ".jpg"}`;
};

const toTime = (value: string): string | null => {
  const parts = value.replace(".", ":").split(":").map(Number);
  if (parts.length !== 2 || parts.some((part) => !Number.isInteger(part))) return null;
  const [hour, minute] = parts;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

type OpeningHoursDetection = {
  hours: WebsiteOpeningHours | null;
  notes: string[];
  recognizedDays: Set<keyof WebsiteOpeningHours>;
};

const schemaDayIndex = (value: unknown): number | null => {
  const normalized = String(value || "").split("/").pop()?.toLocaleLowerCase("en-US") || "";
  const names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const index = names.indexOf(normalized);
  return index >= 0 ? index : null;
};

const structuredOpeningSpecifications = (html: string): Array<Record<string, unknown>> => {
  const specifications: Array<Record<string, unknown>> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const entries = record.openingHoursSpecification;
    if (Array.isArray(entries)) {
      entries.forEach((entry) => {
        if (entry && typeof entry === "object") specifications.push(entry as Record<string, unknown>);
      });
    } else if (entries && typeof entries === "object") {
      specifications.push(entries as Record<string, unknown>);
    }
    Object.values(record).forEach(visit);
  };
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(decodeHtml(match[1])));
    } catch {
      // Invalid third-party JSON-LD is ignored; visible text remains available.
    }
  }
  return specifications;
};

const daysFromText = (value: string): number[] => {
  const matches = Array.from(value.toLocaleLowerCase("de-DE").matchAll(/montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|\bmo\b|\bdi\b|\bmi\b|\bdo\b|\bfr\b|\bsa\b|\bso\b/g));
  const values = new Set<number>();
  matches.forEach((match, index) => {
    const current = dayIndex.get(match[0]);
    if (current === undefined) return;
    const next = matches[index + 1];
    const between = next ? value.slice((match.index || 0) + match[0].length, next.index || 0) : "";
    const nextDay = next ? dayIndex.get(next[0]) : undefined;
    if (nextDay !== undefined && /(?:-|–|bis)/.test(between)) {
      const from = Math.min(current, nextDay);
      const to = Math.max(current, nextDay);
      for (let day = from; day <= to; day += 1) values.add(day);
    } else {
      values.add(current);
    }
  });
  return [...values];
};

const extractOpeningHours = (html: string): OpeningHoursDetection => {
  const text = textFromHtml(html);
  const hours = createOpeningHours();
  const notes: string[] = [];
  const recognizedDays = new Set<keyof WebsiteOpeningHours>();
  let foundOpenPeriod = false;
  const rangePattern = /((?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|\bmo\b|\bdi\b|\bmi\b|\bdo\b|\bfr\b|\bsa\b|\bso\b)[^0-9]{0,90}?)(\d{1,2}[.:]\d{2})\s*(?:-|–|bis|to)\s*(\d{1,2}[.:]\d{2})/gi;
  for (const match of text.matchAll(rangePattern)) {
    const openTime = toTime(match[2]);
    const closeTime = toTime(match[3]);
    if (!openTime || !closeTime) continue;
    for (const dayIndexValue of daysFromText(match[1])) {
      const day = dayKeys[dayIndexValue];
      hours[day] = { enabled: true, openTime, closeTime, openEnded: false, detected: true };
      recognizedDays.add(day);
      foundOpenPeriod = true;
    }
  }
  const openEndedPattern = /((?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|\bmo\b|\bdi\b|\bmi\b|\bdo\b|\bfr\b|\bsa\b|\bso\b)[^0-9]{0,90}?)(\d{1,2}[.:]\d{2})\s*(?:-|–|bis|to)\s*ende\b/gi;
  for (const match of text.matchAll(openEndedPattern)) {
    const openTime = toTime(match[2]);
    if (!openTime) continue;
    for (const dayIndexValue of daysFromText(match[1])) {
      // 00:00 is the internal end-of-day sentinel. openEnded keeps the original
      // website wording visible to the restaurant owner and the user app.
      const day = dayKeys[dayIndexValue];
      hours[day] = { enabled: true, openTime, closeTime: "00:00", openEnded: true, detected: true };
      recognizedDays.add(day);
      foundOpenPeriod = true;
    }
  }
  // Only accept day names that are immediately connected to "Ruhetag" or
  // "geschlossen". The previous broad match could turn "Fr/Sa bis 22:00 ...
  // Sonntag Ruhetag" into three closed days.
  const closedPattern = /((?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|\bmo\b|\bdi\b|\bmi\b|\bdo\b|\bfr\b|\bsa\b|\bso\b)(?:\s*(?:,|\/|&|und|–|-)\s*(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|\bmo\b|\bdi\b|\bmi\b|\bdo\b|\bfr\b|\bsa\b|\bso\b|feiertage))*)\s*(?:ruhetag|geschlossen)/gi;
  for (const match of text.matchAll(closedPattern)) {
    for (const dayIndexValue of daysFromText(match[1])) {
      const day = dayKeys[dayIndexValue];
      hours[day].enabled = false;
      hours[day].detected = true;
      recognizedDays.add(day);
    }
  }
  for (const specification of structuredOpeningSpecifications(html)) {
    const days = Array.isArray(specification.dayOfWeek) ? specification.dayOfWeek : [specification.dayOfWeek];
    const openTime = toTime(String(specification.opens || ""));
    const closeTime = toTime(String(specification.closes || ""));
    if (!openTime || !closeTime) continue;
    days.forEach((dayValue) => {
      const index = schemaDayIndex(dayValue);
      if (index === null) return;
      const day = dayKeys[index];
      const next = { enabled: true, openTime, closeTime, openEnded: false, detected: true };
      if (!recognizedDays.has(day)) hours[day] = next;
      recognizedDays.add(day);
      foundOpenPeriod = true;
    });
  }
  const kitchenPattern = /k[üu]chenzeiten?\s*(\d{1,2}[.:]\d{2})\s*(?:-|–|bis)\s*(\d{1,2}[.:]\d{2})(?:\s*(fr\s*\/\s*sa)\s*bis\s*(\d{1,2}[.:]\d{2}))?/i;
  const kitchenMatch = kitchenPattern.exec(text);
  if (kitchenMatch) {
    const extra = kitchenMatch[3] && kitchenMatch[4] ? ` · Fr/Sa bis ${toTime(kitchenMatch[4]) || kitchenMatch[4]}` : "";
    notes.push(`Küchenzeiten · ${toTime(kitchenMatch[1]) || kitchenMatch[1]}–${toTime(kitchenMatch[2]) || kitchenMatch[2]}${extra}`);
  }
  if (/feiertage[^.!]{0,45}(?:ruhetag|geschlossen)|(?:ruhetag|geschlossen)[^.!]{0,45}feiertage/i.test(text)) {
    notes.push("Feiertage · Ruhetag (nur Hinweis, nicht automatisch übernommen)");
  }
  return { hours: foundOpenPeriod || recognizedDays.size ? hours : null, notes, recognizedDays };
};

const mergeOpeningHoursDetections = (detections: OpeningHoursDetection[]) => {
  const hours = createOpeningHours();
  const recognizedDays = new Set<keyof WebsiteOpeningHours>();
  const conflicts: string[] = [];
  const labels: Record<keyof WebsiteOpeningHours, string> = {
    mon: "Montag", tue: "Dienstag", wed: "Mittwoch", thu: "Donnerstag", fri: "Freitag", sat: "Samstag", sun: "Sonntag"
  };
  detections.forEach((detection) => {
    if (!detection.hours) return;
    detection.recognizedDays.forEach((day) => {
      const incoming = detection.hours![day];
      if (!recognizedDays.has(day)) {
        hours[day] = { ...incoming };
        recognizedDays.add(day);
        return;
      }
      const existing = hours[day];
      if (
        existing.enabled !== incoming.enabled
        || existing.openTime !== incoming.openTime
        || existing.closeTime !== incoming.closeTime
        || Boolean(existing.openEnded) !== Boolean(incoming.openEnded)
      ) conflicts.push(`${labels[day]}: widersprüchliche Öffnungszeiten`);
    });
  });
  const unknownDays = dayKeys.filter((day) => !recognizedDays.has(day));
  const notes = [...new Set(detections.flatMap((detection) => detection.notes))];
  if (unknownDays.length) notes.push(`Nicht erkannt: ${unknownDays.map((day) => labels[day]).join(", ")}`);
  return {
    hours: [...recognizedDays].some((day) => hours[day].enabled) ? hours : null,
    notes,
    unknownDays,
    conflicts: [...new Set(conflicts)]
  };
};

export class WebsiteSyncService {
  constructor(private readonly digitalMenuService = new DigitalMenuService()) {}

  async analyze(rawUrl: unknown, onProgress: (step: string, progress: number) => Promise<void> | void, signal?: AbortSignal): Promise<WebsiteSyncResult> {
    let browser: Browser | null = null;
    try {
      const requestedWebsiteUrl = normalizeWebsiteUrl(rawUrl);
      const throwIfAborted = () => {
        if (signal?.aborted) throw new WebsiteSyncError("WEBSITE_SYNC_CANCELLED", "Die Analyse wurde abgebrochen.");
      };
      throwIfAborted();
      await onProgress("Website wird geprüft", 15);
      const rootResponse = await fetchPublic(requestedWebsiteUrl);
      const websiteUrl = canonicalUrl(rootResponse.url || requestedWebsiteUrl);
      const rootType = String(rootResponse.headers.get("content-type") || "").toLowerCase();
      if (!isHtml(rootType, websiteUrl)) throw new WebsiteSyncError("WEBSITE_NOT_HTML", "Die Website enthält keine lesbare Seite.");
      const rawRootHtml = (await readResponseBuffer(
        rootResponse,
        MAX_HTML_BYTES,
        "WEBSITE_TOO_LARGE",
        "Die Website ist zu groß für eine sichere Analyse."
      )).toString("utf-8");

      let renderedPageCount = 0;
      const renderPage = async (url: string): Promise<RenderedPage | null> => {
        if (renderedPageCount >= MAX_RENDERED_MENU_PAGES) return null;
        try {
          throwIfAborted();
          browser ??= await chromium.launch({ headless: true });
          renderedPageCount += 1;
          return await renderPublicHtml(browser, url);
        } catch {
          return null;
        }
      };
      const renderedRoot = await renderPage(websiteUrl);
      const rootBaseUrl = renderedRoot?.finalUrl ? canonicalUrl(renderedRoot.finalUrl) : websiteUrl;
      const rootHtml = renderedRoot?.html || rawRootHtml;
      const warnings: string[] = [];
      if (renderedRoot && !renderedRoot.stable) warnings.push("Dynamische Inhalte der Startseite waren beim Zeitlimit noch nicht vollständig stabil.");

      await onProgress("Öffnungszeiten werden erkannt", 32);
      const openingDetections = [extractOpeningHours(rootHtml)];
      const candidates = new Map<string, Candidate>();
      const queue: Candidate[] = [];
      const addCandidate = (candidate: Candidate) => {
        if (candidate.depth > MAX_CRAWL_DEPTH) return;
        const normalizedUrl = canonicalUrl(candidate.url);
        const key = sourceUrlIdentity(normalizedUrl);
        const normalized = { ...candidate, url: normalizedUrl };
        const existing = candidates.get(key);
        if (!existing) {
          candidates.set(key, normalized);
          queue.push(normalized);
        } else if (normalized.priority > existing.priority) {
          Object.assign(existing, normalized);
        }
      };
      extractCandidates(rawRootHtml, rootBaseUrl).forEach(addCandidate);
      if (renderedRoot?.html) extractCandidates(renderedRoot.html, rootBaseUrl).forEach(addCandidate);

      const sitemapQueue = [canonicalUrl(new URL("/sitemap.xml", rootBaseUrl).toString())];
      const seenSitemaps = new Set<string>();
      while (sitemapQueue.length && seenSitemaps.size < MAX_SITEMAPS) {
        const sitemapUrl = sitemapQueue.shift()!;
        if (seenSitemaps.has(sitemapUrl)) continue;
        seenSitemaps.add(sitemapUrl);
        try {
          const sitemapResponse = await fetchPublic(sitemapUrl);
          const sitemap = (await readResponseBuffer(sitemapResponse, MAX_HTML_BYTES, "WEBSITE_TOO_LARGE", "Die Sitemap ist zu groß.")).toString("utf-8");
          extractSitemapUrls(sitemap, rootBaseUrl).forEach((url) => {
            if (/\.xml(?:$|\?)/i.test(url)) {
              if (!seenSitemaps.has(url)) sitemapQueue.push(url);
              return;
            }
            const menuHint = isLikelyMenuReference(url);
            const hoursHint = isLikelyHoursReference(url);
            if (!menuHint && !hoursHint) return;
            addCandidate({
              url,
              section: classifyMenu(url) || "dinner",
              label: menuHint ? "Sitemap-Menüseite" : "Sitemap-Kontaktseite",
              priority: menuHint ? 120 : 90,
              source: "sitemap",
              depth: 1,
              purpose: menuHint ? "menu" : "hours"
            });
          });
        } catch {
          // Missing and blocked sitemaps do not invalidate ordinary crawling.
        }
      }

      const fileSources = new Map<string, DownloadedFile>();
      const fileUrlIdentities = new Set<string>();
      const fileHashes = new Map<string, string>();
      const htmlSources = new Map<string, HtmlMenuSource>();
      const htmlHashes = new Map<string, string>();
      let totalBytes = 0;

      const addDownloadedFile = async (url: string, response: Response, index: number, priority: number) => {
        if (fileSources.size >= MAX_WEBSITE_MENU_FILES) return;
        const finalUrl = canonicalUrl(response.url || url);
        const urlIdentity = sourceUrlIdentity(finalUrl);
        if (fileUrlIdentities.has(urlIdentity)) return;
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        if (!isMenuFile(contentType, finalUrl)) return;
        const buffer = await readResponseBuffer(response, MAX_MENU_FILE_SIZE, "WEBSITE_MENU_TOO_LARGE", "Eine Menüdatei ist größer als 10 MB.");
        if (!buffer.length) return;
        const normalized = await normalizeMenuUpload({
          buffer,
          filename: fileNameFromUrl(finalUrl, contentType, index),
          declaredMimeType: contentType
        });
        const hash = contentHash(normalized.buffer);
        if (fileHashes.has(hash)) return;
        totalBytes += normalized.buffer.length;
        if (totalBytes > MAX_MENU_BATCH_SIZE) throw new WebsiteSyncError("WEBSITE_MENU_TOO_LARGE", "Die gefundenen Menüdateien sind zusammen größer als 50 MB.");
        fileHashes.set(hash, finalUrl);
        fileUrlIdentities.add(urlIdentity);
        fileSources.set(finalUrl, { ...normalized, url: finalUrl, priority, hash });
      };

      const addHtmlSource = (url: string, html: string, priority: number, trustedMenuPage = false) => {
        const text = textFromHtml(html);
        if (!hasVisibleMenuStructure(text) && !trustedMenuPage) return;
        if (text.length < 80) return;
        const hash = contentHash(text.replace(/\s+/g, " ").toLocaleLowerCase("de-DE"));
        const existingUrl = htmlHashes.get(hash);
        if (existingUrl) {
          const existing = htmlSources.get(existingUrl);
          if (existing && priority > existing.priority) existing.priority = priority;
          return;
        }
        const canonical = canonicalUrl(url);
        const existing = htmlSources.get(canonical);
        if (!existing || priority > existing.priority) {
          if (existing) htmlHashes.delete(existing.hash);
          htmlHashes.set(hash, canonical);
          htmlSources.set(canonical, { url: canonical, text, priority, hash });
        }
      };
      addHtmlSource(rootBaseUrl, rootHtml, 100, false);

      await onProgress("Menükarten werden gesucht", 48);
      const seen = new Set<string>();
      let processedCandidates = 0;
      while (queue.length && processedCandidates < MAX_MENU_PAGE_CANDIDATES) {
        throwIfAborted();
        queue.sort((left, right) => right.priority - left.priority);
        const candidate = queue.shift()!;
        if (seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        processedCandidates += 1;
        try {
          const response = await fetchPublic(candidate.url);
          const finalUrl = canonicalUrl(response.url || candidate.url);
          const contentType = String(response.headers.get("content-type") || "").toLowerCase();
          if (isMenuFile(contentType, finalUrl)) {
            await addDownloadedFile(finalUrl, response, processedCandidates, candidate.priority);
            continue;
          }
          if (!isHtml(contentType, finalUrl)) continue;
          const rawNestedHtml = (await readResponseBuffer(
            response,
            MAX_HTML_BYTES,
            "WEBSITE_TOO_LARGE",
            "Eine Website-Unterseite ist zu groß für eine sichere Analyse."
          )).toString("utf-8");
          const renderedNested = await renderPage(finalUrl);
          const nestedBaseUrl = renderedNested?.finalUrl ? canonicalUrl(renderedNested.finalUrl) : finalUrl;
          const nestedHtml = renderedNested?.html || rawNestedHtml;
          if (renderedNested && !renderedNested.stable) warnings.push("Eine dynamische Unterseite war beim Zeitlimit noch nicht vollständig geladen.");
          const trustedMenuPage = candidate.purpose === "menu" && isLikelyMenuReference(`${candidate.label} ${candidate.url}`);
          if (candidate.purpose === "menu") addHtmlSource(nestedBaseUrl, nestedHtml, candidate.priority, trustedMenuPage);
          if (candidate.purpose === "hours" || isLikelyHoursReference(`${candidate.label} ${candidate.url}`)) {
            openingDetections.push(extractOpeningHours(nestedHtml));
          }
          extractCandidates(rawNestedHtml, nestedBaseUrl, { depth: candidate.depth, pageIsMenu: trustedMenuPage }).forEach(addCandidate);
          if (renderedNested?.html) {
            extractCandidates(renderedNested.html, nestedBaseUrl, { depth: candidate.depth, pageIsMenu: trustedMenuPage }).forEach(addCandidate);
          }
        } catch (error) {
          if (error instanceof WebsiteSyncError && error.code === "WEBSITE_MENU_TOO_LARGE") throw error;
          warnings.push(candidate.purpose === "hours"
            ? "Eine Seite mit Öffnungszeiten konnte nicht geladen werden."
            : "Eine gefundene Menüquelle konnte nicht vollständig geladen werden.");
        }
      }
      if (queue.length) warnings.push("Weitere Website-Unterseiten lagen außerhalb des sicheren Scanbudgets.");

      const openingHoursDetection = mergeOpeningHoursDetections(openingDetections);
      const openingHours = openingHoursDetection.hours;
      const openingHoursNotes = openingHoursDetection.notes;

      await onProgress("Menüs werden analysiert", 66);
      let menuSources: WebsiteMenuDraft[] = [];
      const expandedFileSources = (await Promise.all(
        [...fileSources.values()]
          .sort((a, b) => b.priority - a.priority)
          .map(splitPdfIntoAnalysisPages)
      )).flat();
      const discoveredAnalysisSources = [
        ...expandedFileSources,
        ...[...htmlSources.values()].sort((a, b) => b.priority - a.priority).flatMap((page) => (
          chunkMenuText(page.text).map((text, chunk) => ({ type: "html" as const, ...page, text, chunk }))
        ))
      ].sort((a, b) => b.priority - a.priority);
      const analysisSources = discoveredAnalysisSources.slice(0, MAX_ANALYSIS_UNITS);
      if (discoveredAnalysisSources.length > analysisSources.length) {
        warnings.push("Weitere lesbare Menüabschnitte lagen außerhalb des sicheren Analysebudgets.");
      }
      const successfulPhysicalSources = new Set<string>();
      const failedPhysicalSources = new Set<string>();
      let fallbackUses = 0;
      const analysisResults: Array<{
        drafts: WebsiteMenuDraft[];
        warnings: string[];
        sourceUrl: string;
        success: boolean;
        fallbackUses: number;
      } | undefined> = new Array(analysisSources.length);
      let nextAnalysisIndex = 0;
      let completedAnalyses = 0;
      const analyzeNextSource = async () => {
        while (true) {
          const index = nextAnalysisIndex;
          nextAnalysisIndex += 1;
          if (index >= analysisSources.length) return;
          throwIfAborted();
          const source = analysisSources[index];
          let sourceFallbackUses = 0;
          try {
            const analyze = (useFallbackModel: boolean) => source.type === "file"
              ? this.digitalMenuService.analyzeWebsiteMenuFiles(
                [{ buffer: source.buffer, filename: source.filename, mimeType: source.mimeType }],
                { useFallbackModel }
              )
              : this.digitalMenuService.analyzeWebsiteMenuText(source.text, { useFallbackModel });
            let result;
            try {
              result = await analyze(false);
            } catch (error) {
              if (!(error instanceof DigitalMenuServiceError)) throw error;
              if (source.type === "file" && source.priority < 80) throw error;
              result = await analyze(true);
              sourceFallbackUses += 1;
            }
            if (websiteAnalysisNeedsFallback(result.areas) && (source.type === "html" || source.priority >= 80)) {
              try {
                const fallback = await analyze(true);
                sourceFallbackUses += 1;
                if (websiteAnalysisScore(fallback.areas) > websiteAnalysisScore(result.areas)) result = fallback;
              } catch {
                // A fallback failure never discards a usable primary result.
              }
            }
            analysisResults[index] = {
              drafts: sourceDraftsFromAnalysis(
                `source-${index + 1}`,
                source.url,
                result.areas,
                source.type === "file" ? source.pageNumber : null
              ),
              warnings: result.warnings,
              sourceUrl: source.url,
              success: true,
              fallbackUses: sourceFallbackUses
            };
          } catch (error) {
            if (!(error instanceof DigitalMenuServiceError)) throw error;
            analysisResults[index] = {
              drafts: [],
              warnings: ["Eine gefundene Menüquelle konnte nicht analysiert werden."],
              sourceUrl: source.url,
              success: false,
              fallbackUses: sourceFallbackUses
            };
          } finally {
            completedAnalyses += 1;
            const progress = 66 + Math.floor((completedAnalyses / Math.max(1, analysisSources.length)) * 22);
            await onProgress(`Menüs werden analysiert (${completedAnalyses}/${analysisSources.length})`, progress);
          }
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(MAX_PARALLEL_ANALYSES, analysisSources.length) },
          () => analyzeNextSource()
        )
      );
      analysisResults.forEach((entry) => {
        if (!entry) return;
        menuSources.push(...entry.drafts);
        warnings.push(...entry.warnings);
        fallbackUses += entry.fallbackUses;
        if (entry.success) {
          successfulPhysicalSources.add(entry.sourceUrl);
          failedPhysicalSources.delete(entry.sourceUrl);
        } else if (!successfulPhysicalSources.has(entry.sourceUrl)) {
          failedPhysicalSources.add(entry.sourceUrl);
        }
      });

      if (menuSources.length) {
        const globalInputs: WebsiteMenuGlobalInput[] = menuSources.flatMap((draft) => draft.items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          section: item.section,
          recognizedHeading: item.recognizedHeading || draft.recognizedHeading,
          suggestedArea: draft.section === "regular" ? "dinner" : draft.section,
          confidence: item.confidence || draft.confidence
        })));
        if (globalInputs.length > 800) warnings.push("Mehr als 800 Gerichte wurden gefunden; zusätzliche Einträge bleiben bei ihrer Quellen-Zuordnung.");
        try {
          let globalAnalysis = await this.digitalMenuService.classifyWebsiteMenuItemsGlobally(globalInputs);
          if (globalAnalysisNeedsFallback(globalAnalysis, globalInputs.length)) {
            try {
              const fallback = await this.digitalMenuService.classifyWebsiteMenuItemsGlobally(globalInputs, { useFallbackModel: true });
              fallbackUses += 1;
              if (globalAnalysisScore(fallback) > globalAnalysisScore(globalAnalysis)) globalAnalysis = fallback;
            } catch {
              // Keep the complete primary classification if the stronger fallback is unavailable.
            }
          }
          menuSources = applyGlobalWebsiteClassification(menuSources, globalAnalysis);
          warnings.push(...globalAnalysis.warnings);
        } catch {
          warnings.push("Die gemeinsame Zuordnung war nicht verfügbar; die einzeln erkannten Bereiche werden angezeigt.");
        }
      }
      if (fallbackUses) warnings.push(`${fallbackUses} unsichere Analyse${fallbackUses === 1 ? " wurde" : "n wurden"} zusätzlich geprüft.`);

    const menus: WebsiteSyncResult["menus"] = {};
    for (const section of ["breakfast", "lunch", "dinner", "drinks"] as const) {
      const drafts = menuSources.filter((source) => source.section === section);
      if (!drafts.length) continue;
      menus[section] = aggregateWebsiteMenuDraft(`aggregate-${section}`, section, drafts);
    }
    const unclassifiedDrafts = menuSources.filter((source) => source.section === "unclassified");
    const unclassifiedMenu = unclassifiedDrafts.length
      ? aggregateWebsiteMenuDraft("aggregate-unclassified", "unclassified", unclassifiedDrafts)
      : undefined;
    if (!openingHours && !menuSources.length) {
      throw new WebsiteSyncError("WEBSITE_NOTHING_FOUND", "Auf der Website wurden keine Öffnungszeiten oder verwertbaren Menükarten gefunden.");
    }
    await onProgress("Entwurf ist bereit", 100);
    return {
      websiteUrl,
      scannedAt: new Date().toISOString(),
      openingHours,
      openingHoursNotes,
      openingHoursUnknownDays: openingHoursDetection.unknownDays,
      openingHoursConflicts: openingHoursDetection.conflicts,
      menus,
      unclassifiedMenu,
      menuSources,
      menuScan: {
        checkedSources: new Set(analysisSources.map((source) => source.url)).size,
        analyzedSources: successfulPhysicalSources.size,
        failedSources: failedPhysicalSources.size
      },
      warnings: [...new Set(warnings)]
    };
    } finally {
      const browserToClose = browser as Browser | null;
      if (browserToClose) await browserToClose.close().catch(() => undefined);
    }
  }
}
