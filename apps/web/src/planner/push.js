import {
  pushControllerGetPublicKey,
  pushControllerSubscribe,
  pushControllerUnsubscribe,
} from '@guendlkofen/api-client'

/** True when the browser can register a service worker and receive Web Push. */
export function isPushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** iOS/iPadOS user agent — push there only works from an installed PWA. */
export function isIosDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const iOS = /iphone|ipad|ipod/i.test(ua)
  // iPadOS 13+ reports as Mac but is touch-capable.
  const iPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1
  return iOS || iPadOS
}

/** True when running as an installed / home-screen PWA. */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true
  )
}

/** Decode a URL-safe base64 VAPID key into the Uint8Array subscribe() wants. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i)
  }
  return output
}

/** Current PushSubscription for this device, or null. */
export async function getCurrentSubscription() {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/**
 * Ask for permission, create (or reuse) the browser push subscription and
 * register it with the API. Returns { ok, permission, reason }.
 */
export async function subscribeToPush() {
  if (!isPushSupported()) return { ok: false, permission: 'denied' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, permission }

  const { publicKey } = await pushControllerGetPublicKey()
  if (!publicKey) return { ok: false, permission, reason: 'not-configured' }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  const json = subscription.toJSON()
  await pushControllerSubscribe({
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent,
  })

  return { ok: true, permission }
}

/**
 * Remove the API subscription and unsubscribe the browser. Safe to call when
 * there is no subscription (used on logout / opt-out).
 */
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  try {
    await pushControllerUnsubscribe({ endpoint: subscription.endpoint })
  } catch {
    // Network/offline — the local unsubscribe below still stops delivery.
  }
  try {
    await subscription.unsubscribe()
  } catch {
    // Ignore; the endpoint is already gone server-side.
  }
}
