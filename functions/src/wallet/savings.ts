import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue, Timestamp, type DocumentData, type Transaction } from 'firebase-admin/firestore'
import { authorizeForChild, cleanString, db, requireAmount, requireDocId, round2, sumSavings } from '../shared/access'

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

function addMonths(from: Date, months: number): Date {
  const date = new Date(from)
  date.setMonth(date.getMonth() + months)
  return date
}

export interface MaturitySettlement {
  interest: number
  // Fields to merge into the caller's single update of the goal doc
  updates: Record<string, unknown>
  // The goal as it reads after settling, for the caller's own interest logic
  goal: DocumentData
}

// A locked goal earns its plan's rate only until maturityDate, then the flexible rate. Settling
// pays what the locked rate owes up to maturity and switches the goal over, exactly once
export function settleMaturity(data: DocumentData, now: Date): MaturitySettlement | null {
  const maturityDate = toDate(data.maturityDate)
  if (!maturityDate || maturityDate > now || data.maturedAt) return null

  // Runs before the rate changes, so it pays the locked rate. Goals that already earned interest
  // past maturity get nothing here and keep what they earned
  const interest = proRataInterest(data, maturityDate)
  const lastInterestAt = toDate(data.lastInterestAt) ?? toDate(data.createdAt) ?? maturityDate

  const updates: Record<string, unknown> = {
    interestRate: SAVINGS_PLANS.flexible.annualRate,
    maturedAt: maturityDate,
    lastInterestAt: lastInterestAt > maturityDate ? lastInterestAt : maturityDate,
  }
  if (interest > 0) {
    updates.currentAmount = round2(((data.currentAmount as number | undefined) ?? 0) + interest)
    updates.accruedInterest = round2(((data.accruedInterest as number | undefined) ?? 0) + interest)
  }

  return { interest, updates, goal: { ...data, ...updates } }
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
  const maturityDate = plan.lockMonths > 0 ? addMonths(now, plan.lockMonths) : undefined

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
    const [userSnap, savingsSnap, allGoalsSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(savingsRef),
      tx.get(userRef.collection('savings')),
    ])
    const user = userSnap.data()
    const storedGoal = savingsSnap.data()
    if (!user || !storedGoal) throw new HttpsError('not-found', 'errors.notFound')

    const now = new Date()
    const balance = (user.balance as number | undefined) ?? 0
    // Settle before any amount changes, so money added to a matured goal never earns the locked rate
    const settlement = settleMaturity(storedGoal, now)
    const goal = settlement?.goal ?? storedGoal
    if (settlement && settlement.interest > 0) {
      writeInterestTransaction(tx, userId, settlement.interest, balance, goal, savingsId, now)
    }

    let currentAmount = (goal.currentAmount as number | undefined) ?? 0
    let newBalance = balance
    const goalUpdates: Record<string, unknown> = { ...settlement?.updates }
    let txType: string

    if (move === 'out') {
      if (force !== true && isLocked(goal, now)) throw new HttpsError('failed-precondition', 'errors.savingsLocked')

      const interest = proRataInterest(goal, now)
      if (interest > 0) {
        currentAmount = round2(currentAmount + interest)
        goalUpdates.accruedInterest = round2(((goal.accruedInterest as number | undefined) ?? 0) + interest)
        goalUpdates.lastInterestAt = now
        writeInterestTransaction(tx, userId, interest, balance, goal, savingsId, now)
      }
      if (currentAmount < amount) throw new HttpsError('failed-precondition', 'errors.insufficientBalance')

      currentAmount = round2(currentAmount - amount)
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
      txType = move === 'in' ? 'transfer_to_savings' : 'deposit_to_savings'
    }

    goalUpdates.currentAmount = currentAmount
    tx.update(savingsRef, goalUpdates)
    const otherGoals = allGoalsSnap.docs.filter(d => d.id !== savingsId).map(d => d.data())
    tx.update(userRef, { balance: newBalance, totalSavings: round2(sumSavings(otherGoals) + currentAmount) })

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
    const [userSnap, savingsSnap, allGoalsSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(savingsRef),
      tx.get(userRef.collection('savings')),
    ])
    const user = userSnap.data()
    const storedGoal = savingsSnap.data()
    if (!user || !storedGoal) throw new HttpsError('not-found', 'errors.notFound')

    const now = new Date()
    if (force !== true && isLocked(storedGoal, now)) throw new HttpsError('failed-precondition', 'errors.savingsLocked')

    const balance = (user.balance as number | undefined) ?? 0
    const settlement = settleMaturity(storedGoal, now)
    const goal = settlement?.goal ?? storedGoal
    if (settlement && settlement.interest > 0) {
      writeInterestTransaction(tx, userId, settlement.interest, balance, goal, savingsId, now)
    }

    let currentAmount = (goal.currentAmount as number | undefined) ?? 0

    const interest = proRataInterest(goal, now)
    if (interest > 0) {
      currentAmount = round2(currentAmount + interest)
      writeInterestTransaction(tx, userId, interest, balance, goal, savingsId, now)
    }

    tx.delete(savingsRef)
    tx.update(userRef, {
      balance: round2(balance + currentAmount),
      totalSavings: sumSavings(allGoalsSnap.docs.filter(d => d.id !== savingsId).map(d => d.data())),
    })
  })

  return { success: true }
})

// Locks a matured goal again for its plan's period. Locking only limits the child, so the child
// may do it as well as a parent
export const renewSavingsGoal = onCall<{ userId?: unknown; savingsId?: unknown }>(async (request) => {
  const { userId: rawUserId, savingsId: rawSavingsId } = request.data ?? {}
  await authorizeForChild(request.auth, rawUserId)
  const userId = rawUserId as string
  const savingsId = requireDocId(rawSavingsId)

  const userRef = db.doc(`users/${userId}`)
  const savingsRef = db.doc(`users/${userId}/savings/${savingsId}`)

  await db.runTransaction(async (tx) => {
    const [userSnap, savingsSnap, allGoalsSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(savingsRef),
      tx.get(userRef.collection('savings')),
    ])
    const user = userSnap.data()
    const storedGoal = savingsSnap.data()
    if (!user || !storedGoal) throw new HttpsError('not-found', 'errors.notFound')

    const now = new Date()
    const savingsType = storedGoal.savingsType
    const plan = typeof savingsType === 'string' && savingsType in SAVINGS_PLANS
      ? SAVINGS_PLANS[savingsType as SavingsType]
      : null
    const maturityDate = toDate(storedGoal.maturityDate)
    if (!plan || plan.lockMonths <= 0 || !maturityDate || maturityDate > now) {
      throw new HttpsError('failed-precondition', 'errors.generic')
    }

    const balance = (user.balance as number | undefined) ?? 0
    const settlement = settleMaturity(storedGoal, now)
    const goal = settlement?.goal ?? storedGoal
    if (settlement && settlement.interest > 0) {
      writeInterestTransaction(tx, userId, settlement.interest, balance, goal, savingsId, now)
    }

    // Pay the flexible rate owed since maturity before the locked rate takes over again
    let currentAmount = (goal.currentAmount as number | undefined) ?? 0
    let accruedInterest = (goal.accruedInterest as number | undefined) ?? 0
    const interest = proRataInterest(goal, now)
    if (interest > 0) {
      currentAmount = round2(currentAmount + interest)
      accruedInterest = round2(accruedInterest + interest)
      writeInterestTransaction(tx, userId, interest, balance, goal, savingsId, now)
    }

    tx.update(savingsRef, {
      currentAmount,
      accruedInterest,
      interestRate: plan.annualRate,
      maturityDate: addMonths(now, plan.lockMonths),
      lastInterestAt: now,
      maturedAt: FieldValue.delete(),
    })
    const otherGoals = allGoalsSnap.docs.filter(d => d.id !== savingsId).map(d => d.data())
    tx.update(userRef, { totalSavings: round2(sumSavings(otherGoals) + currentAmount) })
  })

  return { success: true }
})
