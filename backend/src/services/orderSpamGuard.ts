type SpamCheckInput = {
  restaurantId: string;
  email: string;
  deviceId?: string;
  ip?: string;
  offerId: string;
  quantity: number;
  pickupTimeIso: string;
  fulfillmentType: "pickup" | "dinein";
};

export type SpamCheckResult =
  | { allowed: true; suspiciousIp: boolean }
  | { allowed: false; reason: "DUPLICATE_ORDER" | "TOO_MANY_REQUESTS" };

type SlidingBucket = Map<string, number[]>;

const DEFAULTS = {
  duplicateWindowMs: 2 * 60 * 1000,
  deviceWindowMs: 10 * 60 * 1000,
  emailWindowMs: 24 * 60 * 60 * 1000,
  ipWindowMs: 60 * 60 * 1000,
  deviceLimit: 5,
  emailLimit: 7,
  ipSoftLimit: 15,
  temporaryBlockMs: 15 * 60 * 1000,
  maxKeysPerBucket: 50000
} as const;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export class OrderSpamGuard {
  private readonly duplicateWindowMs = parsePositiveInt(
    process.env.ORDER_DUPLICATE_WINDOW_MS,
    DEFAULTS.duplicateWindowMs
  );

  private readonly deviceWindowMs = parsePositiveInt(
    process.env.ORDER_DEVICE_WINDOW_MS,
    DEFAULTS.deviceWindowMs
  );

  private readonly emailWindowMs = parsePositiveInt(
    process.env.ORDER_EMAIL_WINDOW_MS,
    DEFAULTS.emailWindowMs
  );

  private readonly ipWindowMs = parsePositiveInt(
    process.env.ORDER_IP_WINDOW_MS,
    DEFAULTS.ipWindowMs
  );

  private readonly deviceLimit = parsePositiveInt(
    process.env.ORDER_DEVICE_LIMIT,
    DEFAULTS.deviceLimit
  );

  private readonly emailLimit = parsePositiveInt(
    process.env.ORDER_EMAIL_LIMIT,
    DEFAULTS.emailLimit
  );

  private readonly ipSoftLimit = parsePositiveInt(
    process.env.ORDER_IP_SOFT_LIMIT,
    DEFAULTS.ipSoftLimit
  );

  private readonly temporaryBlockMs = parsePositiveInt(
    process.env.ORDER_TEMP_BLOCK_MS,
    DEFAULTS.temporaryBlockMs
  );

  private readonly maxKeysPerBucket = parsePositiveInt(
    process.env.ORDER_SPAM_MAX_KEYS,
    DEFAULTS.maxKeysPerBucket
  );

  private readonly duplicates: SlidingBucket = new Map();
  private readonly deviceOrders: SlidingBucket = new Map();
  private readonly emailOrders: SlidingBucket = new Map();
  private readonly ipOrders: SlidingBucket = new Map();
  private readonly blockedUntil = new Map<string, number>();

  evaluate(input: SpamCheckInput, now = Date.now()): SpamCheckResult {
    const email = this.normalizeEmail(input.email);
    const deviceId = this.normalizeIdentifier(input.deviceId);
    const ip = this.normalizeIdentifier(input.ip);
    const duplicateKey = this.buildDuplicateKey({
      ...input,
      email
    });

    if (this.hasRecentDuplicate(duplicateKey, now)) {
      return { allowed: false, reason: "DUPLICATE_ORDER" };
    }

    const emailKey = this.joinKey(email, input.restaurantId);
    if (this.isBlocked(`email:${emailKey}`, now)) {
      return { allowed: false, reason: "TOO_MANY_REQUESTS" };
    }

    if (this.limitExceeded(this.emailOrders, emailKey, this.emailWindowMs, this.emailLimit, now)) {
      this.setTemporaryBlock(`email:${emailKey}`, now);
      return { allowed: false, reason: "TOO_MANY_REQUESTS" };
    }

    if (deviceId) {
      const deviceKey = this.joinKey(deviceId, input.restaurantId);
      if (this.isBlocked(`device:${deviceKey}`, now)) {
        return { allowed: false, reason: "TOO_MANY_REQUESTS" };
      }

      if (
        this.limitExceeded(
          this.deviceOrders,
          deviceKey,
          this.deviceWindowMs,
          this.deviceLimit,
          now
        )
      ) {
        this.setTemporaryBlock(`device:${deviceKey}`, now);
        return { allowed: false, reason: "TOO_MANY_REQUESTS" };
      }
    }

    const suspiciousIp = ip
      ? this.readRecentEvents(this.ipOrders, this.joinKey(ip, input.restaurantId), this.ipWindowMs, now)
          .length >= this.ipSoftLimit
      : false;

    return { allowed: true, suspiciousIp };
  }

  recordAccepted(input: SpamCheckInput, now = Date.now()): void {
    const email = this.normalizeEmail(input.email);
    const deviceId = this.normalizeIdentifier(input.deviceId);
    const ip = this.normalizeIdentifier(input.ip);

    this.pushEvent(
      this.duplicates,
      this.buildDuplicateKey({ ...input, email }),
      this.duplicateWindowMs,
      now
    );
    this.pushEvent(
      this.emailOrders,
      this.joinKey(email, input.restaurantId),
      this.emailWindowMs,
      now
    );
    if (deviceId) {
      this.pushEvent(
        this.deviceOrders,
        this.joinKey(deviceId, input.restaurantId),
        this.deviceWindowMs,
        now
      );
    }
    if (ip) {
      this.pushEvent(
        this.ipOrders,
        this.joinKey(ip, input.restaurantId),
        this.ipWindowMs,
        now
      );
    }
  }

  private hasRecentDuplicate(key: string, now: number): boolean {
    return this.readRecentEvents(this.duplicates, key, this.duplicateWindowMs, now).length > 0;
  }

  private limitExceeded(
    bucket: SlidingBucket,
    key: string,
    windowMs: number,
    limit: number,
    now: number
  ): boolean {
    return this.readRecentEvents(bucket, key, windowMs, now).length >= limit;
  }

  private readRecentEvents(
    bucket: SlidingBucket,
    key: string,
    windowMs: number,
    now: number
  ): number[] {
    const current = bucket.get(key);
    if (!current || current.length === 0) {
      bucket.delete(key);
      return [];
    }

    const threshold = now - windowMs;
    const next = current.filter((ts) => ts > threshold);
    if (next.length > 0) {
      bucket.set(key, next);
    } else {
      bucket.delete(key);
    }
    return next;
  }

  private pushEvent(bucket: SlidingBucket, key: string, windowMs: number, now: number): void {
    const current = this.readRecentEvents(bucket, key, windowMs, now);
    current.push(now);
    bucket.set(key, current);
    this.ensureCapacity(bucket);
  }

  private isBlocked(key: string, now: number): boolean {
    const until = this.blockedUntil.get(key);
    if (!until) return false;
    if (until <= now) {
      this.blockedUntil.delete(key);
      return false;
    }
    return true;
  }

  private setTemporaryBlock(key: string, now: number): void {
    this.blockedUntil.set(key, now + this.temporaryBlockMs);
  }

  private buildDuplicateKey(input: SpamCheckInput & { email: string }): string {
    const pickupDate = new Date(input.pickupTimeIso);
    const pickupKey = Number.isNaN(pickupDate.getTime())
      ? input.pickupTimeIso
      : pickupDate.toISOString().slice(0, 16);

    return [
      input.restaurantId,
      input.email,
      input.offerId,
      input.quantity,
      input.fulfillmentType,
      pickupKey
    ].join("|");
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeIdentifier(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, 120);
  }

  private joinKey(left: string, right: string): string {
    return `${left}|${right}`;
  }

  private ensureCapacity(bucket: SlidingBucket): void {
    if (bucket.size <= this.maxKeysPerBucket) return;

    // Map keeps insertion order; remove oldest keys first.
    const toRemove = bucket.size - this.maxKeysPerBucket;
    let removed = 0;
    for (const key of bucket.keys()) {
      bucket.delete(key);
      removed += 1;
      if (removed >= toRemove) break;
    }
  }
}
