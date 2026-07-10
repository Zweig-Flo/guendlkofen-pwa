import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_CLAIM, NAME_CLAIM, UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const configMock = { get: jest.fn() };

  const baseUser = {
    id: 'user-1',
    auth0Sub: 'auth0|abc',
    email: 'old@example.com',
    name: 'Old Name',
    locale: 'de',
    isSuperAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    configMock.get.mockReturnValue('admin@example.com, boss@example.com');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('creates a new user from the token payload', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(baseUser);

    await service.provisionFromToken({
      sub: 'auth0|abc',
      [EMAIL_CLAIM]: 'new@example.com',
      [NAME_CLAIM]: 'New Name',
    });

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        auth0Sub: 'auth0|abc',
        email: 'new@example.com',
        name: 'New Name',
        isSuperAdmin: false,
      },
    });
  });

  it('creates a super admin when the email is listed in SUPER_ADMIN_EMAILS', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(baseUser);

    await service.provisionFromToken({
      sub: 'auth0|abc',
      [EMAIL_CLAIM]: 'Admin@Example.com',
    });

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        auth0Sub: 'auth0|abc',
        email: 'Admin@Example.com',
        name: undefined,
        isSuperAdmin: true,
      },
    });
  });

  it('returns the existing user unchanged when nothing differs', async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser);

    const result = await service.provisionFromToken({
      sub: 'auth0|abc',
      [EMAIL_CLAIM]: 'old@example.com',
      [NAME_CLAIM]: 'Old Name',
    });

    expect(result).toBe(baseUser);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('updates changed email/name and promotes newly listed super admins', async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser);
    prismaMock.user.update.mockResolvedValue({
      ...baseUser,
      email: 'admin@example.com',
      isSuperAdmin: true,
    });

    await service.provisionFromToken({
      sub: 'auth0|abc',
      [EMAIL_CLAIM]: 'admin@example.com',
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { auth0Sub: 'auth0|abc' },
      data: { email: 'admin@example.com', isSuperAdmin: true },
    });
  });

  it('keeps super admin status even when the email is no longer listed', async () => {
    configMock.get.mockReturnValue('');
    prismaMock.user.findUnique.mockResolvedValue({
      ...baseUser,
      isSuperAdmin: true,
    });

    const result = await service.provisionFromToken({
      sub: 'auth0|abc',
      [EMAIL_CLAIM]: 'old@example.com',
      [NAME_CLAIM]: 'Old Name',
    });

    expect(result.isSuperAdmin).toBe(true);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
