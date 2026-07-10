import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Builds the OpenAPI document for the API.
 *
 * Shared between the HTTP bootstrap (Swagger UI at /docs) and the
 * offline spec emitter (scripts/emit-openapi.ts).
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const auth0Domain = process.env.AUTH0_DOMAIN ?? '';
  const auth0Audience = process.env.AUTH0_AUDIENCE ?? '';
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Guendlkofen API')
    .setVersion('1.0')
    .addOAuth2({
      type: 'oauth2',
      flows: {
        authorizationCode: {
          // audience makes Auth0 issue a JWT access token for this API
          authorizationUrl: `https://${auth0Domain}/authorize?audience=${encodeURIComponent(auth0Audience)}`,
          tokenUrl: `https://${auth0Domain}/oauth/token`,
          scopes: {
            openid: 'OpenID Connect',
            profile: 'User profile',
            email: 'Email address',
          },
        },
      },
    })
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, swaggerConfig);
}
