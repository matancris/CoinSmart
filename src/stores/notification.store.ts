import { create } from 'zustand'
import { notificationService } from '@/services'
import type { PushStatus } from '@/services/notification.service'
import { handleError } from '@/utils'

const DISMISS_KEY = 'coinsmart_push_prompt_dismissed_at'
// Ask again after a week so a "later" isn't a permanent "no"
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

function wasRecentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return Number.isFinite(at) && Date.now() - at < DISMISS_TTL_MS
  } catch {
    return false
  }
}

interface NotificationState {
  status: PushStatus
  promptDismissed: boolean
  actions: {
    init: (userId: string) => Promise<void>
    enable: (userId: string) => Promise<PushStatus>
    dismissPrompt: () => void
  }
}

export const useNotificationStore = create<NotificationState>((set) => ({
  status: 'unsupported',
  promptDismissed: wasRecentlyDismissed(),
  actions: {
    init: async (userId) => {
      try {
        const status = await notificationService.getPushStatus()
        set({ status })
        // Refresh the token on every launch — browsers rotate it and stale tokens drop pushes
        if (status === 'granted') await notificationService.registerToken(userId)
      } catch (error) {
        handleError(error, { operation: 'notifications:init', userId })
      }
    },

    enable: async (userId) => {
      try {
        const status = await notificationService.enablePush(userId)
        set({ status })
        return status
      } catch (error) {
        handleError(error, { operation: 'notifications:enable', userId })
        return 'default'
      }
    },

    dismissPrompt: () => {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()))
      } catch {
        // Ignore — the prompt just reappears next launch
      }
      set({ promptDismissed: true })
    },
  },
}))
