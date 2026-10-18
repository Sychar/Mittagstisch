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

const adminChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6)
});

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional()
});

const listSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional()
});

const reviewReportListSchema = z.object({
  status: z.enum(["pending", "kept", "removed"]).optional()
});

const reviewReportDecisionSchema = z
  .object({
    decision: z.enum(["keep", "remove", "restore"]),
    note: z.string().trim().max(1000).optional()
  })
  .superRefine((value, ctx) => {
    if (value.decision === "remove" && !value.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "Beim Entfernen ist eine Begründung erforderlich."
      });
    }
  });

const reviewReportReasonLabels: Record<string, string> = {
  fake_or_no_visit: "Fake / kein echter Besuch",
  abusive_or_inappropriate: "Beleidigung oder unangemessener Inhalt",
  wrong_restaurant: "Falsches Restaurant",
  privacy: "Datenschutz / persönliche Daten",
  other: "Sonstiges"
};

const adminSessions = new Map<
  string,
  { adminId: string; createdAt: string; lastSeenAt: string }
>();

export const requireAdminAuth = (
  request: { headers: Record<string, unknown> }
): { token: string; adminId: string } => {
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

  return { token, adminId: session.adminId };
};

export const registerAdminRoutes = (app: FastifyInstance, ctx: AppContext) => {
  app.post("/api/admin/login", async (request) => {
    const body = parseOrThrow(adminLoginSchema, request.body);
    const admin = await ctx.adminService.authenticate(body.email, body.password);
    if (!admin) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Admin login failed");
    }

    const nowIso = new Date().toISOString();
    const token = randomUUID();
    adminSessions.set(token, {
      adminId: admin.id,
      createdAt: nowIso,
      lastSeenAt: nowIso
    });

    return { token };
  });

  app.post("/api/admin/logout", async (request) => {
    const { token } = requireAdminAuth(request);
    adminSessions.delete(token);
    return { ok: true };
  });

  app.patch("/api/admin/password", async (request) => {
    const { adminId } = requireAdminAuth(request);
    const body = parseOrThrow(adminChangePasswordSchema, request.body);

    try {
      await ctx.adminService.changePassword(
        adminId,
        body.currentPassword,
        body.newPassword
      );
      return { ok: true };
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_CURRENT_PASSWORD") {
        throw new HttpError(
          401,
          "INVALID_CURRENT_PASSWORD",
          "Current admin password is invalid"
        );
      }
      if (error instanceof Error && error.message === "WEAK_PASSWORD") {
        throw new HttpError(400, "WEAK_PASSWORD", "New password is too weak");
      }
      if (error instanceof Error && error.message === "ADMIN_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Admin account not found");
      }
      throw error;
    }
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

      if (
        restaurant.email &&
        (restaurant.approvalStatus === "approved" ||
          restaurant.approvalStatus === "rejected")
      ) {
        void ctx.emailService
          .sendRestaurantRegistrationReviewed({
            restaurantEmail: restaurant.email,
            restaurantName: restaurant.name,
            approvalStatus: restaurant.approvalStatus,
            note: restaurant.approvalNote
          })
          .catch((error) => {
            request.log.error(
              { error, restaurantId: restaurant.id },
              "failed to send registration review email"
            );
          });
      }

      return { restaurant };
    } catch (error) {
      if (error instanceof Error && error.message === "RESTAURANT_NOT_FOUND") {
        throw new HttpError(404, "NOT_FOUND", "Restaurant not found");
      }
      throw error;
    }
  });

  app.get("/api/admin/review-reports", async (request) => {
    requireAdminAuth(request);
    if (!ctx.prisma) {
      throw new HttpError(503, "DATABASE_REQUIRED", "Bewertungsmeldungen benötigen die Datenbank.");
    }
    const query = parseOrThrow(reviewReportListSchema, request.query);
    const reports = await ctx.prisma.restaurantReviewReport.findMany({
      where: { status: query.status || "pending" },
      include: {
        restaurant: { select: { id: true, name: true, email: true } },
        review: {
          include: { images: { orderBy: { createdAt: "asc" } } }
        }
      },
      orderBy: { reportedAt: "desc" },
      take: 500
    });

    return reports.map((report) => ({
      id: report.id,
      reviewId: report.reviewId,
      restaurant: report.restaurant,
      reason: report.reason,
      reasonLabel: reviewReportReasonLabels[report.reason] || report.reason,
      note: report.note || "",
      status: report.status,
      reportedAt: report.reportedAt.toISOString(),
      resolvedAt: report.resolvedAt?.toISOString() || null,
      resolutionNote: report.resolutionNote || "",
      restoredAt: report.restoredAt?.toISOString() || null,
      review: {
        rating: report.review.rating,
        text: report.review.text,
        authorName: report.review.authorName || "Gast",
        replyText: report.review.replyText || "",
        visibilityStatus: report.review.visibilityStatus,
        createdAt: report.review.createdAt.toISOString(),
        images: report.review.images.map((image) => ({
          id: image.id,
          url: image.url,
          mimeType: image.mimeType
        }))
      }
    }));
  });

  app.patch("/api/admin/review-reports/:id", async (request) => {
    const { adminId } = requireAdminAuth(request);
    if (!ctx.prisma) {
      throw new HttpError(503, "DATABASE_REQUIRED", "Bewertungsmeldungen benötigen die Datenbank.");
    }
    const { id } = request.params as { id: string };
    const body = parseOrThrow(reviewReportDecisionSchema, request.body);
    const report = await ctx.prisma.restaurantReviewReport.findUnique({
      where: { id },
      include: {
        restaurant: { select: { name: true, email: true } },
        review: true
      }
    });
    if (!report) {
      throw new HttpError(404, "NOT_FOUND", "Bewertungsmeldung wurde nicht gefunden.");
    }
    if (body.decision === "restore" && report.status !== "removed") {
      throw new HttpError(409, "REVIEW_NOT_REMOVED", "Nur entfernte Bewertungen können wiederhergestellt werden.");
    }
    if (body.decision !== "restore" && report.status !== "pending") {
      throw new HttpError(409, "REPORT_ALREADY_RESOLVED", "Diese Meldung wurde bereits bearbeitet.");
    }

    const now = new Date();
    const reportStatus = body.decision === "remove" ? "removed" : "kept";
    const visibilityStatus = body.decision === "remove" ? "removed" : "visible";
    const [updatedReport] = await ctx.prisma.$transaction([
      ctx.prisma.restaurantReviewReport.update({
        where: { id },
        data: {
          status: reportStatus,
          resolvedAt: now,
          resolvedByAdminId: adminId,
          resolutionNote: body.note || null,
          restoredAt: body.decision === "restore" ? now : null
        }
      }),
      ctx.prisma.restaurantReview.update({
        where: { id: report.reviewId },
        data: {
          visibilityStatus,
          moderatedAt: now,
          moderationNote: body.note || null
        }
      })
    ]);

    const decision = body.decision === "remove" ? "removed" : body.decision === "restore" ? "restored" : "kept";
    void ctx.emailService
      .sendRestaurantReviewReportResolved({
        restaurantName: report.restaurant.name,
        restaurantEmail: report.restaurant.email,
        rating: report.review.rating,
        decision,
        resolutionNote: body.note
      })
      .catch((error) => {
        request.log.error(
          { error, reviewReportId: report.id, restaurantId: report.review.restaurantId },
          "failed to send review report resolution email"
        );
      });

    return {
      ok: true,
      report: {
        id: updatedReport.id,
        status: updatedReport.status,
        resolvedAt: updatedReport.resolvedAt?.toISOString() || null,
        resolutionNote: updatedReport.resolutionNote || "",
        restoredAt: updatedReport.restoredAt?.toISOString() || null,
        visibilityStatus
      }
    };
  });
};
