import { randomUUID } from "node:crypto";
import { OfferRepo } from "../repositories/offerRepo";
import { OrderRepo } from "../repositories/orderRepo";
import { Order, OrderStatus, OrderWithOffer } from "../types";
import { OrderSpamGuard } from "./orderSpamGuard";

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
    const orders = await this.orderRepo.listByRestaurant(restaurantId);
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

    const updated = await this.orderRepo.updateStatus(orderId, status);
    if (!updated) {
      throw new Error("ORDER_NOT_FOUND");
    }
    return updated;
  }
}
