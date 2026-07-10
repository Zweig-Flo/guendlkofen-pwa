import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Open API — auth happens via Auth0 bearer tokens, not cookies
  app.enableCors({ origin: '*' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

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
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      initOAuth: {
        clientId: process.env.AUTH0_CLIENT_ID,
        scopes: ['openid', 'profile', 'email'],
        usePkceWithAuthorizationCodeGrant: true,
      },
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
