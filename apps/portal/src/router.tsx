import { createBrowserRouter } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import RequireAuth from './components/RequireAuth'
import ClubsPage from './pages/ClubsPage'
import ClubPage from './pages/ClubPage'
import TeamPage from './pages/TeamPage'
import InviteLandingPage from './pages/InviteLandingPage'

export const router = createBrowserRouter([
  {
    // Public invitation landing — no auth gate.
    path: '/invite/:token',
    element: <InviteLandingPage />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <ClubsPage /> },
          { path: 'clubs/:clubId', element: <ClubPage /> },
          { path: 'clubs/:clubId/teams/:teamId', element: <TeamPage /> },
        ],
      },
    ],
  },
])
