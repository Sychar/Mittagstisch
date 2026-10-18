import { AdminAccount as DbAdminAccount, PrismaClient } from "@prisma/client";
import { AdminAccount } from "../types";
import { AdminRepo } from "./adminRepo";

const toAdminAccount = (row: DbAdminAccount): AdminAccount => ({
  id: row.id,
  email: row.email,
  passwordHash: row.passwordHash,
  lastLoginAt: row.lastLoginAt?.toISOString() ?? undefined,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

export class PrismaAdminRepo implements AdminRepo {
  constructor(private prisma: PrismaClient) {}

  async count(): Promise<number> {
    return this.prisma.adminAccount.count();
  }

  async findById(id: string): Promise<AdminAccount | undefined> {
    const row = await this.prisma.adminAccount.findUnique({ where: { id } });
    return row ? toAdminAccount(row) : undefined;
  }

  async findByEmail(email: string): Promise<AdminAccount | undefined> {
    const row = await this.prisma.adminAccount.findUnique({ where: { email } });
    return row ? toAdminAccount(row) : undefined;
  }

  async create(account: AdminAccount): Promise<AdminAccount> {
    const row = await this.prisma.adminAccount.create({
      data: {
        id: account.id,
        email: account.email,
        passwordHash: account.passwordHash,
        lastLoginAt: account.lastLoginAt ? new Date(account.lastLoginAt) : null,
        createdAt: new Date(account.createdAt),
        updatedAt: new Date(account.updatedAt)
      }
    });
    return toAdminAccount(row);
  }

  async updatePassword(
    id: string,
    passwordHash: string
  ): Promise<AdminAccount | undefined> {
    try {
      const row = await this.prisma.adminAccount.update({
        where: { id },
        data: {
          passwordHash
        }
      });
      return toAdminAccount(row);
    } catch {
      return undefined;
    }
  }

  async touchLastLogin(id: string, atIso: string): Promise<AdminAccount | undefined> {
    try {
      const row = await this.prisma.adminAccount.update({
        where: { id },
        data: {
          lastLoginAt: new Date(atIso)
        }
      });
      return toAdminAccount(row);
    } catch {
      return undefined;
    }
  }
}
