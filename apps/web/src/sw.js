/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

// Precache the app shell (HTML/JS/CSS/icons). vite-plugin-pwa replaces
// self.__WB_MANIFEST with the built asset list at build time — this exact
// token must appear verbatim for injection to work.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA offline navigation: deep links like /clubs/... are not literal precache
// entries, so route all navigations to the precached shell.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// injectManifest does NOT auto-inject skipWaiting — with registerType
// 'autoUpdate' the SW must do it itself so redeploys take effect on reload.
self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/**
 * Constrain a payload-supplied URL to our own origin. Push payloads come from
 * our API, but a compromised payload must not become a lockscreen phishing
 * link — foreign origins collapse to '/'.
 */
function sameOriginUrl(raw) {
  try {
    const url = new URL(raw || '/', self.location.origin)
    return url.origin === self.location.origin
      ? url.pathname + url.search + url.hash
      : '/'
  } catch {
    return '/'
  }
}

/**
 * Web Push: the API sends a JSON payload { title, body, url }. Show a
 * notification carrying the deep-link url so the click handler can open it.
 */
self.addEventListener('push', (event) => {
  let payload = {}
  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = { body: event.data.text() }
    }
  }

  const title = payload.title || 'SV Gündlkofen'
  const options = {
    body: payload.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    // Read back by the notificationclick handler below.
    data: { url: sameOriginUrl(payload.url) },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

/**
 * Tapping a notification focuses an existing app window (navigating it to the
 * deep link) or opens a new one. No action buttons — tap opens the event page.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = sameOriginUrl(
    event.notification.data && event.notification.data.url,
  )

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            client.focus()
            if ('navigate' in client) {
              client.navigate(targetUrl).catch(() => {
                // Opaque navigations can reject; ignore.
              })
            }
            return undefined
          }
        }
        return self.clients.openWindow(targetUrl)
      }),
  )
})
