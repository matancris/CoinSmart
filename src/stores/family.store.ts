import { create } from 'zustand'
import type { AppUser } from '@/types'
import { userService } from '@/services'
import { handleError } from '@/utils'
import { toast } from '@/components/ui/Toast'
import { i18n } from '@/i18n'

let unsubChildren: (() => void) | null = null
let activeFamilyId: string | null = null

interface ChildUpdates extends Partial<AppUser> {
  pin?: string
}

interface FamilyState {
  children: AppUser[]
  isLoading: boolean
  actions: {
    fetchChildren: (familyId: string) => Promise<void>
    subscribeChildren: (familyId: string) => void
    unsubscribeChildren: () => void
    addChild: (data: {
      familyId: string
      displayName: string
      avatarEmoji: string
      pin: string
      initialBalance: number
    }) => Promise<boolean>
    updateChild: (childId: string, updates: ChildUpdates) => Promise<boolean>
    removeChild: (childId: string) => Promise<boolean>
  }
}

export const useFamilyStore = create<FamilyState>((set, get) => ({
  children: [],
  isLoading: false,
  actions: {
    fetchChildren: async (familyId) => {
      set({ isLoading: true })
      try {
        const children = await userService.getChildrenByFamily(familyId)
        set({ children: children.filter(c => c.isActive), isLoading: false })
      } catch (error) {
        handleError(error, { operation: 'fetchChildren', familyId })
        set({ isLoading: false })
      }
    },

    subscribeChildren: (familyId) => {
      if (activeFamilyId === familyId && unsubChildren) return
      get().actions.unsubscribeChildren()
      activeFamilyId = familyId
      set({ isLoading: true })

      unsubChildren = userService.subscribeChildrenByFamily(
        familyId,
        (children) => set({ children: children.filter(c => c.isActive), isLoading: false }),
        (error) => {
          handleError(error, { operation: 'subscribeChildren', familyId })
          set({ isLoading: false })
        }
      )
    },

    unsubscribeChildren: () => {
      unsubChildren?.()
      unsubChildren = null
      activeFamilyId = null
    },

    addChild: async (data) => {
      try {
        const child = await userService.createChild(data)
        set({ children: [...get().children, child] })
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        const appError = handleError(error, { operation: 'addChild' })
        toast(i18n.t(appError.message.startsWith('errors.') ? appError.message : 'errors.generic'), 'error')
        return false
      }
    },

    updateChild: async (childId, updates) => {
      try {
        const child = get().children.find(c => c.id === childId)
        if (!child) throw new Error('Child not found')

        // Route PIN updates to loginProfile
        const { pin, ...userUpdates } = updates
        if (pin) {
          await userService.updateChildPin(childId, pin)
        }

        if (Object.keys(userUpdates).length > 0) {
          await userService.updateUser(childId, userUpdates)
        }

        if (userUpdates.avatarEmoji) {
          await userService.updateLoginProfileAvatar(child.familyId, childId, userUpdates.avatarEmoji)
        }

        set({
          children: get().children.map(c =>
            c.id === childId ? { ...c, ...userUpdates } : c
          ),
        })
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        const appError = handleError(error, { operation: 'updateChild', childId })
        toast(i18n.t(appError.message.startsWith('errors.') ? appError.message : 'errors.generic'), 'error')
        return false
      }
    },

    removeChild: async (childId) => {
      try {
        const child = get().children.find(c => c.id === childId)
        if (!child) throw new Error('Child not found')

        await userService.removeChild(childId, child.familyId)
        set({ children: get().children.filter(c => c.id !== childId) })
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        handleError(error, { operation: 'removeChild', childId })
        toast(i18n.t('errors.generic'), 'error')
        return false
      }
    },
  },
}))
