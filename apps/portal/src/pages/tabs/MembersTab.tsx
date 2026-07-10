import {
  ActionIcon,
  Badge,
  Group,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  ClubMembershipDtoRole,
  getClubMembersControllerFindAllQueryKey,
  useClubMembersControllerFindAll,
  useClubMembersControllerRemove,
  useClubMembersControllerUpdateRole,
  type ClubMembershipDto,
} from '@guendlkofen/api-client'
import QueryBoundary from '../../components/QueryBoundary'
import { notifyError, notifySuccess } from '../../lib/errors'

function MembersTab({ clubId, canManage }: { clubId: string; canManage: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const membersQuery = useClubMembersControllerFindAll(clubId)

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getClubMembersControllerFindAllQueryKey(clubId),
    })

  const updateRole = useClubMembersControllerUpdateRole({
    mutation: {
      onSuccess: () => {
        notifySuccess(t('members.roleUpdated'))
        void invalidate()
      },
      onError: (error) => notifyError(error),
    },
  })

  const remove = useClubMembersControllerRemove({
    mutation: {
      onSuccess: () => {
        notifySuccess(t('members.removed'))
        void invalidate()
      },
      onError: (error) => notifyError(error),
    },
  })

  const roleOptions = [
    { value: ClubMembershipDtoRole.MEMBER, label: t('members.roles.MEMBER') },
    { value: ClubMembershipDtoRole.CLUB_ADMIN, label: t('members.roles.CLUB_ADMIN') },
  ]

  function confirmRemove(member: ClubMembershipDto) {
    const name = member.user.name ?? member.user.email ?? t('members.unnamed')
    modals.openConfirmModal({
      title: t('members.removeTitle'),
      children: <Text size="sm">{t('members.removeConfirm', { name })}</Text>,
      labels: { confirm: t('common.remove'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate({ clubId, membershipId: member.id }),
    })
  }

  return (
    <Stack>
      <QueryBoundary
        isLoading={membersQuery.isLoading}
        isError={membersQuery.isError}
        onRetry={() => void membersQuery.refetch()}
      >
        {membersQuery.data && membersQuery.data.length === 0 ? (
          <Text c="dimmed">{t('members.empty')}</Text>
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
                                membershipId: member.id,
                                data: { role: value as ClubMembershipDtoRole },
                              })
                            }
                          }}
                        />
                      ) : (
                        <Badge
                          color={
                            member.role === ClubMembershipDtoRole.CLUB_ADMIN
                              ? 'blue'
                              : 'gray'
                          }
                        >
                          {t(`members.roles.${member.role}`)}
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
    </Stack>
  )
}

export default MembersTab
