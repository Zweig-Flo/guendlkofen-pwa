import { Anchor, Container, Group, Tabs, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useClubsControllerFindOne } from '@guendlkofen/api-client'
import QueryBoundary from '../components/QueryBoundary'
import { useClubPermissions } from '../lib/permissions'
import TeamsTab from './tabs/TeamsTab'
import MembersTab from './tabs/MembersTab'
import InvitationsTab from './tabs/InvitationsTab'

function ClubPage() {
  const { t } = useTranslation()
  const { clubId = '' } = useParams()

  const clubQuery = useClubsControllerFindOne(clubId)
  const perms = useClubPermissions(clubId)

  return (
    <Container size="lg">
      <Group mb="md">
        <Anchor size="sm" renderRoot={(props) => <Link to="/" {...props} />}>
          ← {t('clubs.title')}
        </Anchor>
      </Group>

      <QueryBoundary
        isLoading={clubQuery.isLoading}
        isError={clubQuery.isError}
        onRetry={() => void clubQuery.refetch()}
      >
        <Title order={2} mb="lg">
          {clubQuery.data?.name}
        </Title>

        <Tabs defaultValue="teams" keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="teams">{t('club.tabs.teams')}</Tabs.Tab>
            <Tabs.Tab value="members">{t('club.tabs.members')}</Tabs.Tab>
            {perms.canManageInvitations && (
              <Tabs.Tab value="invitations">{t('club.tabs.invitations')}</Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="teams">
            <TeamsTab clubId={clubId} canManage={perms.canManageClub} />
          </Tabs.Panel>
          <Tabs.Panel value="members">
            <MembersTab clubId={clubId} canManage={perms.canManageClub} />
          </Tabs.Panel>
          {perms.canManageInvitations && (
            <Tabs.Panel value="invitations">
              <InvitationsTab clubId={clubId} />
            </Tabs.Panel>
          )}
        </Tabs>
      </QueryBoundary>
    </Container>
  )
}

export default ClubPage
