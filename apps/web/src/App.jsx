import { Route, Routes } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { Center, Loader } from '@mantine/core'
import Landing from './Landing.jsx'
import { AppShellLayout } from './planner/AppShellLayout.jsx'
import { HomeScreen } from './planner/screens/HomeScreen.jsx'
import { TeamsScreen } from './planner/screens/TeamsScreen.jsx'
import { TeamPlannerScreen } from './planner/screens/TeamPlannerScreen.jsx'
import { EventDetailScreen } from './planner/screens/EventDetailScreen.jsx'

function App() {
  const { isLoading, isAuthenticated } = useAuth0()

  if (isLoading) {
    return (
      <Center mih="100svh">
        <Loader />
      </Center>
    )
  }

  if (!isAuthenticated) {
    return <Landing />
  }

  return (
    <Routes>
      <Route element={<AppShellLayout />}>
        <Route index element={<HomeScreen />} />
        <Route path="teams" element={<TeamsScreen />} />
        <Route
          path="clubs/:clubId/teams/:teamId"
          element={<TeamPlannerScreen />}
        />
        <Route
          path="clubs/:clubId/teams/:teamId/events/:eventId"
          element={<EventDetailScreen />}
        />
      </Route>
    </Routes>
  )
}

export default App
