import {
  collection, doc, getDocs, updateDoc,
  query, orderBy, limit as firestoreLimit, startAfter,
  writeBatch, getDoc, type DocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/config/firebase'
import type { Transaction, TransactionType } from '@/types'
import { toDate } from '@/utils/date'

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

export async function createTransaction(
  userId: string,
  data: {
    type: TransactionType
    amount: number
    description: string
    itemName?: string
    createdBy: string
    note?: string
  }
): Promise<Transaction> {
  const batch = writeBatch(db)
  const userRef = doc(db, 'users', userId)
  const userSnap = await getDoc(userRef)

  if (!userSnap.exists()) throw new Error('User not found')

  const currentBalance = (userSnap.data().balance as number) ?? 0
  const delta = getBalanceDelta(data.type, data.amount)
  const newBalance = currentBalance + delta

  if (newBalance < 0) throw new Error('errors.insufficientBalance')

  const txRef = doc(collection(db, 'users', userId, 'transactions'))
  const transaction: Transaction = {
    id: txRef.id,
    type: data.type,
    amount: data.amount,
    balanceAfter: newBalance,
    description: data.description,
    createdAt: new Date(),
    createdBy: data.createdBy,
    ...(data.itemName != null && { itemName: data.itemName }),
    ...(data.note != null && { note: data.note }),
  }

  batch.set(txRef, transaction)
  batch.update(userRef, { balance: newBalance })

  await batch.commit()
  return transaction
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  updates: { description?: string; note?: string; amount?: number; editedBy: string }
): Promise<void> {
  const txRef = doc(db, 'users', userId, 'transactions', transactionId)
  await updateDoc(txRef, {
    ...updates,
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
  const delta = getBalanceDelta(tx.type, tx.amount)
  const restoredBalance = currentBalance - delta

  const batch = writeBatch(db)
  batch.delete(txRef)

  const userUpdates: Record<string, number> = { balance: restoredBalance }

  if (tx.savingsId && (tx.type === 'transfer_to_savings' || tx.type === 'transfer_from_savings')) {
    const savingsRef = doc(db, 'users', userId, 'savings', tx.savingsId)
    const savingsSnap = await getDoc(savingsRef)

    if (!savingsSnap.exists()) {
      // Savings goal was already deleted — deleteSavingsGoal already reconciled finances.
      // Only delete the orphaned transaction doc, skip balance reversal.
      batch.delete(txRef)
      await batch.commit()
      return
    }

    const currentSavingsAmount = (savingsSnap.data().currentAmount as number) ?? 0
    const totalSavings = (userSnap.data().totalSavings as number) ?? 0

    if (tx.type === 'transfer_to_savings') {
      batch.update(savingsRef, { currentAmount: currentSavingsAmount - tx.amount })
      userUpdates.totalSavings = totalSavings - tx.amount
    } else {
      batch.update(savingsRef, { currentAmount: currentSavingsAmount + tx.amount })
      userUpdates.totalSavings = totalSavings + tx.amount
    }
  }

  batch.update(userRef, userUpdates)
  await batch.commit()
}

function getBalanceDelta(type: TransactionType, amount: number): number {
  switch (type) {
    case 'deposit':
    case 'transfer_from_savings':
    case 'interest':
      return amount
    case 'withdrawal':
    case 'purchase':
    case 'transfer_to_savings':
      return -amount
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
  }
}
