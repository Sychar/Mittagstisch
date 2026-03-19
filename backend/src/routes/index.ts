import { FastifyInstance } from "fastify";
import { AppContext } from "../context";
import { registerAdminRoutes } from "./admin";
import { registerAuthRoutes } from "./auth";
import { registerHealthRoutes } from "./health";
import { registerOfferRoutes } from "./offers";
import { registerOrderRoutes } from "./orders";
import { registerRestaurantRoutes } from "./restaurants";

export const registerRoutes = (app: FastifyInstance, ctx: AppContext) => {
  registerHealthRoutes(app);
  registerAdminRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerOfferRoutes(app, ctx);
  registerOrderRoutes(app, ctx);
  registerRestaurantRoutes(app, ctx);
};
