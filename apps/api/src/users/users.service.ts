import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CLAIM_NAMESPACE = 'https://guendlkofen.app';
export const EMAIL_CLAIM = `${CLAIM_NAMESPACE}/email`;
export const NAME_CLAIM = `${CLAIM_NAMESPACE}/name`;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Upserts the local User record for an Auth0 access-token payload.
   * Called on every authenticated request; the result becomes `request.user`.
   */
  async provisionFromToken(payload: Record<string, unknown>): Promise<User> {
    const auth0Sub = payload.sub as string;
    const email = this.optionalString(payload[EMAIL_CLAIM]);
    const name = this.optionalString(payload[NAME_CLAIM]);
    const isSuperAdminEmail =
      email !== undefined && this.isSuperAdminEmail(email);

    const existing = await this.prisma.user.findUnique({ where: { auth0Sub } });
    if (!existing) {
      return this.prisma.user.create({
        data: {
          auth0Sub,
          email,
          name,
          isSuperAdmin: isSuperAdminEmail,
        },
      });
    }

    const data: { email?: string; name?: string; isSuperAdmin?: boolean } = {};
    if (email !== undefined && email !== existing.email) {
      data.email = email;
    }
    if (name !== undefined && name !== existing.name) {
      data.name = name;
    }
    // Once super admin, always super admin; newly listed emails get promoted.
    if (!existing.isSuperAdmin && isSuperAdminEmail) {
      data.isSuperAdmin = true;
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }
    return this.prisma.user.update({ where: { auth0Sub }, data });
  }

  private isSuperAdminEmail(email: string): boolean {
    const configured = this.config.get<string>('SUPER_ADMIN_EMAILS') ?? '';
    return configured
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0)
      .includes(email.toLowerCase());
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
