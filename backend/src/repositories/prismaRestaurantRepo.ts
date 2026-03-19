import { PrismaClient, Restaurant as DbRestaurant } from "@prisma/client";
import { MealSlot, Restaurant, RestaurantApprovalStatus } from "../types";
import { RestaurantRepo } from "./restaurantRepo";

const toRestaurant = (row: DbRestaurant): Restaurant => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  address: row.address,
  postalCode: row.postalCode,
  lat: row.lat,
  lng: row.lng,
  mealSlots: row.mealSlots,
  approvalStatus: row.approvalStatus,
  approvalRequestedAt: row.approvalRequestedAt.toISOString(),
  approvalReviewedAt: row.approvalReviewedAt?.toISOString() ?? undefined,
  approvalNote: row.approvalNote ?? undefined,
  menuUrl: row.menuUrl ?? undefined,
  menuMimeType: row.menuMimeType ?? undefined,
  passwordHash: row.passwordHash,
  createdAt: row.createdAt.toISOString()
});

export class PrismaRestaurantRepo implements RestaurantRepo {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<Restaurant | undefined> {
    const row = await this.prisma.restaurant.findUnique({ where: { id } });
    return row ? toRestaurant(row) : undefined;
  }

  async findByEmail(email: string): Promise<Restaurant | undefined> {
    const row = await this.prisma.restaurant.findUnique({ where: { email } });
    return row ? toRestaurant(row) : undefined;
  }

  async list(): Promise<Restaurant[]> {
    const rows = await this.prisma.restaurant.findMany();
    return rows.map(toRestaurant);
  }

  async listByApprovalStatus(status: RestaurantApprovalStatus): Promise<Restaurant[]> {
    const rows = await this.prisma.restaurant.findMany({
      where: { approvalStatus: status },
      orderBy: { approvalRequestedAt: "asc" }
    });
    return rows.map(toRestaurant);
  }

  async create(restaurant: Restaurant): Promise<Restaurant> {
    const row = await this.prisma.restaurant.create({
      data: {
        id: restaurant.id,
        name: restaurant.name,
        email: restaurant.email,
        phone: restaurant.phone,
        address: restaurant.address,
        postalCode: restaurant.postalCode,
        lat: restaurant.lat,
        lng: restaurant.lng,
        mealSlots: restaurant.mealSlots,
        approvalStatus: restaurant.approvalStatus,
        approvalRequestedAt: new Date(restaurant.approvalRequestedAt),
        approvalReviewedAt: restaurant.approvalReviewedAt
          ? new Date(restaurant.approvalReviewedAt)
          : null,
        approvalNote: restaurant.approvalNote,
        menuUrl: restaurant.menuUrl,
        menuMimeType: restaurant.menuMimeType,
        passwordHash: restaurant.passwordHash,
        createdAt: new Date(restaurant.createdAt)
      }
    });

    return toRestaurant(row);
  }

  async updateMenu(
    id: string,
    patch: {
      menuUrl?: string;
      menuMimeType?: string;
    }
  ): Promise<Restaurant | undefined> {
    try {
      const row = await this.prisma.restaurant.update({
        where: { id },
        data: {
          menuUrl: patch.menuUrl,
          menuMimeType: patch.menuMimeType
        }
      });
      return toRestaurant(row);
    } catch {
      return undefined;
    }
  }

  async updateMealSlots(id: string, mealSlots: MealSlot[]): Promise<Restaurant | undefined> {
    try {
      const row = await this.prisma.restaurant.update({
        where: { id },
        data: {
          mealSlots
        }
      });
      return toRestaurant(row);
    } catch {
      return undefined;
    }
  }

  async updateApproval(
    id: string,
    patch: {
      approvalStatus: RestaurantApprovalStatus;
      approvalReviewedAt: string;
      approvalNote?: string;
    }
  ): Promise<Restaurant | undefined> {
    try {
      const row = await this.prisma.restaurant.update({
        where: { id },
        data: {
          approvalStatus: patch.approvalStatus,
          approvalReviewedAt: new Date(patch.approvalReviewedAt),
          approvalNote: patch.approvalNote
        }
      });
      return toRestaurant(row);
    } catch {
      return undefined;
    }
  }
}
