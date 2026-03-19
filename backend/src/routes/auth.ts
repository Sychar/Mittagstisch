import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppContext } from "../context";
import { HttpError, parseOrThrow } from "../utils/http";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const registerAuthRoutes = (app: FastifyInstance, ctx: AppContext) => {
  app.post("/api/auth/login", async (request) => {
    const body = parseOrThrow(loginSchema, request.body);
    try {
      const result = await ctx.restaurantService.authenticate(body.email, body.password);
      if (!result) {
        throw new HttpError(401, "INVALID_CREDENTIALS", "Login failed");
      }

      return {
        token: result.session.token,
        restaurant: result.restaurant
      };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      if (error instanceof Error && error.message === "PENDING_APPROVAL") {
        throw new HttpError(
          403,
          "PENDING_APPROVAL",
          "Registration is pending admin approval"
        );
      }
      if (error instanceof Error && error.message === "REJECTED") {
        throw new HttpError(
          403,
          "REGISTRATION_REJECTED",
          "Registration was rejected by admin"
        );
      }
      throw error;
    }
  });
};
