import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { UsersService } from '../users/users.service';

// jwks-rsa pulls in `jose` (ESM), which the unit jest config does not transform.
// These tests reject before any signing key is ever fetched, so a lightweight
// factory mock keeps the suite hermetic (no jose load, no network).
jest.mock('jwks-rsa', () => ({
  JwksClient: jest.fn().mockImplementation(() => ({
    getSigningKey: jest.fn(),
  })),
}));

import { WsAuthService } from './ws-auth.service';

function makeService(): {
  service: WsAuthService;
  provision: jest.Mock;
} {
  const config = {
    getOrThrow: jest.fn((key: string) =>
      key === 'AUTH0_DOMAIN' ? 'tenant.eu.auth0.com' : 'https://api.test',
    ),
  } as unknown as ConfigService;
  const provision = jest.fn();
  const users = { provisionFromToken: provision } as unknown as UsersService;
  return { service: new WsAuthService(config, users), provision };
}

describe('WsAuthService', () => {
  it('rejects a missing token without touching the user service', async () => {
    const { service, provision } = makeService();
    await expect(service.verifyAndProvision(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(provision).not.toHaveBeenCalled();
  });

  it('rejects a malformed / garbage token before any network call', async () => {
    const { service, provision } = makeService();
    // No dots → "jwt malformed": jsonwebtoken rejects during decode, so the
    // JWKS is never fetched and the user is never provisioned.
    await expect(
      service.verifyAndProvision('not-a-real-jwt'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(provision).not.toHaveBeenCalled();
  });

  it('rejects an empty-string token without touching the user service', async () => {
    const { service, provision } = makeService();
    await expect(service.verifyAndProvision('')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(provision).not.toHaveBeenCalled();
  });
});
