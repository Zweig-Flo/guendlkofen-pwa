import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './swagger';

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

  const document = buildOpenApiDocument(app);
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
