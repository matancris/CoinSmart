import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { getToken, onMessage, type Unsubscribe } from 'firebase/messaging'
import { db } from '@/config/firebase'
import { getMessagingInstance } from '@/config/firebase'

export async function requestAndSaveToken(userId: string): Promise<void> {
  const messaging = await getMessagingInstance()
  if (!messaging) {
    console.warn('[Notifications] Notifications not supported on this device')
    return
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()

  if (permission !== 'granted') {
    console.warn('[Notifications] Notification permission denied/dismissed:', permission)
    return
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
  if (!vapidKey) {
    console.warn('[Notifications] VAPID key not configured (VITE_FIREBASE_VAPID_KEY)')
    return
  }

  if (!navigator.serviceWorker) {
    console.warn('[Notifications] Service Worker not available (non-HTTPS, WebView, or unsupported browser)')
    return
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    })

    if (token) {
      await updateDoc(doc(db, 'users', userId), {
        fcmTokens: arrayUnion(token),
      })
    }
  } catch (err) {
    console.warn('[Notifications] Failed to get/save token:', err)
  }
}

export async function removeToken(userId: string): Promise<void> {
  const messaging = await getMessagingInstance()
  if (!messaging) return

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
  if (!vapidKey) return

  try {
    const token = await getToken(messaging, { vapidKey })
    if (token) {
      await updateDoc(doc(db, 'users', userId), {
        fcmTokens: arrayRemove(token),
      })
    }
  } catch {
    // Token may not exist, ignore
  }
}

export function initForegroundHandler(
  onNotification: (title: string, body: string) => void
): (() => void) {
  let unsubscribe: Unsubscribe | null = null

  getMessagingInstance().then((messaging) => {
    if (!messaging) return
    unsubscribe = onMessage(messaging, (payload) => {
      const title = payload.data?.title ?? ''
      const body = payload.data?.body ?? ''
      onNotification(title, body)
    })
  })

  return () => unsubscribe?.()
}
