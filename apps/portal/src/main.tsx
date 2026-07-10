import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { ModalsProvider } from '@mantine/modals'
import { Auth0Provider, type AppState } from '@auth0/auth0-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'

import './i18n'
import ApiProvider from './ApiProvider'
import { router } from './router'

const queryClient = new QueryClient()

/** After Auth0 returns from a redirect, send the user back where they came from. */
function onRedirectCallback(appState?: AppState) {
  void router.navigate(appState?.returnTo ?? '/', { replace: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="auto">
      <Notifications />
      <ModalsProvider>
        <Auth0Provider
          domain={import.meta.env.VITE_AUTH0_DOMAIN}
          clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
          authorizationParams={{
            redirect_uri: window.location.origin,
            audience: import.meta.env.VITE_AUTH0_AUDIENCE,
          }}
          cacheLocation="localstorage"
          useRefreshTokens
          onRedirectCallback={onRedirectCallback}
        >
          <QueryClientProvider client={queryClient}>
            <ApiProvider>
              <RouterProvider router={router} />
            </ApiProvider>
          </QueryClientProvider>
        </Auth0Provider>
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
)
