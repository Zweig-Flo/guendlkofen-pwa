import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import type { User } from './generated/prisma/client';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toEqual({ message: 'Hello World!' });
    });
  });

  describe('me', () => {
    it('should map the provisioned user to a UserDto', () => {
      const user: User = {
        id: 'user-1',
        auth0Sub: 'auth0|abc',
        email: 'player@example.com',
        name: 'Max Mustermann',
        locale: 'de',
        isSuperAdmin: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const req = { user } as unknown as Request;

      expect(appController.getProfile(req)).toEqual({
        id: 'user-1',
        email: 'player@example.com',
        name: 'Max Mustermann',
        locale: 'de',
        isSuperAdmin: true,
      });
    });
  });
});
