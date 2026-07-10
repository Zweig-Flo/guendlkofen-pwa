export interface InvitationEmailParams {
  /** Locale of the INVITER — decides the email language. */
  locale: string;
  clubName: string;
  /** Full acceptance link, e.g. `${PORTAL_URL}/invite/<token>`. */
  link: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

/** Club names are user-controlled — escape before interpolating into HTML. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Builds the localized invitation email. German is the primary language;
 * anything that is not explicitly `en` falls back to German.
 */
export function buildInvitationEmail(
  params: InvitationEmailParams,
): BuiltEmail {
  const { clubName, link } = params;
  const safeClubName = escapeHtml(clubName);
  const lang = params.locale?.toLowerCase().startsWith('en') ? 'en' : 'de';

  if (lang === 'en') {
    const subject = `You have been invited to ${clubName}`;
    const text = [
      `You have been invited to join ${clubName}.`,
      '',
      `Accept the invitation by opening the following link:`,
      link,
      '',
      `This link expires in 14 days.`,
    ].join('\n');
    const html = [
      `<p>You have been invited to join <strong>${safeClubName}</strong>.</p>`,
      `<p><a href="${link}">Accept the invitation</a></p>`,
      `<p>Or copy this link into your browser:<br/>${link}</p>`,
      `<p>This link expires in 14 days.</p>`,
    ].join('\n');
    return { subject, html, text };
  }

  const subject = `Du wurdest zu ${clubName} eingeladen`;
  const text = [
    `Du wurdest eingeladen, ${clubName} beizutreten.`,
    '',
    `Nimm die Einladung an, indem du den folgenden Link öffnest:`,
    link,
    '',
    `Dieser Link läuft in 14 Tagen ab.`,
  ].join('\n');
  const html = [
    `<p>Du wurdest eingeladen, <strong>${safeClubName}</strong> beizutreten.</p>`,
    `<p><a href="${link}">Einladung annehmen</a></p>`,
    `<p>Oder kopiere diesen Link in deinen Browser:<br/>${link}</p>`,
    `<p>Dieser Link läuft in 14 Tagen ab.</p>`,
  ].join('\n');
  return { subject, html, text };
}
