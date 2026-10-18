import { Order } from "../types";

export interface OrderRepo {
  findById(id: string): Promise<Order | undefined>;
  listByRestaurant(restaurantId: string): Promise<Order[]>;
  create(order: Order): Promise<Order>;
  updateStatus(
    id: string,
    status: Order["status"],
    statusUpdatedAt?: string
  ): Promise<Order | undefined>;
  archive(id: string, archivedAt: string): Promise<Order | undefined>;
}

export class InMemoryOrderRepo implements OrderRepo {
  private items = new Map<string, Order>();

  async findById(id: string): Promise<Order | undefined> {
    return this.items.get(id);
  }

  async listByRestaurant(restaurantId: string): Promise<Order[]> {
    return Array.from(this.items.values())
      .filter((order) => order.restaurantId === restaurantId && !order.archivedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(order: Order): Promise<Order> {
    this.items.set(order.id, order);
    return order;
  }

  async updateStatus(
    id: string,
    status: Order["status"],
    statusUpdatedAt?: string
  ): Promise<Order | undefined> {
    const current = this.items.get(id);
    if (!current) return undefined;
    const next: Order = {
      ...current,
      status,
      statusUpdatedAt: statusUpdatedAt ?? current.statusUpdatedAt
    };
    this.items.set(id, next);
    return next;
  }

  async archive(id: string, archivedAt: string): Promise<Order | undefined> {
    const current = this.items.get(id);
    if (!current) return undefined;
    const next: Order = {
      ...current,
      archivedAt
    };
    this.items.set(id, next);
    return next;
  }
}
