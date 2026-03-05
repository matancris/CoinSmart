import { create } from 'zustand'
import type { User } from 'firebase/auth'
import type { AppUser, Family } from '@/types'
import { authService, notificationService } from '@/services'
import { handleError, getFirebaseErrorMessage, FAMILY_CODE_KEY, CHILD_SESSION_KEY } from '@/utils'
import { toast } from '@/components/ui/Toast'
import { i18n } from '@/i18n'

let unsubscribeAuth: (() => void) | null = null
let suppressAuthListener = false

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

interface ChildSession {
  childId: string
  familyId: string
  expiresAt: number
}

interface AuthState {
  firebaseUser: User | null
  appUser: AppUser | null
  family: Family | null
  isLoading: boolean
  isInitialized: boolean
  actions: {
    initialize: () => void
    validateFamilyCode: (familyCode: string) => Promise<boolean>
    loginWithEmail: (email: string, password: string) => Promise<boolean>
    loginChildWithPin: (familyCode: string, pin: string) => Promise<boolean>
    register: (email: string, password: string, familyName: string, displayName: string) => Promise<boolean>
    logout: () => Promise<void>
    setChildSession: (appUser: AppUser, family: Family) => void
  }
}

function saveChildSession(childId: string, familyId: string, familyCode: string) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS
  localStorage.setItem(CHILD_SESSION_KEY, JSON.stringify({ childId, familyId, expiresAt }))
  localStorage.setItem(FAMILY_CODE_KEY, familyCode.toUpperCase())
}

function clearChildSession() {
  localStorage.removeItem(CHILD_SESSION_KEY)
}

function getChildSession(): ChildSession | null {
  const raw = localStorage.getItem(CHILD_SESSION_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as ChildSession
    if (session.expiresAt && Date.now() > session.expiresAt) {
      clearChildSession()
      return null
    }
    return session
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  appUser: null,
  family: null,
  isLoading: false,
  isInitialized: false,
  actions: {
    initialize: () => {
      if (unsubscribeAuth) return

      set({ isLoading: true })
      unsubscribeAuth = authService.onAuthChange(async (firebaseUser) => {
        if (suppressAuthListener) return

        if (get().appUser) {
          set({ firebaseUser, isLoading: false, isInitialized: true })
          return
        }

        if (firebaseUser && !firebaseUser.isAnonymous) {
          try {
            const appUser = await authService.fetchAppUser(firebaseUser.uid)
            const family = await authService.fetchFamily(appUser.familyId)
            set({ firebaseUser, appUser, family, isLoading: false, isInitialized: true })
          } catch {
            set({ firebaseUser: null, appUser: null, family: null, isLoading: false, isInitialized: true })
          }
          return
        }

        // Try restoring child session from localStorage
        const session = getChildSession()
        if (session) {
          try {
            if (!firebaseUser) {
              suppressAuthListener = true
              await authService.logout().catch(() => {})
              await authService.signInAsAnonymous()
              suppressAuthListener = false
            }
            // Refresh lastAuthUid so Firestore rules recognise this anonymous session
            await authService.updateLastAuthUid(session.childId)
            const appUser = await authService.fetchAppUser(session.childId)
            const family = await authService.fetchFamily(session.familyId)
            // Sliding expiration: refresh the 7-day timer on each visit
            const familyCode = localStorage.getItem(FAMILY_CODE_KEY) ?? ''
            saveChildSession(session.childId, session.familyId, familyCode)
            set({ firebaseUser: firebaseUser ?? null, appUser, family, isLoading: false, isInitialized: true })
          } catch {
            clearChildSession()
            set({ firebaseUser: null, appUser: null, family: null, isLoading: false, isInitialized: true })
          }
        } else {
          set({ firebaseUser, appUser: null, family: null, isLoading: false, isInitialized: true })
        }
      })
    },

    validateFamilyCode: async (familyCode) => {
      try {
        return await authService.validateFamilyCode(familyCode)
      } catch {
        return false
      }
    },

    loginWithEmail: async (email, password) => {
      set({ isLoading: true })
      suppressAuthListener = true
      try {
        const appUser = await authService.loginWithEmail(email, password)
        const family = await authService.fetchFamily(appUser.familyId)
        set({ appUser, family, isLoading: false, isInitialized: true })
        return true
      } catch (error) {
        const appError = handleError(error, { operation: 'loginWithEmail' })
        const msgKey = getFirebaseErrorMessage(appError.code)
        toast(i18n.t(msgKey), 'error')
        set({ isLoading: false })
        return false
      } finally {
        suppressAuthListener = false
      }
    },

    loginChildWithPin: async (familyCode, pin) => {
      set({ isLoading: true })
      suppressAuthListener = true
      try {
        const { appUser, family } = await authService.loginChildWithPin(familyCode, pin)
        saveChildSession(appUser.id, family.id, familyCode)
        set({ appUser, family, isLoading: false, isInitialized: true })
        return true
      } catch (error) {
        const appError = handleError(error, { operation: 'loginChildWithPin' })
        toast(i18n.t(appError.message.startsWith('errors.') ? appError.message : 'errors.generic'), 'error')
        set({ isLoading: false })
        return false
      } finally {
        suppressAuthListener = false
      }
    },

    register: async (email, password, familyName, displayName) => {
      set({ isLoading: true })
      suppressAuthListener = true
      try {
        const { user, family } = await authService.registerParent(email, password, familyName, displayName)
        set({ appUser: user, family, isLoading: false, isInitialized: true })
        return true
      } catch (error) {
        const appError = handleError(error, { operation: 'register' })
        const msgKey = getFirebaseErrorMessage(appError.code)
        toast(i18n.t(msgKey), 'error')
        set({ isLoading: false })
        return false
      } finally {
        suppressAuthListener = false
      }
    },

    logout: async () => {
      suppressAuthListener = true
      const currentUser = get().appUser
      if (currentUser) {
        await notificationService.removeToken(currentUser.id).catch(() => {})
      }
      clearChildSession()
      await authService.logout()
      set({ firebaseUser: null, appUser: null, family: null, isInitialized: true })
      suppressAuthListener = false
    },

    setChildSession: (appUser, family) => {
      set({ appUser, family, isInitialized: true })
    },
  },
}))
