import { FastifyInstance } from "fastify";

export const registerHealthRoutes = (app: FastifyInstance) => {
  app.get("/health", async () => {
    return { ok: true, time: new Date().toISOString() };
  });
};