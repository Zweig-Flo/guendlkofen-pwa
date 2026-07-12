export interface ChatPushParams {
  /** Locale of the RECIPIENT — decides the message language. */
  locale: string;
  teamName: string;
  authorName: string;
  /** Already-decrypted message text; truncated here for the preview. */
  content: string;
}

export interface BuiltChatPush {
  title: string;
  body: string;
}

const PREVIEW_MAX = 80;

function resolveLang(locale: string | undefined): 'de' | 'en' {
  return locale?.toLowerCase().startsWith('en') ? 'en' : 'de';
}

/** Collapse whitespace and cut to ~80 chars with an ellipsis. */
export function previewText(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= PREVIEW_MAX) {
    return normalized;
  }
  return `${normalized.slice(0, PREVIEW_MAX - 1).trimEnd()}…`;
}

/**
 * Localized push copy for a new chat message. German is primary; anything not
 * explicitly `en` falls back to German (same policy as the reminder texts).
 */
export function buildChatPush(params: ChatPushParams): BuiltChatPush {
  const lang = resolveLang(params.locale);
  const preview = previewText(params.content);
  const author = params.authorName || (lang === 'en' ? 'Someone' : 'Jemand');

  if (lang === 'en') {
    return {
      title: `New message in ${params.teamName}`,
      body: `${author}: ${preview}`,
    };
  }
  return {
    title: `Neue Nachricht in ${params.teamName}`,
    body: `${author}: ${preview}`,
  };
}
