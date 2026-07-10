import { AppShell, Avatar, Burger, Group, Menu, Text, Title, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useAuth0 } from '@auth0/auth0-react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet } from 'react-router-dom'
import LanguageSwitcher from './LanguageSwitcher'

/** Shell with a header (title, language switcher, user menu) wrapping all
 *  authenticated pages via react-router's <Outlet />. */
function AppLayout() {
  const { t } = useTranslation()
  const { user, logout } = useAuth0()
  const [opened, { toggle }] = useDisclosure(false)

  const displayName = user?.name ?? user?.email ?? t('auth.account')
  const initial = (displayName ?? '?').charAt(0).toUpperCase()

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title
              order={4}
              style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}
              renderRoot={(props) => <Link to="/" {...props} />}
            >
              {t('app.title')}
            </Title>
          </Group>

          <Group gap="md" wrap="nowrap">
            <LanguageSwitcher />
            <Menu position="bottom-end" withArrow shadow="md">
              <Menu.Target>
                <UnstyledButton>
                  <Group gap="xs" wrap="nowrap">
                    <Avatar radius="xl" size="sm" color="blue">
                      {initial}
                    </Avatar>
                    <Text size="sm" visibleFrom="sm">
                      {displayName}
                    </Text>
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{displayName}</Menu.Label>
                {user?.email && user.email !== displayName && (
                  <Menu.Label>
                    <Text size="xs" c="dimmed">
                      {user.email}
                    </Text>
                  </Menu.Label>
                )}
                <Menu.Divider />
                <Menu.Item
                  onClick={() =>
                    logout({ logoutParams: { returnTo: window.location.origin } })
                  }
                >
                  {t('auth.logout')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}

export default AppLayout
