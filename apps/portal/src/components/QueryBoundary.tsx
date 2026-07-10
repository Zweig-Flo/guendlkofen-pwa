import type { ReactNode } from 'react'
import { Alert, Button, Center, Group, Loader, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'

interface QueryBoundaryProps {
  isLoading: boolean
  isError: boolean
  onRetry?: () => void
  children: ReactNode
}

/** Renders a loader while loading, an error alert with retry on failure,
 *  otherwise the children. */
function QueryBoundary({ isLoading, isError, onRetry, children }: QueryBoundaryProps) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  }

  if (isError) {
    return (
      <Alert color="red" title={t('errors.loadFailed')}>
        <Stack gap="sm" align="flex-start">
          <Text size="sm">{t('errors.generic')}</Text>
          {onRetry && (
            <Group>
              <Button variant="light" size="xs" onClick={onRetry}>
                {t('common.retry')}
              </Button>
            </Group>
          )}
        </Stack>
      </Alert>
    )
  }

  return <>{children}</>
}

export default QueryBoundary
