import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { getToken, deleteToken, onMessage, type Unsubscribe } from 'firebase/messaging'
import { db, getMessagingInstance } from '@/config/firebase'
import { FCM_TOKEN_KEY } from '@/utils/constants'
import { isAppleWebKit } from '@/utils/platform'

export type PushStatus = 'unsupported' | 'default' | 'granted' | 'denied'

export interface PushMessage {
  title: string
  body: string
  link?: string
}

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported'
  const messaging = await getMessagingInstance()
  if (!messaging) return 'unsupported'
  return Notification.permission
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(FCM_TOKEN_KEY)
  } catch {
    return null
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(FCM_TOKEN_KEY, token)
    else localStorage.removeItem(FCM_TOKEN_KEY)
  } catch {
    // Storage blocked (private mode) — token cleanup on logout just becomes best-effort
  }
}

// Must be called from a user gesture when permission is still 'default' — iOS ignores
// permission prompts that aren't triggered by a tap
export async function enablePush(userId: string): Promise<PushStatus> {
  const status = await getPushStatus()
  if (status === 'unsupported' || status === 'denied') return status

  const permission = status === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') return permission

  await registerToken(userId)
  return 'granted'
}

export async function registerToken(userId: string): Promise<void> {
  const messaging = await getMessagingInstance()
  if (!messaging || Notification.permission !== 'granted') return

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
  if (!vapidKey) {
    console.warn('[Notifications] VAPID key not configured (VITE_FIREBASE_VAPID_KEY)')
    return
  }

  const registration = await navigator.serviceWorker.ready
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
  if (!token) return

  const previous = readStoredToken()
  // The browser can rotate the token; drop the old one so pushes don't fail silently
  if (previous && previous !== token) {
    await updateDoc(doc(db, 'users', userId), { fcmTokens: arrayRemove(previous) }).catch(() => {})
  }

  await updateDoc(doc(db, 'users', userId), { fcmTokens: arrayUnion(token) })
  writeStoredToken(token)
}

// On logout the device must stop receiving the previous user's notifications —
// matters on shared family devices where kids and parents log in on the same phone
export async function removeToken(userId: string): Promise<void> {
  const token = readStoredToken()
  if (!token) return

  await updateDoc(doc(db, 'users', userId), { fcmTokens: arrayRemove(token) }).catch(() => {})

  const messaging = await getMessagingInstance()
  if (messaging) await deleteToken(messaging).catch(() => {})
  writeStoredToken(null)
}

export function initForegroundHandler(onNotification: (message: PushMessage) => void): () => void {
  let unsubscribe: Unsubscribe | null = null
  let cancelled = false

  getMessagingInstance().then((messaging) => {
    if (!messaging || cancelled) return
    unsubscribe = onMessage(messaging, ({ notification, data }) => {
      // Safari shows a system banner itself while the app is open (see firebase-messaging-init)
      if (isAppleWebKit()) return
      const title = notification?.title ?? data?.title ?? ''
      const body = notification?.body ?? data?.body ?? ''
      if (!title && !body) return
      onNotification({ title, body, link: data?.link })
    })
  })

  return () => {
    cancelled = true
    unsubscribe?.()
  }
}
