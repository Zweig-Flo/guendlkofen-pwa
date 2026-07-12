import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import type { User } from '../generated/prisma/client';
import { UsersService } from '../users/users.service';

/**
 * Verifies an Auth0 access token presented over the WebSocket handshake and
 * resolves the local Prisma user — the socket-side equivalent of
 * {@link JwtStrategy}. It checks the SAME issuer, audience, algorithm and JWKS
 * as the HTTP guard, then provisions via the shared `UsersService`.
 */
@Injectable()
export class WsAuthService {
  private readonly jwks: JwksClient;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const domain = config.getOrThrow<string>('AUTH0_DOMAIN');
    this.issuer = `https://${domain}/`;
    this.audience = config.getOrThrow<string>('AUTH0_AUDIENCE');
    this.jwks = new JwksClient({
      jwksUri: `https://${domain}/.well-known/jwks.json`,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
    });
  }

  /** Verifies the token and returns the local user, or throws Unauthorized. */
  async verifyAndProvision(token: string | undefined): Promise<User> {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing access token');
    }
    const payload = await this.verify(token);
    return this.usersService.provisionFromToken(payload);
  }

  private verify(token: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        (header, callback) => {
          this.jwks.getSigningKey(header.kid, (err, key) => {
            if (err || !key) {
              callback(err ?? new Error('Signing key not found'));
              return;
            }
            callback(null, key.getPublicKey());
          });
        },
        {
          audience: this.audience,
          issuer: this.issuer,
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err || !decoded || typeof decoded !== 'object') {
            reject(new UnauthorizedException('Invalid access token'));
            return;
          }
          resolve(decoded);
        },
      );
    });
  }
}
