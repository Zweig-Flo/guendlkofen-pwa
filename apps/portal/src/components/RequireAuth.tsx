import { useEffect } from 'react'
import { Center, Loader, Stack, Text } from '@mantine/core'
import { useAuth0 } from '@auth0/auth0-react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router-dom'

/** Gate for authenticated routes: redirects unauthenticated visitors to the
 *  Auth0 login and remembers where they were headed (appState.returnTo). */
function RequireAuth() {
  const { t } = useTranslation()
  const { isLoading, isAuthenticated, loginWithRedirect } = useAuth0()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void loginWithRedirect({
        appState: { returnTo: window.location.pathname + window.location.search },
      })
    }
  }, [isLoading, isAuthenticated, loginWithRedirect])

  if (!isAuthenticated) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="sm">
          <Loader />
          <Text c="dimmed" size="sm">
            {isLoading ? t('common.loading') : t('auth.redirecting')}
          </Text>
        </Stack>
      </Center>
    )
  }

  return <Outlet />
}

export default RequireAuth
