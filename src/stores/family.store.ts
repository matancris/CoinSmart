import { create } from 'zustand'
import type { AppUser } from '@/types'
import { userService } from '@/services'
import { handleError } from '@/utils'
import { toast } from '@/components/ui/Toast'
import { i18n } from '@/i18n'

interface FamilyState {
  children: AppUser[]
  isLoading: boolean
  actions: {
    fetchChildren: (familyId: string) => Promise<void>
    addChild: (data: {
      familyId: string
      displayName: string
      avatarEmoji: string
      pin: string
      initialBalance: number
    }) => Promise<boolean>
    updateChild: (childId: string, updates: Partial<AppUser>) => Promise<boolean>
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

    addChild: async (data) => {
      try {
        const child = await userService.createChild(data)
        set({ children: [...get().children, child] })
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        handleError(error, { operation: 'addChild' })
        toast(i18n.t('errors.generic'), 'error')
        return false
      }
    },

    updateChild: async (childId, updates) => {
      try {
        await userService.updateUser(childId, updates)
        set({
          children: get().children.map(c =>
            c.id === childId ? { ...c, ...updates } : c
          ),
        })
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        handleError(error, { operation: 'updateChild', childId })
        toast(i18n.t('errors.generic'), 'error')
        return false
      }
    },

    removeChild: async (childId) => {
      try {
        await userService.removeChild(childId)
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
