import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  FileButton,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import { useEventsControllerImport } from '@guendlkofen/api-client'
import { invalidatePlanner } from '../lib'

/** Map a backend row-error message (i18n key or plain text) to a localised string. */
function useRowErrorText() {
  const { t } = useTranslation()
  return (message) => {
    if (typeof message !== 'string') return t('planner.import.error.generic')
    const code = message.startsWith('import.error.')
      ? message.slice('import.error.'.length)
      : message
    const key = `planner.import.error.${code}`
    const translated = t(key)
    // i18next returns the key itself when missing → fall back to raw message
    return translated === key ? message : translated
  }
}

function ResultView({ result }) {
  const { t } = useTranslation()
  const rowError = useRowErrorText()
  const stat = (label, value, color) => (
    <Stack gap={0} align="center">
      <Text fw={700} fz="xl" c={color}>
        {value}
      </Text>
      <Text fz="xs" c="dimmed" ta="center">
        {label}
      </Text>
    </Stack>
  )
  return (
    <Stack>
      <SimpleGrid cols={4}>
        {stat(t('planner.import.imported'), result.imported, 'green')}
        {stat(t('planner.import.updated'), result.updated, 'blue')}
        {stat(t('planner.import.skipped'), result.skipped, 'gray')}
        {stat(t('planner.import.errors'), result.errorCount, 'red')}
      </SimpleGrid>
      {result.errors?.length > 0 && (
        <Stack gap="xs">
          <Text fw={600} fz="sm">
            {t('planner.import.rowErrorsTitle')}
          </Text>
          <Table.ScrollContainer minWidth={320}>
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('planner.import.rowColumn')}</Table.Th>
                  <Table.Th>{t('planner.import.fieldColumn')}</Table.Th>
                  <Table.Th>{t('planner.import.messageColumn')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {result.errors.map((e, i) => (
                  <Table.Tr key={`${e.row}-${i}`}>
                    <Table.Td>{e.row}</Table.Td>
                    <Table.Td>{e.field ?? '—'}</Table.Td>
                    <Table.Td>{rowError(e.message)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      )}
    </Stack>
  )
}

export function ImportModal({ opened, onClose, clubId, teamId }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const importer = useEventsControllerImport()

  function close() {
    setFile(null)
    setResult(null)
    onClose()
  }

  async function upload() {
    if (!file) return
    try {
      // CSV date/time cells are interpreted in the uploader's timezone (API
      // falls back to Europe/Berlin if this is missing).
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const res = await importer.mutateAsync({
        clubId,
        teamId,
        data: { file, timezone },
      })
      setResult(res)
      await invalidatePlanner(queryClient)
    } catch {
      notifications.show({ color: 'red', message: t('planner.import.failed') })
    }
  }

  return (
    <Modal opened={opened} onClose={close} title={t('planner.import.title')} centered size="lg">
      <Stack>
        <Alert variant="light" color="blue">
          {t('planner.import.intro')}
        </Alert>
        <Group>
          <FileButton onChange={setFile} accept=".csv,text/csv">
            {(props) => (
              <Button variant="default" {...props}>
                {t('planner.import.pick')}
              </Button>
            )}
          </FileButton>
          {file && (
            <Text fz="sm" c="dimmed" style={{ minWidth: 0 }} truncate>
              {file.name}
            </Text>
          )}
        </Group>

        {result && <ResultView result={result} />}

        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            {result ? t('common.close') : t('common.cancel')}
          </Button>
          <Button onClick={upload} loading={importer.isPending} disabled={!file}>
            {t('planner.import.upload')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
