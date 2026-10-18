import { FastifyInstance } from "fastify";
import { AppContext } from "../context";
import { registerAdminRoutes } from "./admin";
import { registerAuthRoutes } from "./auth";
import { registerHealthRoutes } from "./health";
import { registerOfferRoutes } from "./offers";
import { registerOrderRoutes } from "./orders";
import { registerEventRoutes } from "./events";
import { registerRestaurantRoutes } from "./restaurants";
import { registerHighlightRoutes } from "./highlights";

export const registerRoutes = (app: FastifyInstance, ctx: AppContext) => {
  registerHealthRoutes(app);
  registerAdminRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerOfferRoutes(app, ctx);
  registerOrderRoutes(app, ctx);
  registerEventRoutes(app, ctx);
  registerRestaurantRoutes(app, ctx);
  registerHighlightRoutes(app, ctx);
};
