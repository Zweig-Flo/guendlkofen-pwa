import { Ability, subject } from '@casl/ability';
import type { PrismaQueryOf, Subjects } from '@casl/prisma/runtime';
import type {
  Club,
  ClubMembership,
  Event,
  Invitation,
  Prisma,
  Team,
  TeamMembership,
  User,
  Vote,
} from '../generated/prisma/client';

export type Action =
  'manage' | 'create' | 'read' | 'update' | 'delete' | 'vote';

export type AppSubjects =
  | 'all'
  | Subjects<{
      User: User;
      Club: Club;
      Team: Team;
      ClubMembership: ClubMembership;
      TeamMembership: TeamMembership;
      Invitation: Invitation;
      Event: Event;
      Vote: Vote;
    }>;

export type SubjectName = Extract<AppSubjects, string>;

export type AppPrismaQuery = PrismaQueryOf<Prisma.TypeMap>;

export type AppAbility = Ability<[Action, AppSubjects], AppPrismaQuery>;

/**
 * Tags a (possibly partial) record with its CASL subject type so it can be
 * passed to `ability.can(...)`. Partial records are fine as long as they
 * carry the fields the ability conditions look at (e.g. `clubId`).
 */
export function toSubject(
  type: Exclude<SubjectName, 'all'>,
  record: Record<string, unknown>,
): AppSubjects {
  return subject(type, record) as unknown as AppSubjects;
}
