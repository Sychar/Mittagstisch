import { MealSlot, Restaurant, RestaurantApprovalStatus } from "../types";

export interface RestaurantRepo {
  findById(id: string): Promise<Restaurant | undefined>;
  findByEmail(email: string): Promise<Restaurant | undefined>;
  list(): Promise<Restaurant[]>;
  listByApprovalStatus(status: RestaurantApprovalStatus): Promise<Restaurant[]>;
  create(restaurant: Restaurant): Promise<Restaurant>;
  updateMenu(
    id: string,
    patch: {
      menuUrl?: string;
      menuMimeType?: string;
    }
  ): Promise<Restaurant | undefined>;
  updateMealSlots(id: string, mealSlots: MealSlot[]): Promise<Restaurant | undefined>;
  updateApproval(
    id: string,
    patch: {
      approvalStatus: RestaurantApprovalStatus;
      approvalReviewedAt: string;
      approvalNote?: string;
    }
  ): Promise<Restaurant | undefined>;
}

export class InMemoryRestaurantRepo implements RestaurantRepo {
  private items = new Map<string, Restaurant>();

  async findById(id: string): Promise<Restaurant | undefined> {
    return this.items.get(id);
  }

  async findByEmail(email: string): Promise<Restaurant | undefined> {
    const needle = email.toLowerCase();
    return Array.from(this.items.values()).find(
      (restaurant) => restaurant.email.toLowerCase() === needle
    );
  }

  async list(): Promise<Restaurant[]> {
    return Array.from(this.items.values());
  }

  async listByApprovalStatus(status: RestaurantApprovalStatus): Promise<Restaurant[]> {
    return Array.from(this.items.values()).filter((restaurant) => restaurant.approvalStatus === status);
  }

  async create(restaurant: Restaurant): Promise<Restaurant> {
    this.items.set(restaurant.id, restaurant);
    return restaurant;
  }

  async updateMenu(
    id: string,
    patch: {
      menuUrl?: string;
      menuMimeType?: string;
    }
  ): Promise<Restaurant | undefined> {
    const current = this.items.get(id);
    if (!current) return undefined;
    const next: Restaurant = {
      ...current,
      menuUrl: patch.menuUrl,
      menuMimeType: patch.menuMimeType
    };
    this.items.set(id, next);
    return next;
  }

  async updateMealSlots(id: string, mealSlots: MealSlot[]): Promise<Restaurant | undefined> {
    const current = this.items.get(id);
    if (!current) return undefined;
    const next: Restaurant = {
      ...current,
      mealSlots
    };
    this.items.set(id, next);
    return next;
  }

  async updateApproval(
    id: string,
    patch: {
      approvalStatus: RestaurantApprovalStatus;
      approvalReviewedAt: string;
      approvalNote?: string;
    }
  ): Promise<Restaurant | undefined> {
    const current = this.items.get(id);
    if (!current) return undefined;
    const next: Restaurant = {
      ...current,
      approvalStatus: patch.approvalStatus,
      approvalReviewedAt: patch.approvalReviewedAt,
      approvalNote: patch.approvalNote
    };
    this.items.set(id, next);
    return next;
  }
}
