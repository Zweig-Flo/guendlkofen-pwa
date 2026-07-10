import { useEffect, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { setAuthTokenProvider, setBaseUrl } from '@guendlkofen/api-client'

setBaseUrl(import.meta.env.VITE_API_URL ?? 'http://localhost:3000')

/**
 * Connects the generated API client to Auth0: while the user is
 * authenticated every request carries a fresh access token.
 */
function ApiProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()

  useEffect(() => {
    if (isAuthenticated) {
      setAuthTokenProvider(() => getAccessTokenSilently())
    } else {
      setAuthTokenProvider(null)
    }
  }, [isAuthenticated, getAccessTokenSilently])

  return children
}

export default ApiProvider
