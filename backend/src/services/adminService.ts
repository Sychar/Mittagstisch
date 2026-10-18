import { compareSync, hashSync } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { AdminRepo } from "../repositories/adminRepo";
import { AdminAccount } from "../types";

const DEFAULT_ADMIN_EMAIL = "admin@mittagstisch.de";
const DEFAULT_ADMIN_PASSWORD = "admin123";

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export class AdminService {
  constructor(private adminRepo: AdminRepo) {}

  async bootstrapFromEnv(): Promise<void> {
    const count = await this.adminRepo.count();
    if (count > 0) return;

    const email = normalizeEmail(process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL);
    const password = (process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD).trim();
    if (!email || !password) {
      throw new Error("ADMIN_BOOTSTRAP_INVALID");
    }

    const nowIso = new Date().toISOString();
    await this.adminRepo.create({
      id: randomUUID(),
      email,
      passwordHash: hashSync(password, 10),
      lastLoginAt: undefined,
      createdAt: nowIso,
      updatedAt: nowIso
    });
  }

  async authenticate(email: string, password: string): Promise<AdminAccount | null> {
    const account = await this.adminRepo.findByEmail(normalizeEmail(email));
    if (!account) return null;
    if (!compareSync(password, account.passwordHash)) return null;

    const nowIso = new Date().toISOString();
    const updated = await this.adminRepo.touchLastLogin(account.id, nowIso);
    return updated ?? account;
  }

  async changePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const account = await this.adminRepo.findById(adminId);
    if (!account) {
      throw new Error("ADMIN_NOT_FOUND");
    }
    if (!compareSync(currentPassword, account.passwordHash)) {
      throw new Error("INVALID_CURRENT_PASSWORD");
    }

    const nextPassword = newPassword.trim();
    if (nextPassword.length < 6) {
      throw new Error("WEAK_PASSWORD");
    }

    const updated = await this.adminRepo.updatePassword(
      adminId,
      hashSync(nextPassword, 10)
    );
    if (!updated) {
      throw new Error("ADMIN_NOT_FOUND");
    }
  }
}
