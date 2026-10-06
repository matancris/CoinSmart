import { collection, getDocs, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/config/firebase'
import type { SavingsGoal, SavingsType } from '@/types'
import { toDate } from '@/utils/date'
import { sanitizeString } from '@/utils/validation'

export async function getSavingsGoals(userId: string): Promise<SavingsGoal[]> {
  const ref = collection(db, 'users', userId, 'savings')
  const q = query(ref, where('status', '==', 'active'))
  const snap = await getDocs(q)
  return snap.docs.map(d => parseSavingsGoal(d.id, d.data()))
}

// Every change that moves money runs on the server (functions/src/wallet/savings.ts),
// where the interest rate and lock rules can't be tampered with
export async function createSavingsGoal(
  userId: string,
  data: { name: string; targetAmount?: number; savingsType: SavingsType }
): Promise<void> {
  const create = httpsCallable(functions, 'createSavingsGoal')
  await create({
    userId,
    name: sanitizeString(data.name, 100),
    savingsType: data.savingsType,
    ...(data.targetAmount !== undefined && { targetAmount: data.targetAmount }),
  })
}

export async function transferToSavings(userId: string, savingsId: string, amount: number): Promise<void> {
  await moveSavings({ userId, savingsId, amount, direction: 'in' })
}

export async function depositToSavings(userId: string, savingsId: string, amount: number): Promise<void> {
  await moveSavings({ userId, savingsId, amount, direction: 'deposit' })
}

export async function withdrawFromSavings(
  userId: string,
  savingsId: string,
  amount: number,
  force?: boolean
): Promise<void> {
  await moveSavings({ userId, savingsId, amount, direction: 'out', force: force === true })
}

export async function deleteSavingsGoal(userId: string, savingsId: string, force?: boolean): Promise<void> {
  const remove = httpsCallable(functions, 'deleteSavingsGoal')
  await remove({ userId, savingsId, force: force === true })
}

async function moveSavings(data: {
  userId: string
  savingsId: string
  amount: number
  direction: 'in' | 'deposit' | 'out'
  force?: boolean
}): Promise<void> {
  const move = httpsCallable(functions, 'moveSavings')
  await move(data)
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
