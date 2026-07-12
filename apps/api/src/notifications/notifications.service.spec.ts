import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../email/email.service';
import { ReminderKind, type User } from '../generated/prisma/client';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    auth0Sub: 'auth0|1',
    email: 'player@example.com',
    name: 'Player One',
    locale: 'de',
    isSuperAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const CONTENT = {
  kind: ReminderKind.VOTE_7D,
  clubName: 'SV Gündlkofen',
  teamName: 'Herren 1',
  opponent: 'SV Musterhausen',
  kickoff: new Date('2026-07-19T16:00:00.000Z'),
  url: 'https://app.test/clubs/c/teams/t/events/e',
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  const pushMock = { sendToUser: jest.fn() };
  const emailMock = { send: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    emailMock.send.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PushService, useValue: pushMock },
        { provide: EmailService, useValue: emailMock },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  it('pushes and does NOT email when the user has subscriptions', async () => {
    pushMock.sendToUser.mockResolvedValue({ subscriptionCount: 2 });

    await service.notify(makeUser(), CONTENT);

    expect(pushMock.sendToUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ url: CONTENT.url }),
    );
    expect(emailMock.send).not.toHaveBeenCalled();
  });

  it('falls back to email when the user has zero subscriptions', async () => {
    pushMock.sendToUser.mockResolvedValue({ subscriptionCount: 0 });

    await service.notify(makeUser(), CONTENT);

    expect(emailMock.send).toHaveBeenCalledTimes(1);
    const [arg] = emailMock.send.mock.calls[0] as [
      { to: string; text: string },
    ];
    expect(arg.to).toBe('player@example.com');
    expect(arg.text).toContain(CONTENT.url);
  });

  it('drops the reminder (no email) when there is no push and no email', async () => {
    pushMock.sendToUser.mockResolvedValue({ subscriptionCount: 0 });

    await service.notify(makeUser({ email: null }), CONTENT);

    expect(emailMock.send).not.toHaveBeenCalled();
  });
});
