import { Offer } from "../types";

export interface OfferRepo {
  findById(id: string): Promise<Offer | undefined>;
  listActive(): Promise<Offer[]>;
  listByRestaurant(restaurantId: string): Promise<Offer[]>;
  create(offer: Offer): Promise<Offer>;
  update(id: string, patch: Partial<Offer>): Promise<Offer | undefined>;
}

export class InMemoryOfferRepo implements OfferRepo {
  private items = new Map<string, Offer>();

  async findById(id: string): Promise<Offer | undefined> {
    return this.items.get(id);
  }

  async listActive(): Promise<Offer[]> {
    return Array.from(this.items.values()).filter((offer) => offer.active);
  }

  async listByRestaurant(restaurantId: string): Promise<Offer[]> {
    return Array.from(this.items.values()).filter(
      (offer) => offer.restaurantId === restaurantId
    );
  }

  async create(offer: Offer): Promise<Offer> {
    this.items.set(offer.id, offer);
    return offer;
  }

  async update(id: string, patch: Partial<Offer>): Promise<Offer | undefined> {
    const current = this.items.get(id);
    if (!current) return undefined;
    const next: Offer = { ...current, ...patch };
    this.items.set(id, next);
    return next;
  }
}
