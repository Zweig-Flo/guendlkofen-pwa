import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  TextInput,
  Textarea,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import {
  useEventsControllerCreate,
  useEventsControllerUpdate,
} from '@guendlkofen/api-client'
import { invalidatePlanner, localInputToIso, toLocalInputValue } from '../lib'

/**
 * Create / edit a game. `event` null => create. Native datetime-local input
 * keeps v1 simple (per design); the wall-clock value is converted to a UTC ISO
 * string on submit.
 */
export function EventFormModal({ opened, onClose, clubId, teamId, event }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = !!event
  const create = useEventsControllerCreate()
  const update = useEventsControllerUpdate()
  const pending = create.isPending || update.isPending

  const form = useForm({
    initialValues: {
      startsAt: toLocalInputValue(event?.startsAt),
      opponent: event?.opponent ?? '',
      location: event?.location ?? '',
      homeAway: event?.homeAway ?? 'HOME',
      notes: event?.notes ?? '',
    },
    validate: {
      startsAt: (v) => (v ? null : t('planner.form.required')),
      opponent: (v) => (v.trim() ? null : t('planner.form.required')),
    },
  })

  async function handleSubmit(values) {
    const data = {
      startsAt: localInputToIso(values.startsAt),
      opponent: values.opponent.trim(),
      homeAway: values.homeAway,
      location: values.location.trim() || undefined,
      notes: values.notes.trim() || undefined,
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ clubId, teamId, eventId: event.id, data })
      } else {
        await create.mutateAsync({ clubId, teamId, data })
      }
      await invalidatePlanner(queryClient)
      notifications.show({ color: 'green', message: t('planner.form.saved') })
      onClose()
    } catch {
      notifications.show({ color: 'red', message: t('planner.form.failed') })
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? t('planner.form.editTitle') : t('planner.form.createTitle')}
      centered
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput
            type="datetime-local"
            label={t('planner.form.startsAt')}
            required
            {...form.getInputProps('startsAt')}
          />
          <TextInput
            label={t('planner.form.opponent')}
            placeholder={t('planner.form.opponentPlaceholder')}
            required
            {...form.getInputProps('opponent')}
          />
          <Select
            label={t('planner.form.homeAway')}
            data={[
              { value: 'HOME', label: t('planner.event.homeAway.HOME') },
              { value: 'AWAY', label: t('planner.event.homeAway.AWAY') },
              { value: 'NEUTRAL', label: t('planner.event.homeAway.NEUTRAL') },
            ]}
            allowDeselect={false}
            {...form.getInputProps('homeAway')}
          />
          <TextInput
            label={t('planner.form.location')}
            {...form.getInputProps('location')}
          />
          <Textarea
            label={t('planner.form.notes')}
            autosize
            minRows={2}
            {...form.getInputProps('notes')}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
