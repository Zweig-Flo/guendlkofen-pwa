import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useQueryClient } from '@tanstack/react-query'
import { ActionIcon, Box, Container, Group, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { clearPersistedCache } from '../queryPersist.js'
import { unsubscribeFromPush } from './push'

const NAV = [
  { to: '/', key: 'nav.home', icon: '🏠', exact: true },
  { to: '/teams', key: 'nav.teams', icon: '👥', exact: false },
]

function isActive(pathname, item) {
  if (item.exact) return pathname === item.to
  return pathname.startsWith(item.to)
}

/**
 * Mobile-first shell: a slim header with the app title + logout, a scrollable
 * content area (routed screens via <Outlet/>), and a fixed bottom navigation
 * bar with large tap targets between Home and Teams.
 */
export function AppShellLayout() {
  const { t } = useTranslation()
  const { logout } = useAuth0()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const BOTTOM_NAV_H = 60

  // On logout: drop this device's push subscription and wipe the cached
  // personal data before Auth0 redirects away (shared-device hygiene).
  const handleLogout = async () => {
    try {
      await unsubscribeFromPush()
    } catch {
      // ignore — proceed with logout regardless.
    }
    clearPersistedCache(queryClient)
    logout({ logoutParams: { returnTo: window.location.origin } })
  }

  return (
    <Box style={{ textAlign: 'left', minHeight: '100svh' }}>
      <Box
        component="header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--mantine-color-body)',
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Container size="sm" py="sm">
          <Group justify="space-between">
            <Text fw={700} fz="lg">
              {t('planner.title')}
            </Text>
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label={t('auth.logout')}
              onClick={handleLogout}
            >
              ⏻
            </ActionIcon>
          </Group>
        </Container>
      </Box>

      <Container
        size="sm"
        py="md"
        style={{ paddingBottom: BOTTOM_NAV_H + 24 }}
      >
        <Outlet />
      </Container>

      <Box
        component="nav"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: BOTTOM_NAV_H,
          zIndex: 10,
          background: 'var(--mantine-color-body)',
          borderTop: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Container size="sm" h="100%">
          <Group grow h="100%" gap={0}>
            {NAV.map((item) => {
              const active = isActive(pathname, item)
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    height: '100%',
                    textDecoration: 'none',
                    color: active
                      ? 'var(--mantine-color-anchor)'
                      : 'var(--mantine-color-dimmed)',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <span style={{ fontSize: 12 }}>{t(item.key)}</span>
                </NavLink>
              )
            })}
          </Group>
        </Container>
      </Box>
    </Box>
  )
}
