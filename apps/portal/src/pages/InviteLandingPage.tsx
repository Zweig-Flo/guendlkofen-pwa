import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Anchor,
  Button,
  Card,
  Center,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useAuth0 } from '@auth0/auth0-react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import {
  InvitationPreviewDtoStatus,
  useInvitationsControllerPreview,
  useInvitationsControllerRedeem,
} from '@guendlkofen/api-client'
import { errorStatus } from '../lib/errors'

const PLAYER_APP_URL =
  import.meta.env.VITE_PLAYER_APP_URL ?? 'http://localhost:5173'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Center mih="100vh" p="md">
      <Card withBorder shadow="sm" padding="xl" radius="md" maw={440} w="100%">
        {children}
      </Card>
    </Center>
  )
}

function InviteLandingPage() {
  const { t } = useTranslation()
  const { token = '' } = useParams()
  const { isLoading: authLoading, isAuthenticated, loginWithRedirect } = useAuth0()

  const previewQuery = useInvitationsControllerPreview(
    { token },
    { query: { retry: false, enabled: token.length > 0 } },
  )

  const [joined, setJoined] = useState(false)
  const redeemFired = useRef(false)

  const redeemMutation = useInvitationsControllerRedeem({
    mutation: {
      onSuccess: () => setJoined(true),
      onError: (error) => {
        // 410 Gone: the invitation changed state (expired/revoked/accepted).
        // Refetch the preview so we render the correct friendly message.
        if (errorStatus(error) === 410) {
          void previewQuery.refetch()
        }
      },
    },
  })

  const previewStatus = previewQuery.data?.status

  // Auto-redeem once, when logged in and the invitation is still valid.
  useEffect(() => {
    if (
      isAuthenticated &&
      previewStatus === InvitationPreviewDtoStatus.valid &&
      !redeemFired.current &&
      !joined
    ) {
      redeemFired.current = true
      redeemMutation.mutate({ data: { token } })
    }
  }, [isAuthenticated, previewStatus, joined, redeemMutation, token])

  // Loading the preview or the auth state.
  if (previewQuery.isLoading || authLoading) {
    return (
      <Shell>
        <Stack align="center" gap="sm">
          <Loader />
          <Text c="dimmed">{t('invite.loading')}</Text>
        </Stack>
      </Shell>
    )
  }

  // Preview failed (unknown token).
  if (previewQuery.isError || !previewQuery.data) {
    return (
      <Shell>
        <Alert color="red" title={t('invite.invalidTitle')}>
          {t('invite.invalid')}
        </Alert>
      </Shell>
    )
  }

  const preview = previewQuery.data

  // Successful join.
  if (joined) {
    return (
      <Shell>
        <Stack gap="md">
          <Title order={3}>{t('invite.successTitle', { club: preview.clubName })}</Title>
          <Text>{t('invite.successText')}</Text>
          <Button component="a" href={PLAYER_APP_URL}>
            {t('invite.openPlayerApp')}
          </Button>
        </Stack>
      </Shell>
    )
  }

  // Non-valid states.
  if (preview.status === InvitationPreviewDtoStatus.expired) {
    return (
      <Shell>
        <Alert color="orange" title={t('invite.expiredTitle')}>
          {t('invite.expired')}
        </Alert>
      </Shell>
    )
  }
  if (preview.status === InvitationPreviewDtoStatus.revoked) {
    return (
      <Shell>
        <Alert color="gray" title={t('invite.revokedTitle')}>
          {t('invite.revoked')}
        </Alert>
      </Shell>
    )
  }
  if (preview.status === InvitationPreviewDtoStatus.accepted) {
    return (
      <Shell>
        <Alert color="blue" title={t('invite.acceptedTitle')}>
          {t('invite.accepted')}
        </Alert>
      </Shell>
    )
  }

  // status === valid
  // Authenticated: redeem is in flight (or about to fire).
  if (isAuthenticated) {
    return (
      <Shell>
        <Stack align="center" gap="sm">
          {redeemMutation.isError ? (
            <Alert color="red" title={t('errors.genericTitle')} w="100%">
              {t('invite.redeemFailed')}
            </Alert>
          ) : (
            <>
              <Loader />
              <Text c="dimmed">{t('invite.joining')}</Text>
            </>
          )}
        </Stack>
      </Shell>
    )
  }

  // Valid but not logged in: invite the user to log in and join.
  return (
    <Shell>
      <Stack gap="md">
        <Title order={3}>{t('invite.validTitle', { club: preview.clubName })}</Title>
        <Text>{t('invite.validText', { club: preview.clubName })}</Text>
        <Text size="sm" c="dimmed">
          {t('invite.maskedEmail', { email: preview.maskedEmail })}
        </Text>
        <Button
          onClick={() =>
            void loginWithRedirect({
              appState: { returnTo: window.location.pathname + window.location.search },
            })
          }
        >
          {t('invite.loginToJoin')}
        </Button>
        <Anchor href={PLAYER_APP_URL} size="sm" c="dimmed">
          {t('invite.openPlayerApp')}
        </Anchor>
      </Stack>
    </Shell>
  )
}

export default InviteLandingPage
