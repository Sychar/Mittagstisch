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
  statusUpdatedAt: row.statusUpdatedAt?.toISOString() ?? undefined,
  archivedAt: row.archivedAt?.toISOString() ?? undefined,
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
      where: {
        restaurantId,
        archivedAt: null
      },
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
        statusUpdatedAt: order.statusUpdatedAt ? new Date(order.statusUpdatedAt) : null,
        archivedAt: order.archivedAt ? new Date(order.archivedAt) : null,
        createdAt: new Date(order.createdAt)
      }
    });

    return toOrder(row);
  }

  async updateStatus(
    id: string,
    status: Order["status"],
    statusUpdatedAt?: string
  ): Promise<Order | undefined> {
    try {
      const row = await this.prisma.order.update({
        where: { id },
        data: {
          status,
          statusUpdatedAt: statusUpdatedAt ? new Date(statusUpdatedAt) : undefined
        }
      });
      return toOrder(row);
    } catch {
      return undefined;
    }
  }

  async archive(id: string, archivedAt: string): Promise<Order | undefined> {
    try {
      const row = await this.prisma.order.update({
        where: { id },
        data: {
          archivedAt: new Date(archivedAt)
        }
      });
      return toOrder(row);
    } catch {
      return undefined;
    }
  }
}
