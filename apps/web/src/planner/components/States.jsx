import { Button, Center, Loader, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'

export function LoadingState() {
  return (
    <Center mih={200}>
      <Loader />
    </Center>
  )
}

export function ErrorState({ onRetry }) {
  const { t } = useTranslation()
  return (
    <Center mih={200}>
      <Stack align="center" gap="sm">
        <Text c="dimmed">{t('common.error.loadFailed')}</Text>
        {onRetry && (
          <Button variant="light" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )}
      </Stack>
    </Center>
  )
}

export function EmptyState({ message }) {
  return (
    <Center mih={160} px="md">
      <Text c="dimmed" ta="center">
        {message}
      </Text>
    </Center>
  )
}
