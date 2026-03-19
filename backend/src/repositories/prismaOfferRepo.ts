import { Offer as DbOffer, PrismaClient } from "@prisma/client";
import { Offer } from "../types";
import { OfferRepo } from "./offerRepo";

const toOffer = (row: DbOffer): Offer => ({
  id: row.id,
  restaurantId: row.restaurantId,
  title: row.title,
  description: row.description,
  price: Number(row.price),
  tags: row.tags,
  imageUrl: row.imageUrl ?? undefined,
  mealSlot: row.mealSlot,
  active: row.active,
  preorderEnabled: row.preorderEnabled,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

export class PrismaOfferRepo implements OfferRepo {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<Offer | undefined> {
    const row = await this.prisma.offer.findUnique({ where: { id } });
    return row ? toOffer(row) : undefined;
  }

  async listActive(): Promise<Offer[]> {
    const rows = await this.prisma.offer.findMany({ where: { active: true } });
    return rows.map(toOffer);
  }

  async listByRestaurant(restaurantId: string): Promise<Offer[]> {
    const rows = await this.prisma.offer.findMany({ where: { restaurantId } });
    return rows.map(toOffer);
  }

  async create(offer: Offer): Promise<Offer> {
    const row = await this.prisma.offer.create({
      data: {
        id: offer.id,
        restaurantId: offer.restaurantId,
        title: offer.title,
        description: offer.description,
        price: offer.price,
        tags: offer.tags,
        imageUrl: offer.imageUrl,
        mealSlot: offer.mealSlot,
        active: offer.active,
        preorderEnabled: offer.preorderEnabled,
        createdAt: new Date(offer.createdAt),
        updatedAt: new Date(offer.updatedAt)
      }
    });

    return toOffer(row);
  }

  async update(id: string, patch: Partial<Offer>): Promise<Offer | undefined> {
    try {
      const row = await this.prisma.offer.update({
        where: { id },
        data: {
          title: patch.title,
          description: patch.description,
          price: patch.price,
          tags: patch.tags,
          imageUrl: patch.imageUrl,
          mealSlot: patch.mealSlot,
          active: patch.active,
          preorderEnabled: patch.preorderEnabled,
          updatedAt: patch.updatedAt ? new Date(patch.updatedAt) : undefined
        }
      });
      return toOffer(row);
    } catch {
      return undefined;
    }
  }
}
