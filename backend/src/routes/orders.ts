import { FastifyInstance, FastifyRequest } from "fastify";
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

export const registerOrderRoutes = (app: FastifyInstance, ctx: AppContext) => {
  app.post("/api/orders", async (request) => {
    const body = parseOrThrow(createOrderSchema, request.body);
    const deviceId = getSingleHeaderValue(request.headers["x-device-id"]);
    const requestIp = getClientIp(request);

    try {
      return await ctx.orderService.createOrder({
        offerId: body.offerId,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        quantity: body.quantity,
        pickupTime: body.pickupTime,
        fulfillmentType: body.fulfillmentType,
        deviceId,
        requestIp
      });
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
