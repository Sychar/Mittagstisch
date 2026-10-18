import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { buildContext } from "./context";
import { registerRoutes } from "./routes/index";
import { HttpError } from "./utils/http";

export const buildApp = async () => {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024
    }
  });

  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  mkdirSync(uploadsRoot, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadsRoot,
    prefix: "/uploads/"
  });

  const ctx = await buildContext();
  registerRoutes(app, ctx);

  app.addHook("onSend", async (request, reply, payload) => {
    if (reply.statusCode >= 400) {
      const body =
        typeof payload === "string"
          ? payload
          : Buffer.isBuffer(payload)
          ? payload.toString("utf-8")
          : JSON.stringify(payload);
      request.log.warn(
        {
          statusCode: reply.statusCode,
          method: request.method,
          url: request.url,
          authHeader: Boolean(request.headers.authorization),
          responseBody: body?.slice(0, 1000)
        },
        "request failed"
      );
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      const diagnosticId =
        error.details && typeof error.details === "object"
          ? String((error.details as Record<string, unknown>).diagnosticId || "").trim()
          : "";
      reply.status(error.status).send({
        error: error.code,
        message: error.message,
        details: error.details,
        ...(diagnosticId ? { diagnosticId } : {})
      });
      return;
    }

    request.log.error(error);
    reply.status(500).send({
      error: "INTERNAL_ERROR",
      message: "Something went wrong"
    });
  });

  return app;
};
