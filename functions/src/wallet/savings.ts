import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { Timestamp, type DocumentData, type Transaction } from 'firebase-admin/firestore'
import { authorizeForChild, cleanString, db, requireAmount, requireDocId, round2 } from '../shared/access'

type SavingsType = 'flexible' | 'locked_2m' | 'locked_6m'

// Keep in sync with SAVINGS_PLANS in src/utils/savings.ts — the server copy is the one that counts
const SAVINGS_PLANS: Record<SavingsType, { annualRate: number; lockMonths: number }> = {
  flexible: { annualRate: 0.03, lockMonths: 0 },
  locked_2m: { annualRate: 0.06, lockMonths: 2 },
  locked_6m: { annualRate: 0.12, lockMonths: 6 },
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

function isLocked(data: DocumentData, now: Date): boolean {
  const maturityDate = toDate(data.maturityDate)
  return maturityDate !== null && now < maturityDate
}

function proRataInterest(data: DocumentData, now: Date): number {
  const currentAmount = (data.currentAmount as number | undefined) ?? 0
  const interestRate = (data.interestRate as number | undefined) ?? 0
  if (interestRate <= 0 || currentAmount <= 0) return 0

  const lastInterestAt = toDate(data.lastInterestAt) ?? toDate(data.createdAt) ?? now
  const daysElapsed = Math.floor((now.getTime() - lastInterestAt.getTime()) / MS_PER_DAY)
  if (daysElapsed <= 0) return 0

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return round2(currentAmount * (interestRate / 12) * (daysElapsed / daysInMonth))
}

function writeInterestTransaction(
  tx: Transaction,
  userId: string,
  amount: number,
  balanceAfter: number,
  goal: DocumentData,
  savingsId: string,
  now: Date,
): void {
  const txRef = db.collection(`users/${userId}/transactions`).doc()
  tx.set(txRef, {
    id: txRef.id,
    type: 'interest',
    amount,
    balanceAfter,
    description: goal.name ?? '',
    savingsId,
    createdAt: now,
    createdBy: 'system',
  })
}

interface CreateGoalRequest {
  userId?: unknown
  name?: unknown
  targetAmount?: unknown
  savingsType?: unknown
}

export const createSavingsGoal = onCall<CreateGoalRequest>(async (request) => {
  const { userId, name, targetAmount, savingsType } = request.data ?? {}
  await authorizeForChild(request.auth, userId)

  if (typeof savingsType !== 'string' || !(savingsType in SAVINGS_PLANS)) {
    throw new HttpsError('invalid-argument', 'errors.generic')
  }
  const plan = SAVINGS_PLANS[savingsType as SavingsType]
  const goalName = cleanString(name, 100)
  if (!goalName) throw new HttpsError('invalid-argument', 'errors.generic')
  const target = targetAmount === undefined || targetAmount === null ? undefined : requireAmount(targetAmount)

  const now = new Date()
  let maturityDate: Date | undefined
  if (plan.lockMonths > 0) {
    maturityDate = new Date(now)
    maturityDate.setMonth(maturityDate.getMonth() + plan.lockMonths)
  }

  const ref = db.collection(`users/${userId as string}/savings`).doc()
  await ref.set({
    id: ref.id,
    name: goalName,
    currentAmount: 0,
    interestRate: plan.annualRate,
    accruedInterest: 0,
    savingsType,
    status: 'active',
    createdAt: now,
    lastInterestAt: now,
    ...(target !== undefined && { targetAmount: target }),
    ...(maturityDate && { maturityDate }),
  })

  return { id: ref.id }
})

type MoveDirection = 'in' | 'deposit' | 'out'

interface MoveRequest {
  userId?: unknown
  savingsId?: unknown
  amount?: unknown
  direction?: unknown
  force?: unknown
}

// 'in' moves wallet money into the goal, 'deposit' is a parent adding new money straight into the goal,
// 'out' moves goal money back to the wallet
export const moveSavings = onCall<MoveRequest>(async (request) => {
  const { userId: rawUserId, savingsId: rawSavingsId, amount: rawAmount, direction, force } = request.data ?? {}
  const { caller } = await authorizeForChild(request.auth, rawUserId)
  const userId = rawUserId as string
  const savingsId = requireDocId(rawSavingsId)
  const amount = requireAmount(rawAmount)

  if (direction !== 'in' && direction !== 'deposit' && direction !== 'out') {
    throw new HttpsError('invalid-argument', 'errors.generic')
  }
  const move: MoveDirection = direction
  // Creating money and breaking a lock are parent-only
  if ((move === 'deposit' || force === true) && caller.role !== 'parent') {
    throw new HttpsError('permission-denied', 'errors.generic')
  }

  const userRef = db.doc(`users/${userId}`)
  const savingsRef = db.doc(`users/${userId}/savings/${savingsId}`)

  await db.runTransaction(async (tx) => {
    const [userSnap, savingsSnap] = await Promise.all([tx.get(userRef), tx.get(savingsRef)])
    const user = userSnap.data()
    const goal = savingsSnap.data()
    if (!user || !goal) throw new HttpsError('not-found', 'errors.notFound')

    const now = new Date()
    const balance = (user.balance as number | undefined) ?? 0
    let totalSavings = (user.totalSavings as number | undefined) ?? 0
    let currentAmount = (goal.currentAmount as number | undefined) ?? 0
    let newBalance = balance
    const goalUpdates: Record<string, unknown> = {}
    let txType: string

    if (move === 'out') {
      if (force !== true && isLocked(goal, now)) throw new HttpsError('failed-precondition', 'errors.savingsLocked')

      const interest = proRataInterest(goal, now)
      if (interest > 0) {
        currentAmount = round2(currentAmount + interest)
        totalSavings = round2(totalSavings + interest)
        goalUpdates.accruedInterest = round2(((goal.accruedInterest as number | undefined) ?? 0) + interest)
        goalUpdates.lastInterestAt = now
        writeInterestTransaction(tx, userId, interest, balance, goal, savingsId, now)
      }
      if (currentAmount < amount) throw new HttpsError('failed-precondition', 'errors.insufficientBalance')

      currentAmount = round2(currentAmount - amount)
      totalSavings = round2(totalSavings - amount)
      newBalance = round2(balance + amount)
      txType = 'transfer_from_savings'
    } else {
      if (move === 'in') {
        if (balance < amount) throw new HttpsError('failed-precondition', 'errors.insufficientBalance')
        newBalance = round2(balance - amount)
      }
      // Interest accrues from the first deposit, not from when an empty goal was created
      if (currentAmount <= 0) goalUpdates.lastInterestAt = now
      currentAmount = round2(currentAmount + amount)
      totalSavings = round2(totalSavings + amount)
      txType = move === 'in' ? 'transfer_to_savings' : 'deposit_to_savings'
    }

    goalUpdates.currentAmount = currentAmount
    tx.update(savingsRef, goalUpdates)
    tx.update(userRef, { balance: newBalance, totalSavings })

    const txRef = userRef.collection('transactions').doc()
    tx.set(txRef, {
      id: txRef.id,
      type: txType,
      amount,
      balanceAfter: newBalance,
      description: goal.name ?? '',
      savingsId,
      createdAt: now,
      createdBy: caller.actorId,
    })
  })

  return { success: true }
})

// Closing a goal pays everything in it, plus interest earned so far, back into the wallet
export const deleteSavingsGoal = onCall<{ userId?: unknown; savingsId?: unknown; force?: unknown }>(async (request) => {
  const { userId: rawUserId, savingsId: rawSavingsId, force } = request.data ?? {}
  const { caller } = await authorizeForChild(request.auth, rawUserId)
  const userId = rawUserId as string
  const savingsId = requireDocId(rawSavingsId)
  if (force === true && caller.role !== 'parent') throw new HttpsError('permission-denied', 'errors.generic')

  const userRef = db.doc(`users/${userId}`)
  const savingsRef = db.doc(`users/${userId}/savings/${savingsId}`)

  await db.runTransaction(async (tx) => {
    const [userSnap, savingsSnap] = await Promise.all([tx.get(userRef), tx.get(savingsRef)])
    const user = userSnap.data()
    const goal = savingsSnap.data()
    if (!user || !goal) throw new HttpsError('not-found', 'errors.notFound')

    const now = new Date()
    if (force !== true && isLocked(goal, now)) throw new HttpsError('failed-precondition', 'errors.savingsLocked')

    const balance = (user.balance as number | undefined) ?? 0
    let totalSavings = (user.totalSavings as number | undefined) ?? 0
    let currentAmount = (goal.currentAmount as number | undefined) ?? 0

    const interest = proRataInterest(goal, now)
    if (interest > 0) {
      currentAmount = round2(currentAmount + interest)
      totalSavings = round2(totalSavings + interest)
      writeInterestTransaction(tx, userId, interest, balance, goal, savingsId, now)
    }

    tx.delete(savingsRef)
    tx.update(userRef, {
      balance: round2(balance + currentAmount),
      totalSavings: round2(totalSavings - currentAmount),
    })
  })

  return { success: true }
})
