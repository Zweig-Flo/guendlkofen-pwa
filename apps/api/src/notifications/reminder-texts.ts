import { ReminderKind } from '../generated/prisma/client';

export interface ReminderTextParams {
  kind: ReminderKind;
  /** Locale of the RECIPIENT — decides the message language. */
  locale: string;
  clubName: string;
  teamName: string;
  opponent: string;
  /** Kickoff time; formatted in Europe/Berlin wall-clock. */
  kickoff: Date;
}

export interface BuiltReminder {
  title: string;
  body: string;
}

/** Free-text fields are user-controlled — escape before embedding in HTML. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveLang(locale: string | undefined): 'de' | 'en' {
  return locale?.toLowerCase().startsWith('en') ? 'en' : 'de';
}

function formatKickoff(kickoff: Date, lang: 'de' | 'en'): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  }).format(kickoff);
}

/**
 * Builds a localized reminder title + body. German is primary; anything that
 * is not explicitly `en` falls back to German. Mirrors the plain-function
 * builder style of `src/email/invitation-email.ts`.
 */
export function buildReminderMessage(
  params: ReminderTextParams,
): BuiltReminder {
  const { kind, clubName, teamName, opponent, kickoff } = params;
  const lang = resolveLang(params.locale);
  const when = formatKickoff(kickoff, lang);
  const match = `${teamName} vs. ${opponent}`;

  if (lang === 'en') {
    switch (kind) {
      case ReminderKind.VOTE_7D:
      case ReminderKind.VOTE_2D:
        return {
          title: `${clubName}: please respond`,
          body: `${match} on ${when}. Please let your team know if you can make it.`,
        };
      case ReminderKind.INFO_1D:
        return {
          title: `${clubName}: game tomorrow`,
          body: `${match} on ${when}. You are in — see you there!`,
        };
    }
  }

  switch (kind) {
    case ReminderKind.VOTE_7D:
    case ReminderKind.VOTE_2D:
      return {
        title: `${clubName}: bitte abstimmen`,
        body: `${match} am ${when}. Bitte sag deinem Team, ob du dabei bist.`,
      };
    case ReminderKind.INFO_1D:
      return {
        title: `${clubName}: Spiel morgen`,
        body: `${match} am ${when}. Du bist dabei — bis dann!`,
      };
  }
}
