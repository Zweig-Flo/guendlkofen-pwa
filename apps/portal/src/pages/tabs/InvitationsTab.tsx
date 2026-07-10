import { useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { modals } from '@mantine/modals'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  CreateInvitationDtoClubRole,
  CreateInvitationTeamAssignmentDtoRole,
  getClubInvitationsControllerFindAllQueryKey,
  InvitationDtoStatus,
  useClubInvitationsControllerCreate,
  useClubInvitationsControllerFindAll,
  useClubInvitationsControllerRevoke,
  useTeamsControllerFindAll,
  type InvitationDto,
} from '@guendlkofen/api-client'
import QueryBoundary from '../../components/QueryBoundary'
import { notifyError, notifySuccess } from '../../lib/errors'
import { formatDate } from '../../lib/format'

const statusColor: Record<string, string> = {
  PENDING: 'yellow',
  ACCEPTED: 'green',
  REVOKED: 'gray',
}

interface InviteFormValues {
  email: string
  clubRole: CreateInvitationDtoClubRole
  teamIds: string[]
}

function InvitationsTab({ clubId }: { clubId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const invitationsQuery = useClubInvitationsControllerFindAll(clubId)
  const teamsQuery = useTeamsControllerFindAll(clubId)

  const [modalOpen, setModalOpen] = useState(false)
  const [teamRoles, setTeamRoles] = useState<
    Record<string, CreateInvitationTeamAssignmentDtoRole>
  >({})

  const form = useForm<InviteFormValues>({
    initialValues: {
      email: '',
      clubRole: CreateInvitationDtoClubRole.MEMBER,
      teamIds: [],
    },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : true),
    },
  })

  const teamOptions = useMemo(
    () =>
      (teamsQuery.data ?? []).map((team) => ({
        value: team.id,
        label: `${team.name} (${team.sport})`,
      })),
    [teamsQuery.data],
  )

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getClubInvitationsControllerFindAllQueryKey(clubId),
    })

  const createMutation = useClubInvitationsControllerCreate({
    mutation: {
      onSuccess: () => {
        notifySuccess(t('invitations.sent'))
        closeModal()
        void invalidate()
      },
      onError: (error) => notifyError(error),
    },
  })

  const revokeMutation = useClubInvitationsControllerRevoke({
    mutation: {
      onSuccess: () => {
        notifySuccess(t('invitations.revoked'))
        void invalidate()
      },
      onError: (error) => notifyError(error),
    },
  })

  const clubRoleOptions = [
    { value: CreateInvitationDtoClubRole.MEMBER, label: t('members.roles.MEMBER') },
    { value: CreateInvitationDtoClubRole.CLUB_ADMIN, label: t('members.roles.CLUB_ADMIN') },
  ]
  const teamRoleOptions = [
    { value: CreateInvitationTeamAssignmentDtoRole.PLAYER, label: t('teamRoles.PLAYER') },
    {
      value: CreateInvitationTeamAssignmentDtoRole.TEAM_ADMIN,
      label: t('teamRoles.TEAM_ADMIN'),
    },
  ]

  function closeModal() {
    setModalOpen(false)
    setTeamRoles({})
    form.reset()
  }

  function submit(values: InviteFormValues) {
    const teamAssignments = values.teamIds.map((teamId) => ({
      teamId,
      role: teamRoles[teamId] ?? CreateInvitationTeamAssignmentDtoRole.PLAYER,
    }))
    createMutation.mutate({
      clubId,
      data: {
        email: values.email.trim(),
        clubRole: values.clubRole,
        teamAssignments: teamAssignments.length > 0 ? teamAssignments : undefined,
      },
    })
  }

  function confirmRevoke(invitation: InvitationDto) {
    modals.openConfirmModal({
      title: t('invitations.revokeTitle'),
      children: (
        <Text size="sm">{t('invitations.revokeConfirm', { email: invitation.email })}</Text>
      ),
      labels: { confirm: t('invitations.revoke'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        revokeMutation.mutate({ clubId, invitationId: invitation.id }),
    })
  }

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const team of teamsQuery.data ?? []) map.set(team.id, team.name)
    return map
  }, [teamsQuery.data])

  return (
    <Stack>
      <Group justify="flex-end">
        <Button size="sm" onClick={() => setModalOpen(true)}>
          {t('invitations.inviteButton')}
        </Button>
      </Group>

      <QueryBoundary
        isLoading={invitationsQuery.isLoading}
        isError={invitationsQuery.isError}
        onRetry={() => void invitationsQuery.refetch()}
      >
        {invitationsQuery.data && invitationsQuery.data.length === 0 ? (
          <Text c="dimmed">{t('invitations.empty')}</Text>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('invitations.email')}</Table.Th>
                  <Table.Th>{t('invitations.clubRole')}</Table.Th>
                  <Table.Th>{t('invitations.status')}</Table.Th>
                  <Table.Th>{t('invitations.expiresAt')}</Table.Th>
                  <Table.Th>{t('invitations.invitedBy')}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {invitationsQuery.data?.map((invitation) => (
                  <Table.Tr key={invitation.id}>
                    <Table.Td>{invitation.email}</Table.Td>
                    <Table.Td>{t(`members.roles.${invitation.clubRole}`)}</Table.Td>
                    <Table.Td>
                      <Badge color={statusColor[invitation.status] ?? 'gray'}>
                        {t(`invitations.statuses.${invitation.status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{formatDate(invitation.expiresAt)}</Table.Td>
                    <Table.Td>
                      {invitation.invitedBy?.name ??
                        invitation.invitedBy?.email ??
                        t('members.unnamed')}
                    </Table.Td>
                    <Table.Td>
                      <Group justify="flex-end">
                        {invitation.status === InvitationDtoStatus.PENDING && (
                          <Button
                            variant="subtle"
                            color="red"
                            size="xs"
                            onClick={() => confirmRevoke(invitation)}
                          >
                            {t('invitations.revoke')}
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </QueryBoundary>

      <Modal opened={modalOpen} onClose={closeModal} title={t('invitations.inviteTitle')}>
        <form onSubmit={form.onSubmit(submit)}>
          <Stack>
            <TextInput
              label={t('invitations.email')}
              placeholder={t('invitations.emailPlaceholder')}
              data-autofocus
              {...form.getInputProps('email')}
            />
            <Select
              label={t('invitations.clubRole')}
              allowDeselect={false}
              data={clubRoleOptions}
              {...form.getInputProps('clubRole')}
            />
            <MultiSelect
              label={t('invitations.teamAssignmentsLabel')}
              placeholder={
                form.values.teamIds.length === 0
                  ? t('invitations.teamAssignmentsPlaceholder')
                  : undefined
              }
              data={teamOptions}
              searchable
              {...form.getInputProps('teamIds')}
            />
            {form.values.teamIds.map((teamId) => (
              <Select
                key={teamId}
                label={t('invitations.teamRole', {
                  team: teamNameById.get(teamId) ?? teamId,
                })}
                allowDeselect={false}
                data={teamRoleOptions}
                value={teamRoles[teamId] ?? CreateInvitationTeamAssignmentDtoRole.PLAYER}
                onChange={(value) =>
                  value &&
                  setTeamRoles((prev) => ({
                    ...prev,
                    [teamId]: value as CreateInvitationTeamAssignmentDtoRole,
                  }))
                }
              />
            ))}
            <Group justify="flex-end">
              <Button variant="default" onClick={closeModal}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                {t('invitations.inviteButton')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  )
}

export default InvitationsTab
