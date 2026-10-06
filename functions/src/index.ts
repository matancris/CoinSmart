import { initializeApp } from 'firebase-admin/app'

initializeApp()

export { onTransactionCreated } from './notifications/onTransactionCreated'
export { transferToChild } from './transfers/transferToChild'
export { processRecurring } from './scheduled/processRecurring'
export { checkFamilyCode, childLogin, refreshChildSession } from './auth/childAuth'
export { createChild, setChildPin } from './family/children'
export { createTransaction } from './wallet/transactions'
export { createSavingsGoal, moveSavings, deleteSavingsGoal } from './wallet/savings'
export { syncWallet } from './wallet/syncWallet'
