import { randomUUID } from "node:crypto";
import { MealSlot, Offer, OfferWithRestaurant, Tag } from "../types";
import { OfferRepo } from "../repositories/offerRepo";
import { RestaurantRepo } from "../repositories/restaurantRepo";
import { GeoService, haversineKm } from "./geoService";

const DEFAULT_MEAL_SLOT: MealSlot = "lunch";

export class OfferService {
  constructor(
    private offerRepo: OfferRepo,
    private restaurantRepo: RestaurantRepo,
    private geoService: GeoService
  ) {}

  async listOffersNear(
    postalCode: string,
    radiusKm: number,
    mealSlot?: MealSlot
  ): Promise<OfferWithRestaurant[]> {
    const origin = this.geoService.getCoordinates(postalCode);
    if (!origin) {
      throw new Error("POSTAL_CODE_UNKNOWN");
    }

    const offers = await this.offerRepo.listActive();
    const results: OfferWithRestaurant[] = [];

    for (const offer of offers) {
      const restaurant = await this.restaurantRepo.findById(offer.restaurantId);
      if (!restaurant) continue;

      if (mealSlot && offer.mealSlot !== mealSlot) {
        continue;
      }

      if (mealSlot && !restaurant.mealSlots.includes(mealSlot)) {
        continue;
      }

      const distanceKm = haversineKm(origin, {
        lat: restaurant.lat,
        lng: restaurant.lng
      });

      if (distanceKm <= radiusKm) {
        results.push({
          ...offer,
          distanceKm: Number(distanceKm.toFixed(2)),
          restaurant: {
            id: restaurant.id,
            name: restaurant.name,
            address: restaurant.address,
            phone: restaurant.phone,
            postalCode: restaurant.postalCode,
            mealSlots: restaurant.mealSlots,
            menuUrl: restaurant.menuUrl,
            menuMimeType: restaurant.menuMimeType
          }
        });
      }
    }

    return results.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  async getOfferWithRestaurant(
    id: string,
    postalCode?: string
  ): Promise<OfferWithRestaurant | null> {
    const offer = await this.offerRepo.findById(id);
    if (!offer) return null;

    const restaurant = await this.restaurantRepo.findById(offer.restaurantId);
    if (!restaurant) return null;

    let distanceKm = 0;
    if (postalCode) {
      const origin = this.geoService.getCoordinates(postalCode);
      if (!origin) {
        throw new Error("POSTAL_CODE_UNKNOWN");
      }
      distanceKm = haversineKm(origin, { lat: restaurant.lat, lng: restaurant.lng });
    }

    return {
      ...offer,
      distanceKm: Number(distanceKm.toFixed(2)),
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        address: restaurant.address,
        phone: restaurant.phone,
        postalCode: restaurant.postalCode,
        mealSlots: restaurant.mealSlots,
        menuUrl: restaurant.menuUrl,
        menuMimeType: restaurant.menuMimeType
      }
    };
  }

  /** Public links must never reveal inactive offers or pending restaurants. */
  async getPublicOfferWithRestaurant(id: string): Promise<OfferWithRestaurant | null> {
    const offer = await this.offerRepo.findById(id);
    if (!offer || !offer.active) return null;

    const restaurant = await this.restaurantRepo.findById(offer.restaurantId);
    if (!restaurant || restaurant.approvalStatus !== "approved") return null;

    return {
      ...offer,
      distanceKm: 0,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        address: restaurant.address,
        phone: restaurant.phone,
        postalCode: restaurant.postalCode,
        mealSlots: restaurant.mealSlots,
        menuUrl: restaurant.menuUrl,
        menuMimeType: restaurant.menuMimeType
      }
    };
  }

  async createOffer(input: {
    restaurantId: string;
    title: string;
    description: string;
    price: number;
    tags: Tag[];
    imageUrl?: string;
    mealSlot?: MealSlot;
    active?: boolean;
    preorderEnabled?: boolean;
  }): Promise<Offer> {
    const restaurant = await this.restaurantRepo.findById(input.restaurantId);
    if (!restaurant) {
      throw new Error("RESTAURANT_NOT_FOUND");
    }

    const resolvedMealSlot = input.mealSlot ?? DEFAULT_MEAL_SLOT;
    if (!restaurant.mealSlots.includes(resolvedMealSlot)) {
      throw new Error("MEAL_SLOT_NOT_ENABLED");
    }

    const offer: Offer = {
      id: randomUUID(),
      restaurantId: input.restaurantId,
      title: input.title,
      description: input.description,
      price: input.price,
      tags: input.tags,
      imageUrl: input.imageUrl,
      mealSlot: resolvedMealSlot,
      active: input.active ?? true,
      preorderEnabled: input.preorderEnabled ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return this.offerRepo.create(offer);
  }

  async listByRestaurant(restaurantId: string): Promise<Offer[]> {
    return this.offerRepo.listByRestaurant(restaurantId);
  }

  async updateOffer(
    restaurantId: string,
    offerId: string,
    patch: Partial<
      Pick<
        Offer,
        "title" | "description" | "price" | "tags" | "imageUrl" | "mealSlot" | "active" | "preorderEnabled"
      >
    >
  ): Promise<Offer> {
    const existing = await this.offerRepo.findById(offerId);
    if (!existing) {
      throw new Error("OFFER_NOT_FOUND");
    }
    if (existing.restaurantId !== restaurantId) {
      throw new Error("FORBIDDEN");
    }

    const restaurant = await this.restaurantRepo.findById(restaurantId);
    if (!restaurant) {
      throw new Error("RESTAURANT_NOT_FOUND");
    }

    const nextMealSlot = patch.mealSlot ?? existing.mealSlot;
    if (!restaurant.mealSlots.includes(nextMealSlot)) {
      throw new Error("MEAL_SLOT_NOT_ENABLED");
    }

    const nextTags: Tag[] | undefined = patch.tags
      ? patch.tags.length === 0
        ? ["classic"]
        : patch.tags
      : undefined;

    const updated = await this.offerRepo.update(offerId, {
      ...patch,
      mealSlot: nextMealSlot,
      tags: nextTags ?? existing.tags,
      updatedAt: new Date().toISOString()
    });

    if (!updated) {
      throw new Error("OFFER_NOT_FOUND");
    }

    return updated;
  }

  async deleteOffer(restaurantId: string, offerId: string): Promise<void> {
    const existing = await this.offerRepo.findById(offerId);
    if (!existing) {
      throw new Error("OFFER_NOT_FOUND");
    }
    if (existing.restaurantId !== restaurantId) {
      throw new Error("FORBIDDEN");
    }

    const deleted = await this.offerRepo.delete(offerId);
    if (!deleted) {
      throw new Error("OFFER_NOT_FOUND");
    }
  }
}
