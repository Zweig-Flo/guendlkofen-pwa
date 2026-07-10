import { notifications } from '@mantine/notifications'
import { ApiError } from '@guendlkofen/api-client'
import i18n from '../i18n'

/** HTTP status carried by a failed request, or undefined for non-API errors. */
export function errorStatus(error: unknown): number | undefined {
  return error instanceof ApiError ? error.status : undefined
}

/**
 * Shows an error notification. `messages` maps HTTP status codes to
 * already-translated messages; falls back to a generic message.
 */
export function notifyError(error: unknown, messages: Record<number, string> = {}) {
  const status = errorStatus(error)
  const message =
    (status !== undefined && messages[status]) ||
    (status === 409 ? i18n.t('errors.conflict') : i18n.t('errors.generic'))

  notifications.show({
    color: 'red',
    title: i18n.t('errors.genericTitle'),
    message,
  })
}

/** Shows a success notification. */
export function notifySuccess(message: string) {
  notifications.show({ color: 'green', message })
}
