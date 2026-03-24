import { initializeApp } from 'firebase-admin/app'

initializeApp()

export { onTransactionCreated } from './notifications/onTransactionCreated'
export { transferToChild } from './transfers/transferToChild'
