import { useCallback, useState } from 'react'
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Stack,
  Switch,
  Text,
} from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { isIosDevice, isStandalone } from './push'
import { usePush } from './usePush'

const DISMISS_KEY = 'svg-push-dismissed'

/** Remembers (in localStorage) that the promo/hint card was dismissed. */
function useDismissed(key) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      window.localStorage.setItem(key, '1')
    } catch {
      // ignore
    }
  }, [key])
  return [dismissed, dismiss]
}

/**
 * Home-screen push opt-in. Shows one of:
 *  - an "add to home screen" hint on iOS Safari (push needs an installed PWA),
 *  - a dismissible opt-in card while the user hasn't decided,
 *  - an on/off toggle once subscribed.
 * Renders nothing when there's nothing useful to offer.
 */
export function PushSetup() {
  const { t } = useTranslation()
  const { supported, permission, subscribed, busy, enable, disable } = usePush()
  const [dismissed, dismiss] = useDismissed(DISMISS_KEY)

  // iOS Safari tab: push only works from an installed PWA.
  if (isIosDevice() && !isStandalone()) {
    if (dismissed) return null
    return (
      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Text fw={600}>🔔 {t('push.title')}</Text>
            <Text c="dimmed" fz="sm">
              {t('push.iosHint')}
            </Text>
          </Stack>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={t('common.close')}
            onClick={dismiss}
          >
            ✕
          </ActionIcon>
        </Group>
      </Card>
    )
  }

  if (!supported) return null

  // Already subscribed: offer an off switch.
  if (subscribed) {
    return (
      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" wrap="nowrap">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text fw={600}>🔔 {t('push.title')}</Text>
            <Text c="dimmed" fz="sm">
              {t('push.active')}
            </Text>
          </Stack>
          <Switch
            checked
            disabled={busy}
            onChange={() => disable()}
            aria-label={t('push.disableLabel')}
          />
        </Group>
      </Card>
    )
  }

  // Not subscribed yet — invite opt-in unless blocked or dismissed.
  if (permission !== 'denied' && !dismissed) {
    return (
      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Text fw={600}>🔔 {t('push.title')}</Text>
            <Text c="dimmed" fz="sm">
              {t('push.body')}
            </Text>
          </Stack>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={t('common.close')}
            onClick={dismiss}
          >
            ✕
          </ActionIcon>
        </Group>
        <Button
          mt="sm"
          fullWidth
          loading={busy}
          onClick={() => enable()}
        >
          {t('push.enable')}
        </Button>
      </Card>
    )
  }

  return null
}
