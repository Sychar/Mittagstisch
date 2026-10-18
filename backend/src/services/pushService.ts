type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoPushMessage = {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

const chunk = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
};

export class PushService {
  private readonly accessToken: string;

  constructor() {
    this.accessToken = String(process.env.EXPO_ACCESS_TOKEN || "").trim();
  }

  static isExpoPushToken(value: unknown): value is string {
    const token = String(value || "").trim();
    return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
  }

  async sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
    const uniqueTokens = Array.from(
      new Set(tokens.map((entry) => String(entry || "").trim()).filter((entry) => PushService.isExpoPushToken(entry)))
    );
    if (!uniqueTokens.length) return;

    const messages: ExpoPushMessage[] = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data
    }));

    for (const batch of chunk(messages, CHUNK_SIZE)) {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {})
        },
        body: JSON.stringify(batch)
      });

      if (!response.ok) {
        throw new Error(`PUSH_REQUEST_FAILED:${response.status}`);
      }

      const payload = (await response.json().catch(() => null)) as
        | {
            errors?: Array<{ code?: string; message?: string }>;
          }
        | null;
      if (payload?.errors?.length) {
        throw new Error(payload.errors[0]?.message || payload.errors[0]?.code || "PUSH_FAILED");
      }
    }
  }
}

