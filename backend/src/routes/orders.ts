import { FastifyInstance, FastifyRequest } from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AppContext } from "../context";
import { HttpError, parseOrThrow } from "../utils/http";

const createOrderSchema = z.object({
  offerId: z.string().min(1),
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  quantity: z.coerce.number().int().positive().max(50),
  pickupTime: z.string().min(5),
  fulfillmentType: z.enum(["pickup", "dinein"])
});
const RESTAURANT_SETTINGS_DIR = path.resolve(process.cwd(), "uploads", "restaurant-settings");
const pushTokenSchema = z.object({
  token: z.string().min(8).max(400),
  platform: z.enum(["ios", "android"]),
  createdAt: z.string().optional(),
  lastSeenAt: z.string().optional()
});
const pushTokenArraySchema = z.array(pushTokenSchema);

const getSingleHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const getClientIp = (request: FastifyRequest): string | undefined => {
  const forwarded = getSingleHeaderValue(request.headers["x-forwarded-for"]);
  if (forwarded) {
    const firstForwardedIp = forwarded.split(",")[0]?.trim();
    if (firstForwardedIp) {
      return firstForwardedIp;
    }
  }

  const ip = request.ip?.trim();
  return ip || undefined;
};

const loadRestaurantPushTokens = async (restaurantId: string): Promise<string[]> => {
  const safeId = restaurantId.trim();
  if (!/^[a-zA-Z0-9-]+$/.test(safeId)) return [];
  const filePath = path.join(RESTAURANT_SETTINGS_DIR, `${safeId}.json`);
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { pushTokens?: unknown };
    const tokens = pushTokenArraySchema.safeParse(parsed?.pushTokens);
    if (!tokens.success) return [];
    const unique = new Set<string>();
    for (const entry of tokens.data) {
      if (!entry.token) continue;
      if (unique.has(entry.token)) continue;
      unique.add(entry.token);
    }
    return Array.from(unique);
  } catch {
    return [];
  }
};

export const registerOrderRoutes = (app: FastifyInstance, ctx: AppContext) => {
  app.post("/api/orders", async (request) => {
    const body = parseOrThrow(createOrderSchema, request.body);
    const deviceId = getSingleHeaderValue(request.headers["x-device-id"]);
    const requestIp = getClientIp(request);

    try {
      const createdOrder = await ctx.orderService.createOrder({
        offerId: body.offerId,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        quantity: body.quantity,
        pickupTime: body.pickupTime,
        fulfillmentType: body.fulfillmentType,
        deviceId,
        requestIp
      });

      try {
        const [offer, restaurant] = await Promise.all([
          ctx.offerRepo.findById(createdOrder.offerId),
          ctx.restaurantRepo.findById(createdOrder.restaurantId)
        ]);

        if (restaurant) {
          void ctx.emailService
            .sendOrderReceived({
              customerEmail: createdOrder.customerEmail,
              customerName: createdOrder.customerName,
              restaurantName: restaurant.name,
              offerTitle: offer?.title || "Vorbestellung",
              quantity: createdOrder.quantity,
              pickupTimeIso: createdOrder.pickupTime,
              fulfillmentType: createdOrder.fulfillmentType
            })
            .catch((error) => {
              request.log.error(
                { error, orderId: createdOrder.id, restaurantId: createdOrder.restaurantId },
                "failed to send order received email"
              );
            });

          const pushTokens = await loadRestaurantPushTokens(createdOrder.restaurantId);
          if (pushTokens.length) {
            void ctx.pushService
              .sendToTokens(pushTokens, {
                title: "Neue Vorbestellung",
                body: `${createdOrder.customerName} · ${createdOrder.quantity}x ${offer?.title || "Angebot"}`,
                data: {
                  type: "order_created",
                  orderId: createdOrder.id,
                  restaurantId: createdOrder.restaurantId
                }
              })
              .catch((error) => {
                request.log.error(
                  { error, orderId: createdOrder.id, restaurantId: createdOrder.restaurantId },
                  "failed to send push notification for order"
                );
              });
          }
        }
      } catch (error) {
        request.log.error(
          { error, orderId: createdOrder.id, restaurantId: createdOrder.restaurantId },
          "post-order side effects failed"
        );
      }

      return createdOrder;
    } catch (error) {
      if (error instanceof Error && error.message === "OFFER_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Offer not found");
      }
      if (error instanceof Error && error.message === "OFFER_INACTIVE") {
        throw new HttpError(400, "OFFER_INACTIVE", "Offer is inactive");
      }
      if (error instanceof Error && error.message === "PREORDER_DISABLED") {
        throw new HttpError(400, "PREORDER_DISABLED", "Preorder disabled");
      }
      if (error instanceof Error && error.message === "INVALID_TIME") {
        throw new HttpError(400, "INVALID_TIME", "Invalid pickup time");
      }
      if (error instanceof Error && error.message === "DUPLICATE_ORDER") {
        throw new HttpError(409, "DUPLICATE_ORDER", "Duplicate order detected");
      }
      if (error instanceof Error && error.message === "TOO_MANY_REQUESTS") {
        throw new HttpError(
          429,
          "TOO_MANY_REQUESTS",
          "Too many requests. Please try again in a few minutes."
        );
      }
      throw error;
    }
  });
};
