import { compareSync, hashSync } from "bcryptjs";
import { randomUUID } from "node:crypto";
import {
  MealSlot,
  Restaurant,
  RestaurantApprovalStatus,
  RestaurantPublic,
  Session
} from "../types";
import { RestaurantRepo } from "../repositories/restaurantRepo";
import { SessionRepo } from "../repositories/sessionRepo";
import { GeoService } from "./geoService";

const DEFAULT_MEAL_SLOTS: MealSlot[] = ["lunch"];
const DEFAULT_APPROVAL_STATUS: RestaurantApprovalStatus = "pending";

const normalizeMealSlots = (input?: MealSlot[]): MealSlot[] => {
  const slots = Array.isArray(input)
    ? Array.from(new Set(input.filter((slot): slot is MealSlot => Boolean(slot))))
    : [];

  return slots.length ? slots : [...DEFAULT_MEAL_SLOTS];
};

export class RestaurantService {
  constructor(
    private restaurantRepo: RestaurantRepo,
    private sessionRepo: SessionRepo,
    private geoService: GeoService
  ) {}

  async authenticate(
    email: string,
    password: string
  ): Promise<{ session: Session; restaurant: RestaurantPublic } | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const restaurant = await this.restaurantRepo.findByEmail(normalizedEmail);
    if (!restaurant) return null;
    if (!compareSync(password, restaurant.passwordHash)) return null;
    if (restaurant.approvalStatus === "pending") {
      throw new Error("PENDING_APPROVAL");
    }
    if (restaurant.approvalStatus === "rejected") {
      throw new Error("REJECTED");
    }

    const session: Session = {
      token: randomUUID(),
      restaurantId: restaurant.id,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };
    this.sessionRepo.create(session);

    return { session, restaurant: this.toPublic(restaurant) };
  }

  async register(input: {
    name: string;
    email: string;
    password: string;
    phone: string;
    address: string;
    postalCode: string;
    mealSlots?: MealSlot[];
    lat?: number;
    lng?: number;
  }): Promise<RestaurantPublic> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.restaurantRepo.findByEmail(normalizedEmail);
    if (existing) {
      throw new Error("EMAIL_EXISTS");
    }

    const coords =
      input.lat !== undefined && input.lng !== undefined
        ? { lat: input.lat, lng: input.lng }
        : this.geoService.getCoordinates(input.postalCode);

    if (!coords) {
      throw new Error("POSTAL_CODE_UNKNOWN");
    }

    const restaurant: Restaurant = {
      id: randomUUID(),
      name: input.name,
      email: normalizedEmail,
      phone: input.phone,
      address: input.address,
      postalCode: input.postalCode,
      lat: coords.lat,
      lng: coords.lng,
      mealSlots: normalizeMealSlots(input.mealSlots),
      approvalStatus: DEFAULT_APPROVAL_STATUS,
      approvalRequestedAt: new Date().toISOString(),
      approvalReviewedAt: undefined,
      approvalNote: undefined,
      menuUrl: undefined,
      menuMimeType: undefined,
      passwordHash: hashSync(input.password, 10),
      createdAt: new Date().toISOString()
    };

    await this.restaurantRepo.create(restaurant);
    return this.toPublic(restaurant);
  }

  toPublic(restaurant: Restaurant): RestaurantPublic {
    const { passwordHash, ...rest } = restaurant;
    return {
      ...rest,
      mealSlots: normalizeMealSlots(restaurant.mealSlots)
    };
  }

  async setMenuFile(input: {
    restaurantId: string;
    menuUrl: string;
    menuMimeType: string;
  }): Promise<RestaurantPublic> {
    const updated = await this.restaurantRepo.updateMenu(input.restaurantId, {
      menuUrl: input.menuUrl,
      menuMimeType: input.menuMimeType
    });
    if (!updated) {
      throw new Error("RESTAURANT_NOT_FOUND");
    }
    return this.toPublic(updated);
  }

  async setMealSlots(input: {
    restaurantId: string;
    mealSlots: MealSlot[];
  }): Promise<RestaurantPublic> {
    const updated = await this.restaurantRepo.updateMealSlots(
      input.restaurantId,
      normalizeMealSlots(input.mealSlots)
    );
    if (!updated) {
      throw new Error("RESTAURANT_NOT_FOUND");
    }
    return this.toPublic(updated);
  }

  async listByApprovalStatus(status: RestaurantApprovalStatus): Promise<RestaurantPublic[]> {
    const restaurants = await this.restaurantRepo.listByApprovalStatus(status);
    return restaurants.map((restaurant) => this.toPublic(restaurant));
  }

  async reviewRegistration(input: {
    restaurantId: string;
    decision: "approve" | "reject";
    note?: string;
  }): Promise<RestaurantPublic> {
    const current = await this.restaurantRepo.findById(input.restaurantId);
    if (!current) {
      throw new Error("RESTAURANT_NOT_FOUND");
    }

    const approvalStatus: RestaurantApprovalStatus =
      input.decision === "approve" ? "approved" : "rejected";

    const updated = await this.restaurantRepo.updateApproval(input.restaurantId, {
      approvalStatus,
      approvalReviewedAt: new Date().toISOString(),
      approvalNote: input.note?.trim() || undefined
    });

    if (!updated) {
      throw new Error("RESTAURANT_NOT_FOUND");
    }

    return this.toPublic(updated);
  }
}
