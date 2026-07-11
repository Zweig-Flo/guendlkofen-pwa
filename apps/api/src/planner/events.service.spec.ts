import { AbilityBuilder } from '@casl/ability';
import { createPrismaAbility } from '@casl/prisma/runtime';
import { Test, TestingModule } from '@nestjs/testing';
import type { AppAbility } from '../casl/app-ability';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from '../teams/teams.service';
import { computeImportKey, wallClockToUtc } from './csv-import';
import { EventsService } from './events.service';

const CLUB_ID = 'club-a';
const TEAM_ID = 'team-a1';

function importerAbility(): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);
  can('manage', 'Event', { teamId: { in: [TEAM_ID] } });
  return build();
}

const CSV = [
  'Datum;Zeit;Gegner',
  '2026-09-12;15:00;SV Musterhausen',
  '2026-09-19;11:00;TSV Beispieldorf',
].join('\n');

const KEY_1 = computeImportKey('2026-09-12', 'SV Musterhausen');
const KEY_2 = computeImportKey('2026-09-19', 'TSV Beispieldorf');
const STARTS_1 = wallClockToUtc('Europe/Berlin', 2026, 9, 12, 15, 0);
const STARTS_2 = wallClockToUtc('Europe/Berlin', 2026, 9, 19, 11, 0);

function existingRow(importKey: string, startsAt: Date, opponent: string) {
  return {
    id: `evt-${importKey.slice(0, 6)}`,
    teamId: TEAM_ID,
    startsAt,
    opponent,
    location: null,
    homeAway: 'HOME',
    notes: null,
    status: 'SCHEDULED',
    source: 'IMPORT',
    importKey,
  };
}

function csvFile(content = CSV): Express.Multer.File {
  const buffer = Buffer.from(content, 'utf8');
  return {
    buffer,
    size: buffer.byteLength,
    mimetype: 'text/csv',
    originalname: 'events.csv',
  } as Express.Multer.File;
}

describe('EventsService.importCsv (dedupe / upsert)', () => {
  let service: EventsService;

  const prismaMock = {
    event: { findMany: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  };
  const teamsServiceMock = { getTeamInClubForAbility: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    teamsServiceMock.getTeamInClubForAbility.mockResolvedValue({
      id: TEAM_ID,
      clubId: CLUB_ID,
    });
    prismaMock.event.upsert.mockReturnValue(Promise.resolve({}));
    prismaMock.$transaction.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TeamsService, useValue: teamsServiceMock },
      ],
    }).compile();
    service = module.get(EventsService);
  });

  it('imports every row on a first run (no existing importKeys)', async () => {
    prismaMock.event.findMany.mockResolvedValue([]);

    const result = await service.importCsv(
      importerAbility(),
      CLUB_ID,
      TEAM_ID,
      csvFile(),
    );

    expect(result.imported).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errorCount).toBe(0);
    // Existing lookup is scoped to the row importKeys (never MANUAL/null keys).
    expect(prismaMock.event.findMany).toHaveBeenCalledWith({
      where: { teamId: TEAM_ID, importKey: { in: [KEY_1, KEY_2] } },
    });
  });

  it('skips every row when re-importing an identical file', async () => {
    prismaMock.event.findMany.mockResolvedValue([
      existingRow(KEY_1, STARTS_1, 'SV Musterhausen'),
      existingRow(KEY_2, STARTS_2, 'TSV Beispieldorf'),
    ]);

    const result = await service.importCsv(
      importerAbility(),
      CLUB_ID,
      TEAM_ID,
      csvFile(),
    );

    expect(result.imported).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it('updates a row whose start time was corrected (same date+opponent key)', async () => {
    // Existing row-1 has a different (old) kickoff time but the same importKey.
    prismaMock.event.findMany.mockResolvedValue([
      existingRow(
        KEY_1,
        new Date(STARTS_1.getTime() - 60 * 60 * 1000),
        'SV Musterhausen',
      ),
      existingRow(KEY_2, STARTS_2, 'TSV Beispieldorf'),
    ]);

    const result = await service.importCsv(
      importerAbility(),
      CLUB_ID,
      TEAM_ID,
      csvFile(),
    );

    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    // The corrected row upserts on its stable key, keeping the same event/votes.
    expect(prismaMock.event.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId_importKey: { teamId: TEAM_ID, importKey: KEY_1 } },
      }),
    );
  });
});
