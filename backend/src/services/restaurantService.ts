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

const DEFAULT_APPROVAL_STATUS: RestaurantApprovalStatus = "pending";
const SHORT_SESSION_DAYS = 14;
const LONG_SESSION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeMealSlots = (input?: MealSlot[]): MealSlot[] => {
  return Array.isArray(input)
    ? Array.from(new Set(input.filter((slot): slot is MealSlot => Boolean(slot))))
    : [];
};

export class RestaurantService {
  constructor(
    private restaurantRepo: RestaurantRepo,
    private sessionRepo: SessionRepo,
    private geoService: GeoService
  ) {}

  async authenticate(
    email: string,
    password: string,
    rememberMe = false
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

    const nowMs = Date.now();
    const sessionDays = rememberMe ? LONG_SESSION_DAYS : SHORT_SESSION_DAYS;
    const session: Session = {
      token: randomUUID(),
      restaurantId: restaurant.id,
      createdAt: new Date(nowMs).toISOString(),
      lastSeenAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + sessionDays * DAY_MS).toISOString(),
      rememberMe
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

    const coords = await this.geoService.resolveRestaurantCoordinates({
      address: input.address,
      postalCode: input.postalCode,
      lat: input.lat,
      lng: input.lng
    });

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

  async updateProfile(input: {
    restaurantId: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    postalCode?: string;
    mealSlots?: MealSlot[];
  }): Promise<RestaurantPublic> {
    const current = await this.restaurantRepo.findById(input.restaurantId);
    if (!current) {
      throw new Error("RESTAURANT_NOT_FOUND");
    }

    const normalizedEmail =
      input.email !== undefined ? input.email.trim().toLowerCase() : undefined;
    if (normalizedEmail && normalizedEmail !== current.email.toLowerCase()) {
      const existing = await this.restaurantRepo.findByEmail(normalizedEmail);
      if (existing && existing.id !== current.id) {
        throw new Error("EMAIL_EXISTS");
      }
    }

    const nextAddress = input.address !== undefined ? input.address.trim() : current.address;
    const nextPostalCode =
      input.postalCode !== undefined ? input.postalCode.trim() : current.postalCode;
    const addressChanged =
      nextAddress !== current.address || nextPostalCode !== current.postalCode;
    const coords = addressChanged
      ? await this.geoService.resolveRestaurantCoordinates({
          address: nextAddress,
          postalCode: nextPostalCode
        })
      : { lat: current.lat, lng: current.lng };

    if (!coords) {
      throw new Error("POSTAL_CODE_UNKNOWN");
    }

    const updated = await this.restaurantRepo.updateProfile(input.restaurantId, {
      name: input.name !== undefined ? input.name.trim() : undefined,
      email: normalizedEmail,
      phone: input.phone !== undefined ? input.phone.trim() : undefined,
      address: input.address !== undefined ? nextAddress : undefined,
      postalCode: input.postalCode !== undefined ? nextPostalCode : undefined,
      lat: addressChanged ? coords.lat : undefined,
      lng: addressChanged ? coords.lng : undefined,
      mealSlots: input.mealSlots !== undefined ? normalizeMealSlots(input.mealSlots) : undefined
    });

    if (!updated) {
      throw new Error("RESTAURANT_NOT_FOUND");
    }
    return this.toPublic(updated);
  }

  async resetPassword(input: {
    restaurantId: string;
    password: string;
  }): Promise<RestaurantPublic> {
    const updated = await this.restaurantRepo.updatePassword(
      input.restaurantId,
      hashSync(input.password, 10)
    );
    if (!updated) {
      throw new Error("RESTAURANT_NOT_FOUND");
    }
    this.sessionRepo.deleteByRestaurantId(input.restaurantId);
    return this.toPublic(updated);
  }

  async changePassword(input: {
    restaurantId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<RestaurantPublic> {
    const current = await this.restaurantRepo.findById(input.restaurantId);
    if (!current) {
      throw new Error("RESTAURANT_NOT_FOUND");
    }
    if (!compareSync(input.currentPassword, current.passwordHash)) {
      throw new Error("INVALID_CURRENT_PASSWORD");
    }
    if (compareSync(input.newPassword, current.passwordHash)) {
      throw new Error("PASSWORD_UNCHANGED");
    }

    const updated = await this.restaurantRepo.updatePassword(
      input.restaurantId,
      hashSync(input.newPassword, 10)
    );
    if (!updated) {
      throw new Error("RESTAURANT_NOT_FOUND");
    }

    // A password change invalidates every existing device session.
    this.sessionRepo.deleteByRestaurantId(input.restaurantId);
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
