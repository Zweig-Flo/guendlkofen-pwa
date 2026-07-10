import i18n from '../i18n'

/** Formats an ISO date string using the active locale, date only. */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
  }).format(date)
}
