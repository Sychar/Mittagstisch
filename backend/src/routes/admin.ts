import { randomUUID } from "node:crypto";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppContext } from "../context";
import { RestaurantApprovalStatus } from "../types";
import { HttpError, parseOrThrow } from "../utils/http";

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional()
});

const listSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional()
});

const adminSessions = new Map<string, { createdAt: string; lastSeenAt: string }>();

const getAdminCredentials = () => ({
  email: (process.env.ADMIN_EMAIL || "admin@mittagstisch.de").trim().toLowerCase(),
  password: process.env.ADMIN_PASSWORD || "admin123"
});

const requireAdminAuth = (request: { headers: Record<string, unknown> }): string => {
  const header = request.headers.authorization;
  if (!header || typeof header !== "string") {
    throw new HttpError(401, "ADMIN_UNAUTHORIZED", "Admin authentication required");
  }

  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    throw new HttpError(401, "ADMIN_UNAUTHORIZED", "Invalid admin authorization header");
  }

  const session = adminSessions.get(token);
  if (!session) {
    throw new HttpError(401, "ADMIN_UNAUTHORIZED", "Invalid admin token");
  }

  adminSessions.set(token, {
    ...session,
    lastSeenAt: new Date().toISOString()
  });

  return token;
};

export const registerAdminRoutes = (app: FastifyInstance, ctx: AppContext) => {
  app.post("/api/admin/login", async (request) => {
    const body = parseOrThrow(adminLoginSchema, request.body);
    const credentials = getAdminCredentials();

    if (
      body.email.trim().toLowerCase() !== credentials.email ||
      body.password !== credentials.password
    ) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Admin login failed");
    }

    const token = randomUUID();
    adminSessions.set(token, {
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    });

    return { token };
  });

  app.post("/api/admin/logout", async (request) => {
    const token = requireAdminAuth(request);
    adminSessions.delete(token);
    return { ok: true };
  });

  app.get("/api/admin/restaurants/requests", async (request) => {
    requireAdminAuth(request);
    return await ctx.restaurantService.listByApprovalStatus("pending");
  });

  app.get("/api/admin/restaurants", async (request) => {
    requireAdminAuth(request);
    const query = parseOrThrow(listSchema, request.query);

    const status: RestaurantApprovalStatus = query.status ?? "pending";
    return await ctx.restaurantService.listByApprovalStatus(status);
  });

  app.patch("/api/admin/restaurants/:id/review", async (request) => {
    requireAdminAuth(request);
    const body = parseOrThrow(reviewSchema, request.body);
    const { id } = request.params as { id: string };

    try {
      const restaurant = await ctx.restaurantService.reviewRegistration({
        restaurantId: id,
        decision: body.decision,
        note: body.note
      });
      return { restaurant };
    } catch (error) {
      if (error instanceof Error && error.message === "RESTAURANT_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
      }
      throw error;
    }
  });
};
