import { Order as DbOrder, PrismaClient } from "@prisma/client";
import { Order } from "../types";
import { OrderRepo } from "./orderRepo";

const toOrder = (row: DbOrder): Order => ({
  id: row.id,
  offerId: row.offerId,
  restaurantId: row.restaurantId,
  customerName: row.customerName,
  customerEmail: row.customerEmail,
  quantity: row.quantity,
  pickupTime: row.pickupTime.toISOString(),
  fulfillmentType: row.fulfillmentType,
  deviceId: row.deviceId ?? undefined,
  requestIp: row.requestIp ?? undefined,
  status: row.status,
  createdAt: row.createdAt.toISOString()
});

export class PrismaOrderRepo implements OrderRepo {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<Order | undefined> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    return row ? toOrder(row) : undefined;
  }

  async listByRestaurant(restaurantId: string): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' }
    });
    return rows.map(toOrder);
  }

  async create(order: Order): Promise<Order> {
    const row = await this.prisma.order.create({
      data: {
        id: order.id,
        offerId: order.offerId,
        restaurantId: order.restaurantId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        quantity: order.quantity,
        pickupTime: new Date(order.pickupTime),
        fulfillmentType: order.fulfillmentType,
        deviceId: order.deviceId ?? null,
        requestIp: order.requestIp ?? null,
        status: order.status,
        createdAt: new Date(order.createdAt)
      }
    });

    return toOrder(row);
  }

  async updateStatus(id: string, status: Order["status"]): Promise<Order | undefined> {
    try {
      const row = await this.prisma.order.update({
        where: { id },
        data: { status }
      });
      return toOrder(row);
    } catch {
      return undefined;
    }
  }
}
