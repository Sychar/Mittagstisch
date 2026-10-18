import { randomUUID } from "node:crypto";
import { OfferRepo } from "../repositories/offerRepo";
import { OrderRepo } from "../repositories/orderRepo";
import { Order, OrderStatus, OrderWithOffer } from "../types";
import { OrderSpamGuard } from "./orderSpamGuard";

const FINAL_ORDER_STATUSES = new Set<OrderStatus>(["confirmed", "cancelled"]);
const AUTO_ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000;
const ORDER_DAY_TIMEZONE = "Europe/Berlin";

const toDateKeyInTimeZone = (iso: string, timeZone: string): string | null => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
};

export class OrderService {
  constructor(
    private orderRepo: OrderRepo,
    private offerRepo: OfferRepo,
    private spamGuard: OrderSpamGuard = new OrderSpamGuard()
  ) {}

  async createOrder(input: {
    offerId: string;
    customerName: string;
    customerEmail: string;
    quantity: number;
    pickupTime: string;
    fulfillmentType: Order["fulfillmentType"];
    deviceId?: string;
    requestIp?: string;
  }): Promise<Order> {
    const offer = await this.offerRepo.findById(input.offerId);
    if (!offer) {
      throw new Error("OFFER_NOT_FOUND");
    }
    if (!offer.active) {
      throw new Error("OFFER_INACTIVE");
    }
    if (!offer.preorderEnabled) {
      throw new Error("PREORDER_DISABLED");
    }

    const pickup = new Date(input.pickupTime);
    if (Number.isNaN(pickup.getTime())) {
      throw new Error("INVALID_TIME");
    }

    const normalizedEmail = input.customerEmail.trim().toLowerCase();
    const spamInput = {
      restaurantId: offer.restaurantId,
      email: normalizedEmail,
      deviceId: input.deviceId,
      ip: input.requestIp,
      offerId: offer.id,
      quantity: input.quantity,
      pickupTimeIso: pickup.toISOString(),
      fulfillmentType: input.fulfillmentType
    } as const;

    let spamResult: ReturnType<OrderSpamGuard["evaluate"]> = {
      allowed: true,
      suspiciousIp: false
    };

    try {
      spamResult = this.spamGuard.evaluate(spamInput);
    } catch {
      // Fail-open: guard problems must not block legitimate users.
      spamResult = { allowed: true, suspiciousIp: false };
    }

    if (!spamResult.allowed) {
      throw new Error(spamResult.reason);
    }

    const order: Order = {
      id: randomUUID(),
      offerId: offer.id,
      restaurantId: offer.restaurantId,
      customerName: input.customerName,
      customerEmail: normalizedEmail,
      quantity: input.quantity,
      pickupTime: pickup.toISOString(),
      fulfillmentType: input.fulfillmentType,
      deviceId: input.deviceId,
      requestIp: input.requestIp,
      status: "pending",
      statusUpdatedAt: undefined,
      archivedAt: undefined,
      createdAt: new Date().toISOString()
    };

    const createdOrder = await this.orderRepo.create(order);

    try {
      this.spamGuard.recordAccepted(spamInput);
    } catch {
      // Guard bookkeeping must not break successful orders.
    }

    return createdOrder;
  }

  async listByRestaurant(restaurantId: string): Promise<OrderWithOffer[]> {
    await this.autoArchiveExpiredFinalOrders(restaurantId);

    const todayKey = toDateKeyInTimeZone(new Date().toISOString(), ORDER_DAY_TIMEZONE);
    const orders = (await this.orderRepo.listByRestaurant(restaurantId)).filter((order) => {
      if (order.archivedAt) return false;
      if (!todayKey) return true;
      const pickupDayKey = toDateKeyInTimeZone(order.pickupTime, ORDER_DAY_TIMEZONE);
      return pickupDayKey === todayKey;
    });
    const results: OrderWithOffer[] = [];

    for (const order of orders) {
      const offer = await this.offerRepo.findById(order.offerId);
      if (!offer) continue;
      results.push({
        ...order,
        offer: {
          id: offer.id,
          title: offer.title,
          price: offer.price
        }
      });
    }

    return results;
  }

  async updateStatus(
    restaurantId: string,
    orderId: string,
    status: OrderStatus
  ): Promise<Order> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }
    if (order.restaurantId !== restaurantId) {
      throw new Error("FORBIDDEN");
    }
    if (order.archivedAt) {
      throw new Error("ORDER_ARCHIVED");
    }
    if (order.status === status) {
      return order;
    }

    const statusUpdatedAt = FINAL_ORDER_STATUSES.has(status)
      ? new Date().toISOString()
      : undefined;
    const updated = await this.orderRepo.updateStatus(orderId, status, statusUpdatedAt);
    if (!updated) {
      throw new Error("ORDER_NOT_FOUND");
    }
    return updated;
  }

  async archiveOrder(restaurantId: string, orderId: string): Promise<Order> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }
    if (order.restaurantId !== restaurantId) {
      throw new Error("FORBIDDEN");
    }
    if (order.archivedAt) {
      return order;
    }
    if (!FINAL_ORDER_STATUSES.has(order.status)) {
      throw new Error("ORDER_NOT_FINAL");
    }

    const archived = await this.orderRepo.archive(orderId, new Date().toISOString());
    if (!archived) {
      throw new Error("ORDER_NOT_FOUND");
    }
    return archived;
  }

  private async autoArchiveExpiredFinalOrders(restaurantId: string): Promise<void> {
    const nowMs = Date.now();
    const orders = await this.orderRepo.listByRestaurant(restaurantId);

    for (const order of orders) {
      if (order.archivedAt) continue;
      if (!FINAL_ORDER_STATUSES.has(order.status)) continue;

      const referenceIso = order.statusUpdatedAt || order.pickupTime;
      const referenceMs = Date.parse(referenceIso);
      if (!Number.isFinite(referenceMs)) continue;
      if (referenceMs + AUTO_ARCHIVE_AFTER_MS > nowMs) continue;

      await this.orderRepo.archive(order.id, new Date(nowMs).toISOString());
    }
  }
}
