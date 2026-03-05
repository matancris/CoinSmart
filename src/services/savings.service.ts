import {
  collection, doc, getDocs, setDoc,
  query, where, writeBatch, getDoc,
  type WriteBatch, type DocumentData,
} from 'firebase/firestore'
import { db } from '@/config/firebase'
import type { SavingsGoal, SavingsType } from '@/types'
import { toDate } from '@/utils/date'
import { sanitizeString } from '@/utils/validation'
import { SAVINGS_PLANS } from '@/utils/savings'

export async function getSavingsGoals(userId: string): Promise<SavingsGoal[]> {
  const ref = collection(db, 'users', userId, 'savings')
  const q = query(ref, where('status', '==', 'active'))
  const snap = await getDocs(q)
  return snap.docs.map(d => parseSavingsGoal(d.id, d.data()))
}

export async function createSavingsGoal(
  userId: string,
  data: { name: string; targetAmount?: number; savingsType: SavingsType }
): Promise<SavingsGoal> {
  const ref = doc(collection(db, 'users', userId, 'savings'))
  const plan = SAVINGS_PLANS[data.savingsType]
  const now = new Date()

  let maturityDate: Date | undefined
  if (plan.lockMonths > 0) {
    maturityDate = new Date(now)
    maturityDate.setMonth(maturityDate.getMonth() + plan.lockMonths)
  }

  const goal: SavingsGoal = {
    id: ref.id,
    name: sanitizeString(data.name, 100),
    targetAmount: data.targetAmount,
    currentAmount: 0,
    interestRate: plan.annualRate,
    accruedInterest: 0,
    savingsType: data.savingsType,
    status: 'active',
    createdAt: now,
    maturityDate,
    lastInterestAt: now,
  }

  // Firestore throws on undefined values — strip them before writing
  const cleanGoal = Object.fromEntries(
    Object.entries(goal).filter(([, v]) => v !== undefined)
  )

  await setDoc(ref, cleanGoal)
  return goal
}

export async function transferToSavings(
  userId: string,
  savingsId: string,
  amount: number,
  createdBy: string
): Promise<void> {
  const userRef = doc(db, 'users', userId)
  const savingsRef = doc(db, 'users', userId, 'savings', savingsId)
  const [userSnap, savingsSnap] = await Promise.all([getDoc(userRef), getDoc(savingsRef)])

  if (!userSnap.exists() || !savingsSnap.exists()) throw new Error('errors.notFound')

  const balance = (userSnap.data().balance as number) ?? 0
  if (balance < amount) throw new Error('errors.insufficientBalance')

  const currentSavings = (savingsSnap.data().currentAmount as number) ?? 0
  const totalSavings = (userSnap.data().totalSavings as number) ?? 0

  const batch = writeBatch(db)

  batch.update(userRef, {
    balance: balance - amount,
    totalSavings: totalSavings + amount,
  })

  batch.update(savingsRef, {
    currentAmount: currentSavings + amount,
  })

  const txRef = doc(collection(db, 'users', userId, 'transactions'))
  batch.set(txRef, {
    id: txRef.id,
    type: 'transfer_to_savings',
    amount,
    balanceAfter: balance - amount,
    description: savingsSnap.data().name,
    savingsId,
    createdAt: new Date(),
    createdBy,
  })

  await batch.commit()
}

export async function depositToSavings(
  userId: string,
  savingsId: string,
  amount: number,
  createdBy: string
): Promise<void> {
  const userRef = doc(db, 'users', userId)
  const savingsRef = doc(db, 'users', userId, 'savings', savingsId)
  const [userSnap, savingsSnap] = await Promise.all([getDoc(userRef), getDoc(savingsRef)])

  if (!userSnap.exists() || !savingsSnap.exists()) throw new Error('errors.notFound')

  const currentSavings = (savingsSnap.data().currentAmount as number) ?? 0
  const totalSavings = (userSnap.data().totalSavings as number) ?? 0
  const balance = (userSnap.data().balance as number) ?? 0

  const batch = writeBatch(db)

  batch.update(userRef, {
    totalSavings: totalSavings + amount,
  })

  batch.update(savingsRef, {
    currentAmount: currentSavings + amount,
  })

  const txRef = doc(collection(db, 'users', userId, 'transactions'))
  batch.set(txRef, {
    id: txRef.id,
    type: 'deposit_to_savings',
    amount,
    balanceAfter: balance,
    description: savingsSnap.data().name,
    savingsId,
    createdAt: new Date(),
    createdBy,
  })

  await batch.commit()
}

export async function withdrawFromSavings(
  userId: string,
  savingsId: string,
  amount: number,
  createdBy: string,
  force?: boolean
): Promise<void> {
  const userRef = doc(db, 'users', userId)
  const savingsRef = doc(db, 'users', userId, 'savings', savingsId)
  const [userSnap, savingsSnap] = await Promise.all([getDoc(userRef), getDoc(savingsRef)])

  if (!userSnap.exists() || !savingsSnap.exists()) throw new Error('errors.notFound')

  const savingsData = savingsSnap.data()

  if (!force) {
    const maturityDate = savingsData.maturityDate
      ? toDate(savingsData.maturityDate)
      : undefined
    if (maturityDate && new Date() < maturityDate) {
      throw new Error('errors.savingsLocked')
    }
  }

  let currentSavings = (savingsData.currentAmount as number) ?? 0
  const interestRate = (savingsData.interestRate as number) ?? 0
  const accruedInterest = (savingsData.accruedInterest as number) ?? 0
  const balance = (userSnap.data().balance as number) ?? 0
  let totalSavings = (userSnap.data().totalSavings as number) ?? 0

  const now = new Date()
  const batch = writeBatch(db)

  const proRataInterest = calculateProRataInterest(savingsData, now, currentSavings, interestRate)
  if (proRataInterest > 0) {
    currentSavings += proRataInterest
    totalSavings += proRataInterest
    writeInterestTransaction(batch, userId, proRataInterest, balance, savingsData.name as string, savingsId, now)
  }

  if (currentSavings < amount) throw new Error('errors.insufficientBalance')

  batch.update(userRef, {
    balance: balance + amount,
    totalSavings: totalSavings - amount,
  })

  batch.update(savingsRef, {
    currentAmount: currentSavings - amount,
    ...(proRataInterest > 0 && {
      accruedInterest: accruedInterest + proRataInterest,
      lastInterestAt: now,
    }),
  })

  const txRef = doc(collection(db, 'users', userId, 'transactions'))
  batch.set(txRef, {
    id: txRef.id,
    type: 'transfer_from_savings',
    amount,
    balanceAfter: balance + amount,
    description: savingsData.name,
    savingsId,
    createdAt: now,
    createdBy,
  })

  await batch.commit()
}

export async function deleteSavingsGoal(
  userId: string,
  savingsId: string,
  force?: boolean
): Promise<void> {
  const userRef = doc(db, 'users', userId)
  const savingsRef = doc(db, 'users', userId, 'savings', savingsId)
  const [userSnap, savingsSnap] = await Promise.all([getDoc(userRef), getDoc(savingsRef)])

  if (!userSnap.exists() || !savingsSnap.exists()) throw new Error('errors.notFound')

  const savingsData = savingsSnap.data()

  if (!force) {
    const maturityDate = savingsData.maturityDate
      ? toDate(savingsData.maturityDate)
      : undefined
    if (maturityDate && new Date() < maturityDate) {
      throw new Error('errors.savingsLocked')
    }
  }

  let currentAmount = (savingsData.currentAmount as number) ?? 0
  const interestRate = (savingsData.interestRate as number) ?? 0
  const balance = (userSnap.data().balance as number) ?? 0
  let totalSavings = (userSnap.data().totalSavings as number) ?? 0

  const now = new Date()
  const batch = writeBatch(db)

  const proRataInterest = calculateProRataInterest(savingsData, now, currentAmount, interestRate)
  if (proRataInterest > 0) {
    currentAmount += proRataInterest
    totalSavings += proRataInterest
    writeInterestTransaction(batch, userId, proRataInterest, balance, savingsData.name as string, savingsId, now)
  }

  batch.delete(savingsRef)
  batch.update(userRef, {
    balance: balance + currentAmount,
    totalSavings: totalSavings - currentAmount,
  })
  await batch.commit()
}

export async function applyInterestIfDue(
  userId: string,
  goal: SavingsGoal
): Promise<boolean> {
  if (goal.currentAmount <= 0 || goal.interestRate <= 0 || goal.status !== 'active') {
    return false
  }

  const lastApplied = goal.lastInterestAt ?? goal.createdAt
  const now = new Date()

  const monthsElapsed = (now.getFullYear() - lastApplied.getFullYear()) * 12
    + (now.getMonth() - lastApplied.getMonth())

  if (monthsElapsed <= 0) return false

  const monthlyRate = goal.interestRate / 12
  let runningAmount = goal.currentAmount
  let totalInterest = 0

  const userRef = doc(db, 'users', userId)
  const savingsRef = doc(db, 'users', userId, 'savings', goal.id)
  const userSnap = await getDoc(userRef)
  if (!userSnap.exists()) return false

  const walletBalance = (userSnap.data().balance as number) ?? 0
  const totalSavings = (userSnap.data().totalSavings as number) ?? 0

  const batch = writeBatch(db)

  for (let i = 0; i < monthsElapsed; i++) {
    const monthInterest = Math.round(runningAmount * monthlyRate * 100) / 100
    if (monthInterest <= 0) continue

    totalInterest += monthInterest
    runningAmount += monthInterest

    const txRef = doc(collection(db, 'users', userId, 'transactions'))
    batch.set(txRef, {
      id: txRef.id,
      type: 'interest',
      amount: monthInterest,
      balanceAfter: walletBalance,
      description: goal.name,
      savingsId: goal.id,
      createdAt: new Date(),
      createdBy: 'system',
    })
  }

  if (totalInterest <= 0) return false

  batch.update(savingsRef, {
    currentAmount: runningAmount,
    accruedInterest: goal.accruedInterest + totalInterest,
    lastInterestAt: now,
  })

  batch.update(userRef, {
    totalSavings: totalSavings + totalInterest,
  })

  await batch.commit()
  return true
}

function calculateProRataInterest(
  savingsData: DocumentData,
  now: Date,
  currentAmount: number,
  interestRate: number,
): number {
  if (interestRate <= 0 || currentAmount <= 0) return 0

  const lastInterestAt = savingsData.lastInterestAt
    ? toDate(savingsData.lastInterestAt)
    : savingsData.createdAt
      ? toDate(savingsData.createdAt)
      : now
  const daysElapsed = Math.floor(
    (now.getTime() - lastInterestAt.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (daysElapsed <= 0) return 0

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Math.round(
    currentAmount * (interestRate / 12) * (daysElapsed / daysInMonth) * 100
  ) / 100
}

function writeInterestTransaction(
  batch: WriteBatch,
  userId: string,
  amount: number,
  balanceAfter: number,
  description: string,
  savingsId: string,
  now: Date,
): void {
  const txRef = doc(collection(db, 'users', userId, 'transactions'))
  batch.set(txRef, {
    id: txRef.id,
    type: 'interest',
    amount,
    balanceAfter,
    description,
    savingsId,
    createdAt: now,
    createdBy: 'system',
  })
}

function parseSavingsGoal(id: string, data: Record<string, unknown>): SavingsGoal {
  return {
    id,
    name: data.name as string,
    targetAmount: data.targetAmount as number | undefined,
    currentAmount: (data.currentAmount as number) ?? 0,
    interestRate: (data.interestRate as number) ?? 0,
    accruedInterest: (data.accruedInterest as number) ?? 0,
    savingsType: (data.savingsType as SavingsGoal['savingsType']) ?? 'flexible',
    status: (data.status as SavingsGoal['status']) ?? 'active',
    createdAt: toDate(data.createdAt),
    maturityDate: data.maturityDate ? toDate(data.maturityDate) : undefined,
    lastInterestAt: data.lastInterestAt ? toDate(data.lastInterestAt) : undefined,
  }
}
