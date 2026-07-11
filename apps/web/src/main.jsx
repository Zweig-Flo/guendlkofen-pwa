import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { createTheme, MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'

import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'
import './i18n/index.js'
import ApiProvider from './ApiProvider.jsx'
import App from './App.jsx'

const queryClient = new QueryClient()

// Mobile-first Mantine theme: green primary (club colours), comfortable base
// font size and rounded corners for touch-friendly cards/buttons.
const theme = createTheme({
  primaryColor: 'green',
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  defaultRadius: 'md',
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications />
      <Auth0Provider
        domain={import.meta.env.VITE_AUTH0_DOMAIN}
        clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
        authorizationParams={{
          redirect_uri: window.location.origin,
          audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        }}
        cacheLocation="localstorage"
        useRefreshTokens
      >
        <QueryClientProvider client={queryClient}>
          <ApiProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ApiProvider>
        </QueryClientProvider>
      </Auth0Provider>
    </MantineProvider>
  </StrictMode>,
)
