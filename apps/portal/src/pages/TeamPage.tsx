import { useMemo, useState } from 'react'
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  CreateTeamMemberDtoRole,
  getTeamMembersControllerFindAllQueryKey,
  TeamMembershipDtoRole,
  useClubMembersControllerFindAll,
  useTeamMembersControllerAdd,
  useTeamMembersControllerFindAll,
  useTeamMembersControllerRemove,
  useTeamMembersControllerUpdateRole,
  useTeamsControllerFindOne,
  type TeamMembershipDto,
} from '@guendlkofen/api-client'
import QueryBoundary from '../components/QueryBoundary'
import { useTeamPermissions } from '../lib/permissions'
import { notifyError, notifySuccess } from '../lib/errors'

function TeamPage() {
  const { t } = useTranslation()
  const { clubId = '', teamId = '' } = useParams()
  const queryClient = useQueryClient()

  const teamQuery = useTeamsControllerFindOne(clubId, teamId)
  const membersQuery = useTeamMembersControllerFindAll(clubId, teamId)
  const clubMembersQuery = useClubMembersControllerFindAll(clubId)
  const perms = useTeamPermissions(clubId, teamId)
  const canManage = perms.canManageTeam

  const [addOpen, setAddOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getTeamMembersControllerFindAllQueryKey(clubId, teamId),
    })

  const addMutation = useTeamMembersControllerAdd({
    mutation: {
      onSuccess: () => {
        notifySuccess(t('team.added'))
        setAddOpen(false)
        setSelectedUserId(null)
        void invalidate()
      },
      onError: (error) => notifyError(error),
    },
  })

  const updateRole = useTeamMembersControllerUpdateRole({
    mutation: {
      onSuccess: () => {
        notifySuccess(t('team.roleUpdated'))
        void invalidate()
      },
      onError: (error) => notifyError(error),
    },
  })

  const remove = useTeamMembersControllerRemove({
    mutation: {
      onSuccess: () => {
        notifySuccess(t('team.removed'))
        void invalidate()
      },
      onError: (error) => notifyError(error),
    },
  })

  const roleOptions = [
    { value: TeamMembershipDtoRole.PLAYER, label: t('teamRoles.PLAYER') },
    { value: TeamMembershipDtoRole.TEAM_ADMIN, label: t('teamRoles.TEAM_ADMIN') },
  ]

  const eligibleMembers = useMemo(() => {
    const inTeam = new Set((membersQuery.data ?? []).map((m) => m.userId))
    return (clubMembersQuery.data ?? [])
      .filter((m) => !inTeam.has(m.userId))
      .map((m) => ({
        value: m.userId,
        label: m.user.name ?? m.user.email ?? t('members.unnamed'),
      }))
  }, [membersQuery.data, clubMembersQuery.data, t])

  function confirmRemove(member: TeamMembershipDto) {
    const name = member.user.name ?? member.user.email ?? t('members.unnamed')
    modals.openConfirmModal({
      title: t('team.removeTitle'),
      children: <Text size="sm">{t('team.removeConfirm', { name })}</Text>,
      labels: { confirm: t('common.remove'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate({ clubId, teamId, membershipId: member.id }),
    })
  }

  return (
    <Container size="lg">
      <Group mb="md">
        <Anchor size="sm" renderRoot={(props) => <Link to={`/clubs/${clubId}`} {...props} />}>
          ← {t('club.tabs.teams')}
        </Anchor>
      </Group>

      <QueryBoundary
        isLoading={teamQuery.isLoading}
        isError={teamQuery.isError}
        onRetry={() => void teamQuery.refetch()}
      >
        {teamQuery.data && (
          <Group align="baseline" gap="sm" mb="lg">
            <Title order={2}>{teamQuery.data.name}</Title>
            <Text c="dimmed">
              {teamQuery.data.sport} · {t('teams.rank')} {teamQuery.data.rank}
              {teamQuery.data.league ? ` · ${teamQuery.data.league}` : ''}
            </Text>
          </Group>
        )}
      </QueryBoundary>

      <Group justify="space-between" mb="sm">
        <Title order={4}>{t('team.membersTitle')}</Title>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            {t('team.addButton')}
          </Button>
        )}
      </Group>

      <QueryBoundary
        isLoading={membersQuery.isLoading}
        isError={membersQuery.isError}
        onRetry={() => void membersQuery.refetch()}
      >
        {membersQuery.data && membersQuery.data.length === 0 ? (
          <Text c="dimmed">{t('team.empty')}</Text>
        ) : (
          <Table.ScrollContainer minWidth={520}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('members.name')}</Table.Th>
                  <Table.Th>{t('members.email')}</Table.Th>
                  <Table.Th>{t('members.role')}</Table.Th>
                  {canManage && <Table.Th />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {membersQuery.data?.map((member) => (
                  <Table.Tr key={member.id}>
                    <Table.Td>{member.user.name ?? t('members.unnamed')}</Table.Td>
                    <Table.Td>{member.user.email ?? '—'}</Table.Td>
                    <Table.Td>
                      {canManage ? (
                        <Select
                          size="xs"
                          w={160}
                          allowDeselect={false}
                          data={roleOptions}
                          value={member.role}
                          disabled={updateRole.isPending}
                          onChange={(value) => {
                            if (value && value !== member.role) {
                              updateRole.mutate({
                                clubId,
                                teamId,
                                membershipId: member.id,
                                data: { role: value as TeamMembershipDtoRole },
                              })
                            }
                          }}
                        />
                      ) : (
                        <Badge
                          color={
                            member.role === TeamMembershipDtoRole.TEAM_ADMIN
                              ? 'blue'
                              : 'gray'
                          }
                        >
                          {t(`teamRoles.${member.role}`)}
                        </Badge>
                      )}
                    </Table.Td>
                    {canManage && (
                      <Table.Td>
                        <Group justify="flex-end">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label={t('common.remove')}
                            onClick={() => confirmRemove(member)}
                          >
                            ✕
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </QueryBoundary>

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title={t('team.addTitle')}>
        <Stack>
          {eligibleMembers.length === 0 ? (
            <Text c="dimmed" size="sm">
              {t('team.noEligible')}
            </Text>
          ) : (
            <Select
              label={t('team.selectMember')}
              placeholder={t('team.selectMember')}
              searchable
              data={eligibleMembers}
              value={selectedUserId}
              onChange={setSelectedUserId}
            />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAddOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!selectedUserId}
              loading={addMutation.isPending}
              onClick={() =>
                selectedUserId &&
                addMutation.mutate({
                  clubId,
                  teamId,
                  data: { userId: selectedUserId, role: CreateTeamMemberDtoRole.PLAYER },
                })
              }
            >
              {t('common.add')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  )
}

export default TeamPage
