import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { notificationService } from '@/services'

export function useNotifications() {
  const appUser = useAuthStore((state) => state.appUser)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!appUser) {
      cleanupRef.current?.()
      cleanupRef.current = null
      return
    }

    // Fire-and-forget token registration
    notificationService.requestAndSaveToken(appUser.id).catch((err) => console.warn('[Notifications]', err))

    // Set up foreground message handler
    const unsubscribe = notificationService.initForegroundHandler()
    cleanupRef.current = () => unsubscribe?.()

    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [appUser])
}
