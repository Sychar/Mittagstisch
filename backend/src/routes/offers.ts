import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppContext } from "../context";
import { HttpError, parseOrThrow } from "../utils/http";

const mealSlotSchema = z.enum(["breakfast", "lunch", "dinner"]);

const offersQuerySchema = z.object({
  postalCode: z.string().min(4),
  radiusKm: z.coerce.number().positive().max(50).optional(),
  mealSlot: mealSlotSchema.optional()
});

const offerDetailQuerySchema = z.object({
  postalCode: z.string().min(4).optional()
});

export const registerOfferRoutes = (app: FastifyInstance, ctx: AppContext) => {
  app.get("/api/offers", async (request) => {
    const query = parseOrThrow(offersQuerySchema, request.query);
    const radiusKm = query.radiusKm ?? Number(process.env.DEFAULT_RADIUS_KM ?? 10);

    try {
      return await ctx.offerService.listOffersNear(query.postalCode, radiusKm, query.mealSlot);
    } catch (error) {
      if (error instanceof Error && error.message === "POSTAL_CODE_UNKNOWN") {
        throw new HttpError(400, "POSTAL_CODE_UNKNOWN", "Unknown postal code");
      }
      throw error;
    }
  });

  app.get("/api/offers/:id", async (request) => {
    const query = parseOrThrow(offerDetailQuerySchema, request.query);
    const { id } = request.params as { id: string };

    try {
      const result = await ctx.offerService.getOfferWithRestaurant(id, query.postalCode);
      if (!result) {
        throw new HttpError(404, "NOT_FOUND", "Offer not found");
      }
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "POSTAL_CODE_UNKNOWN") {
        throw new HttpError(400, "POSTAL_CODE_UNKNOWN", "Unknown postal code");
      }
      throw error;
    }
  });
};
