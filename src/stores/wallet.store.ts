import { create } from 'zustand'
import type { Transaction, TransactionType, SavingsGoal, SavingsType, Allowance, AllowanceFrequency, AllowanceStatus } from '@/types'
import { transactionService, savingsService, userService, allowanceService } from '@/services'
import { handleError } from '@/utils'
import { toast } from '@/components/ui/Toast'
import { i18n } from '@/i18n'
import type { DocumentSnapshot } from 'firebase/firestore'

interface WalletState {
  balance: number
  totalSavings: number
  transactions: Transaction[]
  savingsGoals: SavingsGoal[]
  allowances: Allowance[]
  isLoading: boolean
  hasMore: boolean
  lastDoc: DocumentSnapshot | null
  actions: {
    fetchWallet: (userId: string) => Promise<void>
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
    refreshBalance: (userId: string) => Promise<void>
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
  savingsGoals: [],
  allowances: [],
  isLoading: false,
  hasMore: true,
  lastDoc: null,
  actions: {
    fetchWallet: async (userId) => {
      set({ isLoading: true })
      try {
        const [user, { transactions, lastDoc }, savingsGoals, allowances] = await Promise.all([
          userService.getUser(userId),
          transactionService.getTransactions(userId, 20),
          savingsService.getSavingsGoals(userId),
          allowanceService.getAllowances(userId),
        ])
        set({
          balance: user.balance,
          totalSavings: user.totalSavings,
          transactions,
          savingsGoals,
          allowances,
          lastDoc,
          hasMore: transactions.length === 20,
          isLoading: false,
        })

        let needsRefresh = false

        // Apply interest to eligible goals
        const eligibleGoals = savingsGoals.filter(g =>
          g.status === 'active' && g.interestRate > 0
        )
        if (eligibleGoals.length > 0) {
          const results = await Promise.all(
            eligibleGoals.map(g => savingsService.applyInterestIfDue(userId, g))
          )
          if (results.some(Boolean)) needsRefresh = true
        }

        // Apply due allowances
        const activeAllowances = allowances.filter(a => a.status === 'active')
        if (activeAllowances.length > 0) {
          const allowanceApplied = await allowanceService.applyAllowancesIfDue(userId, activeAllowances)
          if (allowanceApplied) needsRefresh = true
        }

        if (needsRefresh) {
          const [updatedUser, updatedSavings, updatedAllowances, updatedTx] = await Promise.all([
            userService.getUser(userId),
            savingsService.getSavingsGoals(userId),
            allowanceService.getAllowances(userId),
            transactionService.getTransactions(userId, 20),
          ])
          set({
            balance: updatedUser.balance,
            totalSavings: updatedUser.totalSavings,
            savingsGoals: updatedSavings,
            allowances: updatedAllowances,
            transactions: updatedTx.transactions,
            lastDoc: updatedTx.lastDoc,
            hasMore: updatedTx.transactions.length === 20,
          })
        }
      } catch (error) {
        handleError(error, { operation: 'fetchWallet', userId })
        set({ isLoading: false })
      }
    },

    fetchTransactions: async (userId, loadMore = false) => {
      const state = get()
      if (loadMore && !state.hasMore) return

      set({ isLoading: true })
      try {
        const { transactions, lastDoc } = await transactionService.getTransactions(
          userId,
          20,
          loadMore ? (state.lastDoc ?? undefined) : undefined
        )
        set({
          transactions: loadMore ? [...state.transactions, ...transactions] : transactions,
          lastDoc,
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
        const tx = await transactionService.createTransaction(userId, data)
        set(state => ({
          transactions: [tx, ...state.transactions],
          balance: tx.balanceAfter,
        }))
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
        await get().actions.fetchWallet(userId)
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
        await get().actions.fetchWallet(userId)
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
        await get().actions.fetchWallet(userId)
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
        await get().actions.fetchWallet(userId)
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
        await get().actions.fetchWallet(userId)
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
        set({ balance: newBalance })
        toast(i18n.t('common.success'), 'success')
        return true
      } catch (error) {
        handleError(error, { operation: 'setBalance', userId })
        toast(i18n.t('errors.generic'), 'error')
        return false
      }
    },

    refreshBalance: async (userId) => {
      try {
        const user = await userService.getUser(userId)
        set({ balance: user.balance, totalSavings: user.totalSavings })
      } catch (error) {
        handleError(error, { operation: 'refreshBalance', userId })
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
