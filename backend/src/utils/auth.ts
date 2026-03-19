import { FastifyRequest } from "fastify";
import { SessionRepo } from "../repositories/sessionRepo";
import { HttpError } from "./http";

export const getAuthToken = (request: FastifyRequest): string | null => {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token.trim();
};

export const requireAuth = (
  request: FastifyRequest,
  sessionRepo: SessionRepo
): string => {
  const token = getAuthToken(request);
  if (!token) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing auth token");
  }

  const session = sessionRepo.findByToken(token);
  if (!session) {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid auth token");
  }

  sessionRepo.touch(token);
  return session.restaurantId;
};