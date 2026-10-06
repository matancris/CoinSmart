import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { useNotificationStore } from '@/stores/notification.store'
import { notificationService } from '@/services'
import { toast } from '@/components/ui/Toast'

export function useNotifications() {
  const userId = useAuthStore((state) => state.appUser?.id)
  const { init } = useNotificationStore((state) => state.actions)

  useEffect(() => {
    if (!userId) return

    init(userId)

    return notificationService.initForegroundHandler(({ title, body }) => {
      toast(body || title, 'info', { title: body ? title : undefined })
    })
  }, [userId, init])
}
