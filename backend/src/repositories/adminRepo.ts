import { AdminAccount } from "../types";

export interface AdminRepo {
  count(): Promise<number>;
  findById(id: string): Promise<AdminAccount | undefined>;
  findByEmail(email: string): Promise<AdminAccount | undefined>;
  create(account: AdminAccount): Promise<AdminAccount>;
  updatePassword(id: string, passwordHash: string): Promise<AdminAccount | undefined>;
  touchLastLogin(id: string, atIso: string): Promise<AdminAccount | undefined>;
}

export class InMemoryAdminRepo implements AdminRepo {
  private items = new Map<string, AdminAccount>();

  async count(): Promise<number> {
    return this.items.size;
  }

  async findById(id: string): Promise<AdminAccount | undefined> {
    return this.items.get(id);
  }

  async findByEmail(email: string): Promise<AdminAccount | undefined> {
    const needle = email.trim().toLowerCase();
    return Array.from(this.items.values()).find(
      (account) => account.email.toLowerCase() === needle
    );
  }

  async create(account: AdminAccount): Promise<AdminAccount> {
    this.items.set(account.id, account);
    return account;
  }

  async updatePassword(
    id: string,
    passwordHash: string
  ): Promise<AdminAccount | undefined> {
    const current = this.items.get(id);
    if (!current) return undefined;
    const next: AdminAccount = {
      ...current,
      passwordHash,
      updatedAt: new Date().toISOString()
    };
    this.items.set(id, next);
    return next;
  }

  async touchLastLogin(id: string, atIso: string): Promise<AdminAccount | undefined> {
    const current = this.items.get(id);
    if (!current) return undefined;
    const next: AdminAccount = {
      ...current,
      lastLoginAt: atIso,
      updatedAt: atIso
    };
    this.items.set(id, next);
    return next;
  }
}
