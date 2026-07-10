import { useState } from 'react'
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { modals } from '@mantine/modals'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  getTeamsControllerFindAllQueryKey,
  useTeamsControllerCreate,
  useTeamsControllerFindAll,
  useTeamsControllerRemove,
  useTeamsControllerUpdate,
  type TeamDto,
} from '@guendlkofen/api-client'
import QueryBoundary from '../../components/QueryBoundary'
import { notifyError, notifySuccess } from '../../lib/errors'

interface TeamFormValues {
  name: string
  sport: string
  league: string
  rank: number
}

function TeamsTab({ clubId, canManage }: { clubId: string; canManage: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const teamsQuery = useTeamsControllerFindAll(clubId)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<TeamDto | null>(null)

  const form = useForm<TeamFormValues>({
    initialValues: { name: '', sport: '', league: '', rank: 1 },
    validate: {
      name: (v) => (v.trim().length === 0 ? true : null),
      sport: (v) => (v.trim().length === 0 ? true : null),
      rank: (v) => (v < 1 ? true : null),
    },
  })

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getTeamsControllerFindAllQueryKey(clubId),
    })

  const rankConflict = { 409: t('teams.rankConflict') }

  const createMutation = useTeamsControllerCreate({
    mutation: {
      onSuccess: () => {
        notifySuccess(t('teams.created'))
        closeModal()
        void invalidate()
      },
      onError: (error) => notifyError(error, rankConflict),
    },
  })

  const updateMutation = useTeamsControllerUpdate({
    mutation: {
      onSuccess: () => {
        notifySuccess(t('teams.updated'))
        closeModal()
        void invalidate()
      },
      onError: (error) => notifyError(error, rankConflict),
    },
  })

  const removeMutation = useTeamsControllerRemove({
    mutation: {
      onSuccess: () => {
        notifySuccess(t('teams.deleted'))
        void invalidate()
      },
      onError: (error) => notifyError(error),
    },
  })

  function openCreate() {
    setEditing(null)
    form.setValues({ name: '', sport: '', league: '', rank: 1 })
    setModalOpen(true)
  }

  function openEdit(team: TeamDto) {
    setEditing(team)
    form.setValues({
      name: team.name,
      sport: team.sport,
      league: team.league ?? '',
      rank: team.rank,
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    form.reset()
  }

  function submit(values: TeamFormValues) {
    const data = {
      name: values.name.trim(),
      sport: values.sport.trim(),
      league: values.league.trim() || undefined,
      rank: values.rank,
    }
    if (editing) {
      updateMutation.mutate({ clubId, teamId: editing.id, data })
    } else {
      createMutation.mutate({ clubId, data })
    }
  }

  function confirmDelete(team: TeamDto) {
    modals.openConfirmModal({
      title: t('teams.deleteTitle'),
      children: <Text size="sm">{t('teams.deleteConfirm', { name: team.name })}</Text>,
      labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => removeMutation.mutate({ clubId, teamId: team.id }),
    })
  }

  const teams = [...(teamsQuery.data ?? [])].sort((a, b) => a.rank - b.rank)

  return (
    <Stack>
      {canManage && (
        <Group justify="flex-end">
          <Button size="sm" onClick={openCreate}>
            {t('teams.createButton')}
          </Button>
        </Group>
      )}

      <QueryBoundary
        isLoading={teamsQuery.isLoading}
        isError={teamsQuery.isError}
        onRetry={() => void teamsQuery.refetch()}
      >
        {teams.length === 0 ? (
          <Text c="dimmed">{t('teams.empty')}</Text>
        ) : (
          <Table.ScrollContainer minWidth={500}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('teams.rank')}</Table.Th>
                  <Table.Th>{t('teams.name')}</Table.Th>
                  <Table.Th>{t('teams.sport')}</Table.Th>
                  <Table.Th>{t('teams.league')}</Table.Th>
                  {canManage && <Table.Th />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {teams.map((team) => (
                  <Table.Tr
                    key={team.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/clubs/${clubId}/teams/${team.id}`)}
                  >
                    <Table.Td>{team.rank}</Table.Td>
                    <Table.Td>{team.name}</Table.Td>
                    <Table.Td>{team.sport}</Table.Td>
                    <Table.Td>{team.league ?? '—'}</Table.Td>
                    {canManage && (
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <Button variant="subtle" size="xs" onClick={() => openEdit(team)}>
                            {t('common.edit')}
                          </Button>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label={t('common.delete')}
                            onClick={() => confirmDelete(team)}
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

      <Modal
        opened={modalOpen}
        onClose={closeModal}
        title={editing ? t('teams.editTitle') : t('teams.createTitle')}
      >
        <form onSubmit={form.onSubmit(submit)}>
          <Stack>
            <TextInput
              label={t('teams.name')}
              placeholder={t('teams.namePlaceholder')}
              data-autofocus
              {...form.getInputProps('name')}
            />
            <TextInput
              label={t('teams.sport')}
              placeholder={t('teams.sportPlaceholder')}
              {...form.getInputProps('sport')}
            />
            <TextInput
              label={`${t('teams.league')} (${t('common.optional')})`}
              placeholder={t('teams.leaguePlaceholder')}
              {...form.getInputProps('league')}
            />
            <NumberInput
              label={t('teams.rank')}
              min={1}
              allowDecimal={false}
              {...form.getInputProps('rank')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeModal}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {editing ? t('common.save') : t('common.create')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  )
}

export default TeamsTab
