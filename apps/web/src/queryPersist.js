import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

// Single localStorage key holding the dehydrated React Query cache so the
// last-fetched planner data renders instantly offline / on next launch.
const PERSIST_KEY = 'svg-query-cache'

/**
 * Wire the given QueryClient to a localStorage-backed persister. Cached reads
 * survive reloads and work offline; mutations remain online-only.
 */
export function setupQueryPersistence(queryClient) {
  const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: PERSIST_KEY,
  })
  persistQueryClient({
    queryClient,
    persister,
    // Drop cached data older than a day so stale rosters don't linger forever.
    maxAge: 1000 * 60 * 60 * 24,
  })
}

/**
 * Wipe both the in-memory and persisted cache. Called on logout so personal
 * data never lingers on a shared device.
 */
export function clearPersistedCache(queryClient) {
  queryClient.clear()
  try {
    window.localStorage.removeItem(PERSIST_KEY)
  } catch {
    // localStorage unavailable (private mode / disabled) — nothing to clear.
  }
}
