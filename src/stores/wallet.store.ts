import { create } from 'zustand'
import type { Transaction, TransactionType, SavingsGoal, SavingsType, Allowance, AllowanceFrequency, AllowanceStatus } from '@/types'
import { transactionService, savingsService, userService, allowanceService } from '@/services'
import { handleError } from '@/utils'
import { toast } from '@/components/ui/Toast'
import { i18n } from '@/i18n'

let unsubUser: (() => void) | null = null
let unsubTransactions: (() => void) | null = null
let activeUserId: string | null = null

interface WalletState {
  balance: number
  totalSavings: number
  transactions: Transaction[]
  olderTransactions: Transaction[]
  savingsGoals: SavingsGoal[]
  allowances: Allowance[]
  isLoading: boolean
  hasMore: boolean
  lastCursor: Date | null
  actions: {
    subscribe: (userId: string) => Promise<void>
    unsubscribe: () => void
    fetchTransactions: (userId: string, loadMore?: boolean) => Promise<void>
    fetchSavings: (userId: string) => Promise<void>
    createTransaction: (userId: string, data: {
      type: TransactionType
      amount: number
      description: string
      itemName?: string
      createdBy: string
      note?: string
    }) => Promise<boolean>
    createSavingsGoal: (userId: string, data: {
      name: string
      targetAmount?: number
      savingsType: SavingsType
    }) => Promise<boolean>
    transferToSavings: (userId: string, savingsId: string, amount: number, createdBy: string) => Promise<boolean>
    depositToSavings: (userId: string, savingsId: string, amount: number, createdBy: string) => Promise<boolean>
    withdrawFromSavings: (userId: string, savingsId: string, amount: number, createdBy: string, force?: boolean) => Promise<boolean>
    deleteSavingsGoal: (userId: string, savingsId: string, force?: boolean) => Promise<boolean>
    deleteTransaction: (userId: string, transactionId: string) => Promise<boolean>
    setBalance: (userId: string, newBalance: number) => Promise<boolean>
    fetchAllowances: (userId: string) => Promise<void>
    createAllowance: (userId: string, data: {
      amount: number
      frequency: AllowanceFrequency
      intervalDays?: number
      dayOfMonth?: number
      description: string
      createdBy: string
    }) => Promise<boolean>
    updateAllowance: (userId: string, allowanceId: string, data: {
      amount?: number
      frequency?: AllowanceFrequency
      intervalDays?: number
      dayOfMonth?: number
      description?: string
    }) => Promise<boolean>
    deleteAllowance: (userId: string, allowanceId: string) => Promise<boolean>
    toggleAllowancePause: (userId: string, allowanceId: string, currentStatus: AllowanceStatus) => Promise<boolean>
  }
}

export const useWalletStore = create<WalletState>((set, get) => ({
  balance: 0,
  totalSavings: 0,
  transactions: [],
  olderTransactions: [],
  savingsGoals: [],
  allowances: [],
  isLoading: false,
  hasMore: true,
  lastCursor: null,
  actions: {
    subscribe: async (userId) => {
      if (activeUserId === userId && unsubUser && unsubTransactions) return

      get().actions.unsubscribe()
      activeUserId = userId
      set({ isLoading: true })

      try {
        const [savingsGoals, allowances] = await Promise.all([
          savingsService.getSavingsGoals(userId),
          allowanceService.getAllowances(userId),
        ])
        set({ savingsGoals, allowances })

        let needsRefresh = false

        const eligibleGoals = savingsGoals.filter(g =>
          g.status === 'active' && g.interestRate > 0
        )
        if (eligibleGoals.length > 0) {
          const results = await Promise.all(
            eligibleGoals.map(g => savingsService.applyInterestIfDue(userId, g))
          )
          if (results.some(Boolean)) needsRefresh = true
        }

        const activeAllowances = allowances.filter(a => a.status === 'active')
        if (activeAllowances.length > 0) {
          const allowanceApplied = await allowanceService.applyAllowancesIfDue(userId, activeAllowances)
          if (allowanceApplied) needsRefresh = true
        }

        if (needsRefresh) {
          const [updatedSavings, updatedAllowances] = await Promise.all([
            savingsService.getSavingsGoals(userId),
            allowanceService.getAllowances(userId),
          ])
          set({ savingsGoals: updatedSavings, allowances: updatedAllowances })
        }
      } catch (error) {
        handleError(error, { operation: 'subscribe:init', userId })
      }

      // Guard: abort if unsubscribed or switched user during async init
      if (activeUserId !== userId) return

      // Start real-time listeners
      unsubUser = userService.subscribeUser(
        userId,
        (user) => {
          set({ balance: user.balance, totalSavings: user.totalSavings })
        },
        (error) => handleError(error, { operation: 'subscribeUser', userId })
      )

      unsubTransactions = transactionService.subscribeTransactions(
        userId,
        20,
        (liveTransactions) => {
          set({
            transactions: [...liveTransactions, ...get().olderTransactions],
            hasMore: liveTransactions.length === 20,
            isLoading: false,
          })
        },
        (error) => {
          handleError(error, { operation: 'subscribeTransactions', userId })
          set({ isLoading: false })
        }
      )
    },

    unsubscribe: () => {
      if (unsubUser) { unsubUser(); unsubUser = null }
      if (unsubTransactions) { unsubTransactions(); unsubTransactions = null }
      activeUserId = null
      set({
        balance: 0,
        totalSavings: 0,
        transactions: [],
        olderTransactions: [],
        savingsGoals: [],
        allowances: [],
        isLoading: false,
        hasMore: true,
        lastCursor: null,
      })
    },

    fetchTransactions: async (userId, loadMore = false) => {
      if (!loadMore) return
      const state = get()
      if (!state.hasMore) return

      set({ isLoading: true })
      try {
        // Use the createdAt of the last live transaction as cursor for the first "Load More"
        const liveTransactions = state.transactions.slice(0, state.transactions.length - state.olderTransactions.length)
        const cursor = state.lastCursor
          ?? (liveTransactions.length > 0 ? liveTransactions[liveTransactions.length - 1].createdAt : null)

        if (!cursor) {
          set({ isLoading: false, hasMore: false })
          return
        }

        const { transactions, lastCursor } = await transactionService.getTransactionsAfterDate(
          userId, 20, cursor
        )

        const newOlder = [...state.olderTransactions, ...transactions]
        const liveTx = state.transactions.slice(0, state.transactions.length - state.olderTransactions.length)

        set({
          olderTransactions: newOlder,
          transactions: [...liveTx, ...newOlder],
          lastCursor,
          hasMore: transactions.length === 20,
          isLoading: false,
        })
      } catch (error) {
        handleError(error, { operation: 'fetchTransactions', userId })
        set({ isLoading: false })
      }
    },

    fetchSavings: async (userId) => {
      try {
        const savingsGoals = await savingsService.getSavingsGoals(userId)
        set({ savingsGoals })
      } catch (error) {
        handleError(error, { operation: 'fetchSavings', userId })
      }
    },

    createTransaction: async (userId, data) => {
      try {
        await transactionService.createTransaction(userId, data)
        return true
      } catch (error) {
        const appError = handleError(error, { operation: 'createTransaction' })
        toast(i18n.t(appError.message.startsWith('errors.') ? appError.message : 'errors.generic'), 'error')
        return false
      }
    },

    createSavingsGoal: async (userId, data) => {
      try {
        const goal = await savingsService.createSavingsGoal(userId, data)
        set(state => ({ savingsGoals: [...state.savingsGoals, goal] }))
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        handleError(error, { operation: 'createSavingsGoal' })
        toast(i18n.t('errors.generic'), 'error')
        return false
      }
    },

    transferToSavings: async (userId, savingsId, amount, createdBy) => {
      try {
        await savingsService.transferToSavings(userId, savingsId, amount, createdBy)
        const savingsGoals = await savingsService.getSavingsGoals(userId)
        set({ savingsGoals })
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        const appError = handleError(error, { operation: 'transferToSavings' })
        toast(i18n.t(appError.message.startsWith('errors.') ? appError.message : 'errors.generic'), 'error')
        return false
      }
    },

    depositToSavings: async (userId, savingsId, amount, createdBy) => {
      try {
        await savingsService.depositToSavings(userId, savingsId, amount, createdBy)
        const savingsGoals = await savingsService.getSavingsGoals(userId)
        set({ savingsGoals })
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        const appError = handleError(error, { operation: 'depositToSavings' })
        toast(i18n.t(appError.message.startsWith('errors.') ? appError.message : 'errors.generic'), 'error')
        return false
      }
    },

    withdrawFromSavings: async (userId, savingsId, amount, createdBy, force) => {
      try {
        await savingsService.withdrawFromSavings(userId, savingsId, amount, createdBy, force)
        const savingsGoals = await savingsService.getSavingsGoals(userId)
        set({ savingsGoals })
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        const appError = handleError(error, { operation: 'withdrawFromSavings' })
        toast(i18n.t(appError.message.startsWith('errors.') ? appError.message : 'errors.generic'), 'error')
        return false
      }
    },

    deleteSavingsGoal: async (userId, savingsId, force) => {
      try {
        await savingsService.deleteSavingsGoal(userId, savingsId, force)
        const savingsGoals = await savingsService.getSavingsGoals(userId)
        set({ savingsGoals })
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        const appError = handleError(error, { operation: 'deleteSavingsGoal' })
        toast(i18n.t(appError.message.startsWith('errors.') ? appError.message : 'errors.generic'), 'error')
        return false
      }
    },

    deleteTransaction: async (userId, transactionId) => {
      try {
        await transactionService.deleteTransaction(userId, transactionId)
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        handleError(error, { operation: 'deleteTransaction' })
        toast(i18n.t('errors.generic'), 'error')
        return false
      }
    },

    setBalance: async (userId, newBalance) => {
      try {
        await userService.setBalance(userId, newBalance)
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        handleError(error, { operation: 'setBalance', userId })
        toast(i18n.t('errors.generic'), 'error')
        return false
      }
    },

    fetchAllowances: async (userId) => {
      try {
        const allowances = await allowanceService.getAllowances(userId)
        set({ allowances })
      } catch (error) {
        handleError(error, { operation: 'fetchAllowances', userId })
      }
    },

    createAllowance: async (userId, data) => {
      try {
        const allowance = await allowanceService.createAllowance(userId, data)
        set(state => ({ allowances: [...state.allowances, allowance] }))
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        handleError(error, { operation: 'createAllowance' })
        toast(i18n.t('errors.generic'), 'error')
        return false
      }
    },

    updateAllowance: async (userId, allowanceId, data) => {
      try {
        await allowanceService.updateAllowance(userId, allowanceId, data)
        const allowances = await allowanceService.getAllowances(userId)
        set({ allowances })
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        handleError(error, { operation: 'updateAllowance' })
        toast(i18n.t('errors.generic'), 'error')
        return false
      }
    },

    deleteAllowance: async (userId, allowanceId) => {
      try {
        await allowanceService.deleteAllowance(userId, allowanceId)
        set(state => ({
          allowances: state.allowances.filter(a => a.id !== allowanceId),
        }))
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        handleError(error, { operation: 'deleteAllowance' })
        toast(i18n.t('errors.generic'), 'error')
        return false
      }
    },

    toggleAllowancePause: async (userId, allowanceId, currentStatus) => {
      try {
        await allowanceService.toggleAllowanceStatus(userId, allowanceId, currentStatus)
        const allowances = await allowanceService.getAllowances(userId)
        set({ allowances })
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        handleError(error, { operation: 'toggleAllowancePause' })
        toast(i18n.t('errors.generic'), 'error')
        return false
      }
    },
  },
}))
