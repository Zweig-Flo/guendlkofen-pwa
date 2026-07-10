import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const domain = config.getOrThrow<string>('AUTH0_DOMAIN');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      }),
      audience: config.getOrThrow<string>('AUTH0_AUDIENCE'),
      issuer: `https://${domain}/`,
      algorithms: ['RS256'],
    });
  }

  validate(payload: Record<string, unknown>) {
    // Returned value becomes request.user
    return payload;
  }
}
