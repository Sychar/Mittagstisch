import { FastifyInstance } from "fastify";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { AppContext } from "../context";
import { requireAuth } from "../utils/auth";
import { HttpError, parseOrThrow } from "../utils/http";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  rememberMe: z.boolean().optional()
});

const passwordResetRequestSchema = z.object({
  email: z.string().email()
});

const passwordResetConfirmSchema = z.object({
  email: z.string().email(),
  code: z.string().trim().regex(/^\d{6}$/),
  password: z.string().min(6)
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(6).max(128),
  newPassword: z.string().min(6).max(128)
});

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const createResetCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

const passwordResetRequestResponse = {
  ok: true,
  message: "Wenn die E-Mail registriert ist, wurde ein Code gesendet."
};

export const registerAuthRoutes = (app: FastifyInstance, ctx: AppContext) => {
  app.post("/api/auth/login", async (request) => {
    const body = parseOrThrow(loginSchema, request.body);
    try {
      const result = await ctx.restaurantService.authenticate(
        body.email,
        body.password,
        Boolean(body.rememberMe)
      );
      if (!result) {
        throw new HttpError(401, "INVALID_CREDENTIALS", "Login failed");
      }

      return {
        token: result.session.token,
        sessionExpiresAt: result.session.expiresAt,
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

  app.post("/api/auth/password-reset/request", async (request) => {
    const body = parseOrThrow(passwordResetRequestSchema, request.body);
    const email = normalizeEmail(body.email);

    if (!ctx.emailService.isConfigured()) {
      throw new HttpError(
        503,
        "PASSWORD_RESET_UNAVAILABLE",
        "Passwort-Reset ist gerade nicht verfügbar. Bitte Support kontaktieren."
      );
    }

    const restaurant = await ctx.restaurantRepo.findByEmail(email);
    if (!restaurant) {
      return passwordResetRequestResponse;
    }

    const code = createResetCode();
    const entry = ctx.passwordResetStore.create({
      restaurantId: restaurant.id,
      email,
      code
    });

    try {
      await ctx.emailService.sendRestaurantPasswordResetCode({
        restaurantName: restaurant.name,
        restaurantEmail: restaurant.email,
        code,
        expiresAtIso: entry.expiresAt
      });
    } catch (error) {
      ctx.passwordResetStore.deleteByRestaurantId(restaurant.id);
      request.log.error({ error, restaurantId: restaurant.id }, "password reset email failed");
      throw new HttpError(
        503,
        "PASSWORD_RESET_EMAIL_FAILED",
        "Code konnte nicht per E-Mail gesendet werden. Bitte später erneut versuchen."
      );
    }

    return passwordResetRequestResponse;
  });

  app.post("/api/auth/password-reset/confirm", async (request) => {
    const body = parseOrThrow(passwordResetConfirmSchema, request.body);
    const email = normalizeEmail(body.email);
    const entry = ctx.passwordResetStore.verify(email, body.code);

    if (!entry) {
      throw new HttpError(
        400,
        "INVALID_RESET_CODE",
        "Der Code ist ungültig oder abgelaufen."
      );
    }

    const restaurant = await ctx.restaurantRepo.findById(entry.restaurantId);
    if (!restaurant || normalizeEmail(restaurant.email) !== email) {
      ctx.passwordResetStore.deleteByRestaurantId(entry.restaurantId);
      throw new HttpError(
        400,
        "INVALID_RESET_CODE",
        "Der Code ist ungültig oder abgelaufen."
      );
    }

    await ctx.restaurantService.resetPassword({
      restaurantId: restaurant.id,
      password: body.password
    });
    ctx.passwordResetStore.deleteByRestaurantId(restaurant.id);

    return { ok: true };
  });

  app.post("/api/auth/password/change", async (request) => {
    const restaurantId = requireAuth(request, ctx.sessionRepo);
    const body = parseOrThrow(passwordChangeSchema, request.body);

    try {
      await ctx.restaurantService.changePassword({
        restaurantId,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_CURRENT_PASSWORD") {
        throw new HttpError(400, "INVALID_CURRENT_PASSWORD", "Das aktuelle Passwort ist nicht korrekt.");
      }
      if (error instanceof Error && error.message === "PASSWORD_UNCHANGED") {
        throw new HttpError(400, "PASSWORD_UNCHANGED", "Das neue Passwort muss sich vom aktuellen unterscheiden.");
      }
      throw error;
    }

    return { ok: true };
  });
};
