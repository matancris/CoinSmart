import {
  collection, doc, getDocs, updateDoc,
  query, orderBy, limit as firestoreLimit, startAfter,
  writeBatch, getDoc, onSnapshot,
  Timestamp, type DocumentSnapshot,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/config/firebase'
import type { Transaction, TransactionType } from '@/types'
import { toDate } from '@/utils/date'
import { sanitizeString } from '@/utils/validation'

export async function getTransactions(
  userId: string,
  limitCount = 20,
  lastDoc?: DocumentSnapshot
): Promise<{ transactions: Transaction[]; lastDoc: DocumentSnapshot | null }> {
  const ref = collection(db, 'users', userId, 'transactions')
  let q = query(ref, orderBy('createdAt', 'desc'), firestoreLimit(limitCount))

  if (lastDoc) {
    q = query(ref, orderBy('createdAt', 'desc'), startAfter(lastDoc), firestoreLimit(limitCount))
  }

  const snap = await getDocs(q)
  const transactions = snap.docs.map(d => parseTransaction(d.id, d.data()))
  const newLastDoc = snap.docs[snap.docs.length - 1] ?? null

  return { transactions, lastDoc: newLastDoc }
}

// Runs on the server so the balance can only change together with a matching ledger entry
export async function createTransaction(
  userId: string,
  data: {
    type: TransactionType
    amount: number
    description: string
    itemName?: string
    note?: string
  }
): Promise<void> {
  const create = httpsCallable(functions, 'createTransaction')
  await create({
    userId,
    type: data.type,
    amount: data.amount,
    description: sanitizeString(data.description, 200),
    ...(data.itemName != null && { itemName: sanitizeString(data.itemName, 100) }),
    ...(data.note != null && { note: sanitizeString(data.note, 500) }),
  })
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  updates: { description?: string; note?: string; editedBy: string }
): Promise<void> {
  const txRef = doc(db, 'users', userId, 'transactions', transactionId)
  await updateDoc(txRef, {
    ...(updates.description != null && { description: sanitizeString(updates.description, 200) }),
    ...(updates.note != null && { note: sanitizeString(updates.note, 500) }),
    editedBy: updates.editedBy,
    editedAt: new Date(),
  })
}

export async function deleteTransaction(userId: string, transactionId: string): Promise<void> {
  const txRef = doc(db, 'users', userId, 'transactions', transactionId)
  const txSnap = await getDoc(txRef)

  if (!txSnap.exists()) return

  const tx = parseTransaction(txSnap.id, txSnap.data())
  const userRef = doc(db, 'users', userId)
  const userSnap = await getDoc(userRef)

  if (!userSnap.exists()) return

  const currentBalance = (userSnap.data().balance as number) ?? 0
  // Interest and direct savings deposits land in the savings goal, never in the wallet
  const delta = tx.type === 'interest' ? 0 : getBalanceDelta(tx.type, tx.amount)
  const restoredBalance = roundCents(currentBalance - delta)

  const batch = writeBatch(db)
  batch.delete(txRef)

  const userUpdates: Record<string, number> = { balance: restoredBalance }

  if (tx.savingsId && SAVINGS_TX_TYPES.includes(tx.type)) {
    const savingsRef = doc(db, 'users', userId, 'savings', tx.savingsId)
    const savingsSnap = await getDoc(savingsRef)

    if (!savingsSnap.exists()) {
      // Savings goal was already deleted — deleteSavingsGoal already reconciled finances.
      // Only delete the orphaned transaction doc, skip balance reversal.
      batch.delete(txRef)
      await batch.commit()
      return
    }

    const savingsData = savingsSnap.data()
    const currentSavingsAmount = (savingsData.currentAmount as number) ?? 0
    const totalSavings = (userSnap.data().totalSavings as number) ?? 0
    // Reverse the effect: a withdrawal took money out of the goal, every other type put money in
    const savingsDelta = tx.type === 'transfer_from_savings' ? tx.amount : -tx.amount

    const savingsUpdates: Record<string, number> = {
      currentAmount: roundCents(currentSavingsAmount + savingsDelta),
    }
    if (tx.type === 'interest') {
      const accruedInterest = (savingsData.accruedInterest as number) ?? 0
      savingsUpdates.accruedInterest = Math.max(0, roundCents(accruedInterest - tx.amount))
    }

    batch.update(savingsRef, savingsUpdates)
    userUpdates.totalSavings = roundCents(totalSavings + savingsDelta)
  }

  batch.update(userRef, userUpdates)
  await batch.commit()
}

export function subscribeTransactions(
  userId: string,
  limitCount: number,
  onData: (transactions: Transaction[]) => void,
  onError: (error: Error) => void
): () => void {
  const ref = collection(db, 'users', userId, 'transactions')
  const q = query(ref, orderBy('createdAt', 'desc'), firestoreLimit(limitCount))

  return onSnapshot(q, (snap) => {
    const transactions = snap.docs.map(d => parseTransaction(d.id, d.data()))
    onData(transactions)
  }, onError)
}

export async function getTransactionsAfterDate(
  userId: string,
  limitCount: number,
  afterDate: Date
): Promise<{ transactions: Transaction[]; lastCursor: Date | null }> {
  const ref = collection(db, 'users', userId, 'transactions')
  const q = query(
    ref,
    orderBy('createdAt', 'desc'),
    startAfter(Timestamp.fromDate(afterDate)),
    firestoreLimit(limitCount)
  )

  const snap = await getDocs(q)
  const transactions = snap.docs.map(d => parseTransaction(d.id, d.data()))
  const lastCursor = transactions.length > 0
    ? transactions[transactions.length - 1].createdAt
    : null

  return { transactions, lastCursor }
}

export async function createChildTransfer(
  senderId: string,
  senderName: string,
  recipientId: string,
  recipientName: string,
  amount: number,
  note?: string
): Promise<void> {
  const callable = httpsCallable(functions, 'transferToChild')
  const result = await callable({ senderId, senderName, recipientId, recipientName, amount, note })
  const data = result.data as { success?: boolean }
  if (!data.success) throw new Error('errors.generic')
}

const SAVINGS_TX_TYPES: TransactionType[] = [
  'transfer_to_savings',
  'transfer_from_savings',
  'deposit_to_savings',
  'interest',
]

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

function getBalanceDelta(type: TransactionType, amount: number): number {
  switch (type) {
    case 'deposit':
    case 'transfer_from_savings':
    case 'interest':
    case 'allowance':
    case 'transfer_in':
      return amount
    case 'withdrawal':
    case 'purchase':
    case 'transfer_to_savings':
    case 'transfer_out':
      return -amount
    case 'deposit_to_savings':
      return 0
  }
}

function parseTransaction(id: string, data: Record<string, unknown>): Transaction {
  return {
    id,
    type: data.type as TransactionType,
    amount: data.amount as number,
    balanceAfter: data.balanceAfter as number,
    description: data.description as string,
    itemName: data.itemName as string | undefined,
    createdAt: toDate(data.createdAt),
    createdBy: data.createdBy as string,
    editedAt: data.editedAt ? toDate(data.editedAt) : undefined,
    editedBy: data.editedBy as string | undefined,
    note: data.note as string | undefined,
    savingsId: data.savingsId as string | undefined,
    recipientId: data.recipientId as string | undefined,
    recipientName: data.recipientName as string | undefined,
  }
}
