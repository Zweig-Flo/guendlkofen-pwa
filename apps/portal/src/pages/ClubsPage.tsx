import { useState } from 'react'
import {
  ActionIcon,
  Button,
  Card,
  Container,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { modals } from '@mantine/modals'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  getClubsControllerFindAllQueryKey,
  useClubsControllerCreate,
  useClubsControllerFindAll,
  useClubsControllerRemove,
  type ClubDto,
} from '@guendlkofen/api-client'
import QueryBoundary from '../components/QueryBoundary'
import { useMe } from '../lib/permissions'
import { notifyError, notifySuccess } from '../lib/errors'

function ClubsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: me } = useMe()
  const isSuperAdmin = me?.isSuperAdmin ?? false

  const clubsQuery = useClubsControllerFindAll()
  const [createOpen, setCreateOpen] = useState(false)

  const form = useForm({
    initialValues: { name: '' },
    validate: { name: (v) => (v.trim().length === 0 ? true : null) },
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getClubsControllerFindAllQueryKey() })

  const createMutation = useClubsControllerCreate({
    mutation: {
      onSuccess: () => {
        notifySuccess(t('clubs.created'))
        setCreateOpen(false)
        form.reset()
        void invalidate()
      },
      onError: (error) => notifyError(error),
    },
  })

  const removeMutation = useClubsControllerRemove({
    mutation: {
      onSuccess: () => {
        notifySuccess(t('clubs.deleted'))
        void invalidate()
      },
      onError: (error) => notifyError(error),
    },
  })

  const confirmDelete = (club: ClubDto) =>
    modals.openConfirmModal({
      title: t('clubs.deleteTitle'),
      children: <Text size="sm">{t('clubs.deleteConfirm', { name: club.name })}</Text>,
      labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => removeMutation.mutate({ clubId: club.id }),
    })

  return (
    <Container size="lg">
      <Group justify="space-between" mb="lg">
        <Title order={2}>{t('clubs.title')}</Title>
        {isSuperAdmin && (
          <Button onClick={() => setCreateOpen(true)}>{t('clubs.createButton')}</Button>
        )}
      </Group>

      <QueryBoundary
        isLoading={clubsQuery.isLoading}
        isError={clubsQuery.isError}
        onRetry={() => void clubsQuery.refetch()}
      >
        {clubsQuery.data && clubsQuery.data.length === 0 ? (
          <Text c="dimmed">{t('clubs.empty')}</Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            {clubsQuery.data?.map((club) => (
              <Card key={club.id} withBorder shadow="sm" padding="lg" radius="md">
                <Stack gap="sm">
                  <Title order={4}>{club.name}</Title>
                  <Group justify="space-between">
                    <Button
                      variant="light"
                      size="sm"
                      onClick={() => navigate(`/clubs/${club.id}`)}
                    >
                      {t('clubs.open')}
                    </Button>
                    {isSuperAdmin && (
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={t('common.delete')}
                        onClick={() => confirmDelete(club)}
                      >
                        ✕
                      </ActionIcon>
                    )}
                  </Group>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        )}
      </QueryBoundary>

      <Modal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('clubs.createTitle')}
      >
        <form onSubmit={form.onSubmit((values) => createMutation.mutate({ data: values }))}>
          <Stack>
            <TextInput
              label={t('clubs.nameLabel')}
              placeholder={t('clubs.namePlaceholder')}
              data-autofocus
              {...form.getInputProps('name')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setCreateOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                {t('common.create')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  )
}

export default ClubsPage
