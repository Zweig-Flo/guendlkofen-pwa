import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

const sendNotification = webpush.sendNotification as jest.Mock;
const setVapidDetails = webpush.setVapidDetails as jest.Mock;

/** ConfigService stub returning the given VAPID env values. */
function config(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const VAPID = {
  VAPID_PUBLIC_KEY: 'public-key',
  VAPID_PRIVATE_KEY: 'private-key',
  VAPID_SUBJECT: 'mailto:test@example.com',
};

function sub(endpoint: string) {
  return { endpoint, p256dh: 'p', auth: 'a' };
}

/** A web-push error carries the HTTP status the push service returned. */
function pushError(statusCode: number): Error {
  return Object.assign(new Error(`push failed ${statusCode}`), { statusCode });
}

describe('PushService', () => {
  const prismaMock = {
    pushSubscription: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
  };

  async function build(values: Record<string, string | undefined>) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: config(values) },
      ],
    }).compile();
    return module.get(PushService);
  }

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.pushSubscription.upsert.mockResolvedValue({});
  });

  it('exposes the configured public key', async () => {
    const service = await build(VAPID);
    expect(service.getPublicKey()).toBe('public-key');
    expect(setVapidDetails).toHaveBeenCalled();
  });

  it('returns an empty key and logs instead of sending when VAPID is unset', async () => {
    const service = await build({});
    expect(service.getPublicKey()).toBe('');

    prismaMock.pushSubscription.findMany.mockResolvedValue([sub('e1')]);
    const result = await service.sendToUser('user-1', {
      title: 't',
      body: 'b',
      url: 'u',
    });

    expect(result.subscriptionCount).toBe(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('prunes subscriptions that a push service reports as gone (404/410)', async () => {
    const service = await build(VAPID);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      sub('dead-410'),
      sub('dead-404'),
      sub('alive'),
    ]);
    sendNotification.mockImplementation(
      (subscription: { endpoint: string }) => {
        if (subscription.endpoint === 'dead-410') {
          return Promise.reject(pushError(410));
        }
        if (subscription.endpoint === 'dead-404') {
          return Promise.reject(pushError(404));
        }
        return Promise.resolve();
      },
    );

    const result = await service.sendToUser('user-1', {
      title: 't',
      body: 'b',
      url: 'u',
    });

    expect(result.subscriptionCount).toBe(3);
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: { in: ['dead-410', 'dead-404'] } },
    });
  });

  it('keeps subscriptions on transient (non-404/410) errors', async () => {
    const service = await build(VAPID);
    prismaMock.pushSubscription.findMany.mockResolvedValue([sub('e1')]);
    sendNotification.mockRejectedValue(pushError(500));

    await service.sendToUser('user-1', { title: 't', body: 'b', url: 'u' });

    expect(prismaMock.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });

  it('returns zero without touching web-push when the user has no subscriptions', async () => {
    const service = await build(VAPID);
    prismaMock.pushSubscription.findMany.mockResolvedValue([]);

    const result = await service.sendToUser('user-1', {
      title: 't',
      body: 'b',
      url: 'u',
    });

    expect(result.subscriptionCount).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('upserts a subscription by endpoint, moving ownership to the caller', async () => {
    const service = await build(VAPID);
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';
    prismaMock.pushSubscription.findUnique.mockResolvedValue({
      userId: 'user-1',
    });

    await service.saveSubscription('user-2', {
      endpoint,
      keys: { p256dh: 'pk', auth: 'ak' },
      userAgent: 'UA',
    });

    expect(prismaMock.pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint },
      create: {
        userId: 'user-2',
        endpoint,
        p256dh: 'pk',
        auth: 'ak',
        userAgent: 'UA',
      },
      update: { userId: 'user-2', p256dh: 'pk', auth: 'ak', userAgent: 'UA' },
    });
  });

  it.each([
    ['not a URL', 'e1'],
    ['plain http', 'http://push.example.com/x'],
    ['loopback', 'https://127.0.0.1/x'],
    ['localhost', 'https://localhost:3000/x'],
    ['private range', 'https://192.168.1.10/x'],
    ['link-local metadata', 'https://169.254.169.254/latest/meta-data'],
  ])('rejects unsafe endpoint (%s) with 400', async (_label, endpoint) => {
    const service = await build(VAPID);

    await expect(
      service.saveSubscription('user-1', {
        endpoint,
        keys: { p256dh: 'pk', auth: 'ak' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it('deletes a subscription scoped to the calling user', async () => {
    const service = await build(VAPID);

    await service.deleteSubscription('user-1', 'e1');

    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'e1', userId: 'user-1' },
    });
  });
});
