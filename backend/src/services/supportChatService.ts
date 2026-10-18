import { PrismaClient, RestaurantSupportMessageRole } from "@prisma/client";
import { randomUUID } from "node:crypto";

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
  /\/+$/,
  ""
);
const SUPPORT_TIMEOUT_MS = 45_000;
const SUPPORT_HISTORY_LIMIT = 50;
const SUPPORT_CONTEXT_LIMIT = 12;
const SUPPORT_RATE_LIMIT_PER_HOUR = 20;
const SUPPORT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const knowledgeArticles = [
  {
    slug: "menu-ai",
    title: "Menü mit KI erstellen",
    keywords: "menü ki foto bild pdf scannen speisekarte erstellen",
    content:
      "Öffne Mein Menü, wähle Speisekarte oder Mittagstisch und tippe auf Karte erstellen. Wähle Foto, Galerie, Kamera oder PDF. Nach der Analyse kannst du jedes Gericht prüfen und speichern."
  },
  {
    slug: "manual-dish",
    title: "Gericht manuell hinzufügen",
    keywords: "gericht manuell hinzufügen eintragen preis allergene kategorie",
    content:
      "Öffne Mein Menü und danach Speisekarte oder Mittagstisch. Tippe auf Gericht hinzufügen, trage Name, Preis und Beschreibung ein und speichere das Gericht."
  },
  {
    slug: "offers",
    title: "Angebot erstellen",
    keywords: "angebot erstellen preis aktiv mittag angebot des tages",
    content:
      "Öffne Meine Angebote, dann Angebot erstellen. Gib Titel, Preis, Beschreibung und Bereich ein. Nach dem Speichern kann das Angebot aktiviert oder später bearbeitet werden."
  },
  {
    slug: "lunch",
    title: "Mittagstisch erstellen",
    keywords: "mittagstisch mittagskarte tage wochentag gültigkeit erstellen",
    content:
      "Öffne Mein Menü, wähle Mittagstisch und tippe auf Karte erstellen. Lade die Karte hoch oder füge Gerichte manuell hinzu. Lege danach bei Bedarf Gültigkeit oder Wochentage fest."
  },
  {
    slug: "visibility",
    title: "Restaurant besser sichtbar machen",
    keywords: "sichtbar profil öffnungszeiten adresse logo beschreibung geöffnet",
    content:
      "Pflege in Einstellungen Profil dein Logo, die Beschreibung, Adresse und Telefonnummer. Unter Sichtbarkeit hinterlegst du Art und Öffnungszeiten. Aktive Angebote und ein gepflegter Mittagstisch verbessern die Sichtbarkeit zusätzlich."
  }
] as const;

type SupportActionTarget = "myMenu" | "offers" | "settings" | "lunch" | null;

export type SupportChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  title?: string;
  steps?: string[];
  action?: { label: string; target: Exclude<SupportActionTarget, null> };
  handoffSuggested?: boolean;
  createdAt: string;
};

type AssistantReply = {
  content: string;
  title?: string;
  steps?: string[];
  action?: { label: string; target: Exclude<SupportActionTarget, null> };
  handoffSuggested: boolean;
};

export class SupportChatServiceError extends Error {
  constructor(
    public readonly code: "SUPPORT_CHAT_UNAVAILABLE" | "SUPPORT_RATE_LIMIT" | "SUPPORT_CHAT_FAILED",
    message: string
  ) {
    super(message);
  }
}

const truncate = (value: string, limit: number): string => value.trim().slice(0, limit);

const parseSteps = (value: string | null): string[] | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    const steps = parsed
      .map((entry) => truncate(String(entry || ""), 500))
      .filter(Boolean)
      .slice(0, 6);
    return steps.length ? steps : undefined;
  } catch {
    return undefined;
  }
};

const toMessage = (message: {
  id: string;
  role: RestaurantSupportMessageRole;
  content: string;
  title: string | null;
  stepsJson: string | null;
  actionTarget: string | null;
  actionLabel: string | null;
  handoffSuggested: boolean;
  createdAt: Date;
}): SupportChatMessage => {
  const target = ["myMenu", "offers", "settings", "lunch"].includes(message.actionTarget || "")
    ? (message.actionTarget as Exclude<SupportActionTarget, null>)
    : null;
  return {
    id: message.id,
    role: message.role === RestaurantSupportMessageRole.assistant ? "assistant" : "user",
    content: message.content,
    ...(message.title ? { title: message.title } : {}),
    ...(parseSteps(message.stepsJson) ? { steps: parseSteps(message.stepsJson) } : {}),
    ...(target && message.actionLabel
      ? { action: { target, label: message.actionLabel } }
      : {}),
    ...(message.handoffSuggested ? { handoffSuggested: true } : {}),
    createdAt: message.createdAt.toISOString()
  };
};

const fetchWithTimeout = async (url: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPPORT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new SupportChatServiceError(
        "SUPPORT_CHAT_FAILED",
        "Der Assistent antwortet gerade zu langsam. Bitte erneut versuchen."
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const extractOutputText = (payload: Record<string, unknown>): string => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }
  return "";
};

const parseAssistantReply = (value: string): AssistantReply => {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  const title = truncate(String(parsed.title || ""), 120);
  const content = truncate(String(parsed.content || ""), 800);
  const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
  const steps = rawSteps
    .map((step) => truncate(String(step || ""), 500))
    .filter(Boolean)
    .slice(0, 6);
  const rawAction = parsed.action && typeof parsed.action === "object"
    ? (parsed.action as Record<string, unknown>)
    : null;
  const rawTarget = String(rawAction?.target || "");
  const target = ["myMenu", "offers", "settings", "lunch"].includes(rawTarget)
    ? (rawTarget as Exclude<SupportActionTarget, null>)
    : null;
  const actionLabel = truncate(String(rawAction?.label || ""), 60);

  if (!content && !steps.length) {
    throw new Error("Leere Assistenten-Antwort");
  }

  return {
    content: content || "So gehst du vor:",
    ...(title ? { title } : {}),
    ...(steps.length ? { steps } : {}),
    ...(target && actionLabel ? { action: { target, label: actionLabel } } : {}),
    handoffSuggested: parsed.handoffSuggested === true
  };
};

export class SupportChatService {
  private lastCleanupAt = 0;
  private readonly model: string;
  private readonly fallbackModel: string;

  constructor(private readonly prisma: PrismaClient | null) {
    this.model = process.env.OPENAI_SUPPORT_MODEL || process.env.OPENAI_MENU_MODEL || "gpt-4.1-mini";
    this.fallbackModel = process.env.OPENAI_SUPPORT_FALLBACK_MODEL || "gpt-4.1-mini";
  }

  async getMessages(restaurantId: string): Promise<SupportChatMessage[]> {
    const prisma = this.requirePrisma();
    await this.cleanupExpiredMessages();
    const conversation = await this.ensureConversation(restaurantId);
    const messages = await prisma.restaurantSupportMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: SUPPORT_HISTORY_LIMIT
    });
    return messages.reverse().map(toMessage);
  }

  async sendMessage(restaurantId: string, rawMessage: string): Promise<SupportChatMessage> {
    const prisma = this.requirePrisma();
    const message = truncate(rawMessage, 2_000);
    if (message.length < 2) {
      throw new SupportChatServiceError("SUPPORT_CHAT_FAILED", "Bitte schreibe eine kurze Frage.");
    }

    await this.cleanupExpiredMessages();
    await this.seedKnowledgeArticles();
    const conversation = await this.ensureConversation(restaurantId);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const sentThisHour = await prisma.restaurantSupportMessage.count({
      where: {
        conversationId: conversation.id,
        role: RestaurantSupportMessageRole.user,
        createdAt: { gte: oneHourAgo }
      }
    });
    if (sentThisHour >= SUPPORT_RATE_LIMIT_PER_HOUR) {
      throw new SupportChatServiceError(
        "SUPPORT_RATE_LIMIT",
        "Du hast viele Nachrichten gesendet. Bitte versuche es in einer Stunde erneut oder schreibe dem Team."
      );
    }

    const recent = await prisma.restaurantSupportMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: SUPPORT_CONTEXT_LIMIT
    });
    const articles = await this.findRelevantArticles(message);
    const reply = await this.askAssistant(message, recent.reverse().map(toMessage), articles);

    const assistantMessage = await prisma.$transaction(async (transaction) => {
      await transaction.restaurantSupportMessage.create({
        data: {
          id: randomUUID(),
          conversationId: conversation.id,
          role: RestaurantSupportMessageRole.user,
          content: message
        }
      });
      return transaction.restaurantSupportMessage.create({
        data: {
          id: randomUUID(),
          conversationId: conversation.id,
          role: RestaurantSupportMessageRole.assistant,
          content: reply.content,
          title: reply.title || null,
          stepsJson: reply.steps?.length ? JSON.stringify(reply.steps) : null,
          actionTarget: reply.action?.target || null,
          actionLabel: reply.action?.label || null,
          handoffSuggested: reply.handoffSuggested
        }
      });
    });

    return toMessage(assistantMessage);
  }

  private requirePrisma(): PrismaClient {
    if (!this.prisma) {
      throw new SupportChatServiceError(
        "SUPPORT_CHAT_UNAVAILABLE",
        "Der Assistent ist gerade nicht verfügbar. Bitte schreibe unserem Team."
      );
    }
    return this.prisma;
  }

  private async ensureConversation(restaurantId: string) {
    const prisma = this.requirePrisma();
    return prisma.restaurantSupportConversation.upsert({
      where: { restaurantId },
      update: {},
      create: { id: randomUUID(), restaurantId }
    });
  }

  private async cleanupExpiredMessages(): Promise<void> {
    if (Date.now() - this.lastCleanupAt < 6 * 60 * 60 * 1000) return;
    this.lastCleanupAt = Date.now();
    const prisma = this.requirePrisma();
    await prisma.restaurantSupportMessage.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - SUPPORT_RETENTION_MS) } }
    });
  }

  private async seedKnowledgeArticles(): Promise<void> {
    const prisma = this.requirePrisma();
    await Promise.all(
      knowledgeArticles.map((article) =>
        prisma.supportKnowledgeArticle.upsert({
          where: { slug: article.slug },
          update: {
            title: article.title,
            keywords: article.keywords,
            content: article.content,
            active: true
          },
          create: { id: randomUUID(), ...article, active: true }
        })
      )
    );
  }

  private async findRelevantArticles(question: string) {
    const prisma = this.requirePrisma();
    const articles = await prisma.supportKnowledgeArticle.findMany({
      where: { active: true },
      orderBy: { title: "asc" }
    });
    const terms = question.toLocaleLowerCase("de-DE").split(/[^a-z0-9äöüß]+/).filter((term) => term.length >= 3);
    return articles
      .map((article) => ({
        ...article,
        score: terms.reduce(
          (total, term) => total + (article.keywords.toLocaleLowerCase("de-DE").includes(term) ? 1 : 0),
          0
        )
      }))
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "de"))
      .slice(0, 3);
  }

  private async askAssistant(
    question: string,
    history: SupportChatMessage[],
    articles: Array<{ title: string; content: string }>
  ): Promise<AssistantReply> {
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      throw new SupportChatServiceError(
        "SUPPORT_CHAT_UNAVAILABLE",
        "Der Assistent ist gerade nicht verfügbar. Bitte schreibe unserem Team."
      );
    }

    const context = history
      .map((entry) => `${entry.role === "user" ? "Restaurant" : "Assistent"}: ${entry.content}`)
      .join("\n");
    const knowledge = articles.length
      ? articles.map((article) => `## ${article.title}\n${article.content}`).join("\n\n")
      : "Keine passende Hilfe gefunden.";
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        steps: { type: "array", items: { type: "string" } },
        action: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            target: { type: "string", enum: ["myMenu", "offers", "settings", "lunch", ""] }
          },
          required: ["label", "target"]
        },
        handoffSuggested: { type: "boolean" }
      },
      required: ["title", "content", "steps", "action", "handoffSuggested"]
    } as const;
    const system = [
      "Du bist der Nah&Fein Assistent fuer Restaurantbetreiber.",
      "Antworte immer auf Deutsch, kurz, konkret und freundlich.",
      "Hilf nur bei Menü mit KI, manuellen Gerichten, Angeboten, Mittagstisch, Profil, Öffnungszeiten und Sichtbarkeit.",
      "Erfinde keine Funktionen, Preise oder Daten. Frage nicht nach Passwörtern oder Zugangsdaten.",
      "Bei persönlichen Konten, Zahlungen, Fehlern, unklaren Problemen oder allem ausserhalb der Wissensbasis: handoffSuggested true und content 'Unser Team kann dir dabei besser helfen.'.",
      "Nutze bei passenden Anleitungen maximal fünf nummerierbare Schritte.",
      "Nur dann eine action setzen, wenn der passende Bereich sicher ist. Sonst label und target leer lassen.",
      `Wissensbasis:\n${knowledge}`,
      context ? `Letzte Unterhaltung:\n${context}` : ""
    ].filter(Boolean).join("\n\n");

    const models = Array.from(new Set([this.model, this.fallbackModel].filter(Boolean)));
    let lastError = "Der Assistent konnte gerade nicht antworten.";
    for (const model of models) {
      try {
        const response = await fetchWithTimeout(`${OPENAI_BASE_URL}/responses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            text: { format: { type: "json_schema", name: "restaurant_support_reply", strict: true, schema } },
            input: [
              { role: "system", content: [{ type: "input_text", text: system }] },
              { role: "user", content: [{ type: "input_text", text: question }] }
            ]
          })
        });
        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          lastError = String((payload.error as Record<string, unknown> | undefined)?.message || lastError);
          continue;
        }
        const text = extractOutputText(payload);
        if (!text) {
          lastError = "Der Assistent hat keine Antwort geliefert.";
          continue;
        }
        return parseAssistantReply(text);
      } catch (error) {
        if (error instanceof SupportChatServiceError) throw error;
        lastError = error instanceof Error ? error.message : lastError;
      }
    }
    throw new SupportChatServiceError("SUPPORT_CHAT_FAILED", `${lastError} Erneut versuchen.`);
  }
}
