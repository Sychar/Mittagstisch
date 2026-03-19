import { seedOffers, seedRestaurants } from "./data/seed";
import { InMemoryOfferRepo, OfferRepo } from "./repositories/offerRepo";
import { InMemoryOrderRepo, OrderRepo } from "./repositories/orderRepo";
import { InMemoryRestaurantRepo, RestaurantRepo } from "./repositories/restaurantRepo";
import { InMemorySessionRepo } from "./repositories/sessionRepo";
import { createPrismaClient } from "./repositories/prismaClient";
import { PrismaOfferRepo } from "./repositories/prismaOfferRepo";
import { PrismaOrderRepo } from "./repositories/prismaOrderRepo";
import { PrismaRestaurantRepo } from "./repositories/prismaRestaurantRepo";
import { GeoService } from "./services/geoService";
import { OfferService } from "./services/offerService";
import { OrderService } from "./services/orderService";
import { OrderSpamGuard } from "./services/orderSpamGuard";
import { RestaurantService } from "./services/restaurantService";

export type AppContext = {
  offerService: OfferService;
  orderService: OrderService;
  restaurantService: RestaurantService;
  offerRepo: OfferRepo;
  orderRepo: OrderRepo;
  restaurantRepo: RestaurantRepo;
  sessionRepo: InMemorySessionRepo;
  geoService: GeoService;
};

export const buildContext = async (): Promise<AppContext> => {
  const dataStore = process.env.DATA_STORE ?? (process.env.DATABASE_URL ? "prisma" : "memory");
  const usePrisma = dataStore === "prisma";
  const seedFlag = (process.env.SEED_DEMO ?? "").toLowerCase();
  const shouldSeed = seedFlag === "1" || seedFlag === "true" || seedFlag === "yes";

  if (usePrisma && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when DATA_STORE=prisma");
  }

  const prisma = usePrisma ? createPrismaClient() : null;
  if (prisma) {
    try {
      await prisma.$connect();
    } catch (error) {
      throw new Error("DATABASE_CONNECTION_FAILED");
    }
  }

  const offerRepo: OfferRepo = usePrisma && prisma
    ? new PrismaOfferRepo(prisma)
    : new InMemoryOfferRepo();
  const orderRepo: OrderRepo = usePrisma && prisma
    ? new PrismaOrderRepo(prisma)
    : new InMemoryOrderRepo();
  const restaurantRepo: RestaurantRepo = usePrisma && prisma
    ? new PrismaRestaurantRepo(prisma)
    : new InMemoryRestaurantRepo();

  const sessionRepo = new InMemorySessionRepo();
  const geoService = new GeoService();
  const orderSpamGuard = new OrderSpamGuard();

  if (shouldSeed) {
    if (!usePrisma) {
      for (const restaurant of seedRestaurants()) {
        await restaurantRepo.create(restaurant);
      }

      for (const offer of seedOffers()) {
        await offerRepo.create(offer);
      }
    } else if (prisma) {
      const count = await prisma.restaurant.count();
      if (count === 0) {
        for (const restaurant of seedRestaurants()) {
          await restaurantRepo.create(restaurant);
        }

        for (const offer of seedOffers()) {
          await offerRepo.create(offer);
        }
      }
    }
  }

  const offerService = new OfferService(offerRepo, restaurantRepo, geoService);
  const orderService = new OrderService(orderRepo, offerRepo, orderSpamGuard);
  const restaurantService = new RestaurantService(
    restaurantRepo,
    sessionRepo,
    geoService
  );

  return {
    offerService,
    orderService,
    restaurantService,
    offerRepo,
    orderRepo,
    restaurantRepo,
    sessionRepo,
    geoService
  };
};
