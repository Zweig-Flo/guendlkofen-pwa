import dayjs from 'dayjs'
import 'dayjs/locale/de'

/** Return a dayjs instance localised to the current UI language. */
function loc(value, lang) {
  return dayjs(value).locale(lang === 'de' ? 'de' : 'en')
}

/** Stable day bucket key (local date) for grouping events. */
export function dayKey(value) {
  return dayjs(value).format('YYYY-MM-DD')
}

/** Full weekday + date heading, e.g. "Samstag, 12. September". */
export function formatDayHeading(value, lang) {
  return loc(value, lang).format(lang === 'de' ? 'dddd, D. MMMM' : 'dddd, MMMM D')
}

/** Kickoff time only, e.g. "15:00" / "3:00 PM". */
export function formatTime(value, lang) {
  return loc(value, lang).format(lang === 'de' ? 'HH:mm' : 'h:mm A')
}

/** Compact date + time for cards, e.g. "Sa, 12. Sep · 15:00". */
export function formatDateTime(value, lang) {
  return loc(value, lang).format(
    lang === 'de' ? 'dd, D. MMM · HH:mm' : 'ddd, MMM D · h:mm A',
  )
}

/** Value for a native <input type="datetime-local"> from an ISO/UTC string. */
export function toLocalInputValue(value) {
  if (!value) return ''
  return dayjs(value).format('YYYY-MM-DDTHH:mm')
}

/** Convert a datetime-local wall-clock string to an ISO 8601 UTC string. */
export function localInputToIso(value) {
  return new Date(value).toISOString()
}

/** True once an event's kickoff is in the past. */
export function isPast(startsAt) {
  return dayjs(startsAt).isBefore(dayjs())
}

/** Two-letter initials for an avatar from a display name / email. */
export function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/[\s@.]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Invalidate every planner-related query (event lists, detail, votes and the
 * cross-team /me/upcoming-events aggregation) so tallies reconcile after a
 * mutation. Returns the promise so callers can await refetch settle.
 */
export function invalidatePlanner(queryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey?.[0]
      return (
        typeof key === 'string' &&
        (key.includes('/events') || key.includes('/upcoming-events'))
      )
    },
  })
}
