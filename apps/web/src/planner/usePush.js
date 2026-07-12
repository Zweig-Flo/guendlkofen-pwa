import { useCallback, useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import {
  getCurrentSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from './push'

/**
 * Push opt-in state + actions for the UI. Tracks browser permission and the
 * live subscription, and surfaces enable/disable with user-facing toasts.
 */
export function usePush() {
  const { t } = useTranslation()
  const supported = isPushSupported()
  const [permission, setPermission] = useState(() =>
    supported ? Notification.permission : 'denied',
  )
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supported) return undefined
    let active = true
    getCurrentSubscription()
      .then((subscription) => {
        if (active) setSubscribed(Boolean(subscription))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [supported])

  const enable = useCallback(async () => {
    if (busy) return false
    setBusy(true)
    try {
      const result = await subscribeToPush()
      setPermission(result.permission ?? Notification.permission)
      if (result.ok) {
        setSubscribed(true)
        notifications.show({ color: 'green', message: t('push.enabled') })
        return true
      }
      if (result.permission === 'denied') {
        notifications.show({ color: 'red', message: t('push.denied') })
      } else {
        notifications.show({ color: 'red', message: t('push.failed') })
      }
      return false
    } catch {
      notifications.show({ color: 'red', message: t('push.failed') })
      return false
    } finally {
      setBusy(false)
    }
  }, [busy, t])

  const disable = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      await unsubscribeFromPush()
      setSubscribed(false)
      notifications.show({ message: t('push.disabled') })
    } catch {
      notifications.show({ color: 'red', message: t('push.failed') })
    } finally {
      setBusy(false)
    }
  }, [busy, t])

  return { supported, permission, subscribed, busy, enable, disable }
}
