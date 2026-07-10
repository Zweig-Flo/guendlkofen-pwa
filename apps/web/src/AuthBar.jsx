import { useAuth0 } from '@auth0/auth0-react'
import { useTranslation } from 'react-i18next'
import { useAppControllerGetProfile } from '@guendlkofen/api-client'

function AuthBar() {
  const { isLoading, isAuthenticated, user, loginWithRedirect, logout } = useAuth0()
  const { t } = useTranslation()

  const {
    data: me,
    error,
    refetch,
    isFetching,
  } = useAppControllerGetProfile({ query: { enabled: false, retry: false } })

  if (isLoading) {
    return <div className="auth-bar">{t('auth.loading')}</div>
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-bar">
        <button type="button" onClick={() => loginWithRedirect()}>
          {t('auth.login')}
        </button>
      </div>
    )
  }

  return (
    <div className="auth-bar">
      <span>{t('auth.loggedInAs', { name: user?.name ?? user?.email })}</span>
      <button type="button" onClick={() => refetch()} disabled={isFetching}>
        {t('auth.callApi')}
      </button>
      <button
        type="button"
        onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
      >
        {t('auth.logout')}
      </button>
      {error && <pre>{t('auth.apiError', { message: error.message })}</pre>}
      {!error && me && <pre>{JSON.stringify(me, null, 2)}</pre>}
    </div>
  )
}

export default AuthBar
